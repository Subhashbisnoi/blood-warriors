export type Role = 'admin' | 'member' | 'approver' | 'accountant' | 'finance_controller'

export interface AuthUser {
  username: string
  role: Role
  name: string
  email: string
  company_id: string
  company_name: string
  department: string | null
}

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('bw_user')
    if (raw) return JSON.parse(raw) as AuthUser
    const token = localStorage.getItem('bw_token')
    if (token) {
      const claims = decodeJwt(token)
      return {
        username: (claims.sub as string) ?? 'admin',
        role: ((claims.role as string) ?? 'admin') as Role,
        name: (claims.name as string) ?? (claims.sub as string) ?? 'Admin',
        email: (claims.sub as string) ?? '',
        company_id: (claims.company_id as string) ?? 'bloodwarriors',
        company_name: 'Blood Warriors',
        department: (claims.department as string) ?? null,
      }
    }
    return null
  } catch {
    return null
  }
}

// No Provider needed — reads directly from localStorage
export function useAuth() {
  const user = getUser()

  const logout = () => {
    localStorage.removeItem('bw_token')
    localStorage.removeItem('bw_user')
    window.location.href = '/'
  }

  return { user, logout }
}

// Dummy AuthProvider export so nothing breaks if referenced elsewhere
export function AuthProvider({ children }: { children: import('react').ReactNode }) {
  return <>{children}</>
}
