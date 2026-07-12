import axios from 'axios'

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  // Kirim X-XSRF-TOKEN dari cookie meski origin FE ≠ origin API (dev: 5173 → 8000)
  withXSRFToken: true,
  headers: { Accept: 'application/json' },
})

// Endpoint csrf-cookie ada di luar prefix /api
export async function ensureCsrf(): Promise<void> {
  await axios.get(new URL('/sanctum/csrf-cookie', API_URL).toString(), {
    withCredentials: true,
  })
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !window.location.pathname.startsWith('/login')
    ) {
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)
