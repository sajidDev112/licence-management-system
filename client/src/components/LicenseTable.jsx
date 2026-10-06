import StatusBadge from './StatusBadge'
import LicenseKey from './LicenseKey'
import IconButton, { ACTION_ICONS } from './IconButton'
import { formatDate } from '../services/format'

/*
 * `nowrap` marks the columns whose content must stay on one line — the key, the
 * dates, the status chip. Everything else is allowed to wrap so the table can
 * compress to the available width instead of forcing a horizontal scrollbar.
 */
const COLUMNS = {
  licenseKey: {
    header: 'License Key',
    nowrap: true,
    render: (l, ctx) => <LicenseKey value={l.licenseKey} onCopied={ctx.onCopied} showLabel={false} />,
  },
  clientName: {
    header: 'Client',
    render: (l) => <span className="font-medium text-slate-900 dark:text-white">{l.clientName}</span>,
  },
  companyName: { header: 'Company', render: (l) => l.companyName },
  clientUserId: { header: 'User Name', render: (l) => l.clientUserId },
  productName: { header: 'Product', render: (l) => l.productName },
  soldBy: {
    header: 'Sold By',
    render: (l) =>
      l.soldBy || <span className="text-slate-400 dark:text-slate-600">&mdash;</span>,
  },
  startDate: { header: 'Start Date', nowrap: true, render: (l) => formatDate(l.startDate) },
  expiryDate: { header: 'Expiry Date', nowrap: true, render: (l) => formatDate(l.expiryDate) },
  status: {
    header: 'Status',
    nowrap: true,
    // Display only. The license is switched off and on from its details popup,
    // so a stray click in a long table cannot cut a client off.
    render: (l) => <StatusBadge status={l.status} />,
  },
}

/** Edit opens the editable details popup; Delete asks for confirmation first. */
function Actions({ license, actions }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Edit" paths={ACTION_ICONS.edit} onClick={() => actions.onView(license)} />
      {actions.onDelete && (
        <IconButton
          label="Delete"
          paths={ACTION_ICONS.delete}
          tone="danger"
          onClick={() => actions.onDelete(license)}
        />
      )}
    </div>
  )
}

export default function LicenseTable({ licenses, columns, actions, onCopied }) {
  const cols = columns.map((key) => ({ key, ...COLUMNS[key] }))

  return (
    <>
      {/* Desktop / tablet: real table */}
      {/* overflow-x-auto is only a safety net for very narrow windows; the
          columns below are sized to fit without it at laptop widths and up. */}
      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full table-auto text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="table-head">
                  {c.header}
                </th>
              ))}
              <th className="table-head">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {licenses.map((license) => (
              <tr
                key={license.id}
                className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
              >
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={`px-2 py-3 align-middle text-slate-600 dark:text-slate-300 ${
                      c.nowrap ? 'whitespace-nowrap' : 'break-words'
                    }`}
                  >
                    {c.render(license, { onCopied })}
                  </td>
                ))}
                <td className="whitespace-nowrap px-2 py-3 align-middle">
                  <Actions license={license} actions={actions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Below xl the ten columns cannot fit, so every field is shown stacked
          instead — nothing is hidden, and there is nothing to scroll sideways. */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 xl:hidden">
        {licenses.map((license) => (
          <div key={license.id} className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900 dark:text-white">
                  {license.clientName}
                </p>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">
                  {license.companyName}
                </p>
              </div>
              <StatusBadge status={license.status} />
            </div>
            <LicenseKey value={license.licenseKey} onCopied={onCopied} />
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">User Name</dt>
              <dd className="truncate text-right text-slate-800 dark:text-slate-200">
                {license.clientUserId}
              </dd>
              <dt className="text-slate-500 dark:text-slate-400">Product</dt>
              <dd className="text-right text-slate-800 dark:text-slate-200">{license.productName}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Sold By</dt>
              <dd className="truncate text-right text-slate-800 dark:text-slate-200">
                {license.soldBy || '—'}
              </dd>
              <dt className="text-slate-500 dark:text-slate-400">Start</dt>
              <dd className="text-right text-slate-800 dark:text-slate-200">
                {formatDate(license.startDate)}
              </dd>
              <dt className="text-slate-500 dark:text-slate-400">Expires</dt>
              <dd className="text-right text-slate-800 dark:text-slate-200">
                {formatDate(license.expiryDate)}
              </dd>
            </dl>
            <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
              <Actions license={license} actions={actions} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
