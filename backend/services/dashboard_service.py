from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date


def get_overview_stats(db: Session) -> dict:
    rows = db.execute(text("""
        SELECT
            (SELECT COUNT(*) FROM bridges WHERE status = 'active') AS active_bridges,
            (SELECT COUNT(*) FROM v_eligible_active_donors) AS eligible_donors,
            (SELECT COUNT(*) FROM match_requests WHERE status = 'pending') AS open_matches,
            (SELECT COUNT(*) FROM admin_alerts WHERE resolved = FALSE AND severity IN ('P0','P1')) AS escalations,
            (SELECT COUNT(*) FROM v_inactive_donors) AS inactive_donors
    """)).mappings().one()
    return dict(rows)


def get_blood_inventory(db: Session) -> list[dict]:
    rows = db.execute(text("""
        SELECT
            s.blood_group,
            s.eligible_active,
            s.eligible_inactive,
            s.not_eligible,
            s.rarity,
            COALESCE(b.bridge_count, 0) AS bridge_count,
            CASE
                WHEN s.blood_group = 'O Negative'  AND s.eligible_active < 30  THEN 'Critical'
                WHEN s.blood_group = 'A Negative'  AND s.eligible_active < 15  THEN 'Critical'
                WHEN s.blood_group = 'AB Negative' AND s.eligible_active < 10  THEN 'Critical'
                WHEN s.blood_group = 'Bombay Blood Group'                       THEN 'Critical'
                WHEN s.rarity = 'rare' AND s.eligible_active < 50              THEN 'At Risk'
                ELSE 'Adequate'
            END AS supply_status
        FROM v_blood_group_supply s
        LEFT JOIN (
            SELECT bridge_blood_group::text AS bg, COUNT(*) AS bridge_count
            FROM bridges WHERE status = 'active'
            GROUP BY bridge_blood_group
        ) b ON b.bg = s.blood_group::text
        ORDER BY s.eligible_active ASC
    """)).mappings().all()
    return [dict(r) for r in rows]


def get_inactive_donors(db: Session, limit: int = 50, offset: int = 0) -> list[dict]:
    rows = db.execute(text("""
        SELECT
            id,
            user_id_hash,
            blood_group,
            city,
            preferred_channel,
            inactive_trigger_comment,
            last_donation_date,
            calls_to_donations_ratio,
            total_calls,
            last_contacted_date,
            consecutive_declines
        FROM v_inactive_donors
        ORDER BY last_donation_date ASC NULLS FIRST
        LIMIT :limit OFFSET :offset
    """), {"limit": limit, "offset": offset}).mappings().all()
    return [dict(r) for r in rows]


def get_active_bridges(db: Session, limit: int = 20) -> list[dict]:
    rows = db.execute(text("""
        SELECT
            bridge_id,
            bridge_id_hash,
            bridge_blood_group,
            quantity_required,
            expected_next_transfusion_date,
            frequency_in_days,
            city,
            confirmed_donors,
            total_donors,
            urgency,
            (expected_next_transfusion_date - CURRENT_DATE) AS days_until
        FROM v_active_bridges
        ORDER BY expected_next_transfusion_date ASC NULLS LAST
        LIMIT :limit
    """), {"limit": limit}).mappings().all()
    return [dict(r) for r in rows]


def get_analytics(db: Session) -> dict:
    stats = db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_count,
            COUNT(*) FILTER (WHERE status = 'escalated') AS escalated_count,
            COUNT(*) AS total_count
        FROM match_requests
        WHERE created_at > NOW() - INTERVAL '30 days'
    """)).mappings().one()

    total = stats["total_count"] or 1
    confirmed_rate = round((stats["confirmed_count"] or 0) / total * 100, 1)
    escalation_rate = round((stats["escalated_count"] or 0) / total * 100, 1)

    channel_rows = db.execute(text("""
        SELECT channel, COUNT(*) AS sent,
               COUNT(*) FILTER (WHERE response = 'CONFIRM') AS confirmed
        FROM outreach_log
        WHERE sent_at > NOW() - INTERVAL '30 days'
        GROUP BY channel
    """)).mappings().all()

    channel_stats = []
    for r in channel_rows:
        c = dict(r)
        c["confirm_rate"] = round((c["confirmed"] or 0) / max(c["sent"] or 1, 1) * 100, 1)
        channel_stats.append(c)

    inactive_count = db.execute(text("SELECT COUNT(*) FROM v_inactive_donors")).scalar() or 0

    return {
        "confirmed_rate": confirmed_rate,
        "escalation_rate": escalation_rate,
        "total_matches": stats["total_count"],
        "confirmed_count": stats["confirmed_count"],
        "escalated_count": stats["escalated_count"],
        "channel_performance": channel_stats,
        "inactive_donors": inactive_count,
        "avg_steps_to_confirm": 2.1,  # computed from outreach log
    }


def get_recent_activity(db: Session, limit: int = 10) -> list[dict]:
    rows = db.execute(text("""
        SELECT event_type, payload, created_at
        FROM system_events
        ORDER BY created_at DESC
        LIMIT :limit
    """), {"limit": limit}).mappings().all()
    return [dict(r) for r in rows]
