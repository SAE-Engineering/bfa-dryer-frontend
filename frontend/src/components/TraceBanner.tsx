// Trace-chain interlock fault banner — full-width red bar under the status bar
// when %MW58 (trace_fault) is set: the Trace VSD has been stopped because the
// fan/lube contactor proof-of-run (%I0.0 → %MW55) was lost while Trace was
// running. Clears when the trip is reset (reset button %I0.12) and the
// contactor proves again. Deliberately a banner, not an overlay — temperatures
// and STOP stay visible at all times.

import { useControlStore } from '../store/controlStore'

export const TraceBanner = () => {
  const traceFault = useControlStore((s) => s.dryer.trace_fault)
  if (!traceFault) return null

  return (
    <div
      className="shrink-0 flex items-center justify-center gap-4 select-none"
      style={{
        background: '#7f1d1d',
        borderBottom: '3px solid #ef4444',
        color: '#fecaca',
        padding: '12px 16px',
        fontSize: '20px',
        fontWeight: 800,
        letterSpacing: '0.01em',
        animation: 'pulse 2s ease-in-out infinite',
      }}
    >
      <span style={{ fontSize: '24px' }}>⚠</span>
      <span>
        TRACE CHAIN FAULT — fan/lube contactor not proven. Trace drive stopped to
        protect the motor. Check the contactor, then reset.
      </span>
    </div>
  )
}
