import { getToken, clearToken } from '../api/client';

export function useAuth() {
  const token = getToken();
  const isAuthenticated = !!token;

  function logout() {
    clearToken();
    window.location.href = '/';
  }

  return { isAuthenticated, logout };
}
