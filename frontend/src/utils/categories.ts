// ── Category utilities ────────────────────────────────────────────────────────
export const BASE_CATEGORIES = [
  'Medicines',
  'Fluids/Juice',
  'Logistics',
  'Food',
  'Equipment',
  'Lab Supplies',
  'Patient Transport',
  'Other',
]

export const EXP_HEADS = [
  'MEDICINES','FLUIDS','LOGISTICS','FOOD','EQUIPMENT','LAB','TRANSPORT',
  'ADMINISTRATION','UTILITIES','PROFESSIONAL','OTHER',
]

const LS_KEY = 'custom_categories'

export function getAllCategories(): string[] {
  const custom = getCustomCategories()
  return [...BASE_CATEGORIES, ...custom.filter(c => !BASE_CATEGORIES.includes(c))]
}

export function getCustomCategories(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function addCustomCategory(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const existing = getCustomCategories()
  if (existing.includes(trimmed) || BASE_CATEGORIES.includes(trimmed)) return
  localStorage.setItem(LS_KEY, JSON.stringify([...existing, trimmed]))
}

export function removeCustomCategory(name: string): void {
  const existing = getCustomCategories()
  localStorage.setItem(LS_KEY, JSON.stringify(existing.filter(c => c !== name)))
}

export async function syncCategoriesFromApi(_companyId?: string): Promise<string[]> {
  // categories endpoint not available — use local list
  return getAllCategories()
}
