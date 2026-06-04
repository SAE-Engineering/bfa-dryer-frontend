// Top status bar: connection, SIM badge, Safety OK, Fan proven, logging indicator.

import { useControlStore } from '../store/controlStore'

export const StatusBar = () => {
  const dryer = useControlStore((s) => s.dryer)
  const wsStatus = useControlStore((s) => s.wsStatus)

  const connLabel =
    wsStatus === 'open'
      ? dryer.connected
        ? 'PLC Connected'
        : 'PLC Offline'
      : wsStatus === 'connecting'
      ? 'Connecting…'
      : 'Disconnected'

  const connColor =
    wsStatus === 'open' && dryer.connected
      ? 'bg-green-500'
      : wsStatus === 'connecting'
      ? 'bg-yellow-500'
      : 'bg-red-600'

  const textColor =
    wsStatus === 'open' && dryer.connected
      ? 'text-green-400'
      : wsStatus === 'connecting'
      ? 'text-yellow-400'
      : 'text-red-400'

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-900 border-b border-gray-700 text-sm font-medium select-none">
      {/* Connection */}
      <div className="flex items-center gap-2">
        <span className={`inline-block w-3 h-3 rounded-full ${connColor} shadow-sm`} />
        <span className={textColor}>{connLabel}</span>
      </div>

      {/* SIM badge */}
      {dryer.sim && (
        <span className="px-2 py-0.5 rounded bg-amber-600 text-amber-100 text-xs font-bold tracking-wider uppercase">
          SIM
        </span>
      )}

      <div className="flex-1" />

      {/* Safety OK */}
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block w-3 h-3 rounded-full ${
            dryer.safety_ok ? 'bg-green-500' : 'bg-red-600 animate-pulse'
          }`}
        />
        <span className={dryer.safety_ok ? 'text-green-400' : 'text-red-400'}>
          {dryer.safety_ok ? 'Safety OK' : 'Safety FAULT'}
        </span>
      </div>

      {/* Fan proven */}
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block w-3 h-3 rounded-full ${
            dryer.fan_proven ? 'bg-green-500' : 'bg-gray-600'
          }`}
        />
        <span className={dryer.fan_proven ? 'text-green-400' : 'text-gray-500'}>
          Fan proven
        </span>
      </div>

      {/* Logging indicator — always shown; backend always logs when connected */}
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block w-3 h-3 rounded-full ${
            wsStatus === 'open' && dryer.connected ? 'bg-blue-500' : 'bg-gray-600'
          }`}
        />
        <span className={wsStatus === 'open' && dryer.connected ? 'text-blue-400' : 'text-gray-500'}>
          logging {wsStatus === 'open' && dryer.connected ? '✓' : '—'}
        </span>
      </div>

      {/* Timestamp */}
      {dryer.ts && (
        <span className="text-gray-600 font-mono text-xs">
          {new Date(dryer.ts).toLocaleTimeString()}
        </span>
      )}
    </div>
  )
}
