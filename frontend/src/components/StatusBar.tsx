// Top status bar: SAE logo, connection, SIM badge, Safety OK, Fan proven, logging indicator, clock.
// Designed for 1920×1200 @224 PPI industrial panel — text/LEDs large enough to read at a glance.
//
// Long-press the SAE logo (1.2s) to open the PIN-gated master PLC release modal.
// The parent (App.tsx) owns the timer and fires onLogoPointerDown/Up/Cancel.

import { useEffect, useState } from 'react'
import { useControlStore } from '../store/controlStore'

function useClock() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-AU', { hour12: false }))
  useEffect(() => {
    const id = setInterval(
      () => setTime(new Date().toLocaleTimeString('en-AU', { hour12: false })),
      1000
    )
    return () => clearInterval(id)
  }, [])
  return time
}

interface StatusBarProps {
  onLogoPointerDown?: () => void
  onLogoPointerUp?: () => void
  onLogoPointerCancel?: () => void
}

export const StatusBar = ({
  onLogoPointerDown,
  onLogoPointerUp,
  onLogoPointerCancel,
}: StatusBarProps) => {
  const dryer = useControlStore((s) => s.dryer)
  const wsStatus = useControlStore((s) => s.wsStatus)
  const clock = useClock()

  const connLabel =
    wsStatus === 'open'
      ? dryer.connected
        ? 'PLC Connected'
        : 'PLC Offline'
      : wsStatus === 'connecting'
      ? 'Connecting…'
      : 'Disconnected'

  const connDot =
    wsStatus === 'open' && dryer.connected
      ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]'
      : wsStatus === 'connecting'
      ? 'bg-yellow-400 animate-pulse'
      : 'bg-red-500 animate-pulse'

  const connText =
    wsStatus === 'open' && dryer.connected
      ? 'text-green-300'
      : wsStatus === 'connecting'
      ? 'text-yellow-300'
      : 'text-red-400'

  const loggingActive = wsStatus === 'open' && dryer.connected

  return (
    <div
      className="flex items-center gap-6 px-5 bg-gray-900 border-b-2 border-gray-700 select-none shrink-0"
      style={{ height: '9vh', minHeight: '68px', maxHeight: '88px' }}
    >
      {/* SAE Engineering logo
          Long-press (1.2s) → PIN modal → master PLC release.
          The touch handlers are wired from App.tsx to keep timer state there.
          sae-logo.png lives in frontend/public/ — served as /sae-logo.png by both
          Vite dev server and the production nginx/StaticFiles mount.

          FIX (feat/splash-licence): logo was missing from frontend/dist/ because the
          stale dist build pre-dated the public/ asset. Resolved: dist is rebuilt on
          deploy — `npm run build` copies public/ into dist/ automatically via Vite.
      */}
      <div
        onPointerDown={onLogoPointerDown}
        onPointerUp={onLogoPointerUp}
        onPointerLeave={onLogoPointerCancel}
        onPointerCancel={onLogoPointerCancel}
        style={{
          background: 'rgba(255,255,255,0.10)',
          borderRadius: '10px',
          padding: '5px 10px',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          cursor: 'pointer',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'manipulation',
        }}
        title="Long-press to access master release"
      >
        <img
          src="/sae-logo.png"
          alt="SAE Engineering"
          style={{ height: '48px', width: 'auto', display: 'block', pointerEvents: 'none' }}
          draggable={false}
          onError={(e) => {
            // Fallback: render text if image fails to load
            const img = e.currentTarget as HTMLImageElement
            img.style.display = 'none'
            const parent = img.parentElement
            if (parent && !parent.querySelector('.logo-fallback')) {
              const span = document.createElement('span')
              span.className = 'logo-fallback'
              span.style.cssText = 'font-size:18px;font-weight:900;color:#f1f5f9;letter-spacing:0.05em;'
              span.textContent = 'SAE'
              parent.appendChild(span)
            }
          }}
        />
      </div>

      {/* Connection — immediately right of logo */}
      <div className="flex items-center gap-2.5">
        <span className={`inline-block w-4 h-4 rounded-full shrink-0 ${connDot}`} />
        <span className={`font-bold text-lg leading-none ${connText}`}>{connLabel}</span>
      </div>

      {/* SIM badge */}
      {dryer.sim && (
        <span className="px-3 py-1 rounded bg-amber-500 text-gray-950 text-base font-extrabold tracking-widest uppercase">
          SIM
        </span>
      )}

      <div className="flex-1" />

      {/* Safety OK */}
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-block w-4 h-4 rounded-full shrink-0 ${
            dryer.safety_ok
              ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]'
              : 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.9)]'
          }`}
        />
        <span
          className={`font-bold text-lg leading-none ${
            dryer.safety_ok ? 'text-green-300' : 'text-red-400'
          }`}
        >
          {dryer.safety_ok ? 'Safety OK' : 'SAFETY FAULT'}
        </span>
      </div>

      {/* Divider */}
      <span className="text-gray-600 text-2xl font-thin">|</span>

      {/* Fan proven */}
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-block w-4 h-4 rounded-full shrink-0 ${
            dryer.fan_proven
              ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]'
              : 'bg-gray-600'
          }`}
        />
        <span
          className={`font-semibold text-lg leading-none ${
            dryer.fan_proven ? 'text-green-300' : 'text-gray-500'
          }`}
        >
          Fan Proven
        </span>
      </div>

      {/* Divider */}
      <span className="text-gray-600 text-2xl font-thin">|</span>

      {/* Logging */}
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-block w-4 h-4 rounded-full shrink-0 ${
            loggingActive
              ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]'
              : 'bg-gray-600'
          }`}
        />
        <span
          className={`font-semibold text-lg leading-none ${
            loggingActive ? 'text-blue-300' : 'text-gray-500'
          }`}
        >
          {loggingActive ? 'Logging' : 'Logging —'}
        </span>
      </div>

      {/* Divider */}
      <span className="text-gray-600 text-2xl font-thin">|</span>

      {/* Clock */}
      <span className="font-mono font-bold text-xl text-gray-200 tabular-nums tracking-widest">
        {clock}
      </span>
    </div>
  )
}
