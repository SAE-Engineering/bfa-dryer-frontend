import { useControlStore } from '../store/controlStore'

export const Dashboard = () => {
  const sensors = useControlStore((state) => state.sensors)
  const status = useControlStore((state) => state.status)

  return (
    <div className="bg-gray-900 text-white p-6 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">System Status</h2>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-400">PLC Connection</div>
          <div className={`text-lg font-bold ${status.plcReady ? 'text-green-500' : 'text-red-500'}`}>
            {status.plcReady ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded">
          <div className="text-sm text-gray-400">Last Update</div>
          <div className="text-lg font-mono text-gray-300">
            {status.lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      </div>

      <h3 className="text-xl font-bold mb-3">Temperatures</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-blue-900 p-3 rounded">
          <div className="text-sm text-gray-300">Heat Input</div>
          <div className="text-2xl font-bold">{sensors.heatInput}°C</div>
        </div>
        <div className="bg-orange-900 p-3 rounded">
          <div className="text-sm text-gray-300">Product 1</div>
          <div className="text-2xl font-bold">{sensors.product1}°C</div>
        </div>
        <div className="bg-orange-900 p-3 rounded">
          <div className="text-sm text-gray-300">Product 2</div>
          <div className="text-2xl font-bold">{sensors.product2}°C</div>
        </div>
        <div className="bg-cyan-900 p-3 rounded">
          <div className="text-sm text-gray-300">Exhaust</div>
          <div className="text-2xl font-bold">{sensors.exhaust}°C</div>
        </div>
      </div>
    </div>
  )
}
