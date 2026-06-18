// Top status bar: SAE logo, connection, SIM badge, Safety OK, Fan proven, logging indicator, clock.
// VSD reference buttons: Nameplates + Commissioning Programs.
// Designed for 1920×1200 @224 PPI industrial panel — text/LEDs large enough to read at a glance.

import { useEffect, useRef, useState } from 'react'
import { useControlStore } from '../store/controlStore'
import { VsdNameplates } from './VsdNameplates'
import { VsdPrograms } from './VsdPrograms'
import { api } from '../api/client'
import { useLinkHealth } from '../hooks/useLinkHealth'

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

export const StatusBar = () => {
  const dryer = useControlStore((s) => s.dryer)
  const wsStatus = useControlStore((s) => s.wsStatus)
  const clock = useClock()

  // Link health — drives the stale/unknown handling across the bar.
  const { stale, linkLost, unknown, ageMs, reason } = useLinkHealth()
  const ageS = Math.floor(ageMs / 1000)

  // Hidden diagnostics gesture: a ~2 s long-press on the SAE logo opens the
  // diag screen (#diag). The kiosk has no URL bar, so this is the discreet way
  // in. Pointer-based so it works on the touch panel and with a mouse.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startDiagPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      window.location.hash = 'diag'
    }, 2000)
  }
  const cancelDiagPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const connLabel = linkLost
    ? reason === 'sim_drop'
      ? 'COMMS DROP (TEST)'
      : reason === 'plc_offline'
      ? 'PLC Offline'
      : 'Disconnected'
    : stale
    ? `DATA STALE ${ageS}s`
    : wsStatus === 'open'
    ? dryer.connected
      ? 'PLC Connected'
      : 'PLC Offline'
    : wsStatus === 'connecting'
    ? 'Connecting…'
    : 'Disconnected'

  const connDot = linkLost
    ? 'bg-red-500 animate-pulse'
    : stale
    ? 'bg-amber-400 animate-pulse'
    : wsStatus === 'open' && dryer.connected
    ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]'
    : wsStatus === 'connecting'
    ? 'bg-yellow-400 animate-pulse'
    : 'bg-red-500 animate-pulse'

  const connText = linkLost
    ? 'text-red-400'
    : stale
    ? 'text-amber-300'
    : wsStatus === 'open' && dryer.connected
    ? 'text-green-300'
    : wsStatus === 'connecting'
    ? 'text-yellow-300'
    : 'text-red-400'

  const loggingActive = wsStatus === 'open' && dryer.connected && !unknown

  const [showNameplates, setShowNameplates] = useState(false)
  const [showPrograms, setShowPrograms] = useState(false)

  const released = !!dryer.released

  // PLC-release PIN modal state
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const closePin = () => {
    setPinOpen(false)
    setPin('')
    setErr(null)
    setBusy(false)
  }

  const submitPin = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      await api.releasePlc(pin)
      closePin()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg.includes('403') ? 'Incorrect PIN' : 'Release failed — try again')
      setPin('')
      setBusy(false)
    }
  }

  const reconnect = async () => {
    try {
      await api.takePlc()
    } catch {
      /* poll loop will reconnect on its own shortly */
    }
  }

  return (
    <>
    <div
      className="flex items-center gap-6 px-5 bg-gray-900 border-b-2 border-gray-700 select-none shrink-0"
      style={{ height: '9vh', minHeight: '68px', maxHeight: '88px' }}
    >
      {/* SAE Engineering logo — light pill backing so navy SVG reads on dark bg */}
      <div
        onPointerDown={startDiagPress}
        onPointerUp={cancelDiagPress}
        onPointerLeave={cancelDiagPress}
        onPointerCancel={cancelDiagPress}
        title=""
        style={{
          background: 'rgba(255,255,255,0.10)',
          borderRadius: '10px',
          padding: '5px 10px',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          cursor: 'default',
        }}
      >
        <img
          src={`${import.meta.env.BASE_URL || '/'}sae-logo.png`}
          alt="SAE Engineering"
          style={{ height: '48px', width: 'auto', display: 'block' }}
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

      {/* Sim inputs (E-STOP, comms loss, faults) are driven from the external
          I/O panel beside the HMI on the design page — NOT from on-screen
          buttons — so the HMI itself stays identical to the real panel. */}

      {/* Live frame age — proves data is fresh; ticks up if the feed stalls */}
      <span
        className={`font-mono text-sm tabular-nums ${
          unknown ? 'text-amber-300 font-bold' : 'text-gray-600'
        }`}
        title="Age of the last state frame received"
      >
        {ageS}s
      </span>

      <div className="flex-1" />

      {/* VSD reference buttons */}
      <button
        onClick={() => setShowNameplates(true)}
        className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-600 bg-gray-800/60 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
      >
        VSD Nameplates
      </button>
      <button
        onClick={() => setShowPrograms(true)}
        className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-cyan-700/60 bg-cyan-900/20 text-cyan-300 hover:bg-cyan-900/40 hover:text-cyan-100 transition-colors"
      >
        VSD Programs
      </button>

      {/* Divider */}
      <span className="text-gray-600 text-2xl font-thin">|</span>

      {/* Safety OK — drops to "unknown" when state is stale / link lost */}
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-block w-4 h-4 rounded-full shrink-0 ${
            unknown
              ? 'bg-gray-500'
              : dryer.safety_ok
              ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]'
              : 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.9)]'
          }`}
        />
        <span
          className={`font-bold text-lg leading-none ${
            unknown ? 'text-gray-400' : dryer.safety_ok ? 'text-green-300' : 'text-red-400'
          }`}
        >
          {unknown ? 'Safety ?' : dryer.safety_ok ? 'Safety OK' : 'SAFETY FAULT'}
        </span>
      </div>

      {/* Divider */}
      <span className="text-gray-600 text-2xl font-thin">|</span>

      {/* Fan proven — "unknown" when state is stale / link lost */}
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-block w-4 h-4 rounded-full shrink-0 ${
            unknown
              ? 'bg-gray-500'
              : dryer.fan_proven
              ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]'
              : 'bg-gray-600'
          }`}
        />
        <span
          className={`font-semibold text-lg leading-none ${
            unknown ? 'text-gray-400' : dryer.fan_proven ? 'text-green-300' : 'text-gray-500'
          }`}
        >
          {unknown ? 'Fan ?' : 'Fan Proven'}
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
          {loggingActive ? 'Logging ✓' : 'Logging —'}
        </span>
      </div>

      {/* Divider */}
      <span className="text-gray-600 text-2xl font-thin">|</span>

      {/* PLC release / reconnect */}
      {released && (
        <span className="px-3 py-1 rounded bg-red-600 text-white text-base font-extrabold tracking-wide uppercase animate-pulse">
          Released — MEB has PLC
        </span>
      )}
      {released ? (
        <button
          onClick={reconnect}
          className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold text-lg leading-none shadow-lg"
        >
          ⟳ Reconnect PLC
        </button>
      ) : (
        <button
          onClick={() => setPinOpen(true)}
          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-bold text-lg leading-none shadow-lg"
        >
          ⏏ Release PLC
        </button>
      )}

      {/* Divider */}
      <span className="text-gray-600 text-2xl font-thin">|</span>

      {/* Clock */}
      <span className="font-mono font-bold text-xl text-gray-200 tabular-nums tracking-widest">
        {clock}
      </span>
    </div>

      {/* Modals */}
      {showNameplates && <VsdNameplates onClose={() => setShowNameplates(false)} />}
      {showPrograms && <VsdPrograms onClose={() => setShowPrograms(false)} />}

      {/* PIN modal — release the PLC link for MEB */}
      {pinOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={closePin}
        >
          <div
            className="bg-gray-900 border-2 border-gray-600 rounded-2xl p-6 w-[360px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-gray-100 text-2xl font-bold mb-1 text-center">Release PLC</div>
            <div className="text-gray-400 text-sm mb-4 text-center leading-snug">
              Enter the maintenance PIN to drop the HMI's PLC link so MEB can
              upload. The dryer keeps running — this does not stop equipment.
            </div>

            {/* PIN display */}
            <div className="h-14 mb-3 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center tracking-[0.5em] text-3xl font-mono text-gray-100">
              {pin ? pin.replace(/./g, '•') : <span className="text-gray-600 tracking-normal text-lg">PIN</span>}
            </div>

            {err && <div className="text-red-400 text-center font-semibold mb-2">{err}</div>}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  onClick={() => setPin((p) => (p.length < 8 ? p + d : p))}
                  className="py-4 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-2xl font-bold text-gray-100"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => { setPin(''); setErr(null) }}
                className="py-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-lg font-bold text-gray-300"
              >
                Clear
              </button>
              <button
                onClick={() => setPin((p) => (p.length < 8 ? p + '0' : p))}
                className="py-4 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-2xl font-bold text-gray-100"
              >
                0
              </button>
              <button
                onClick={() => setPin((p) => p.slice(0, -1))}
                className="py-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-lg font-bold text-gray-300"
              >
                ⌫
              </button>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={closePin}
                className="py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-lg font-bold text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={submitPin}
                disabled={busy || pin.length < 4}
                className="py-3 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-40 text-lg font-bold text-white"
              >
                {busy ? '…' : 'Release'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
