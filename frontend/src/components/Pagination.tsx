export function Pagination({
  current,
  last,
  onChange,
}: {
  current: number
  last: number
  onChange: (page: number) => void
}) {
  if (last <= 1) return null

  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <button
        disabled={current <= 1}
        onClick={() => onChange(current - 1)}
        className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
      >
        Sebelumnya
      </button>
      <span className="text-slate-500">
        Hal {current} / {last}
      </span>
      <button
        disabled={current >= last}
        onClick={() => onChange(current + 1)}
        className="rounded-lg border border-slate-300 px-3 py-1 disabled:opacity-40"
      >
        Berikutnya
      </button>
    </div>
  )
}
