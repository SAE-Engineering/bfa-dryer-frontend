// Latched E-STOP annunciation — a full-screen warning-triangle alarm shown
// whenever the e-stop is latched (state.estop). All DOLs are off and all VSDs
// stopped. The alarm is LATCHED: it stays up after the e-stop button is released
// and clears ONLY when the reset input fires (state.estop → false), after which
// everything is left in the OFF state.

import { useControlStore } from '../store/controlStore'

export const EstopOverlay = () => {
  const estop = useControlStore((s) => s.dryer.estop)

  if (!estop) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 450,                       // above comms-loss, below main-off (black)
        background: 'rgba(20,2,2,0.90)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '22px',
        textAlign: 'center',
        padding: '40px',
      }}
    >
      {/* Warning triangle */}
      <div style={{ position: 'relative', width: '180px', height: '156px', animation: 'pulse 1.3s ease-in-out infinite' }}>
        <svg viewBox="0 0 100 88" width="180" height="156" aria-hidden="true">
          <path d="M50 4 L96 84 L4 84 Z" fill="#7f1d1d" stroke="#ef4444" strokeWidth="4" strokeLinejoin="round" />
          <rect x="45" y="30" width="10" height="30" rx="3" fill="#fee2e2" />
          <circle cx="50" cy="70" r="6" fill="#fee2e2" />
        </svg>
      </div>
      <div style={{ fontSize: '60px', fontWeight: 900, letterSpacing: '0.06em', color: '#fecaca',
        textShadow: '0 0 24px rgba(239,68,68,0.6)' }}>
        E&#8209;STOP ENGAGED
      </div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: '#fca5a5' }}>
        All drives and conveyors stopped
      </div>
      <div style={{ fontSize: '24px', fontWeight: 800, color: '#fcd34d', letterSpacing: '0.04em' }}>
        Press RESET to clear
      </div>
    </div>
  )
}
