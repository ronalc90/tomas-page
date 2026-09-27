import { useState } from "react";

interface Point {
  week: string;
  label: string;
  workshops: number;
  quizzes: number;
}

const SERIES = [
  { key: "workshops", label: "Talleres completados", cls: "s1", color: "var(--viz-1)" },
  { key: "quizzes", label: "Evaluaciones presentadas", cls: "s2", color: "var(--viz-2)" },
] as const;

/** Columnas agrupadas por semana, con eje único, rejilla tenue y detalle al pasar el cursor. */
export function WeeklyChart({ data }: { data: Point[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 32 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = Math.max(4, ...data.flatMap((d) => [d.workshops, d.quizzes]));
  const step = max <= 8 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : 25;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(20, (band - 14) / 2);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;

  const bar = (x: number, v: number, cls: string, key: string) => {
    if (v <= 0) return null;
    const h = Math.max(2, (v / top) * innerH);
    const r = Math.min(4, h / 2, barW / 2);
    const yTop = pad.top + innerH - h;
    const yBase = pad.top + innerH;
    // Esquinas redondeadas arriba, cuadradas en la base.
    const d = `M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${yBase} Z`;
    return <path key={key} d={d} className={cls} />;
  };

  const tip = active !== null ? data[active] : null;

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="chart-legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="chart-wrap" onMouseLeave={() => setActive(null)}>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Actividad por semana: talleres completados y evaluaciones presentadas">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
              <text x={pad.left - 8} y={y(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = pad.left + i * band;
            const cx = x0 + band / 2;
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
                  aria-label={`Semana del ${d.label}: ${d.workshops} talleres completados, ${d.quizzes} evaluaciones presentadas`}
                />
                {bar(cx - barW - 1, d.workshops, "s1", "a")}
                {bar(cx + 1, d.quizzes, "s2", "b")}
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
              left: `${Math.min(78, Math.max(0, ((pad.left + (active! + 0.5) * band) / W) * 100 - 12))}%`,
              top: 0,
            }}
          >
            <b>Semana del {tip.label}</b>
            {SERIES.map((s) => (
              <span key={s.key}>
                <i style={{ background: s.color }} />
                {s.label}: <strong className="num">{tip[s.key]}</strong>
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
                <th className="num">Talleres</th>
                <th className="num">Evaluaciones</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.week}>
                  <td>{d.label}</td>
                  <td className="num">{d.workshops}</td>
                  <td className="num">{d.quizzes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
