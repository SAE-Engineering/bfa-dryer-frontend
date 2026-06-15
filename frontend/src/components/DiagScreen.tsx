// Hidden on-panel diagnostics screen.
//
// Reached at #diag (hash route — NOT linked from the normal UI) or by a ~2 s
// long-press on the SAE logo in the StatusBar (see StatusBar.tsx).  Polls
// GET /api/diag every ~1 s and renders raw %MW words + %M bits with decoded
// labels so the operator can fault-find comms + I/O without opening MEB.
//
// READ-ONLY: this screen never writes to the PLC.  Dark theme, sized for the
// 1920×1200 industrial panel.
//
// Labels grounded against make_final.py (bfa-plc-cli) — the live FINAL program.

import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { DiagState } from '../types'

// ── %MW0 command-word bit labels (the HMI command word) ───────────────────
const MW0_BITS: { bit: number; label: string }[] = [
  { bit: 0, label: 'X0 Hot Fan' },
  { bit: 1, label: 'X1 Discharge Agitator' },
  { bit: 2, label: 'X2 Spinner' },
  { bit: 3, label: 'X3 Agitator 1' },
  { bit: 4, label: 'X4 Mill' },
  { bit: 5, label: 'X5 Discharge Conveyor' },
  { bit: 6, label: 'X6 Loading Conveyor' },
  { bit: 7, label: 'X7 Brush' },
  { bit: 8, label: 'X8 Shaker' },
  { bit: 9, label: 'X9 Agitator 2' },
  { bit: 10, label: 'X10 Trace Chain' },
  { bit: 11, label: 'X11 Burner' },
]

// ── %MW row metadata: label + how to derive a human reading ────────────────
type Derive = (raw: number | null) => string
const tempC: Derive = (r) => (r === null ? '—' : `${(r / 10).toFixed(1)} °C`)
const hz: Derive = (r) => (r === null ? '—' : `${r} Hz`)
const plain: Derive = (r) => (r === null ? '—' : `${r}`)

const MW_ROWS: { addr: number; label: string; derive: Derive }[] = [
  { addr: 0, label: 'Command word (HMI outputs)', derive: plain },
  { addr: 2, label: 'Mode', derive: plain },
  { addr: 10, label: 'Heartbeat', derive: plain },
  { addr: 11, label: 'Heartbeat', derive: plain },
  { addr: 31, label: 'Burner-air temp', derive: tempC },
  { addr: 32, label: 'Product 1 temp', derive: tempC },
  { addr: 33, label: 'Product 2 temp', derive: tempC },
  { addr: 34, label: 'Exhaust temp', derive: tempC },
  { addr: 40, label: 'Spinner setpoint', derive: hz },
  { addr: 41, label: 'Agitator 1 setpoint', derive: hz },
  { addr: 42, label: 'Agitator 2 setpoint', derive: hz },
  { addr: 43, label: 'Trace chain setpoint', derive: hz },
  { addr: 44, label: 'Hot Fan setpoint', derive: hz },
  { addr: 45, label: 'Burner target', derive: tempC },
  { addr: 46, label: 'Burner band', derive: tempC },
  { addr: 49, label: 'Scorch limit', derive: tempC },
  { addr: 48, label: 'Over-temp clear', derive: tempC },
  { addr: 50, label: 'Scorch clear', derive: tempC },
  { addr: 52, label: 'Fire re-enable', derive: tempC },
]

// ── %M groups: Inputs / mirrors, Faults, Drive status ──────────────────────
const M_INPUTS: { addr: number; label: string }[] = [
  { addr: 0, label: 'Run-permit %M0' },
  { addr: 1, label: 'MAIN on/off (←I0.0) %M1' },
  { addr: 2, label: 'SHUTOFF monitor (←I0.11) %M2' },
  { addr: 3, label: 'SOFT-LOCK monitor (←I0.10) %M3' },
  { addr: 4, label: 'SAFETY-OK (=NOT I0.13) %M4' },
  { addr: 5, label: 'RESET monitor (←I0.12) %M5' },
]
const M_FAULTS: { addr: number; label: string }[] = [
  { addr: 20, label: 'Fire trip %M20' },
  { addr: 21, label: 'Over-temp %M21' },
  { addr: 22, label: 'Scorch %M22' },
  { addr: 23, label: 'Hot-fan on %M23' },
]
const M_DRIVE: { addr: number; label: string }[] = [
  { addr: 80, label: 'Trace MC_Power %M80' },
  { addr: 81, label: 'Ag1 MC_Power %M81' },
  { addr: 82, label: 'Ag2 MC_Power %M82' },
  { addr: 83, label: 'Spinner MC_Power %M83' },
  { addr: 88, label: 'Trace ReadStatus-valid %M88' },
  { addr: 89, label: 'Ag1 ReadStatus-valid %M89' },
  { addr: 90, label: 'Ag2 ReadStatus-valid %M90' },
  { addr: 91, label: 'Spinner ReadStatus-valid %M91' },
]

function Dot({ on }: { on: boolean | null }) {
  if (on === null) {
    return <span className="inline-block w-4 h-4 rounded-full bg-gray-700 align-middle" title="no data" />
  }
  return (
    <span
      className={
        'inline-block w-4 h-4 rounded-full align-middle ' +
        (on
          ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]'
          : 'bg-gray-600')
      }
    />
  )
}

function BitGrid({ word }: { word: number | null }) {
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mt-2">
      {MW0_BITS.map(({ bit, label }) => {
        const on = word === null ? null : ((word >> bit) & 1) === 1
        return (
          <div key={bit} className="flex items-center gap-3 text-base">
            <Dot on={on} />
            <span className="font-mono text-gray-500 w-9 shrink-0">b{bit}</span>
            <span className={on ? 'text-green-200' : 'text-gray-400'}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

function MBitTable({ title, rows, m }: {
  title: string
  rows: { addr: number; label: string }[]
  m: Record<string, boolean | null>
}) {
  return (
    <div>
      <div className="text-cyan-300 font-bold text-lg mb-2 uppercase tracking-wide">{title}</div>
      <table className="w-full text-base border-collapse">
        <tbody>
          {rows.map(({ addr, label }) => {
            const v = m[String(addr)] ?? null
            return (
              <tr key={addr} className="border-b border-gray-800">
                <td className="py-1.5 pr-3 font-mono text-gray-500 w-16">%M{addr}</td>
                <td className="py-1.5 pr-3 text-gray-200">{label}</td>
                <td className="py-1.5 pr-3 w-10 text-right"><Dot on={v} /></td>
                <td className={'py-1.5 w-16 text-right font-mono font-bold ' +
                  (v === null ? 'text-gray-600' : v ? 'text-green-300' : 'text-gray-500')}>
                  {v === null ? '—' : v ? 'ON' : 'OFF'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function DiagScreen({ onClose }: { onClose: () => void }) {
  const [diag, setDiag] = useState<DiagState | null>(null)
  const [lastErr, setLastErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const d = await api.getDiag()
        if (!cancelled) {
          setDiag(d)
          setLastErr(null)
        }
      } catch (e) {
        if (!cancelled) setLastErr(e instanceof Error ? e.message : String(e))
      }
    }
    poll()
    timer.current = setInterval(poll, 1000)
    return () => {
      cancelled = true
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  const conn = diag?.conn
  const mw = diag?.mw ?? {}
  const m = diag?.m ?? {}
  const connected = !!conn?.connected

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-6 px-6 py-3 bg-gray-900 border-b-2 border-gray-700 shrink-0">
        <span className="text-xl font-extrabold tracking-wide text-amber-300">PLC DIAGNOSTICS</span>
        <span className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-xs font-bold uppercase tracking-widest text-gray-400">
          read-only
        </span>
        <div className="flex-1" />
        <span className="font-mono text-sm text-gray-500">
          {diag ? new Date(diag.ts).toLocaleTimeString('en-AU', { hour12: false }) : '—'}
        </span>
        <button
          onClick={onClose}
          className="px-5 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-lg font-bold text-white shadow-lg"
        >
          ✕ Close / back to HMI
        </button>
      </div>

      {/* Comms panel */}
      <div className="px-6 py-3 bg-gray-900/60 border-b border-gray-800 shrink-0">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <div className="flex items-center gap-3">
            <span className={'inline-block w-5 h-5 rounded-full ' +
              (connected
                ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.9)]'
                : 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.9)]')} />
            <span className={'text-xl font-bold ' + (connected ? 'text-green-300' : 'text-red-400')}>
              {connected ? 'PLC Connected' : 'PLC Offline'}
            </span>
          </div>
          <div className="text-lg text-gray-300">
            <span className="text-gray-500">host </span>
            <span className="font-mono text-gray-100">{conn?.host ?? '—'}:{conn?.port ?? '—'}</span>
            {conn?.proto && <span className="ml-2 text-gray-500 uppercase text-sm">({conn.proto})</span>}
          </div>
          {conn?.sim && (
            <span className="px-3 py-1 rounded bg-amber-500 text-gray-950 text-sm font-extrabold tracking-widest uppercase">SIM</span>
          )}
          {conn?.released && (
            <span className="px-3 py-1 rounded bg-red-600 text-white text-sm font-extrabold tracking-widest uppercase">Released — MEB has PLC</span>
          )}
        </div>
        {/* Last error(s) */}
        {(lastErr || (conn?.errors && conn.errors.length > 0)) && (
          <div className="mt-2 text-sm text-red-300 font-mono">
            <span className="text-red-500 font-bold uppercase tracking-wide">last error: </span>
            {lastErr ?? conn?.errors.join(' · ')}
          </div>
        )}
      </div>

      {/* Body: %MW (left/wide) + %M groups (right) */}
      <div className="flex-1 grid grid-cols-[1.4fr_1fr] gap-6 px-6 py-4 min-h-0">
        {/* %MW table */}
        <div className="min-h-0 overflow-auto">
          <div className="text-cyan-300 font-bold text-lg mb-2 uppercase tracking-wide">%MW words</div>
          <table className="w-full text-base border-collapse">
            <thead>
              <tr className="text-gray-500 text-sm uppercase tracking-wide border-b border-gray-700">
                <th className="text-left py-1.5 pr-3 w-16">Addr</th>
                <th className="text-left py-1.5 pr-3">Label</th>
                <th className="text-right py-1.5 pr-3 w-20">Raw</th>
                <th className="text-right py-1.5 w-28">Derived</th>
              </tr>
            </thead>
            <tbody>
              {MW_ROWS.map(({ addr, label, derive }) => {
                const raw = mw[String(addr)] ?? null
                return (
                  <tr key={addr} className="border-b border-gray-800 align-top">
                    <td className="py-1.5 pr-3 font-mono text-gray-500">%MW{addr}</td>
                    <td className="py-1.5 pr-3 text-gray-200">
                      {label}
                      {addr === 0 && <BitGrid word={raw} />}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-gray-100">
                      {raw === null ? '—' : raw}
                    </td>
                    <td className="py-1.5 text-right font-mono font-semibold text-emerald-300">
                      {derive(raw)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* %M groups */}
        <div className="min-h-0 overflow-auto flex flex-col gap-5">
          <MBitTable title="Inputs / mirrors" rows={M_INPUTS} m={m} />
          <MBitTable title="Faults" rows={M_FAULTS} m={m} />
          <MBitTable title="Drive status" rows={M_DRIVE} m={m} />
        </div>
      </div>
    </div>
  )
}
