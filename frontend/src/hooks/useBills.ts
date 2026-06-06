import { useEffect, useState, useCallback } from 'react'
import { fetchBills, invalidateBillsCache, type Bill } from '../api/invoices'
import { useAuth } from '../auth/AuthContext'

let _cache: Bill[] | null = null
let _loading = false
const _listeners = new Set<() => void>()

function notify() { _listeners.forEach(fn => fn()) }

export function useBills() {
  const { user } = useAuth()
  const [bills, setBills] = useState<Bill[]>(_cache ?? [])
  const [loading, setLoading] = useState(!_cache)

  useEffect(() => {
    const sync = () => { if (_cache) setBills(_cache) }
    _listeners.add(sync)
    return () => { _listeners.delete(sync) }
  }, [])

  const load = useCallback((force = false) => {
    if (_loading && !force) return
    _loading = true
    setLoading(true)
    if (force) invalidateBillsCache(user?.company_id)
    fetchBills(force, user?.company_id)
      .then(data => { _cache = data; setBills(data); notify() })
      .finally(() => { _loading = false; setLoading(false) })
  }, [user?.company_id])

  useEffect(() => {
    if (!_cache) load()
  }, [load])

  const refresh = () => load(true)

  return { bills, loading, refresh }
}
