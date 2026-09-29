import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, getToken, setToken, setUnauthorizedHandler } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null)
  // Starts true when a token exists, because that token still has to be checked
  // against the backend before any protected page may render.
  const [loading, setLoading] = useState(Boolean(getToken()))

  const signOut = useCallback(() => {
    setToken(null)
    setAdmin(null)
  }, [])

  // A 401 from any request means the token expired or was revoked server-side.
  useEffect(() => {
    setUnauthorizedHandler(() => signOut())
    return () => setUnauthorizedHandler(null)
  }, [signOut])

  // Validate a stored token on first load — never trust it on its own.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    let cancelled = false
    authApi
      .me()
      .then((me) => {
        if (!cancelled) setAdmin(me)
      })
      .catch(() => {
        if (!cancelled) signOut()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [signOut])

  const signIn = useCallback(async (credentials) => {
    const data = await authApi.login(credentials)
    setToken(data.token)
    setAdmin(data.admin)
    return data.admin
  }, [])

  const value = useMemo(
    () => ({ admin, loading, signIn, signOut, isAuthenticated: Boolean(admin) }),
    [admin, loading, signIn, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
