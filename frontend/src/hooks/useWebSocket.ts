import { useEffect, useState, useCallback } from 'react'
import { useControlStore } from '../store/controlStore'

const API_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`

export const useWebSocket = () => {
  const [ws, setWs] = useState<WebSocket | null>(null)
  const setSensors = useControlStore((state) => state.setSensors)
  const setStatus = useControlStore((state) => state.setStatus)

  useEffect(() => {
    const socket = new WebSocket(API_URL)

    socket.onopen = () => {
      console.log('WebSocket connected')
      setStatus({
        connected: true,
        plcReady: true,
        lastUpdate: new Date(),
      })
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'sensor_data') {
          setSensors(data.payload)
        }
      } catch (e) {
        console.error('WebSocket message parse error:', e)
      }
    }

    socket.onerror = () => {
      setStatus({
        connected: false,
        plcReady: false,
        lastUpdate: new Date(),
      })
    }

    socket.onclose = () => {
      console.log('WebSocket disconnected')
      setStatus({
        connected: false,
        plcReady: false,
        lastUpdate: new Date(),
      })
    }

    setWs(socket)

    return () => {
      socket.close()
    }
  }, [setSensors, setStatus])

  const sendCommand = useCallback(
    (command: string, payload?: any) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'command', command, payload }))
      }
    },
    [ws]
  )

  return { ws, sendCommand }
}
