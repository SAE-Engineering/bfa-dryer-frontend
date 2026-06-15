import { useWebSocket } from './hooks/useWebSocket'
import { StatusBar } from './components/StatusBar'
import { FaultBanner } from './components/FaultBanner'
import { LicenseBanner } from './components/LicenseBanner'
import { Dashboard } from './components/Dashboard'

function App() {
  useWebSocket()

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
