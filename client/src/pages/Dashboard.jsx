import StatCard, { STAT_ICONS } from '../components/StatCard'
import { ErrorState } from '../components/States'
import { useStats } from '../hooks/useLicenses'

/**
 * Summary-only dashboard. Licenses themselves live on the Licenses page, so
 * this reads the aggregate counts rather than the full list.
 */
export default function Dashboard() {
  const { stats, loading, error, reload } = useStats()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Dashboard</h1>
        {/* <p className="page-subtitle">Every client you have issued a license to, at a glance.</p> */}
      </div>

      {error ? (
        <div className="card overflow-hidden">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total Clients"
            value={stats.totalClients}
            tone="indigo"
            icon={STAT_ICONS.clients}
            loading={loading}
          />
          <StatCard
            label="Active Licenses"
            value={stats.activeLicenses}
            tone="emerald"
            icon={STAT_ICONS.active}
            loading={loading}
          />
          <StatCard
            label="Expired Licenses"
            value={stats.expiredLicenses}
            tone="red"
            icon={STAT_ICONS.expired}
            loading={loading}
          />
          <StatCard
            label="Deactive"
            value={stats.deactivatedLicenses}
            tone="slate"
            icon={STAT_ICONS.deactivated}
            loading={loading}
          />
          <StatCard
            label="Total Licenses"
            value={stats.totalLicenses}
            tone="slate"
            icon={STAT_ICONS.total}
            loading={loading}
          />
        </div>
      )}
    </div>
  )
}
