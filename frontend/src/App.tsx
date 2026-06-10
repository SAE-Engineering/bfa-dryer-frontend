import { useCallback, useEffect, useRef, useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { StatusBar } from './components/StatusBar'
import { LicenseBanner } from './components/LicenseBanner'
import { Dashboard } from './components/Dashboard'
import { VsdNameplates } from './components/VsdNameplates'
import { BootSplash } from './components/BootSplash'
import { PinModal } from './components/PinModal'
import { api } from './api/client'

// Long-press duration for PLC release PIN trigger (on SAE logo in StatusBar)
const LOGO_LONG_PRESS_MS = 1200

// Auto-retry interval (ms) after PLC release — keeps trying plcTake until reconnected
const PLC_TAKE_RETRY_MS = 4000

function App() {
  useWebSocket()
  const [showVsd, setShowVsd] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [plcReleased, setPlcReleased] = useState(false)

  // Long-press state for logo
  const logoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoLongFiredRef = useRef(false)

  // Auto-retry plcTake after release
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current)
      retryTimerRef.current = null
    }
  }, [])

  const startRetry = useCallback(() => {
    stopRetry()
    retryTimerRef.current = setInterval(async () => {
      try {
        const result = await api.plcTake()
        if (result.connected) {
          setPlcReleased(false)
          stopRetry()
        }
      } catch {
        // PLC still not available — keep retrying
      }
    }, PLC_TAKE_RETRY_MS)
  }, [stopRetry])

  // Cleanup retry on unmount
  useEffect(() => {
    return () => stopRetry()
  }, [stopRetry])

  const handleLogoPointerDown = useCallback(() => {
    logoLongFiredRef.current = false
    logoTimerRef.current = setTimeout(() => {
      logoLongFiredRef.current = true
      setShowPin(true)
    }, LOGO_LONG_PRESS_MS)
  }, [])

  const handleLogoPointerUp = useCallback(() => {
    if (logoTimerRef.current) {
      clearTimeout(logoTimerRef.current)
      logoTimerRef.current = null
    }
  }, [])

  const handleLogoPointerCancel = useCallback(() => {
    if (logoTimerRef.current) {
      clearTimeout(logoTimerRef.current)
      logoTimerRef.current = null
    }
    logoLongFiredRef.current = false
  }, [])

  const handlePlcReleased = useCallback(() => {
    setPlcReleased(true)
    startRetry()
  }, [startRetry])

  return (
    <>
      {/* Boot splash — shown before dashboard on every session (sessionStorage-gated) */}
      {!accepted && (
        <BootSplash onAccepted={() => setAccepted(true)} />
      )}

      {/* Main app layout — always rendered so WS connects in background */}
      <div className="flex flex-col w-screen h-screen bg-gray-950 text-white overflow-hidden">
        {/* StatusBar with long-press logo target wired via onLogoLongPress prop */}
        <StatusBar
          onLogoPointerDown={handleLogoPointerDown}
          onLogoPointerUp={handleLogoPointerUp}
          onLogoPointerCancel={handleLogoPointerCancel}
        />
        <LicenseBanner />

        {/* PLC released banner */}
        {plcReleased && (
          <div
            className="shrink-0 flex items-center justify-center gap-4 select-none"
            style={{
              background: '#1e1b4b',
              borderBottom: '2px solid #6366f1',
              color: '#c7d2fe',
              padding: '10px 16px',
              fontSize: '18px',
              fontWeight: 700,
              letterSpacing: '0.01em',
            }}
          >
            <span style={{ fontSize: '22px' }}>🔌</span>
            <span>PLC released — HMI disconnected. Waiting for PLC to become available…</span>
          </div>
        )}

        {/* main fills remaining height, no scroll */}
        <main className="flex-1 min-h-0 overflow-hidden">
          <Dashboard />
        </main>
        <button
          onClick={() => setShowVsd(true)}
          className="fixed bottom-3 right-3 z-40 rounded-lg border border-gray-600 bg-gray-800/90 px-3 py-2 text-xs font-medium text-gray-100 shadow-lg hover:bg-gray-700"
        >
          VSD Nameplates
        </button>
        {showVsd && <VsdNameplates onClose={() => setShowVsd(false)} />}
      </div>

      {/* PIN modal — shown on long-press of SAE logo */}
      {showPin && (
        <PinModal
          onClose={() => setShowPin(false)}
          onReleased={handlePlcReleased}
        />
      )}
    </>
  )
}

export default App
