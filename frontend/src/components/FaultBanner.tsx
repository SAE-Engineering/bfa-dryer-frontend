// Fault annunciation banner — shows under the status bar when the PLC reports
// active fault latches (fire / over-temp / scorch) in the State JSON `faults`.
//   no faults              -> nothing rendered
//   any 'critical' (fire)  -> red pulsing bar
//   only 'fault'           -> amber bar
// A BANNER, not an overlay: temperatures + STOP stay usable (no-sabotage policy).
// Per-component fault LEDs (red ring + FAULT chip on the tile) are wired
// separately via component.fault; this banner is the floor-readable summary.

import { useControlStore } from '../store/controlStore'

export const FaultBanner = () => {
  const faults = useControlStore((s) => s.dryer.faults) ?? []
  if (faults.length === 0) return null

  const critical = faults.some((f) => f.severity === 'critical')
  const labels = faults.map((f) => f.label).join('  •  ')

  return (
    <div
      className="shrink-0 flex items-center justify-center gap-4 select-none"
      style={{
        background: critical ? '#7f1d1d' : '#78350f',
        borderBottom: `3px solid ${critical ? '#ef4444' : '#f59e0b'}`,
        color: critical ? '#fecaca' : '#fde68a',
        padding: '12px 16px',
        fontSize: '21px',
        fontWeight: 800,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        animation: critical ? 'pulse 1.5s ease-in-out infinite' : undefined,
      }}
    >
      <span style={{ fontSize: '26px' }}>{critical ? '🔥' : '⚠'}</span>
      <span>
        {faults.length > 1 ? `${faults.length} faults — ` : 'Fault — '}
        {labels}
      </span>
    </div>
  )
}
