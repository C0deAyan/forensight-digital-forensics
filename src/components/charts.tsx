export type ChartDatum = { label: string; value: number; tone?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'sky' };

const toneClass: Record<NonNullable<ChartDatum['tone']>, string> = {
  cyan: 'from-cyan-500 to-cyan-300',
  emerald: 'from-emerald-500 to-emerald-300',
  amber: 'from-amber-500 to-amber-300',
  rose: 'from-rose-500 to-rose-300',
  sky: 'from-sky-500 to-sky-300',
};

export function ColumnChart({ data, emptyLabel }: { data: ChartDatum[]; emptyLabel: string }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return <p className="py-10 text-center text-sm text-slate-500">{emptyLabel}</p>;

  return (
    <div className="flex h-56 items-end gap-2" role="img" aria-label="Column chart">
      {data.map((item) => (
        <div key={item.label} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
          <span className="text-center text-[11px] font-medium text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">{item.value}</span>
          <div
            className={`w-full rounded-t-md bg-gradient-to-t ${toneClass[item.tone ?? 'cyan']} transition-all duration-700 ease-out group-hover:brightness-125`}
            style={{ height: `${Math.max(item.value > 0 ? 4 : 0, (item.value / max) * 100)}%` }}
            title={`${item.label}: ${item.value}`}
          />
          <span className="truncate text-center text-[10px] text-slate-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function BarList({ data, emptyLabel }: { data: ChartDatum[]; emptyLabel: string }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return <p className="py-10 text-center text-sm text-slate-500">{emptyLabel}</p>;
  const max = Math.max(...data.map((item) => item.value));

  return (
    <ul className="space-y-4">
      {data.map((item) => (
        <li key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-slate-300">{item.label}</span>
            <span className="font-mono text-slate-400">{item.value} · {Math.round((item.value / total) * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-night-700">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${toneClass[item.tone ?? 'cyan']} transition-all duration-700 ease-out`}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
