import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AlertType } from '../api/contracts'
import { useAlerts, useMarkAlertRead } from '../api/hooks'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Pagination } from '../components/Pagination'
import { RelativeTime } from '../components/RelativeTime'
import { Spinner } from '../components/Spinner'

const ICONS: Record<AlertType, string> = {
  fill_70: '🟡',
  fill_90: '🔴',
  offline: '📡',
  maintenance: '🔧',
}

export function Alerts() {
  const [unreadOnly, setUnreadOnly] = useState(true)
  const [page, setPage] = useState(1)
  const alerts = useAlerts(unreadOnly, page)
  const markRead = useMarkAlertRead()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">Alert</h1>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {([true, false] as const).map((tab) => (
            <button
              key={String(tab)}
              onClick={() => {
                setUnreadOnly(tab)
                setPage(1)
              }}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                unreadOnly === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              {tab ? 'Belum dibaca' : 'Semua'}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        {alerts.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : alerts.isError ? (
          <div className="p-4">
            <ErrorState message="Gagal memuat alert." />
          </div>
        ) : alerts.data.data.length === 0 ? (
          <div className="p-4">
            <EmptyState message={unreadOnly ? 'Tidak ada alert belum dibaca. 🎉' : 'Belum ada alert.'} />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {alerts.data.data.map((alert) => (
                <li key={alert.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-lg">{ICONS[alert.alert_type]}</span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${
                        alert.is_read ? 'text-slate-500' : 'font-semibold text-slate-800'
                      }`}
                    >
                      {alert.message}
                    </p>
                    <p className="text-xs text-slate-400">
                      <Link to={`/units/${alert.unit.id}`} className="text-emerald-700 hover:underline">
                        {alert.unit.code}
                      </Link>{' '}
                      · <RelativeTime iso={alert.created_at} />
                    </p>
                  </div>
                  {!alert.is_read && (
                    <button
                      onClick={() => markRead.mutate(alert.id)}
                      className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Tandai dibaca
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="px-4 pb-3">
              <Pagination
                current={alerts.data.meta.current_page}
                last={alerts.data.meta.last_page}
                onChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
