import { useState, type ReactNode } from "react";

/** Single-series column chart: thin rounded bars on a recessive baseline, hover/tap tooltip. */
export function Columns({
  data,
  max,
  height = 120,
  format = (value) => String(value),
  highlight,
  color = "var(--accent)",
}: {
  data: Array<{ label: string; value: number | null; title?: string }>;
  max?: number;
  height?: number;
  format?: (value: number) => string;
  highlight?: number;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const top = max ?? Math.max(1, ...data.map((item) => item.value ?? 0));
  const shown = hover ?? highlight ?? null;
  return (
    <div className="cols" style={{ height: height + 26 }}>
      <div className="cols-plot" style={{ height }}>
        <span className="cols-grid" style={{ bottom: "50%" }} />
        {data.map((item, index) => {
          const ratio = item.value === null ? 0 : Math.max(item.value > 0 ? 0.04 : 0, item.value / top);
          return (
            <button
              key={`${item.label}-${index}`}
              type="button"
              className={`col ${shown === index ? "is-on" : ""} ${item.value === null ? "is-empty" : ""}`}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              onClick={() => setHover(hover === index ? null : index)}
              aria-label={`${item.title ?? item.label}: ${item.value === null ? "—" : format(item.value)}`}
            >
              <span className="col-bar" style={{ height: `${ratio * 100}%`, background: color }} />
              {shown === index ? (
                <span className="col-tip">
                  <b>{item.value === null ? "—" : format(item.value)}</b>
                  <small>{item.title ?? item.label}</small>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="cols-axis">
        {data.map((item, index) => (
          <span key={`${item.label}-${index}`} className={shown === index ? "is-on" : ""}>
            {data.length > 14 && index % 5 !== 0 && index !== data.length - 1 ? "" : item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Single line on a fixed min..max scale with point markers and a hover readout. */
export function Line({
  data,
  min,
  max,
  height = 110,
  format = (value) => String(value),
  color = "var(--accent)",
  legend,
}: {
  data: Array<{ label: string; value: number | null; title?: string }>;
  min: number;
  max: number;
  height?: number;
  format?: (value: number) => string;
  color?: string;
  legend?: ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 320;
  const pad = 10;
  const step = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  const y = (value: number) => pad + (1 - (value - min) / (max - min || 1)) * (height - pad * 2);
  const points = data.map((item, index) => ({ ...item, x: pad + index * step, y: item.value === null ? null : y(item.value) }));
  const segments: string[] = [];
  let current = "";
  for (const point of points) {
    if (point.y === null) {
      if (current) segments.push(current);
      current = "";
      continue;
    }
    current += `${current ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }
  if (current) segments.push(current);
  const active = hover !== null ? points[hover] : null;
  return (
    <div className="line-chart">
      {legend}
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ height }} onMouseLeave={() => setHover(null)}>
        <line x1={0} x2={width} y1={y((min + max) / 2)} y2={y((min + max) / 2)} className="grid" />
        {segments.map((path) => (
          <path key={path} d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
        {active && active.y !== null ? <line x1={active.x} x2={active.x} y1={0} y2={height} className="cross" /> : null}
        {points.map((point, index) => (
          <rect
            key={`${point.label}-${index}`}
            x={point.x - step / 2}
            y={0}
            width={Math.max(step, 8)}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
            onClick={() => setHover(hover === index ? null : index)}
          />
        ))}
      </svg>
      <div className="line-dots" style={{ height }}>
        {points.map((point, index) =>
          point.y === null ? null : (
            <span
              key={`${point.label}-${index}`}
              className={`line-dot ${hover === index ? "is-on" : ""}`}
              style={{ left: `${(point.x / width) * 100}%`, top: point.y, borderColor: color }}
            />
          ),
        )}
        {active && active.y !== null ? (
          <span className="col-tip is-line" style={{ left: `${(active.x / width) * 100}%`, top: Math.max(0, active.y - 46) }}>
            <b>{format(active.value!)}</b>
            <small>{active.title ?? active.label}</small>
          </span>
        ) : null}
      </div>
      <div className="cols-axis">
        {data.map((item, index) => (
          <span key={`${item.label}-${index}`}>{data.length > 14 && index % 5 !== 0 && index !== data.length - 1 ? "" : item.label}</span>
        ))}
      </div>
    </div>
  );
}
