import axios from 'axios';

const client = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('bw_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('bw_token');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export const setToken = (token: string) => localStorage.setItem('bw_token', token);
export const clearToken = () => localStorage.removeItem('bw_token');
export const getToken = () => localStorage.getItem('bw_token');

export default client;
