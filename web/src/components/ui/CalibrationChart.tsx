import { CHART } from '../../lib/theme'

/** Reliability diagram — predicted vs observed frequency. On the diagonal = calibrated.
 *  Ported from the original calibSVG. */
export function CalibrationChart({ pts }: { pts: Array<[number, number]> }) {
  const W = 300
  const H = 210
  const pad = 34
  const x = (v: number) => pad + v * (W - pad - 10)
  const y = (v: number) => H - pad - v * (H - pad - 14)
  const grid = []
  for (let i = 0; i <= 4; i++) {
    const v = i / 4
    grid.push(
      <line key={`gx${i}`} x1={x(v)} y1={y(0)} x2={x(v)} y2={y(1)} stroke={CHART.line} strokeDasharray="2 3" />,
      <line key={`gy${i}`} x1={x(0)} y1={y(v)} x2={x(1)} y2={y(v)} stroke={CHART.line} strokeDasharray="2 3" />,
    )
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ maxWidth: 340 }}
      role="img"
      aria-label="Calibration: predicted probability versus observed frequency"
    >
      {grid}
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke={CHART.inkFaint} strokeDasharray="4 4" strokeWidth={1} />
      {pts.length ? (
        <>
          <polyline
            fill="none"
            stroke={CHART.signal}
            strokeWidth={2.5}
            points={pts.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')}
          />
          {pts.map((p, i) => (
            <circle key={i} cx={x(p[0])} cy={y(p[1])} r={3.2} fill={CHART.signal} />
          ))}
        </>
      ) : (
        <text x={W / 2} y={H / 2} fill={CHART.inkFaint} fontSize={11} textAnchor="middle">
          not enough settled data yet
        </text>
      )}
      <line x1={pad} y1={y(0)} x2={W - 10} y2={y(0)} stroke={CHART.line2} />
      <line x1={pad} y1={y(0)} x2={pad} y2={y(1)} stroke={CHART.line2} />
      <text x={x(0.5)} y={H - 6} fill={CHART.inkFaint} fontSize={9} textAnchor="middle">
        predicted
      </text>
      <text
        x={11}
        y={y(0.5)}
        fill={CHART.inkFaint}
        fontSize={9}
        textAnchor="middle"
        transform={`rotate(-90 11 ${y(0.5)})`}
      >
        observed
      </text>
    </svg>
  )
}
