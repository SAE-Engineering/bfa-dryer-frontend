// Derived link-health for the HMI — the single source of truth for "can I trust
// what's on screen?".  Combines three failure modes the critics flagged:
//   • backend↔PLC link down   (dryer.connected === false)
//   • browser↔backend WS down  (wsStatus === 'closed')
//   • feed frozen / stalled    (no fresh frame for > STALE_MS)
//   • SIM-ONLY comms-drop test  (simCommDrop)
//
// A 'linkLost' condition warrants a full-screen STATE-UNKNOWN overlay; a milder
// 'stale' condition drops temps / safety / fan readouts to "—" without taking
// the whole screen. `unknown` is true for either — use it to blank a readout.

import { useEffect, useState } from 'react'
import { useControlStore } from '../store/controlStore'

const STALE_MS = 2000

export type LinkReason = 'ok' | 'sim_drop' | 'ws_closed' | 'plc_offline' | 'stale'

export interface LinkHealth {
  ageMs: number
  stale: boolean
  linkLost: boolean
  unknown: boolean
  reason: LinkReason
}

export function useLinkHealth(): LinkHealth {
  const lastUpdate = useControlStore((s) => s.lastUpdate)
  const connected = useControlStore((s) => s.dryer.connected)
  const wsStatus = useControlStore((s) => s.wsStatus)
  const simCommDrop = useControlStore((s) => s.simCommDrop)

  // Re-evaluate frame age a few times a second so "N s old" ticks up.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 400)
    return () => clearInterval(id)
  }, [])

  const hasData = lastUpdate > 0
  const ageMs = hasData ? Math.max(0, now - lastUpdate) : 0

  let reason: LinkReason = 'ok'
  if (simCommDrop) reason = 'sim_drop'
  else if (hasData && wsStatus === 'closed') reason = 'ws_closed'
  else if (hasData && !connected) reason = 'plc_offline'
  else if (hasData && ageMs > STALE_MS) reason = 'stale'

  const linkLost = reason === 'sim_drop' || reason === 'ws_closed' || reason === 'plc_offline'
  const stale = reason === 'stale'

  return { ageMs, stale, linkLost, unknown: linkLost || stale, reason }
}
