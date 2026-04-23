import { useControlStore } from '../store/controlStore'
import { useWebSocket } from '../hooks/useWebSocket'

export const ControlPanel = () => {
  const controls = useControlStore((state) => state.controls)
  const setControl = useControlStore((state) => state.setControl)
  const { sendCommand } = useWebSocket()

  const handleToggle = (key: keyof typeof controls) => {
    const newValue = !controls[key]
    setControl(key, newValue)
    sendCommand('toggle_control', { control: key, value: newValue })
  }

  return (
    <div className="bg-gray-900 text-white p-6 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Controls</h2>
      
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(controls).map(([key, value]) => (
          <button
            key={key}
            onClick={() => handleToggle(key as keyof typeof controls)}
            className={`p-4 rounded font-semibold transition-colors ${
              value
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <div className="text-sm text-gray-300 capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
            <div className="text-lg font-bold">{value ? 'ON' : 'OFF'}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
