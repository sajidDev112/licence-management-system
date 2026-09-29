import { useCallback, useEffect, useState } from 'react'
import { clientApi, licenseApi, productApi } from '../services/api'

/** Generic loader for a backend list endpoint, with reload and error state. */
function useResource(fetcher) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true)
      setError(null)
      try {
        setData(await fetcher())
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    },
    [fetcher]
  )

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, reload: load }
}

/**
 * Loads the license list. The backend is the source of truth for status, so
 * the list is simply re-fetched after every mutation.
 */
export default function useLicenses() {
  const { data, loading, error, reload } = useResource(licenseApi.list)
  return { licenses: data, loading, error, reload }
}

export function useProducts() {
  const { data, loading, error, reload } = useResource(productApi.list)
  return { products: data, loading, error, reload }
}

export function useClients() {
  const { data, loading, error, reload } = useResource(clientApi.list)
  return { clients: data, loading, error, reload }
}

const EMPTY_STATS = {
  totalClients: 0,
  activeLicenses: 0,
  pendingLicenses: 0,
  expiredLicenses: 0,
  totalLicenses: 0,
}

/**
 * Dashboard summary counts. These come from the backend rather than being
 * derived in the browser, so the dashboard never has to load every license.
 */
export function useStats() {
  const [stats, setStats] = useState(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStats(await licenseApi.stats())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { stats, loading, error, reload: load }
}

/** Free-text search across client, company, user ID, product, key and seller. */
export function filterLicenses(licenses, search, status) {
  const q = search.trim().toLowerCase()
  return licenses.filter((l) => {
    if (status !== 'all' && l.status !== status) return false
    if (!q) return true
    return [l.clientName, l.companyName, l.clientUserId, l.licenseKey, l.productName, l.soldBy]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(q))
  })
}
