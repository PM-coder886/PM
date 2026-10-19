import axios from 'axios'

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787/api/v1').replace(/\/+$/, ''),
  timeout: 10000,
  headers: { Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('blog-admin-token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function payload(response) {
  return response?.data?.data ?? response?.data
}

export function messageFrom(error) {
  return error?.response?.data?.error || error?.message || '暂时无法连接服务，请稍后再试。'
}
