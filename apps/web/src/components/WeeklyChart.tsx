import { useState } from "react";

export interface ChartSeries<K extends string> {
  key: K;
  label: string;
  color: string;
}

type Point<K extends string> = { week: string; label: string } & Record<K, number>;

/** Un paso "bonito" (1, 2, 5, 10, 20, 50…) para unas 4 a 6 líneas de rejilla. */
function niceStep(max: number): number {
  const raw = max / 5;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

/** Columnas agrupadas por semana, con eje único, rejilla tenue y detalle al pasar el cursor. */
export function WeeklyChart<K extends string>({
  data,
  series,
  title,
  format = (v) => String(v),
  axisFormat = format,
}: {
  data: Point<K>[];
  series: ChartSeries<K>[];
  /** Descripción para lectores de pantalla. */
  title: string;
  format?: (value: number) => string;
  axisFormat?: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = Math.max(4, ...data.flatMap((d) => series.map((s) => d[s.key])));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const band = innerW / Math.max(1, data.length);
  const gap = 2;
  const barW = Math.max(3, Math.min(18, (band - 12) / series.length - gap));
  const groupW = series.length * barW + (series.length - 1) * gap;
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;

  const bar = (x: number, v: number, color: string, key: string) => {
    if (v <= 0) return null;
    const h = Math.max(2, (v / top) * innerH);
    const r = Math.min(4, h / 2, barW / 2);
    const yTop = pad.top + innerH - h;
    const yBase = pad.top + innerH;
    // Esquinas redondeadas arriba, cuadradas en la base.
    const d = `M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${yBase} Z`;
    return <path key={key} d={d} style={{ fill: color }} />;
  };

  const tip = active !== null ? data[active] : null;
  const describe = (d: Point<K>) => series.map((s) => `${s.label}: ${format(d[s.key])}`).join(", ");

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="chart-legend" aria-hidden="true">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="chart-wrap" onMouseLeave={() => setActive(null)}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
              <text x={pad.left - 8} y={y(t) + 4} textAnchor="end">
                {axisFormat(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = pad.left + i * band;
            const cx = x0 + band / 2;
            const start = cx - groupW / 2;
            return (
              <g key={d.week}>
                <rect
                  className={`hit ${active === i ? "active" : ""}`}
                  x={x0}
                  y={pad.top}
                  width={band}
                  height={innerH}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  tabIndex={0}
                  aria-label={`Semana del ${d.label}: ${describe(d)}`}
                />
                {series.map((s, k) => bar(start + k * (barW + gap), d[s.key], s.color, s.key))}
                <text x={cx} y={H - 8} textAnchor="middle">
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
        {tip && (
          <div
            className="chart-tip"
            style={{
              left: `${Math.min(70, Math.max(0, ((pad.left + (active! + 0.5) * band) / W) * 100 - 12))}%`,
              top: 0,
            }}
          >
            <b>Semana del {tip.label}</b>
            {series.map((s) => (
              <span key={s.key}>
                <i style={{ background: s.color }} />
                {s.label}: <strong className="num">{format(tip[s.key])}</strong>
              </span>
            ))}
          </div>
        )}
      </div>
      <details>
        <summary className="muted" style={{ fontSize: 14, cursor: "pointer" }}>
          Ver como tabla
        </summary>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Semana</th>
                {series.map((s) => (
                  <th key={s.key} className="num">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.week}>
                  <td>{d.label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="num">
                      {format(d[s.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
