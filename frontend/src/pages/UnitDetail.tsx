import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  FillHistoryHourlyPoint,
  FillHistoryRawPoint,
  UnitStatus,
} from '../api/contracts'
import { useFillHistory, useSortLogs, useUnit, useUpdateUnit, type FillRange } from '../api/hooks'
import { useAuth } from '../auth/AuthContext'
import { ErrorState } from '../components/ErrorState'
import { FillBar } from '../components/FillBar'
import { formatDateTime, RelativeTime } from '../components/RelativeTime'
import { Spinner } from '../components/Spinner'
import { StatusBadge } from '../components/StatusBadge'

const RANGES: Array<{ value: FillRange; label: string }> = [
  { value: '24h', label: '24 jam' },
  { value: '7d', label: '7 hari' },
  { value: '30d', label: '30 hari' },
]

const STATUSES: UnitStatus[] = ['active', 'maintenance', 'offline']

function chartTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso))
}

function FillChart({ unitId, range }: { unitId: number; range: FillRange }) {
  const history = useFillHistory(unitId, range)

  if (history.isPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (history.isError) {
    return <ErrorState message="Gagal memuat riwayat fill level." />
  }

  const points =
    history.data.interval === 'raw'
      ? (history.data.data as FillHistoryRawPoint[]).map((p) => ({
          time: chartTime(p.recorded_at),
          organik: p.organic_pct,
          anorganik: p.inorganic_pct,
        }))
      : (history.data.data as FillHistoryHourlyPoint[]).map((p) => ({
          time: chartTime(p.bucket),
          organik: p.avg_organic_pct,
          anorganik: p.avg_inorganic_pct,
        }))

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        Tidak ada data pada rentang ini.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={32} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="organik" stroke="#059669" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="anorganik" stroke="#d97706" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function SortLogTable({ unitId }: { unitId: number }) {
  const [page, setPage] = useState(1)
  const logs = useSortLogs(unitId, page)

  if (logs.isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  if (logs.isError) {
    return <ErrorState message="Gagal memuat log sortir." />
  }

  const { data, meta } = logs.data

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="py-2 pr-4">Waktu</th>
            <th className="py-2 pr-4">Item Quiz</th>
            <th className="py-2 pr-4">Terdeteksi</th>
            <th className="py-2 pr-4">Confidence</th>
            <th className="py-2">Hasil</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((log) => (
            <tr key={`${log.id}-${log.created_at}`}>
              <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
                {formatDateTime(log.created_at)}
              </td>
              <td className="py-2 pr-4">{log.quiz_item?.item_name ?? '—'}</td>
              <td className="py-2 pr-4 capitalize">{log.category_detected ?? '—'}</td>
              <td className="py-2 pr-4">
                {log.confidence === null ? '—' : `${Math.round(log.confidence * 100)}%`}
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
          {data.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-slate-400">
                Belum ada log sortir.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {meta.last_page > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            disabled={meta.current_page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <span className="text-slate-500">
            Hal {meta.current_page} / {meta.last_page}
          </span>
          <button
            disabled={meta.current_page >= meta.last_page}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      )}
    </div>
  )
}

export function UnitDetail() {
  const { id } = useParams()
  const unitId = Number(id)
  const { isSuperAdmin } = useAuth()
  const unit = useUnit(unitId)
  const updateUnit = useUpdateUnit(unitId)
  const [range, setRange] = useState<FillRange>('24h')

  if (unit.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  if (unit.isError) {
    return <ErrorState message="Unit tidak ditemukan atau bukan milik sekolah Anda." />
  }

  const u = unit.data

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{u.code}</h1>
          <p className="text-sm text-slate-500">
            {u.school.name} · {u.location_label ?? 'Tanpa label lokasi'}
          </p>
          {u.last_seen_at && (
            <p className="mt-1 text-xs text-slate-400">
              Terakhir aktif <RelativeTime iso={u.last_seen_at} />
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge status={u.status} />
          {isSuperAdmin && (
            <select
              value={u.status}
              disabled={updateUnit.isPending}
              onChange={(e) => updateUnit.mutate({ status: e.target.value as UnitStatus })}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  Ubah ke: {status}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {u.latest_fill && (
        <div className="grid max-w-md gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <FillBar label="Organik" pct={u.latest_fill.organic_pct} />
          <FillBar label="Anorganik" pct={u.latest_fill.inorganic_pct} />
          <p className="text-xs text-slate-400">
            Pembacaan <RelativeTime iso={u.latest_fill.recorded_at} />
          </p>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-600">Riwayat Fill Level</h2>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`rounded-lg px-3 py-1 text-xs font-medium ${
                  range === r.value
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <FillChart unitId={unitId} range={range} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Log Sortir</h2>
        <SortLogTable unitId={unitId} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Maintenance Event</h2>
        {u.maintenance_events && u.maintenance_events.length > 0 ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {u.maintenance_events.map((event) => (
              <li key={event.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="font-medium capitalize">{event.event_type.replace('_', ' ')}</span>
                  {event.note && <span className="text-slate-500"> — {event.note}</span>}
                  <p className="text-xs text-slate-400">{formatDateTime(event.created_at)}</p>
                </div>
                <span
                  className={`text-xs ${event.resolved ? 'text-emerald-600' : 'text-amber-600'}`}
                >
                  {event.resolved ? 'Selesai' : 'Terbuka'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Tidak ada maintenance event.</p>
        )}
      </section>
    </div>
  )
}
