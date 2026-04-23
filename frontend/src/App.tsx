import { useEffect } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { Dashboard } from './components/Dashboard'
import { ControlPanel } from './components/ControlPanel'

function App() {
  useWebSocket()

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <header className="mb-8">
        <h1 className="text-4xl font-bold">BFA Dryer HMI</h1>
        <p className="text-gray-400">Banana Dryer Control Panel</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Dashboard />
        </div>
        <div>
          <ControlPanel />
        </div>
      </div>
    </div>
  )
}

export default App
