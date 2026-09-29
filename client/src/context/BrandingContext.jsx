import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { brandingApi } from '../services/api'

const BrandingContext = createContext(null)

/**
 * The console logo, stored in Firestore and served by the backend rather than
 * bundled into the build, so it can be changed from Settings without a redeploy.
 */
export function BrandingProvider({ children }) {
  const [logo, setLogo] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const branding = await brandingApi.get()
      setLogo(branding?.logo || null)
    } catch {
      // A missing logo is cosmetic — fall back to the wordmark and carry on.
      setLogo(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const value = useMemo(
    () => ({ logo, loading, setLogo, refresh: load }),
    [logo, loading, load]
  )

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding() {
  const ctx = useContext(BrandingContext)
  if (!ctx) throw new Error('useBranding must be used inside <BrandingProvider>')
  return ctx
}
