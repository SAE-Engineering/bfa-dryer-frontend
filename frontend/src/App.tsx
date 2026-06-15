import { useEffect, useState } from "react"
import { useWebSocket } from "./hooks/useWebSocket"
import { StatusBar } from "./components/StatusBar"
import { FaultBanner } from "./components/FaultBanner"
import { LicenseBanner } from "./components/LicenseBanner"
import { Dashboard } from "./components/Dashboard"
import { DiagScreen } from "./components/DiagScreen"

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

  if (route === "diag") {
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
    </div>
  )
}

export default App
