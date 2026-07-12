import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAllSortLogs, useUnits, type SortLogFilters } from '../api/hooks'
import { ErrorState } from '../components/ErrorState'
import { Pagination } from '../components/Pagination'
import { formatDateTime } from '../components/RelativeTime'
import { Spinner } from '../components/Spinner'

const inputClass =
  'rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none'

export function SortLogs() {
  const [filters, setFilters] = useState<SortLogFilters>({})
  const [page, setPage] = useState(1)
  const units = useUnits()
  const logs = useAllSortLogs(filters, page)

  function updateFilter(patch: SortLogFilters) {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-bold text-slate-800">Log Sortir</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-xs text-slate-500">
          Unit
          <select
            className={`${inputClass} mt-1 block`}
            value={filters.unit_id ?? ''}
            onChange={(e) =>
              updateFilter({ unit_id: e.target.value ? Number(e.target.value) : undefined })
            }
          >
            <option value="">Semua unit</option>
            {units.data?.data.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code} — {unit.location_label ?? '—'}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-500">
          Hasil
          <select
            className={`${inputClass} mt-1 block`}
            value={filters.is_correct ?? ''}
            onChange={(e) =>
              updateFilter({
                is_correct: e.target.value === '' ? undefined : (e.target.value as '1' | '0'),
              })
            }
          >
            <option value="">Semua</option>
            <option value="1">Benar</option>
            <option value="0">Salah</option>
          </select>
        </label>

        <label className="text-xs text-slate-500">
          Dari
          <input
            type="date"
            className={`${inputClass} mt-1 block`}
            value={filters.from ?? ''}
            onChange={(e) => updateFilter({ from: e.target.value || undefined })}
          />
        </label>

        <label className="text-xs text-slate-500">
          Sampai
          <input
            type="date"
            className={`${inputClass} mt-1 block`}
            value={filters.to ?? ''}
            onChange={(e) => updateFilter({ to: e.target.value || undefined })}
          />
        </label>

        {logs.data && (
          <div className="ml-auto rounded-lg bg-emerald-50 px-4 py-2 text-sm">
            <span className="text-slate-500">Akurasi periode: </span>
            <span className="font-bold text-emerald-700">
              {logs.data.summary.accuracy === null ? '—' : `${logs.data.summary.accuracy}%`}
            </span>
            <span className="ml-1 text-xs text-slate-400">
              ({logs.data.summary.correct}/{logs.data.summary.total_scored} benar)
            </span>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {logs.isPending ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : logs.isError ? (
          <ErrorState message="Gagal memuat log sortir." />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-4">Waktu</th>
                  <th className="py-2 pr-4">Unit</th>
                  <th className="py-2 pr-4">Item Quiz</th>
                  <th className="py-2 pr-4">Terdeteksi</th>
                  <th className="py-2 pr-4">Confidence</th>
                  <th className="py-2">Hasil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.data.data.map((log) => (
                  <tr key={`${log.id}-${log.created_at}`}>
                    <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="py-2 pr-4">
                      {log.unit ? (
                        <Link to={`/units/${log.unit.id}`} className="text-emerald-700 hover:underline">
                          {log.unit.code}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2 pr-4">{log.quiz_item?.item_name ?? '—'}</td>
                    <td className="py-2 pr-4 capitalize">{log.category_detected ?? '—'}</td>
                    <td className="py-2 pr-4">
                      {log.confidence === null ? (
                        '—'
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.round(log.confidence * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">
                            {Math.round(log.confidence * 100)}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-2">
                      {log.is_correct === null ? (
                        <span className="text-slate-400">—</span>
                      ) : log.is_correct ? (
                        <span className="text-emerald-600">✓ Benar</span>
                      ) : (
                        <span className="text-red-600">✗ Salah</span>
                      )}
                    </td>
                  </tr>
                ))}
                {logs.data.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      Tidak ada log pada filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <Pagination
              current={logs.data.meta.current_page}
              last={logs.data.meta.last_page}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  )
}
