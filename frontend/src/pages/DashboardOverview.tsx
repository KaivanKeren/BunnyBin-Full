import { Link } from 'react-router-dom'
import type { Alert, Unit } from '../api/contracts'
import { useAlerts, useDashboardSummary, useUnits } from '../api/hooks'
import { EmptyState } from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { FillBar } from '../components/FillBar'
import { RelativeTime } from '../components/RelativeTime'
import { Spinner } from '../components/Spinner'
import { StatusBadge } from '../components/StatusBadge'

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ?? 'text-slate-800'}`}>{value}</div>
    </div>
  )
}

function UnitCard({ unit }: { unit: Unit }) {
  return (
    <Link
      to={`/units/${unit.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="font-semibold text-slate-800">{unit.code}</div>
          <div className="text-xs text-slate-500">
            {unit.location_label ?? '—'} · {unit.school.name}
          </div>
        </div>
        <StatusBadge status={unit.status} />
      </div>

      {unit.latest_fill ? (
        <div className="flex flex-col gap-2">
          <FillBar label="Organik" pct={unit.latest_fill.organic_pct} />
          <FillBar label="Anorganik" pct={unit.latest_fill.inorganic_pct} />
        </div>
      ) : (
        <p className="text-xs text-slate-400">Belum ada data sensor.</p>
      )}

      {unit.last_seen_at && (
        <p className="mt-3 text-xs text-slate-400">
          Terakhir aktif <RelativeTime iso={unit.last_seen_at} />
        </p>
      )}
    </Link>
  )
}

function AlertRow({ alert }: { alert: Alert }) {
  const icon =
    alert.alert_type === 'fill_90' ? '🔴' : alert.alert_type === 'fill_70' ? '🟡' : '⚠️'

  return (
    <li className="flex items-start gap-2 py-2">
      <span>{icon}</span>
      <div className="min-w-0">
        <p className={`text-sm ${alert.is_read ? 'text-slate-500' : 'font-semibold text-slate-800'}`}>
          {alert.message}
        </p>
        <p className="text-xs text-slate-400">
          <RelativeTime iso={alert.created_at} />
        </p>
      </div>
    </li>
  )
}

export function DashboardOverview() {
  const summary = useDashboardSummary()
  const units = useUnits()
  const alerts = useAlerts(false)

  if (units.isPending || summary.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  if (units.isError || summary.isError) {
    return <ErrorState />
  }

  const s = summary.data

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <SummaryCard label="Total Unit" value={String(s.total_units)} />
        <SummaryCard label="Online" value={String(s.units_online)} accent="text-emerald-600" />
        <SummaryCard label="Offline" value={String(s.units_offline)} accent="text-red-600" />
        <SummaryCard label="Alert Belum Dibaca" value={String(s.unread_alerts)} accent="text-amber-600" />
        <SummaryCard
          label="Akurasi Sortir 7 Hari"
          value={s.sort_accuracy_7d === null ? '—' : `${s.sort_accuracy_7d}%`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-600">Unit Bin</h2>
          {units.data.data.length === 0 ? (
            <EmptyState message="Belum ada unit terdaftar." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {units.data.data.map((unit) => (
                <UnitCard key={unit.id} unit={unit} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-600">Alert Terbaru</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            {alerts.data && alerts.data.data.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {alerts.data.data.slice(0, 5).map((alert) => (
                  <AlertRow key={alert.id} alert={alert} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">Tidak ada alert.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
