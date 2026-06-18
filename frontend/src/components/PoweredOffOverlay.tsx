// Main-switch-OFF screen. The main switch (%I0.0) is the panel's master power —
// turning it off kills every output AND removes power to the HMI display. We
// can't actually cut the browser's power, so we render a near-black "screen off"
// over everything to simulate the panel going dark. The external I/O panel
// (which represents the PLC/wiring, not the screen) stays usable to switch it
// back on.
//
// Shown only when the backend reports main_on === false (sim main switch off).

import { useControlStore } from '../store/controlStore'

export const PoweredOffOverlay = () => {
  const mainOn = useControlStore((s) => s.dryer.main_on)

  // Undefined (older state / real panel) → treat as powered. Only false hides it.
  if (mainOn !== false) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,                 // above the comms-loss overlay
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        cursor: 'default',
      }}
    >
      <div style={{ fontSize: '30px', color: '#1f2937', fontWeight: 700, letterSpacing: '0.1em' }}>
        ⏻
      </div>
      <div style={{ fontSize: '15px', color: '#1f2937', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
        Main switch off
      </div>
    </div>
  )
}
