import axios from 'axios'

if (import.meta.env.VITE_API_URL) {
  axios.defaults.baseURL = import.meta.env.VITE_API_URL
}

// Attach bw_token to every request
axios.interceptors.request.use(cfg => {
  const token = localStorage.getItem('bw_token')
  if (token && cfg.headers) cfg.headers['Authorization'] = `Bearer ${token}`
  return cfg
})

axios.interceptors.request.use(cfg => { (cfg as unknown as Record<string, unknown>)._t0 = performance.now(); return cfg })
axios.interceptors.response.use(
  res => {
    const ms = performance.now() - ((res.config as unknown as Record<string, unknown>)._t0 as number ?? 0)
    console.log(`[PERF] axios ${res.config.method?.toUpperCase()} ${res.config.url} → ${res.status} | ${ms.toFixed(0)}ms`)
    return res
  },
  err => {
    const ms = performance.now() - ((err.config as unknown as Record<string, unknown>)?._t0 as number ?? 0)
    console.warn(`[PERF] axios ERR ${err.config?.method?.toUpperCase()} ${err.config?.url} | ${ms.toFixed(0)}ms`)
    return Promise.reject(err)
  }
)

export type InvoicePayload = Record<string, unknown>

// QueueItem — used by UploadStep / BillUploadPage
export interface QueueItem {
  file: File
  data: InvoicePayload
}

// UploadEntry — internal queue entry in UploadStep
export interface UploadEntry {
  file: File
  status: 'pending' | 'processing' | 'done' | 'error'
  result?: InvoicePayload
  error?: string
}

async function fileHash(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

const CACHE_PREFIX = 'bw_ocr_v2_'
const MAX_CACHE_ENTRIES = 50

function cacheGet(hash: string): InvoicePayload | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + hash)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(CACHE_PREFIX + hash)
      return null
    }
    return data
  } catch {
    return null
  }
}

function cacheSet(hash: string, data: InvoicePayload): void {
  try {
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .map(k => ({ key: k, ts: JSON.parse(localStorage.getItem(k)!).ts as number }))
      .sort((a, b) => a.ts - b.ts)
    while (keys.length >= MAX_CACHE_ENTRIES) {
      localStorage.removeItem(keys.shift()!.key)
    }
    localStorage.setItem(CACHE_PREFIX + hash, JSON.stringify({ data, ts: Date.now() }))
  } catch {}
}

export async function ocrInvoice(file: File): Promise<InvoicePayload> {
  const hash = await fileHash(file)
  const cached = cacheGet(hash)
  if (cached) {
    console.log('[cache] hit —', file.name)
    return cached
  }
  const form = new FormData()
  form.append('file', file)
  // blood-warriors uses /bills/ocr instead of /api/invoices/ocr
  const { data } = await axios.post<InvoicePayload>('/bills/ocr', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  cacheSet(hash, data)
  return data
}

export async function ocrInvoiceBulk(files: File[]): Promise<InvoicePayload[]> {
  const form = new FormData()
  for (const f of files) form.append('files', f)
  const { data } = await axios.post<{ results: InvoicePayload[] }>('/bills/ocr-bulk', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.results
}

export interface IngestResult {
  status: string
  supplier_id: string
  upload_id: string
  ocr_id: string
  stg_bill_id: string
  invoice_id: string
  line_items_count: number
  is_duplicate?: boolean
  duplicate_invoice_number?: string | null
}

export async function ingestInvoice(payload: InvoicePayload, companyId?: string): Promise<IngestResult> {
  const { data } = await axios.post<IngestResult>('/bills/ingest', { payload, company_id: companyId ?? null })
  return data
}

export function clearOcrCache(): void {
  Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_PREFIX))
    .forEach(k => localStorage.removeItem(k))
}

export function getOcrCacheSize(): number {
  return Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).length
}

export interface Vendor {
  supplier_id: string
  name: string
  gstn: string | null
  email: string | null
  payment_terms_days: number
  status: string
  is_active: boolean
  source: string
  total_bills: number
  total_billed: number
  outstanding_amount: number
  last_invoice_date: string | null
  created_at: string | null
  bank_account: string | null
  bank_ifsc: string | null
  bank_verified: boolean
  pan: string | null
  vendor_category_id: string | null
  vendor_category_name: string | null
}

const VENDORS_CACHE_TTL = 5 * 60 * 1000

function vendorsCacheKey(companyId?: string) {
  return `bw_vendors_cache_${companyId ?? 'default'}`
}

function vendorsCacheGet(companyId?: string): Vendor[] | null {
  try {
    const key = vendorsCacheKey(companyId)
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > VENDORS_CACHE_TTL) {
      localStorage.removeItem(key)
      return null
    }
    return data
  } catch { return null }
}

function vendorsCacheSet(vendors: Vendor[], companyId?: string): void {
  try {
    localStorage.setItem(vendorsCacheKey(companyId), JSON.stringify({ data: vendors, ts: Date.now() }))
  } catch {}
}

export function invalidateVendorsCache(companyId?: string): void {
  localStorage.removeItem(vendorsCacheKey(companyId))
}

export async function createVendor(payload: {
  name: string
  gstn?: string
  email?: string
  payment_terms_days?: number
  company_id?: string
  bank_account?: string
  bank_ifsc?: string
}): Promise<{
  supplier_id: string
  legal_name?: string
  trade_name?: string
  gstin_verified?: boolean
  gstin_status?: string
  pan?: string
  pan_verified?: boolean
  pan_warning?: string
  bank_verified?: boolean
  bank_skipped?: boolean
  name_at_bank?: string
  bank_warning?: string
}> {
  const { data } = await axios.post('/vendors', payload)
  return data
}

export async function bulkCreateVendorsExcel(file: File, companyId?: string): Promise<{
  created: number; skipped: number; errors: string[]
}> {
  const form = new FormData()
  form.append('file', file)
  const params = companyId ? { company_id: companyId } : {}
  const { data } = await axios.post('/vendors/bulk-excel', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params,
  })
  return data
}

export async function fetchVendors(forceRefresh = false, companyId?: string, onBackground?: (v: Vendor[]) => void): Promise<Vendor[]> {
  const params = companyId ? { company_id: companyId } : {}
  const doFetch = async () => {
    const { data } = await axios.get<{ vendors: Vendor[]; total: number }>('/vendors', { params })
    vendorsCacheSet(data.vendors, companyId)
    return data.vendors
  }
  if (!forceRefresh) {
    const cached = vendorsCacheGet(companyId)
    if (cached) {
      doFetch().then(fresh => onBackground?.(fresh)).catch(() => {})
      return cached
    }
  }
  return doFetch()
}

export async function requestVendorInfo(supplierId: string, payload: {
  requested_by: string
  email_to?: string
  company_id?: string
}): Promise<{ status: string; email_to: string; subject: string; body: string }> {
  const { data } = await axios.post(`/vendors/${supplierId}/request-info`, payload)
  return data
}

export interface BankAccount {
  id: string
  account_number: string
  ifsc: string | null
  bank_name: string | null
  is_primary: boolean
  verified: boolean
  name_at_bank: string | null
  created_at: string | null
}

export async function fetchVendorBankAccounts(supplierId: string, companyId?: string): Promise<BankAccount[]> {
  const params = companyId ? { company_id: companyId } : {}
  const { data } = await axios.get(`/vendors/${supplierId}/bank-accounts`, { params })
  return data
}

export async function addVendorBankAccount(supplierId: string, body: { account_number: string; ifsc?: string; bank_name?: string; is_primary?: boolean; company_id?: string }): Promise<BankAccount> {
  const { data } = await axios.post(`/vendors/${supplierId}/bank-accounts`, body)
  return data
}

export async function deleteVendorBankAccount(supplierId: string, accountId: string, companyId?: string): Promise<void> {
  const params = companyId ? { company_id: companyId } : {}
  await axios.delete(`/vendors/${supplierId}/bank-accounts/${accountId}`, { params })
}

export async function setPrimaryBankAccount(supplierId: string, accountId: string, companyId?: string): Promise<BankAccount[]> {
  const params = companyId ? { company_id: companyId } : {}
  const { data } = await axios.post(`/vendors/${supplierId}/bank-accounts/${accountId}/set-primary`, null, { params })
  return data
}

export async function fetchVendorOutreach(supplierId: string, companyId?: string): Promise<{
  logs: { id: string; requested_by: string; requested_at: string | null; email_to: string | null; subject: string | null; status: string }[]
}> {
  const params = companyId ? { company_id: companyId } : {}
  const { data } = await axios.get(`/vendors/${supplierId}/outreach`, { params })
  return data
}

export interface Bill {
  invoice_id: string
  id: string
  invoice_date: string | null
  due_date: string | null
  status: string
  allowed_roles?: string[]
  allowed_usernames?: string[] | null
  status_label?: string | null
  total_amount: number | null
  currency_code: string
  vendor_name: string | null
  vendor_gstn: string | null
  original_file: string | null
  upload_id: string | null
  stg_bill_id: string | null
  created_at: string | null
  uploaded_by_name: string | null
  uploaded_by_role: string | null
  category: string | null
  department: string | null
  payment_status: string | null
  amount_paid: number | null
  outstanding_amount: number | null
  payment_updated_by: string | null
  payment_updated_at: string | null
  tally_push_pending: boolean
  manual_priority: string | null
  tds_status: string | null
  tds_section_code: string | null
  tds_rate: number | null
  tds_amount: number | null
  tds_base_amount: number | null
  net_payable: number | null
}

const BILLS_CACHE_TTL = 5 * 60 * 1000

function billsCacheKey(companyId?: string, role?: string) {
  return `bw_bills_cache_v2_${companyId ?? 'default'}_${role ?? 'all'}`
}

function billsCacheGet(companyId?: string, role?: string): Bill[] | null {
  try {
    const key = billsCacheKey(companyId, role)
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > BILLS_CACHE_TTL) {
      localStorage.removeItem(key)
      return null
    }
    return data
  } catch {
    return null
  }
}

function billsCacheSet(bills: Bill[], companyId?: string, role?: string): void {
  try {
    localStorage.setItem(billsCacheKey(companyId, role), JSON.stringify({ data: bills, ts: Date.now() }))
  } catch {}
}

export function invalidateBillsCache(companyId?: string): void {
  localStorage.removeItem(billsCacheKey(companyId))
}

export interface ChainEntry {
  id: number
  step: number
  actor_role: string | null
  actor_name: string | null
  action: string
  comment: string | null
  created_at: string | null
}

export interface BillAttachment {
  id: string
  file_name: string
  file_type: string | null
  file_size: number | null
  uploaded_by: string | null
  uploaded_at: string | null
}

export interface BillDetail {
  invoice_id: string
  id: string
  bill_number: string | null
  invoice_date: string | null
  due_date: string | null
  status: string
  allowed_roles?: string[]
  allowed_usernames?: string[] | null
  status_label?: string | null
  subtotal: number | null
  tax_amount: number | null
  total_amount: number | null
  amount_paid: number | null
  outstanding_amount: number | null
  discount_amount: number | null
  currency_code: string
  payment_terms_days: number | null
  upload_id: string | null
  stg_bill_id: string | null
  original_file: string | null
  created_at: string | null
  category: string | null
  department: string | null
  vendor: { name: string | null; gstn: string | null; email: string | null }
  buyer: { name: string; gstn: string }
  line_items: {
    line_number: number
    product_name: string | null
    hsn_code: string | null
    quantity: number | null
    unit: string | null
    unit_price: number | null
    discount_amount: number | null
    tax_rate_percent: number | null
    tax_amount: number | null
    line_total: number | null
  }[]
  chain: ChainEntry[]
  attachments: BillAttachment[]
  manual_priority: string | null
  tds_status: string | null
  tds_section_code: string | null
  tds_rate: number | null
  tds_amount: number | null
  tds_base_amount: number | null
  net_payable: number | null
}

const DETAIL_CACHE_PREFIX = 'bw_bill_detail_'
const DETAIL_CACHE_TTL = 2 * 60 * 1000

function detailCacheGet(invoiceId: string): BillDetail | null {
  try {
    const raw = localStorage.getItem(DETAIL_CACHE_PREFIX + invoiceId)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > DETAIL_CACHE_TTL) {
      localStorage.removeItem(DETAIL_CACHE_PREFIX + invoiceId)
      return null
    }
    return data
  } catch { return null }
}

function detailCacheSet(invoiceId: string, data: BillDetail): void {
  try {
    localStorage.setItem(DETAIL_CACHE_PREFIX + invoiceId, JSON.stringify({ data, ts: Date.now() }))
  } catch {}
}

export function invalidateDetailCache(invoiceId?: string): void {
  if (invoiceId) {
    localStorage.removeItem(DETAIL_CACHE_PREFIX + invoiceId)
    return
  }
  Object.keys(localStorage)
    .filter(k => k.startsWith(DETAIL_CACHE_PREFIX))
    .forEach(k => localStorage.removeItem(k))
}

export async function fetchBillDetail(invoiceId: string): Promise<BillDetail> {
  const cached = detailCacheGet(invoiceId)
  if (cached) return cached
  const { data } = await axios.get<BillDetail>(`/bills/${invoiceId}`)
  detailCacheSet(invoiceId, data)
  return data
}

export async function billAction(invoiceId: string, payload: {
  action: 'submit' | 'approve' | 'send_back' | 'priority_change'
  actor_role: string
  actor_name: string
  comment?: string
}): Promise<{ status: string }> {
  invalidateDetailCache(invoiceId)
  invalidateBillsCache()
  const { data } = await axios.post<{ status: string }>(`/bills/${invoiceId}/action`, payload)
  return data
}

export async function updateBill(invoiceId: string, updates: Record<string, unknown>): Promise<void> {
  invalidateDetailCache(invoiceId)
  // best-effort update — blood-warriors backend may not support all fields
  await axios.put(`/bills/${invoiceId}`, updates).catch(() => {})
}

export async function updatePaymentStatus(
  _invoiceId: string,
  _payload: { payment_status: string; amount_paid?: number; actor_name?: string; actor_role?: string }
): Promise<void> {
  invalidateBillsCache()
  // payment status endpoint not available in blood-warriors backend
}

export async function fetchNotificationCount(_role: string, _companyId?: string): Promise<number> {
  // notifications endpoint not available in blood-warriors backend
  return 0
}

export async function fetchBills(forceRefresh = false, companyId?: string, onBackground?: (b: Bill[]) => void, role?: string, username?: string): Promise<Bill[]> {
  const params: Record<string, string> = {}
  if (companyId) params.company_id = companyId
  if (role) params.role = role
  if (username) params.username = username
  const doFetch = async () => {
    const { data } = await axios.get<Bill[] | { bills: Bill[]; total: number }>('/bills', { params })
    const bills = Array.isArray(data) ? data : (data as { bills: Bill[] }).bills ?? []
    billsCacheSet(bills, companyId, role)
    return bills
  }
  if (!forceRefresh) {
    const cached = billsCacheGet(companyId, role)
    if (cached) {
      doFetch().then(fresh => onBackground?.(fresh)).catch(() => {})
      return cached
    }
  }
  return doFetch()
}

export interface ChainStepAPI {
  step_order: number
  label: string
  role: string
  locked: boolean
  assignees?: string[] | null
}

const DEFAULT_CHAIN_STEPS: ChainStepAPI[] = [
  { step_order: 1, label: 'Pending Admin Approval', role: 'admin', locked: false },
  { step_order: 2, label: 'Approved', role: 'admin', locked: true },
]

export async function fetchChainConfig(_companyId?: string, _department?: string): Promise<ChainStepAPI[]> {
  return DEFAULT_CHAIN_STEPS
}

export async function saveChainConfig(_steps: ChainStepAPI[], _companyId?: string, _department?: string): Promise<void> {
  // not supported in blood-warriors backend
}

export async function fetchDepartments(_companyId?: string): Promise<string[]> {
  return []
}

export async function fetchUserDepartments(username: string, companyId?: string): Promise<string[]> {
  const params: Record<string, string> = { username }
  if (companyId) params.company_id = companyId
  const { data } = await axios.get<{ departments: string[] }>('/settings/user-departments', { params })
  return data.departments
}

export async function addDepartment(_department: string, _companyId?: string): Promise<void> {}

export async function deleteDepartment(_department: string, _companyId?: string): Promise<void> {}

export async function fetchChainDefault(_companyId?: string, _department?: string): Promise<ChainStepAPI[]> {
  return DEFAULT_CHAIN_STEPS
}

export async function saveChainAsDefault(_companyId?: string, _department?: string): Promise<void> {}

export interface CompanyUser {
  username: string
  name: string
  role: string
  email: string
  department: string | null
}

export async function fetchUsers(companyId?: string, department?: string): Promise<CompanyUser[]> {
  const params: Record<string, string> = {}
  if (companyId) params.company_id = companyId
  if (department) params.department = department
  const { data } = await axios.get<{ users: CompanyUser[] }>('/users', { params })
  return data.users
}

export async function createUser(payload: {
  username: string; password: string; role: string; name: string; email: string; department?: string; company_id?: string
}): Promise<void> {
  await axios.post('/users', payload)
}

export async function updateUser(username: string, payload: {
  role?: string; name?: string; email?: string; department?: string; password?: string
}, companyId?: string): Promise<void> {
  const params: Record<string, string> = {}
  if (companyId) params.company_id = companyId
  await axios.put(`/users/${username}`, payload, { params })
}

export async function deleteUser(username: string, companyId?: string): Promise<void> {
  const params: Record<string, string> = {}
  if (companyId) params.company_id = companyId
  await axios.delete(`/users/${username}`, { params })
}

export interface BulkActionResult {
  bill_id: string
  success: boolean
  status?: string
  error?: string
}

export async function bulkBillAction(payload: {
  bill_ids: string[]
  action: 'APPROVE' | 'PUSH_TALLY' | 'MARK_PAID'
  actor_name: string
  actor_role: string
  company_id?: string
  options?: { payment_date?: string; payment_method?: string }
}): Promise<{ results: BulkActionResult[]; succeeded: number; failed: number; total: number }> {
  invalidateBillsCache()
  const { data } = await axios.post('/bills/bulk-action', payload)
  return data
}

export interface Category {
  id: string
  name: string
  exp_head?: string | null
}

const MEDICAL_CATEGORIES: Category[] = [
  { id: 'medicines', name: 'Medicines' },
  { id: 'logistics', name: 'Logistics' },
  { id: 'admin', name: 'Admin' },
  { id: 'it', name: 'IT' },
  { id: 'food', name: 'Food' },
]

export async function fetchCategories(_companyId?: string): Promise<Category[]> {
  return MEDICAL_CATEGORIES
}

export async function createCategory(name: string, expHead?: string, _companyId?: string): Promise<Category> {
  return { id: name.toLowerCase().replace(/\s+/g, '_'), name, exp_head: expHead || null }
}

export async function deleteCategory(_id: string, _companyId?: string): Promise<void> {}

export async function downloadExpenseReport(month?: string, companyId?: string, status?: string): Promise<void> {
  const params: Record<string, string> = {}
  if (month) params.month = month
  if (companyId) params.company_id = companyId
  if (status) params.status = status
  const response = await axios.get('/api/reports/expense-xlsx', {
    params,
    responseType: 'blob',
  })
  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const label = month ? month : 'ALL'
  a.href = url
  a.download = `Medical_Expense_Report_${label}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
