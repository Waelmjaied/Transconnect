export type Datum = { label: string; value: number }

export function BarChart({ title, data, format = String, color = 'var(--blue)', total }: { title: string; data: Datum[]; format?: (n: number) => string; color?: string; total?: string }) {
  const W = 300, H = 90, gap = 2
  const max = Math.max(1, ...data.map((d) => d.value))
  const bar = (W - gap * (data.length - 1)) / Math.max(1, data.length)
  return (
    <figure className="chart">
      <figcaption><span>{title}</span>{total && <b>{total}</b>}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={title} preserveAspectRatio="none" style={{ color }}>
        <line x1="0" x2={W} y1={H} y2={H} className="chart-axis" />
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(2, (d.value / max) * H) : 0
          return <rect key={d.label} x={i * (bar + gap)} y={H - h} width={bar} height={h} rx="1.5" fill="currentColor"><title>{`${d.label}: ${format(d.value)}`}</title></rect>
        })}
        <text x="0" y={H + 12} className="chart-label">{data[0]?.label}</text>
        <text x={W} y={H + 12} textAnchor="end" className="chart-label">{data.at(-1)?.label}</text>
      </svg>
    </figure>
  )
}

export function HBars({ title, items, color = 'var(--blue)' }: { title: string; items: Datum[]; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <figure className="chart">
      <figcaption><span>{title}</span></figcaption>
      <ul className="hbars">
        {items.map((item) => (
          <li key={item.label}><span>{item.label}</span><div><i style={{ width: `${(item.value / max) * 100}%`, background: color }} /></div><b>{item.value}</b></li>
        ))}
      </ul>
    </figure>
  )
}
