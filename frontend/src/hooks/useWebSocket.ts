// WebSocket hook for BFD Dryer HMI.
// Connects to /ws (same-origin; Vite proxy → backend:8000 in dev).
// Parses {type:"state",...} messages and pushes into Zustand store.
// Auto-reconnects on drop with exponential backoff (cap 30s).
// On mount also fires GET /api/state for an initial snapshot.

import { useEffect, useRef } from 'react'
import { useControlStore } from '../store/controlStore'
import { api } from '../api/client'
import { DryerState } from '../types'

// Base-aware WS URL.  BASE_URL is "/" on the real panel/dev (→ ".../ws", as
// before) and "/bfa/sim/" on the bosun sim build (→ ".../bfa/sim/ws"), so the
// same SPA works when served under a sub-path behind the designpacks nginx.
const WS_BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${WS_BASE}/ws`

export const useWebSocket = () => {
  const setDryerState = useControlStore((s) => s.setDryerState)
  const setWsStatus = useControlStore((s) => s.setWsStatus)
  const retryDelay = useRef(1000)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmounted = useRef(false)

  // Initial REST snapshot so the UI has something while WS handshakes
  useEffect(() => {
    api.getState().then(setDryerState).catch(() => {
      // backend not up yet — that's fine, WS will deliver state
    })
  }, [setDryerState])

  useEffect(() => {
    unmounted.current = false

    function connect() {
      if (unmounted.current) return

      setWsStatus('connecting')
      let socket: WebSocket

      try {
        socket = new WebSocket(WS_URL)
      } catch {
        // WebSocket constructor can throw in some environments
        scheduleRetry()
        return
      }

      socket.onopen = () => {
        retryDelay.current = 1000  // reset backoff
        setWsStatus('open')
      }

      socket.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as { type: string }
          if (data.type === 'state') {
            setDryerState(data as DryerState)
          }
        } catch {
          // malformed frame — ignore
        }
      }

      socket.onerror = () => {
        // onclose fires right after; handle retry there
      }

      socket.onclose = () => {
        setWsStatus('closed')
        scheduleRetry()
      }

      return socket
    }

    function scheduleRetry() {
      if (unmounted.current) return
      timerRef.current = setTimeout(() => {
        connect()
      }, retryDelay.current)
      retryDelay.current = Math.min(retryDelay.current * 2, 30_000)
    }

    const sock = connect()

    return () => {
      unmounted.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      sock?.close()
    }
  }, [setDryerState, setWsStatus])
}
