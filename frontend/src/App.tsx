import { useWebSocket } from './hooks/useWebSocket'
import { StatusBar } from './components/StatusBar'
import { Dashboard } from './components/Dashboard'

function App() {
  useWebSocket()

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      <StatusBar />
      <main className="flex-1 overflow-y-auto p-4">
        <Dashboard />
      </main>
    </div>
  )
}

export default App
