// Licence banner — shows under the status bar.
//   ok       -> nothing
//   warning  -> amber bar, telegraphs the upcoming lockout (the "Monday" warning)
//   locked   -> red pulsing bar (expired / invalid / missing); control is start-locked.
// Deliberately a BANNER, not a full overlay: temperatures stay visible and STOP
// stays usable at all times (no-sabotage policy).

import { useControlStore } from '../store/controlStore'

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

export const LicenseBanner = () => {
  const license = useControlStore((s) => s.dryer.license)
  if (!license || license.status === 'ok') return null

  const locked = license.locked
  const expDate = fmtDate(license.expires)

  if (!locked) {
    // WARNING window (amber)
    const days = license.days_left ?? 0
    return (
      <div
        className="shrink-0 flex items-center justify-center gap-4 select-none"
        style={{
          background: '#78350f',
          borderBottom: '2px solid #f59e0b',
          color: '#fde68a',
          padding: '10px 16px',
          fontSize: '20px',
          fontWeight: 700,
          letterSpacing: '0.01em',
        }}
      >
        <span style={{ fontSize: '24px' }}>⚠</span>
        <span>
          Licence expires {expDate ? `${expDate} ` : ''}
          ({days} day{days === 1 ? '' : 's'}) — contact SAE Engineering
        </span>
      </div>
    )
  }

  // LOCKED (red) — expired / invalid / missing
  return (
    <div
      className="shrink-0 flex items-center justify-center gap-4 select-none"
      style={{
        background: '#7f1d1d',
        borderBottom: '3px solid #ef4444',
        color: '#fecaca',
        padding: '14px 16px',
        fontSize: '22px',
        fontWeight: 800,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        animation: 'pulse 2s ease-in-out infinite',
      }}
    >
      <span style={{ fontSize: '26px' }}>🔒</span>
      <span>{license.message || 'Licence locked — contact SAE Engineering'}</span>
    </div>
  )
}
