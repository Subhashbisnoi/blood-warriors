import client, { setToken, clearToken } from './client';

export async function login(email: string, password: string): Promise<string> {
  const res = await client.post('/auth/login', { email, password });
  const token: string = res.data.access_token;
  setToken(token);
  return token;
}

export function logout() {
  clearToken();
}
