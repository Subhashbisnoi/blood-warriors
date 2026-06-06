"""
Blood Warriors — ML Engine
Two LightGBM models trained from RDS PostgreSQL data:

  DonorRankingModel  — replaces the hand-weighted KAG score formula.
                       Predicts P(donor donates if contacted) for
                       Neptune-filtered candidates.

  ChurnRiskModel     — predicts P(donor is churning).
                       High-risk donors are routed to re-engagement
                       flow (F12) instead of standard outreach.

Usage
─────
  python ml_engine.py              # train both models, print eval
  from ml_engine import score_candidates   # call from kag_queries
"""

import math, datetime, os, warnings
import numpy as np
import pandas as pd
import psycopg2, psycopg2.extras
import joblib
import lightgbm as lgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, classification_report

warnings.filterwarnings("ignore", category=UserWarning)

# ── paths ──────────────────────────────────────────────────────────────────────
_BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RANKING_MODEL_PATH = os.path.join(_BASE, "model_ranking.joblib")
CHURN_MODEL_PATH   = os.path.join(_BASE, "model_churn.joblib")

RDS_CONN = (
    "host=database-1.cyjemsoykvhs.us-east-1.rds.amazonaws.com "
    "port=5432 dbname=postgres user=postgres sslmode=require "
    "password=qhe:ZpQ0xVIn#(y#.R$CTYF>mCIX"
)

TODAY = datetime.date.today()

# ── feature engineering ────────────────────────────────────────────────────────

DONOR_TYPE_SCORE = {"Regular Donor": 1.0, "One-Time Donor": 0.6, "Other": 0.3}

def _features(row: dict) -> dict:
    """
    Compute the 8 ML features for a single donor row.
    Works on both RDS dict-cursor rows AND Neptune project() result dicts.
    """
    dtd   = float(row.get("donations_till_date") or 0)
    ratio = float(row.get("calls_to_donations_ratio") or 0)
    dtype = row.get("donor_type") or "Other"
    active = 1 if str(row.get("active_status") or
                      row.get("user_donation_active_status") or "") == "Active" else 0

    # recency: days since last donation (0 if never donated)
    ld = row.get("last_donation_date")
    if isinstance(ld, str):
        try: ld = datetime.date.fromisoformat(ld)
        except Exception: ld = None
    recency_days = (TODAY - ld).days if ld else 365

    # days until next eligible (negative = already eligible)
    ned = row.get("next_eligible_date")
    if isinstance(ned, str):
        try: ned = datetime.date.fromisoformat(ned)
        except Exception: ned = None
    days_until_eligible = (ned - TODAY).days if ned else -1

    # cycle adherence: how closely next_eligible = last_donation + cycle
    cycle = float(row.get("cycle_of_donations") or 0)
    if ld and cycle > 0 and ned:
        actual_gap = (ned - ld).days
        cycle_adherence = max(0.0, 1.0 - abs(actual_gap - cycle) / cycle)
    else:
        cycle_adherence = 0.5  # unknown

    # proximity: not available at training time from RDS; set 0.5 neutral
    # (overridden at scoring time from Neptune edge property)
    proximity = float(row.get("proximity_score") or 0.5)

    return {
        "reliability":        min(1.0, math.log1p(dtd) / math.log1p(12)),  # log-normalised 0-1 (max observed 12)
        "engagement":         min(1.0, 1.0 / (ratio + 0.1)),
        "active_flag":        float(active),
        "type_score":         DONOR_TYPE_SCORE.get(dtype, 0.3),
        "recency_days":       float(recency_days),
        "days_until_eligible": float(days_until_eligible),
        "cycle_adherence":    float(cycle_adherence),
        "proximity":          float(proximity),
    }

FEATURE_COLS = [
    "reliability", "engagement", "active_flag", "type_score",
    "recency_days", "days_until_eligible", "cycle_adherence", "proximity",
]

# ── load data from RDS ─────────────────────────────────────────────────────────

def _load_rds() -> pd.DataFrame:
    conn = psycopg2.connect(RDS_CONN)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT
            dp.donations_till_date,
            dp.cycle_of_donations,
            dp.next_eligible_date,
            dp.last_donation_date,
            dp.eligibility_status,
            dp.user_donation_active_status,
            dp.donor_type,
            dos.calls_to_donations_ratio
        FROM donor_profiles dp
        LEFT JOIN donor_outreach_stats dos ON dos.donor_user_id = dp.user_id
    """)
    rows = [dict(r) for r in cur.fetchall()]
    cur.close(); conn.close()
    print(f"  Loaded {len(rows):,} donor rows from RDS")
    return pd.DataFrame([_features(r) for r in rows]), rows

# ── proxy labels ───────────────────────────────────────────────────────────────
#
# We don't have 48-hour confirmation outcomes, so we use strong dataset proxies:
#
# Ranking label = 1  →  donor has donated (dtd ≥ 1) AND ratio < 2.0
#                        (has shown up AND responds efficiently)
#              = 0  →  never donated OR ratio ≥ 4.0
#                        (unresponsive effort-sink, or zero history)
# Rows in the grey zone (dtd=0 AND ratio 2-4) are dropped for ranking training.
#
# Churn label   = 1  →  Inactive
#              = 0  →  Active
# ──────────────────────────────────────────────────────────────────────────────

def _ranking_labels(rows: list) -> np.ndarray:
    y = []
    for r in rows:
        dtd   = float(r.get("donations_till_date") or 0)
        ratio = float(r.get("calls_to_donations_ratio") or 0)
        if dtd >= 1 and ratio < 2.0:
            y.append(1)
        elif dtd == 0 or ratio >= 4.0:
            y.append(0)
        else:
            y.append(-1)  # grey zone — excluded
    return np.array(y)

def _churn_labels(rows: list) -> np.ndarray:
    return np.array([
        1 if str(r.get("user_donation_active_status") or "") == "Inactive" else 0
        for r in rows
    ])

# ── training ───────────────────────────────────────────────────────────────────

LGB_PARAMS = dict(
    objective      = "binary",
    metric         = "auc",
    learning_rate  = 0.05,
    num_leaves     = 31,
    min_child_samples = 20,
    verbose        = -1,
    n_estimators   = 300,
    early_stopping_rounds = 30,
)

def train():
    print("\n[1/4] Loading RDS data...")
    X_df, rows = _load_rds()

    # ── Ranking model ──────────────────────────────────────────────────────────
    print("\n[2/4] Training DonorRankingModel...")
    y_rank = _ranking_labels(rows)
    mask   = y_rank != -1
    X_r, y_r = X_df[mask].values, y_rank[mask]
    print(f"  Training set: {mask.sum():,} rows  (pos={y_r.sum()}, neg={(y_r==0).sum()})")

    Xtr, Xval, ytr, yval = train_test_split(X_r, y_r, test_size=0.2, random_state=42, stratify=y_r)

    ranking_model = lgb.LGBMClassifier(**LGB_PARAMS)
    ranking_model.fit(
        Xtr, ytr,
        eval_set=[(Xval, yval)],
        callbacks=[lgb.early_stopping(30, verbose=False), lgb.log_evaluation(0)],
    )
    auc_r = roc_auc_score(yval, ranking_model.predict_proba(Xval)[:, 1])
    print(f"  AUC (held-out): {auc_r:.4f}")
    _print_importance(ranking_model, "  Ranking")
    joblib.dump(ranking_model, RANKING_MODEL_PATH)
    print(f"  Saved → {RANKING_MODEL_PATH}")

    # ── Churn model ────────────────────────────────────────────────────────────
    print("\n[3/4] Training ChurnRiskModel...")
    y_churn = _churn_labels(rows)
    X_c, y_c = X_df.values, y_churn
    print(f"  Training set: {len(y_c):,} rows  (churned={y_c.sum()}, active={(y_c==0).sum()})")

    Xtr2, Xval2, ytr2, yval2 = train_test_split(X_c, y_c, test_size=0.2, random_state=42, stratify=y_c)

    churn_model = lgb.LGBMClassifier(**LGB_PARAMS)
    churn_model.fit(
        Xtr2, ytr2,
        eval_set=[(Xval2, yval2)],
        callbacks=[lgb.early_stopping(30, verbose=False), lgb.log_evaluation(0)],
    )
    auc_c = roc_auc_score(yval2, churn_model.predict_proba(Xval2)[:, 1])
    print(f"  AUC (held-out): {auc_c:.4f}")
    _print_importance(churn_model, "  Churn")
    joblib.dump(churn_model, CHURN_MODEL_PATH)
    print(f"  Saved → {CHURN_MODEL_PATH}")

    # ── Summary ────────────────────────────────────────────────────────────────
    print("\n[4/4] Evaluation summary")
    print(f"  DonorRankingModel AUC : {auc_r:.4f}  (target > 0.75)")
    print(f"  ChurnRiskModel    AUC : {auc_c:.4f}  (target > 0.75)")
    print("\n  Classification report — Ranking (val):")
    print(classification_report(yval, ranking_model.predict(Xval), target_names=["Low fit","High fit"]))
    print("  Classification report — Churn (val):")
    print(classification_report(yval2, churn_model.predict(Xval2), target_names=["Active","Churned"]))

    return ranking_model, churn_model

def _print_importance(model, prefix):
    names = FEATURE_COLS
    imps  = model.feature_importances_
    pairs = sorted(zip(names, imps), key=lambda x: -x[1])
    print(f"{prefix} feature importance:")
    for name, imp in pairs:
        bar = "█" * int(imp / max(imps) * 20)
        print(f"    {name:<22} {bar} {imp}")

# ── inference: score Neptune candidates ───────────────────────────────────────

_ranking_model = None
_churn_model   = None

def _load_models():
    global _ranking_model, _churn_model
    if _ranking_model is None:
        if not os.path.exists(RANKING_MODEL_PATH):
            raise FileNotFoundError("Models not found — run `python ml_engine.py` to train first.")
        _ranking_model = joblib.load(RANKING_MODEL_PATH)
        _churn_model   = joblib.load(CHURN_MODEL_PATH)

def score_candidates(candidates: list, bridge_blood_group: str = None) -> list:
    """
    Takes the raw candidate list from Neptune (list of dicts from .project()),
    adds 'ml_score' and 'churn_risk' fields, sorts by ml_score desc.

    candidates: output of gc.run(q_candidates) from neptune_kag_queries.py
    Returns: same list, sorted, with two extra keys per dict.
    """
    if not candidates:
        return candidates

    _load_models()

    # build feature matrix — proximity comes from Neptune edge property if present
    feat_rows = []
    for c in candidates:
        f = _features(c)
        # override proximity from Neptune distance_km edge property if available
        dist_km = float(c.get("distance_km") or 50)
        f["proximity"] = max(0.0, 1.0 - dist_km / 100.0)
        feat_rows.append([f[col] for col in FEATURE_COLS])

    X = np.array(feat_rows, dtype=float)
    ml_scores   = _ranking_model.predict_proba(X)[:, 1]
    churn_risks  = _churn_model.predict_proba(X)[:, 1]

    for c, ms, cr in zip(candidates, ml_scores, churn_risks):
        c["ml_score"]   = round(float(ms), 4)
        c["churn_risk"] = round(float(cr), 4)
        # re-engagement flag: churn > 0.60 and not yet confirmed to bridge
        c["needs_reengagement"] = bool(cr > 0.60)

    candidates.sort(key=lambda x: x["ml_score"], reverse=True)
    return candidates


def score_for_reengagement(gc) -> list:
    """
    Pulls all active donors from Neptune, scores churn risk, returns those
    above threshold sorted by churn_risk desc — input to re-engagement flow F12.
    """
    _load_models()

    q = """
        g.V().hasLabel('Donor')
         .has('active_status','Active')
         .project('donor_id','blood_group','donations_till_date',
                  'calls_to_donations_ratio','donor_type','active_status',
                  'next_eligible_date','last_donation_date','cycle_of_donations')
           .by('kag_id')
           .by('blood_group')
           .by(coalesce(__.values('donations_till_date'), __.constant(0)))
           .by(coalesce(__.values('calls_to_donations_ratio'), __.constant(0)))
           .by(coalesce(__.values('donor_type'), __.constant('Other')))
           .by('active_status')
           .by(coalesce(__.values('next_eligible_date'), __.constant('')))
           .by(coalesce(__.values('last_donation_date'), __.constant('')))
           .by(coalesce(__.values('cycle_of_donations'), __.constant(0)))
    """
    donors = gc.run(q)
    if not donors:
        return []

    feat_rows = [[_features(d)[col] for col in FEATURE_COLS] for d in donors]
    X = np.array(feat_rows, dtype=float)
    churn_risks = _churn_model.predict_proba(X)[:, 1]

    at_risk = []
    for d, cr in zip(donors, churn_risks):
        if cr > 0.60:
            d["churn_risk"] = round(float(cr), 4)
            at_risk.append(d)

    at_risk.sort(key=lambda x: x["churn_risk"], reverse=True)
    return at_risk


# ── entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    train()
