import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Package, TrendingUp, ShoppingCart, BarChart2, ArrowRight, RefreshCw } from 'lucide-react'

interface DashboardData {
  total_items: number
  total_spend: number
  bill_count: number
  by_category: { category: string; item_count: number; total_spend: number; total_qty: number }[]
  monthly_trend: { month: string; spend: number }[]
  top_items: { item_name: string; category: string; total_spend: number; total_qty: number; order_count: number }[]
  recent_items: { item_name: string; category: string; quantity: number | null; unit: string | null; total_amount: number | null; vendor_name: string; bill_date: string | null }[]
}

const CAT_COLORS: Record<string, string> = {
  Medicines: '#dc2626', 'Fluids/Juice': '#2563eb', Logistics: '#d97706',
  Food: '#16a34a', Equipment: '#7c3aed', 'Lab Supplies': '#0891b2',
  'Patient Transport': '#db2777', Other: '#6b7280',
}

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

export default function InventoryDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('bw_token')
      const res = await axios.get('/inventory/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      setData(res.data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const maxSpend = data ? Math.max(...data.by_category.map(c => c.total_spend), 1) : 1
  const maxMonth = data ? Math.max(...data.monthly_trend.map(m => m.spend), 1) : 1

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280', fontFamily: 'Inter,sans-serif' }}>
      <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} /> Loading inventory…
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', fontFamily: 'Inter,sans-serif', background: '#f9fafb', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>Medical Inventory</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>Stock overview from approved bills</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => navigate('/inventory')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            View All Items <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { icon: <Package size={22} />, label: 'Total Items Procured', value: (data?.total_items ?? 0).toLocaleString(), color: '#dc2626', bg: '#fef2f2' },
          { icon: <TrendingUp size={22} />, label: 'Total Spend (Approved)', value: fmt(data?.total_spend ?? 0), color: '#16a34a', bg: '#f0fdf4' },
          { icon: <ShoppingCart size={22} />, label: 'Bills Processed', value: (data?.bill_count ?? 0).toString(), color: '#2563eb', bg: '#eff6ff' },
        ].map(card => (
          <div key={card.label} style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: card.color, flexShrink: 0 }}>
              {card.icon}
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginTop: 2 }}>{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Spend by Category */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <BarChart2 size={16} color="#dc2626" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Spend by Category</span>
          </div>
          {(data?.by_category ?? []).length === 0
            ? <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No data yet</div>
            : (data?.by_category ?? []).map(cat => (
              <div key={cat.category} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{cat.category}</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{fmt(cat.total_spend)} · {cat.item_count} items</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: '#f3f4f6', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: CAT_COLORS[cat.category] ?? '#6b7280', width: `${(cat.total_spend / maxSpend) * 100}%`, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ))
          }
        </div>

        {/* Monthly Trend */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <TrendingUp size={16} color="#2563eb" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Monthly Spend Trend</span>
          </div>
          {(data?.monthly_trend ?? []).length === 0
            ? <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No trend data yet</div>
            : <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
                {(data?.monthly_trend ?? []).map(m => (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{fmt(m.spend).replace('₹', '')}</span>
                    <div style={{ width: '100%', background: '#2563eb', borderRadius: '4px 4px 0 0', height: `${(m.spend / maxMonth) * 100}px`, minHeight: 4, transition: 'height 0.5s ease' }} />
                    <span style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>{m.month}</span>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Top Items */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Top Items by Spend</div>
          {(data?.top_items ?? []).length === 0
            ? <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No items yet</div>
            : (data?.top_items ?? []).map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < (data?.top_items.length ?? 0) - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: CAT_COLORS[item.category] ?? '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{item.category} · {item.order_count} order{item.order_count !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', flexShrink: 0 }}>{fmt(item.total_spend)}</div>
              </div>
            ))
          }
        </div>

        {/* Recent Items */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Recently Added</div>
            <button onClick={() => navigate('/inventory')} style={{ fontSize: 12, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>View all →</button>
          </div>
          {(data?.recent_items ?? []).length === 0
            ? <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No items yet — approve bills to populate inventory</div>
            : (data?.recent_items ?? []).map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < (data?.recent_items.length ?? 0) - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: CAT_COLORS[item.category] ?? '#6b7280', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{item.vendor_name || '—'} · {item.bill_date ? new Date(item.bill_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</div>
                </div>
                {item.total_amount != null && <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', flexShrink: 0 }}>{fmt(item.total_amount)}</div>}
              </div>
            ))
          }
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
