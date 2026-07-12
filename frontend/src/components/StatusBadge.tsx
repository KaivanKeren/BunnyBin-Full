import type { UnitStatus } from '../api/contracts'

const STYLES: Record<UnitStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  maintenance: 'bg-amber-100 text-amber-700',
  offline: 'bg-slate-200 text-slate-600',
}

const LABELS: Record<UnitStatus, string> = {
  active: 'Aktif',
  maintenance: 'Perawatan',
  offline: 'Offline',
}

export function StatusBadge({ status }: { status: UnitStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  )
}
