interface StarCounterProps {
  count: number;
}

export function StarCounter({ count }: StarCounterProps) {
  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-full bg-white/90 px-5 py-2 shadow-lg">
      <span className="text-3xl" aria-hidden>
        ⭐
      </span>
      <span className="text-3xl font-extrabold text-amber-500" aria-label={`${count} bintang`}>
        {count}
      </span>
    </div>
  );
}
