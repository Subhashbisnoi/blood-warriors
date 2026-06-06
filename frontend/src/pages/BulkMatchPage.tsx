import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bulkParse, bulkRun } from '../api/match';
import type { BulkParsedItem, BulkResultItem } from '../api/match';

const BLOOD_GROUPS = [
  'A Positive', 'A Negative', 'B Positive', 'B Negative',
  'O Positive', 'O Negative', 'AB Positive', 'AB Negative',
];

const TIER_COLORS: Record<string, string> = {
  Tier1: '#b91c1c', Tier2: '#c2410c', Tier3: '#92400e',
};

function bgBadge(bg: string) {
  const map: Record<string, string> = {
    'A Positive': 'A+', 'A Negative': 'A−', 'B Positive': 'B+', 'B Negative': 'B−',
    'O Positive': 'O+', 'O Negative': 'O−', 'AB Positive': 'AB+', 'AB Negative': 'AB−',
  };
  return map[bg] || bg;
}

function today7() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

// ── ParsedCard ──────────────────────────────────────────────────────────────

function ParsedCard({
  item, index, onChange,
}: {
  item: BulkParsedItem;
  index: number;
  onChange: (i: number, patch: Partial<BulkParsedItem>) => void;
}) {
  return (
    <div className="bg-surface-container rounded-2xl p-md border border-outline-variant/40">
      <div className="flex items-center justify-between mb-sm">
        <span className="text-label-sm text-on-surface-variant font-bold tracking-widest uppercase">
          Request {index + 1}
        </span>
        <span className="text-label-sm text-primary font-bold px-sm py-xs rounded-full bg-primary-container">
          {bgBadge(item.blood_group)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-sm">
        <div>
          <label className="text-label-sm text-on-surface-variant block mb-xs">Blood Group</label>
          <select
            value={item.blood_group}
            onChange={e => onChange(index, { blood_group: e.target.value })}
            className="w-full bg-surface border border-outline-variant rounded-lg px-sm py-xs text-body-sm text-on-surface"
          >
            {BLOOD_GROUPS.map(bg => <option key={bg}>{bg}</option>)}
          </select>
        </div>
        <div>
          <label className="text-label-sm text-on-surface-variant block mb-xs">Units</label>
          <input
            type="number" min={1} max={200}
            value={item.units}
            onChange={e => onChange(index, { units: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-full bg-surface border border-outline-variant rounded-lg px-sm py-xs text-body-sm text-on-surface"
          />
        </div>
        <div>
          <label className="text-label-sm text-on-surface-variant block mb-xs">City</label>
          <input
            type="text"
            value={item.city}
            onChange={e => onChange(index, { city: e.target.value })}
            className="w-full bg-surface border border-outline-variant rounded-lg px-sm py-xs text-body-sm text-on-surface"
          />
        </div>
        <div>
          <label className="text-label-sm text-on-surface-variant block mb-xs">Date</label>
          <input
            type="date"
            value={item.transfusion_date}
            onChange={e => onChange(index, { transfusion_date: e.target.value })}
            className="w-full bg-surface border border-outline-variant rounded-lg px-sm py-xs text-body-sm text-on-surface"
          />
        </div>
      </div>
    </div>
  );
}

// ── CandidateRow ────────────────────────────────────────────────────────────

function CandidateRow({ c, rank }: { c: Record<string, unknown>; rank: number }) {
  const [open, setOpen] = useState(false);
  const tier = c.tier as string | undefined;
  const tierColor = tier ? (TIER_COLORS[tier] || '#6b7280') : '#6b7280';
  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant/30 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-md px-md py-sm text-left hover:bg-surface-container-high transition-colors"
      >
        <span className="w-7 h-7 flex items-center justify-center rounded-full bg-primary-container text-on-primary text-label-sm font-bold shrink-0">
          {rank}
        </span>
        <span className="font-mono text-label-md text-on-surface font-bold flex-1">
          {c.user_id_hash_short as string}
        </span>
        <span className="text-label-sm text-on-surface-variant">{c.city as string}</span>
        <span className="text-label-sm text-on-surface-variant">{(c.distance_km as number)?.toFixed(1)} km</span>
        {tier && (
          <span className="text-label-xs px-sm py-xs rounded-full text-white font-bold" style={{ background: tierColor }}>
            {tier}
          </span>
        )}
        <span className="text-label-sm font-bold" style={{ color: '#22c55e' }}>
          {((c.score as number) * 100)?.toFixed(0)}%
        </span>
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 18 }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <div className="px-md pb-md pt-xs border-t border-outline-variant/20">
          <p className="text-body-sm text-on-surface-variant leading-relaxed">{c.explanation as string}</p>
          <div className="flex gap-md mt-sm flex-wrap">
            <span className="text-label-sm text-on-surface-variant">
              <b>Donations:</b> {c.donations_till_date as number}
            </span>
            <span className="text-label-sm text-on-surface-variant">
              <b>Churn Risk:</b> {((c.churn_risk as number) * 100)?.toFixed(0)}%
            </span>
            <span className="text-label-sm text-on-surface-variant">
              <b>Next Eligible:</b> {c.next_eligible_date as string}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ResultBlock ─────────────────────────────────────────────────────────────

function ResultBlock({ result }: { result: BulkResultItem }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-surface-container-low rounded-2xl border border-outline-variant/40 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-md px-lg py-md hover:bg-surface-container transition-colors"
      >
        <div className="flex-1 flex items-center gap-md">
          <span className="text-headline-sm font-bold text-on-surface"
            style={{ color: result.status === 'no_donors' ? '#ef4444' : '#22c55e' }}>
            {bgBadge(result.blood_group)}
          </span>
          <div className="flex flex-col text-left">
            <span className="text-label-md text-on-surface font-bold">
              {result.units} units · {result.city}
            </span>
            <span className="text-label-sm text-on-surface-variant">
              {result.transfusion_date} · {result.total} donors matched
            </span>
          </div>
        </div>
        <div className="flex items-center gap-sm">
          {result.status === 'matched' ? (
            <span className="text-label-sm text-white bg-green-600 px-sm py-xs rounded-full font-bold flex items-center gap-xs">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
              {result.total} matched
            </span>
          ) : (
            <span className="text-label-sm text-white bg-red-600 px-sm py-xs rounded-full font-bold flex items-center gap-xs">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>cancel</span>
              No donors
            </span>
          )}
          {result.match_id && (
            <button
              onClick={e => { e.stopPropagation(); navigate(`/outreach/${result.match_id}`); }}
              className="flex items-center gap-xs text-label-sm px-sm py-xs rounded-lg bg-primary-container text-on-primary font-bold hover:bg-primary transition-colors"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chat_bubble</span>
              Outreach Log
            </button>
          )}
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }}>
            {expanded ? 'expand_less' : 'expand_more'}
          </span>
        </div>
      </button>

      {expanded && result.status === 'matched' && (
        <div className="px-lg pb-lg flex flex-col gap-sm">
          {(result.candidates as Record<string, unknown>[]).map((c, i) => (
            <CandidateRow key={i} c={c} rank={i + 1} />
          ))}
        </div>
      )}

      {expanded && result.status === 'no_donors' && (
        <div className="px-lg pb-lg">
          <div className="flex items-center gap-sm text-on-surface-variant text-body-sm bg-surface-container p-md rounded-xl">
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ef4444' }}>blood_type</span>
            No eligible donors found for {result.blood_group} in {result.city} on {result.transfusion_date}.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

type Stage = 'input' | 'parsed' | 'running' | 'results';

export default function BulkMatchPage() {
  const [text, setText] = useState('');
  const [stage, setStage] = useState<Stage>('input');
  const [parseLoading, setParseLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [items, setItems] = useState<BulkParsedItem[]>([]);
  const [results, setResults] = useState<BulkResultItem[]>([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleParse() {
    if (!text.trim()) return;
    setParseLoading(true); setError('');
    try {
      const res = await bulkParse(text);
      setItems(res.items);
      setStage('parsed');
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? 'Failed to parse request. Please try again.');
    } finally {
      setParseLoading(false);
    }
  }

  async function handleRunAll() {
    if (!items.length) return;
    setRunLoading(true); setStage('running'); setError('');
    try {
      const res = await bulkRun(items);
      setResults(res.results);
      setStage('results');
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? 'Matching failed. Please try again.');
      setStage('parsed');
    } finally {
      setRunLoading(false);
    }
  }

  function patchItem(i: number, patch: Partial<BulkParsedItem>) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }

  function addItem() {
    setItems(prev => [...prev, {
      blood_group: 'O Positive', units: 1, city: 'Hyderabad',
      transfusion_date: today7(), lat: 17.385, lon: 78.4867,
    }]);
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  }

  const totalMatched = results.filter(r => r.status === 'matched').reduce((s, r) => s + r.total, 0);
  const matchedIds = results.filter(r => r.match_id).map(r => r.match_id as string);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-outline-variant/20 px-xl py-md flex items-center justify-between">
        <div className="flex items-center gap-md">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(186,26,26,0.15)' }}>
            <span className="material-symbols-outlined" style={{ color: '#ba1a1a', fontSize: 22 }}>biotech</span>
          </div>
          <div>
            <h1 className="text-title-lg font-bold text-on-surface">Bulk Blood Match</h1>
            <p className="text-label-sm text-on-surface-variant">AI-powered multi-request matching</p>
          </div>
        </div>
        {stage === 'results' && matchedIds.length > 0 && (
          <button
            onClick={() => navigate('/outreach')}
            className="flex items-center gap-sm px-md py-sm rounded-xl text-label-md font-bold text-white transition-opacity"
            style={{ background: '#ba1a1a' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chat_bubble</span>
            View All Outreach Logs
          </button>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-xl py-xl space-y-xl">

        {/* Step 1: Natural Language Input */}
        <div className="bg-surface-container rounded-2xl p-lg border border-outline-variant/40 space-y-md">
          <div className="flex items-center gap-sm">
            <span className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center text-label-sm font-bold">1</span>
            <h2 className="text-title-md font-bold text-on-surface">Describe Your Requirements</h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Type naturally — e.g. "I need 10 units of A+ and 20 units of O-negative in Hyderabad by next Tuesday"
          </p>
          <textarea
            rows={4}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="e.g. Need 10 A+, 20 O-ve and 5 AB+ urgently in Hyderabad. Also 8 B+ in Mumbai for Thursday."
            className="w-full bg-surface border border-outline-variant rounded-xl px-md py-sm text-body-md text-on-surface resize-none focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {error && <p className="text-label-sm text-error bg-error-container px-md py-sm rounded-xl">{error}</p>}
          <div className="flex justify-end">
            <button
              onClick={handleParse}
              disabled={parseLoading || !text.trim()}
              className="flex items-center gap-sm px-lg py-sm rounded-xl text-label-md font-bold text-white transition-all disabled:opacity-50"
              style={{ background: '#ba1a1a' }}
            >
              {parseLoading
                ? <><span className="animate-spin material-symbols-outlined" style={{ fontSize: 18 }}>progress_activity</span> Parsing with AI…</>
                : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span> Parse with AI</>
              }
            </button>
          </div>
        </div>

        {/* Step 2: Parsed Items */}
        {(stage === 'parsed' || stage === 'running' || stage === 'results') && (
          <div className="bg-surface-container rounded-2xl p-lg border border-outline-variant/40 space-y-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-sm">
                <span className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center text-label-sm font-bold">2</span>
                <h2 className="text-title-md font-bold text-on-surface">Review & Edit Requests</h2>
              </div>
              <button
                onClick={addItem}
                className="flex items-center gap-xs text-label-sm text-primary hover:text-primary/80 border border-primary rounded-lg px-sm py-xs font-bold transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                Add Request
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              {items.map((item, i) => (
                <div key={i} className="relative">
                  <ParsedCard item={item} index={i} onChange={patchItem} />
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(i)}
                      className="absolute top-sm right-sm w-6 h-6 flex items-center justify-center rounded-full bg-error-container text-error hover:bg-error hover:text-on-error transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Summary bar */}
            <div className="bg-surface rounded-xl px-md py-sm flex items-center justify-between border border-outline-variant/30">
              <div className="flex gap-lg">
                <span className="text-label-sm text-on-surface-variant">
                  <b className="text-on-surface">{items.length}</b> blood types
                </span>
                <span className="text-label-sm text-on-surface-variant">
                  <b className="text-on-surface">{items.reduce((s, it) => s + it.units, 0)}</b> total units
                </span>
                <span className="text-label-sm text-on-surface-variant">
                  <b className="text-on-surface">{[...new Set(items.map(it => it.city))].join(', ')}</b>
                </span>
              </div>
              <button
                onClick={handleRunAll}
                disabled={runLoading || items.length === 0}
                className="flex items-center gap-sm px-lg py-sm rounded-xl text-label-md font-bold text-white transition-all disabled:opacity-50"
                style={{ background: '#16a34a' }}
              >
                {runLoading
                  ? <><span className="animate-spin material-symbols-outlined" style={{ fontSize: 18 }}>progress_activity</span> Matching…</>
                  : <><span className="material-symbols-outlined icon-fill" style={{ fontSize: 18 }}>bolt</span> Run All Matches</>
                }
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Running skeletons */}
        {stage === 'running' && (
          <div className="space-y-md">
            <div className="flex items-center gap-sm">
              <span className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center text-label-sm font-bold">3</span>
              <h2 className="text-title-md font-bold text-on-surface">Running {items.length} AI Matches in Parallel…</h2>
              <span className="animate-spin material-symbols-outlined text-primary" style={{ fontSize: 20 }}>progress_activity</span>
            </div>
            {items.map((item, i) => (
              <div key={i} className="bg-surface-container rounded-2xl border border-outline-variant/40 p-md flex items-center gap-md animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-surface-container-high" />
                <div className="flex-1 space-y-xs">
                  <div className="h-4 bg-surface-container-high rounded w-1/3" />
                  <div className="h-3 bg-surface-container-high rounded w-1/2" />
                </div>
                <div className="text-label-sm text-on-surface-variant">
                  {bgBadge(item.blood_group)} · {item.units} units · {item.city}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Step 4: Results */}
        {stage === 'results' && (
          <div className="space-y-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-sm">
                <span className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center text-label-sm font-bold">3</span>
                <h2 className="text-title-md font-bold text-on-surface">Match Results</h2>
              </div>
              <div className="flex items-center gap-md text-label-sm text-on-surface-variant">
                <span className="flex items-center gap-xs">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  {results.filter(r => r.status === 'matched').length} matched
                </span>
                <span className="flex items-center gap-xs">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  {results.filter(r => r.status === 'no_donors').length} no donors
                </span>
                <span className="font-bold text-on-surface">{totalMatched} total candidates</span>
              </div>
            </div>

            {/* Outreach audit banner */}
            {matchedIds.length > 0 && (
              <div className="bg-green-900/20 border border-green-700/30 rounded-xl px-md py-sm flex items-center gap-sm">
                <span className="material-symbols-outlined icon-fill" style={{ color: '#22c55e', fontSize: 20 }}>task_alt</span>
                <span className="text-body-sm text-on-surface flex-1">
                  Outreach simulation started for <b>{matchedIds.length}</b> match{matchedIds.length > 1 ? 'es' : ''}. All contact attempts are logged in the Outreach Log.
                </span>
                <button
                  onClick={() => navigate('/outreach')}
                  className="text-label-sm text-green-400 hover:text-green-300 font-bold underline"
                >
                  View Log →
                </button>
              </div>
            )}

            {results.map((result, i) => (
              <ResultBlock key={i} result={result} />
            ))}

            <div className="flex justify-center pt-md">
              <button
                onClick={() => { setStage('input'); setText(''); setItems([]); setResults([]); }}
                className="flex items-center gap-sm px-lg py-sm rounded-xl border border-outline-variant text-label-md font-bold text-on-surface-variant hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
                New Bulk Request
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
