// Diagnostics PIN gate — a dark-theme numeric keypad overlay shown when the
// hidden diag trigger (long-press logo / #diag) fires but the tab is not yet
// unlocked.  The PIN is checked SERVER-SIDE (POST /api/diag-auth against env
// DIAG_PIN) so the real PIN is never in this bundle.  On {ok:true} we store the
// returned token in memory and call onUnlock(); wrong PIN shows an error; Cancel
// (or the backdrop) calls onCancel() to return to the MAIN screen.

import { useState } from 'react'
import { api, setDiagToken } from '../api/client'

export function DiagPinGate({
  onUnlock,
  onCancel,
}: {
  onUnlock: () => void
  onCancel: () => void
}) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    if (busy || pin.length < 4) return
    setBusy(true)
    setErr(null)
    try {
      const res = await api.diagAuth(pin)
      if (res.ok && res.token) {
        setDiagToken(res.token)
        onUnlock()
      } else {
        setErr('Incorrect PIN')
        setPin('')
        setBusy(false)
      }
    } catch {
      setErr('Check failed — try again')
      setPin('')
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 border-2 border-gray-600 rounded-2xl p-6 w-[360px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-amber-300 text-2xl font-bold mb-1 text-center tracking-wide">
          PLC DIAGNOSTICS
        </div>
        <div className="text-gray-400 text-sm mb-4 text-center leading-snug">
          Technician access only. Enter the diagnostics PIN to open the
          read-only PLC diagnostics screen.
        </div>

        {/* PIN display */}
        <div className="h-14 mb-3 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center tracking-[0.5em] text-3xl font-mono text-gray-100">
          {pin ? pin.replace(/./g, '•') : <span className="text-gray-600 tracking-normal text-lg">PIN</span>}
        </div>

        {err && <div className="text-red-400 text-center font-semibold mb-2">{err}</div>}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              onClick={() => { setErr(null); setPin((p) => (p.length < 8 ? p + d : p)) }}
              className="py-4 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-2xl font-bold text-gray-100"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => { setPin(''); setErr(null) }}
            className="py-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-lg font-bold text-gray-300"
          >
            Clear
          </button>
          <button
            onClick={() => { setErr(null); setPin((p) => (p.length < 8 ? p + '0' : p)) }}
            className="py-4 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-2xl font-bold text-gray-100"
          >
            0
          </button>
          <button
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="py-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-lg font-bold text-gray-300"
          >
            ⌫
          </button>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button
            onClick={onCancel}
            className="py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-lg font-bold text-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || pin.length < 4}
            className="py-3 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:opacity-40 text-lg font-bold text-white"
          >
            {busy ? '…' : 'Open'}
          </button>
        </div>
      </div>
    </div>
  )
}
