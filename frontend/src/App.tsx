import { useEffect, useState } from "react"
import { useWebSocket } from "./hooks/useWebSocket"
import { StatusBar } from "./components/StatusBar"
import { FaultBanner } from "./components/FaultBanner"
import { LicenseBanner } from "./components/LicenseBanner"
import { Dashboard } from "./components/Dashboard"
import { CommLossOverlay } from "./components/CommLossOverlay"
import { EstopOverlay } from "./components/EstopOverlay"
import { SoftLockOverlay } from "./components/SoftLockOverlay"
import { PoweredOffOverlay } from "./components/PoweredOffOverlay"
import { DiagScreen } from "./components/DiagScreen"
import { DiagPinGate } from "./components/DiagPinGate"

// Hidden diagnostics route: the panel kiosk has no URL bar, so the diag screen
// is reached via the URL hash (#diag) — NOT linked anywhere in the normal UI.
// A ~2 s long-press on the SAE logo in the StatusBar sets location.hash="diag"
// (see StatusBar.tsx).  Closing the screen clears the hash.
function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#/, ""))
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.replace(/^#/, ""))
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return hash
}

function App() {
  useWebSocket()
  const route = useHashRoute()

  // In-memory diagnostics unlock for this tab/session. The hidden trigger
  // (long-press logo / #diag) only opens the diag screen once the tech has
  // entered the PIN (checked server-side). Reload/close clears it.
  const [diagUnlocked, setDiagUnlocked] = useState(false)

  if (route === "diag") {
    if (!diagUnlocked) {
      return (
        <DiagPinGate
          onUnlock={() => setDiagUnlocked(true)}
          onCancel={() => { window.location.hash = "" }}
        />
      )
    }
    return <DiagScreen onClose={() => { window.location.hash = "" }} />
  }

  return (
    <div className="flex flex-col w-screen h-screen bg-gray-950 text-white overflow-hidden">
      <StatusBar />
      <FaultBanner />
      <LicenseBanner />
      {/* main fills remaining height, no scroll */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <Dashboard />
      </main>
      {/* Full-screen STATE-UNKNOWN overlay on PLC link loss (renders above all) */}
      <CommLossOverlay />
      {/* Latched E-STOP warning triangle (clears only on reset) */}
      <EstopOverlay />
      {/* Soft-lockout maintenance popup (trace chain + hot fan only) */}
      <SoftLockOverlay />
      {/* Black "screen off" when the main switch is off (above everything) */}
      <PoweredOffOverlay />
    </div>
  )
}

export default App
