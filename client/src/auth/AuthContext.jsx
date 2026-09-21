import { useEffect, useState } from 'react'
import api from '../services/api'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const interceptor = api.interceptors.response.use(response => response, requestError => {
      if (requestError.response?.status === 401 && requestError.config?.url?.startsWith('/documents')) setUser(null)
      return Promise.reject(requestError)
    })
    api.get('/auth/me', { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setUser(data.user)
    }).catch(requestError => {
      if (controller.signal.aborted) return
      if (requestError.response?.status === 401) setUser(null)
      else setError('Unable to check your session. Please try again.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); api.interceptors.response.eject(interceptor) }
  }, [attempt])

  function retry() { setLoading(true); setError(''); setAttempt(current => current + 1) }
  async function authenticate(mode, values) {
    const { data } = await api.post(`/auth/${mode}`, values)
    setUser(data.user)
    setError('')
  }
  async function logout() {
    await api.post('/auth/logout')
    setUser(null)
  }
  return <AuthContext.Provider value={{ user, loading, error, retry, authenticate, logout }}>{children}</AuthContext.Provider>
}
