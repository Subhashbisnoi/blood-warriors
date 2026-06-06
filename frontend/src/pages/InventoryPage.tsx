import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { Search, RefreshCw, Package, X, LayoutDashboard } from 'lucide-react'

interface InventoryItem {
  id: string
  bill_id: string
  item_name: string
  description: string | null
  category: string
  quantity: number | null
  unit: string | null
  unit_price: number | null
  total_amount: number | null
  hsn_sac: string | null
  vendor_name: string | null
  bill_date: string | null
  uploaded_by: string | null
}

const CATEGORIES = ['All', 'Medicines', 'Logistics', 'Admin', 'IT', 'Food']

const CAT_COLORS: Record<string, string> = {
  Medicines: '#dc2626', Logistics: '#d97706', Admin: '#7c3aed', IT: '#2563eb', Food: '#16a34a',
}

const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export default function InventoryPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')

  const load = async (cat?: string) => {
    setLoading(true)
    try {
      const token = localStorage.getItem('bw_token')
      const params: Record<string, string> = {}
      if (cat && cat !== 'All') params.category = cat
      const res = await axios.get('/inventory/items', { headers: { Authorization: `Bearer ${token}` }, params })
      setItems(res.data)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load(activeCategory) }, [activeCategory])

  const filtered = items.filter(item => {
    if (!search) return true
    const q = search.toLowerCase()
    return item.item_name?.toLowerCase().includes(q) || item.vendor_name?.toLowerCase().includes(q) || item.category?.toLowerCase().includes(q)
  })

  const totalSpend = filtered.reduce((s, i) => s + (i.total_amount ?? 0), 0)

  return (
    <div style={{ padding: '28px 32px', fontFamily: 'Inter,sans-serif', background: '#f9fafb', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>Inventory Items</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            {loading ? 'Loading…' : `${filtered.length} items · Total: ${fmt(totalSpend)}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('/inventory/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <LayoutDashboard size={14} /> Dashboard
          </button>
          <button onClick={() => load(activeCategory)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Search + Category filters */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search items, vendor…"
              style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={13} /></button>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                style={{ padding: '6px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: activeCategory === cat ? (CAT_COLORS[cat] ?? '#111827') : '#f3f4f6',
                  color: activeCategory === cat ? '#fff' : '#374151' }}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Item Name', 'Category', 'Qty', 'Unit Price', 'Total Amount', 'Vendor', 'Bill Date'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', display: 'inline', marginRight: 8 }} /> Loading…
              </td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>
                <Package size={32} style={{ display: 'block', margin: '0 auto 12px' }} />
                No inventory items yet. Approve bills with line items to see them here.
              </td></tr>
            )}
            {filtered.map((item, i) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa', transition: 'background 0.15s' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{item.item_name}</div>
                  {item.hsn_sac && <div style={{ fontSize: 11, color: '#9ca3af' }}>HSN: {item.hsn_sac}</div>}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: (CAT_COLORS[item.category] ?? '#6b7280') + '22', color: CAT_COLORS[item.category] ?? '#6b7280' }}>
                    {item.category}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                  {item.quantity != null ? `${item.quantity} ${item.unit ?? ''}`.trim() : '—'}
                </td>
                <td style={{ padding: '12px 16px', color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                  {item.unit_price != null ? fmt(item.unit_price) : '—'}
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                  {item.total_amount != null ? fmt(item.total_amount) : '—'}
                </td>
                <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: 12 }}>{item.vendor_name ?? '—'}</td>
                <td style={{ padding: '12px 16px', color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {item.bill_date ? new Date(item.bill_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
