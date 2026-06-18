// Full-screen "STATE UNKNOWN" overlay shown when the PLC link is lost.
//
// Critic finding #1: on comms-loss the backend broadcasts all-zeros (running=0,
// temps=0.0, no faults) and the old dashboard rendered that as a calm
// everything-off-and-cold screen — dangerously misleading if the machine is
// actually running hot.  This overlay makes link-loss impossible to miss and
// tells the operator the panel is NOT in control (use the hardware E-STOP).
//
// It deliberately covers the screen: when the PLC link is down, no on-screen
// command can reach the drives anyway — the hardwired Wieland relay is the real
// stop, not this panel.

import { useLinkHealth } from '../hooks/useLinkHealth'
import { useControlStore } from '../store/controlStore'

export const CommLossOverlay = () => {
  const { linkLost, ageMs, reason } = useLinkHealth()
  const simCommDrop = useControlStore((s) => s.simCommDrop)
  const setSimCommDrop = useControlStore((s) => s.setSimCommDrop)

  if (!linkLost) return null

  const secs = Math.floor(ageMs / 1000)
  const sub =
    reason === 'sim_drop'
      ? 'Simulated comms drop — this is a sim test, not a real fault'
      : reason === 'ws_closed'
      ? 'Lost the connection to the HMI backend'
      : 'The backend cannot reach the PLC'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(12,2,2,0.88)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '26px',
        textAlign: 'center',
        padding: '40px',
      }}
    >
      <div
        style={{
          fontSize: '110px',
          lineHeight: 1,
          animation: 'pulse 1.4s ease-in-out infinite',
        }}
      >
        ⚠
      </div>
      <div
        style={{
          fontSize: '64px',
          fontWeight: 900,
          letterSpacing: '0.04em',
          color: '#fecaca',
          textShadow: '0 0 24px rgba(239,68,68,0.6)',
        }}
      >
        PLC LINK LOST
      </div>
      <div style={{ fontSize: '40px', fontWeight: 800, color: '#fca5a5', letterSpacing: '0.05em' }}>
        STATE UNKNOWN
      </div>
      <div style={{ fontSize: '26px', fontWeight: 600, color: '#f3f4f6', maxWidth: '900px' }}>
        {sub}. The readings on this panel may be wrong — do not trust them.
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#fcd34d' }}>
        Use the hardware E-STOP — the panel is not in control.
      </div>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '22px',
          color: '#9ca3af',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        no fresh data for {secs}s
      </div>

      {simCommDrop && (
        <button
          onClick={() => setSimCommDrop(false)}
          style={{
            marginTop: '14px',
            padding: '18px 44px',
            fontSize: '22px',
            fontWeight: 800,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            background: '#064e3b',
            border: '2px solid #059669',
            borderRadius: '14px',
            color: '#6ee7b7',
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          ⟳ End comms-drop test
        </button>
      )}
    </div>
  )
}
