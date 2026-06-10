// VSD commissioning program — BFD banana dryer, Teco E510 drives.
// Per-drive parameter table with KEYPAD vs MODBUS tagging.
// Source: TECO-E510N1-AC002 Communication Addendum + E510 manual V08.
//
// CRITICAL: E510 Modbus func-06 writes to params whose stored value > 255
// silently truncate to the low byte — the drive echoes the full value once
// then reverts. func-16 (write-multiple) also reverts AND trips CE fault (code 28).
// Params whose value ≤ 255 commit reliably. Column "Via" reflects this rule.

import { useState } from 'react'

type Via = 'KEYPAD' | 'Modbus'

interface Param {
  param: string      // e.g. "02-04"
  reg: string        // Modbus register hex
  description: string
  value: string      // display value with unit
  raw: string        // integer written to register
  via: Via
  note?: string
}

interface Drive {
  node: number
  name: string
  params: Param[]
}

// ─── Shared comm + control params (same for all 4 drives except node address) ────
// Group 09: 09-01=RTU, 09-02=9600bd, 09-03=1-stop-bit, 09-04=no-parity, 09-05=8-bit
// Must be entered via KEYPAD before Modbus is active on that drive.
// Group 00: 00-02=Comm run source, 00-05=Comm freq source — both ≤255 → Modbus.

// ─── SPINNER  node 5  (was node 1 — addr 1 is invisible on Teco, readdressed) ────
// Nameplate: 420 V / 50 Hz / 964 rpm / 3.0 kW / 7.02 A / cosφ 0.74 / 6-pole / Y
const SPINNER: Drive = {
  node: 5, name: 'Spinner',
  params: [
    // Group 09 — comm setup (keypad required, drive can't hear Modbus until these are set)
    { param: '09-00', reg: '0x0900', description: 'Modbus node address',         value: '5',         raw: '5',    via: 'KEYPAD', note: 'Set first — addr 1 is invisible on Teco drives' },
    { param: '09-01', reg: '0x0901', description: 'Protocol (0=RTU)',             value: 'RTU',       raw: '0',    via: 'KEYPAD', note: 'Set before connecting Modbus master' },
    { param: '09-02', reg: '0x0902', description: 'Baud rate (1=9600)',           value: '9600 bps',  raw: '1',    via: 'KEYPAD', note: 'Set before connecting' },
    { param: '09-03', reg: '0x0903', description: 'Stop bits (0=1 stop bit)',     value: '1 stop bit',raw: '0',    via: 'KEYPAD', note: 'Set before connecting' },
    { param: '09-04', reg: '0x0904', description: 'Parity (0=none)',              value: 'None',      raw: '0',    via: 'KEYPAD', note: 'Set before connecting' },
    { param: '09-05', reg: '0x0905', description: 'Data bits (0=8 bit)',          value: '8 bit',     raw: '0',    via: 'KEYPAD', note: 'RTU requires 8-bit' },
    { param: '09-07', reg: '0x0907', description: 'Comm timeout action (3=keep running)', value: 'Keep running + COT', raw: '3', via: 'Modbus', note: 'After addr/baud set; prevents stop on master dropout' },
    // Group 02 — motor nameplate
    { param: '02-01', reg: '0x0201', description: 'Rated current (0.1 A units)', value: '7.0 A',     raw: '70',   via: 'Modbus', note: '7.02 A → 70 (rounds to 0.1A)' },
    { param: '02-03', reg: '0x0203', description: 'Rated speed (rpm)',            value: '964 rpm',   raw: '964',  via: 'KEYPAD', note: '964 > 255 — use E510 Link or keypad' },
    { param: '02-04', reg: '0x0204', description: 'Rated voltage (0.1 V units)', value: '420.0 V',   raw: '4200', via: 'KEYPAD', note: '4200 > 255 — use E510 Link or keypad' },
    { param: '02-05', reg: '0x0205', description: 'Rated power (0.1 kW units)',  value: '3.0 kW',    raw: '30',   via: 'Modbus' },
    { param: '02-06', reg: '0x0206', description: 'Rated freq (0.1 Hz units)',   value: '50.0 Hz',   raw: '500',  via: 'KEYPAD', note: '500 > 255 — use E510 Link or keypad' },
    { param: '02-07', reg: '0x0207', description: 'Poles',                       value: '6',         raw: '6',    via: 'Modbus' },
    // Group 00 — run/freq source + limits
    { param: '00-02', reg: '0x0002', description: 'Run command source (2=Comm)', value: 'Communication', raw: '2', via: 'Modbus', note: 'Drive obeys 0x2501 run/stop bit' },
    { param: '00-05', reg: '0x0005', description: 'Freq cmd source (5=Comm)',    value: 'Comm (reg 0x2502)', raw: '5', via: 'Modbus' },
    { param: '00-12', reg: '0x000C', description: 'Freq upper limit (0.1 Hz)',   value: '50.0 Hz',   raw: '500',  via: 'KEYPAD', note: '500 > 255 — keypad or E510 Link' },
    { param: '00-13', reg: '0x000D', description: 'Freq lower limit (0.1 Hz)',   value: '0.0 Hz',    raw: '0',    via: 'Modbus' },
    { param: '00-14', reg: '0x000E', description: 'Accel time 1 (0.1 s units)', value: '10.0 s',    raw: '100',  via: 'Modbus', note: 'Adjust on-site if motor trips OC-A' },
    { param: '00-15', reg: '0x000F', description: 'Decel time 1 (0.1 s units)', value: '10.0 s',    raw: '100',  via: 'Modbus', note: 'Extend if DC-bus OV on decel' },
  ],
}

// ─── AGITATOR 1  node 2 ──────────────────────────────────────────────────────────
// Nameplate: 400 V / 50 Hz / 1410 rpm / 2.2 kW / 5.0 A / cosφ 0.78 / 4-pole / Y
const AGITATOR1: Drive = {
  node: 2, name: 'Agitator 1',
  params: [
    { param: '09-00', reg: '0x0900', description: 'Modbus node address',         value: '2',         raw: '2',    via: 'KEYPAD' },
    { param: '09-01', reg: '0x0901', description: 'Protocol (0=RTU)',             value: 'RTU',       raw: '0',    via: 'KEYPAD' },
    { param: '09-02', reg: '0x0902', description: 'Baud rate (1=9600)',           value: '9600 bps',  raw: '1',    via: 'KEYPAD' },
    { param: '09-03', reg: '0x0903', description: 'Stop bits (0=1)',              value: '1 stop bit',raw: '0',    via: 'KEYPAD' },
    { param: '09-04', reg: '0x0904', description: 'Parity (0=none)',              value: 'None',      raw: '0',    via: 'KEYPAD' },
    { param: '09-05', reg: '0x0905', description: 'Data bits (0=8 bit)',          value: '8 bit',     raw: '0',    via: 'KEYPAD' },
    { param: '09-07', reg: '0x0907', description: 'Comm timeout action',         value: 'Keep running + COT', raw: '3', via: 'Modbus' },
    { param: '02-01', reg: '0x0201', description: 'Rated current (0.1 A)',       value: '5.0 A',     raw: '50',   via: 'Modbus' },
    { param: '02-03', reg: '0x0203', description: 'Rated speed (rpm)',            value: '1410 rpm',  raw: '1410', via: 'KEYPAD', note: '1410 > 255' },
    { param: '02-04', reg: '0x0204', description: 'Rated voltage (0.1 V)',       value: '400.0 V',   raw: '4000', via: 'KEYPAD', note: '4000 > 255' },
    { param: '02-05', reg: '0x0205', description: 'Rated power (0.1 kW)',        value: '2.2 kW',    raw: '22',   via: 'Modbus' },
    { param: '02-06', reg: '0x0206', description: 'Rated freq (0.1 Hz)',         value: '50.0 Hz',   raw: '500',  via: 'KEYPAD', note: '500 > 255' },
    { param: '02-07', reg: '0x0207', description: 'Poles',                       value: '4',         raw: '4',    via: 'Modbus' },
    { param: '00-02', reg: '0x0002', description: 'Run command source (2=Comm)', value: 'Communication', raw: '2', via: 'Modbus' },
    { param: '00-05', reg: '0x0005', description: 'Freq cmd source (5=Comm)',    value: 'Comm (reg 0x2502)', raw: '5', via: 'Modbus' },
    { param: '00-12', reg: '0x000C', description: 'Freq upper limit (0.1 Hz)',   value: '50.0 Hz',   raw: '500',  via: 'KEYPAD', note: '500 > 255' },
    { param: '00-13', reg: '0x000D', description: 'Freq lower limit (0.1 Hz)',   value: '0.0 Hz',    raw: '0',    via: 'Modbus' },
    { param: '00-14', reg: '0x000E', description: 'Accel time 1 (0.1 s)',        value: '10.0 s',    raw: '100',  via: 'Modbus' },
    { param: '00-15', reg: '0x000F', description: 'Decel time 1 (0.1 s)',        value: '10.0 s',    raw: '100',  via: 'Modbus' },
  ],
}

// ─── AGITATOR 2  node 3 ──────────────────────────────────────────────────────────
// Nameplate: 420 V / 50 Hz / 1445 rpm / 1.5 kW / 3.3 A / cosφ 0.77 / 4-pole / Y
const AGITATOR2: Drive = {
  node: 3, name: 'Agitator 2',
  params: [
    { param: '09-00', reg: '0x0900', description: 'Modbus node address',         value: '3',         raw: '3',    via: 'KEYPAD' },
    { param: '09-01', reg: '0x0901', description: 'Protocol (0=RTU)',             value: 'RTU',       raw: '0',    via: 'KEYPAD' },
    { param: '09-02', reg: '0x0902', description: 'Baud rate (1=9600)',           value: '9600 bps',  raw: '1',    via: 'KEYPAD' },
    { param: '09-03', reg: '0x0903', description: 'Stop bits (0=1)',              value: '1 stop bit',raw: '0',    via: 'KEYPAD' },
    { param: '09-04', reg: '0x0904', description: 'Parity (0=none)',              value: 'None',      raw: '0',    via: 'KEYPAD' },
    { param: '09-05', reg: '0x0905', description: 'Data bits (0=8 bit)',          value: '8 bit',     raw: '0',    via: 'KEYPAD' },
    { param: '09-07', reg: '0x0907', description: 'Comm timeout action',         value: 'Keep running + COT', raw: '3', via: 'Modbus' },
    { param: '02-01', reg: '0x0201', description: 'Rated current (0.1 A)',       value: '3.3 A',     raw: '33',   via: 'Modbus' },
    { param: '02-03', reg: '0x0203', description: 'Rated speed (rpm)',            value: '1445 rpm',  raw: '1445', via: 'KEYPAD', note: '1445 > 255' },
    { param: '02-04', reg: '0x0204', description: 'Rated voltage (0.1 V)',       value: '420.0 V',   raw: '4200', via: 'KEYPAD', note: '4200 > 255' },
    { param: '02-05', reg: '0x0205', description: 'Rated power (0.1 kW)',        value: '1.5 kW',    raw: '15',   via: 'Modbus' },
    { param: '02-06', reg: '0x0206', description: 'Rated freq (0.1 Hz)',         value: '50.0 Hz',   raw: '500',  via: 'KEYPAD', note: '500 > 255' },
    { param: '02-07', reg: '0x0207', description: 'Poles',                       value: '4',         raw: '4',    via: 'Modbus' },
    { param: '00-02', reg: '0x0002', description: 'Run command source (2=Comm)', value: 'Communication', raw: '2', via: 'Modbus' },
    { param: '00-05', reg: '0x0005', description: 'Freq cmd source (5=Comm)',    value: 'Comm (reg 0x2502)', raw: '5', via: 'Modbus' },
    { param: '00-12', reg: '0x000C', description: 'Freq upper limit (0.1 Hz)',   value: '50.0 Hz',   raw: '500',  via: 'KEYPAD', note: '500 > 255' },
    { param: '00-13', reg: '0x000D', description: 'Freq lower limit (0.1 Hz)',   value: '0.0 Hz',    raw: '0',    via: 'Modbus' },
    { param: '00-14', reg: '0x000E', description: 'Accel time 1 (0.1 s)',        value: '10.0 s',    raw: '100',  via: 'Modbus' },
    { param: '00-15', reg: '0x000F', description: 'Decel time 1 (0.1 s)',        value: '10.0 s',    raw: '100',  via: 'Modbus' },
  ],
}

// ─── TRACE CHAIN  node 4 ─────────────────────────────────────────────────────────
// Nameplate: 230 V / 50 Hz / 850 rpm / 0.09 kW / 0.85 A / cosφ 0.67 / delta
// ⚠ VOLTAGE FLAG: 230 V delta motor. 400V-class E510 range for 02-04 is 323~528 V.
//   If the drive is a 400V-class unit, entering 230 V (raw 2300) is OUT OF RANGE.
//   Options: (a) confirm drive is a 230V-class unit — enter 230.0 V → raw 2300,
//            (b) if 400V-class and motor rewired star: enter 400.0 V → raw 4000.
//   DO NOT guess — confirm on-site before commissioning.
// ⚠ POWER: 0.09 kW is below 02-05 minimum of 0.1 kW. Write raw 1 (= 0.1 kW min).
const TRACE_CHAIN: Drive = {
  node: 4, name: 'Trace Chain',
  params: [
    { param: '09-00', reg: '0x0900', description: 'Modbus node address',         value: '4',         raw: '4',    via: 'KEYPAD' },
    { param: '09-01', reg: '0x0901', description: 'Protocol (0=RTU)',             value: 'RTU',       raw: '0',    via: 'KEYPAD' },
    { param: '09-02', reg: '0x0902', description: 'Baud rate (1=9600)',           value: '9600 bps',  raw: '1',    via: 'KEYPAD' },
    { param: '09-03', reg: '0x0903', description: 'Stop bits (0=1)',              value: '1 stop bit',raw: '0',    via: 'KEYPAD' },
    { param: '09-04', reg: '0x0904', description: 'Parity (0=none)',              value: 'None',      raw: '0',    via: 'KEYPAD' },
    { param: '09-05', reg: '0x0905', description: 'Data bits (0=8 bit)',          value: '8 bit',     raw: '0',    via: 'KEYPAD' },
    { param: '09-07', reg: '0x0907', description: 'Comm timeout action',         value: 'Keep running + COT', raw: '3', via: 'Modbus' },
    { param: '02-01', reg: '0x0201', description: 'Rated current (0.1 A)',       value: '0.85 A → 9', raw: '9',  via: 'Modbus', note: '0.85 A rounds to 0.9 A (raw 9); nameplate is 0.85' },
    { param: '02-03', reg: '0x0203', description: 'Rated speed (rpm)',            value: '850 rpm',   raw: '850',  via: 'KEYPAD', note: '850 > 255' },
    { param: '02-04', reg: '0x0204', description: 'Rated voltage (0.1 V)',       value: '⚠ CONFIRM — see note', raw: '?', via: 'KEYPAD', note: '⚠ 230V delta motor: if 400V-class drive → raw 2300 is OOB (range 3230~5280). Confirm drive class. If motor rewired star for 400V supply → use 4000. If 230V-class drive → use 2300.' },
    { param: '02-05', reg: '0x0205', description: 'Rated power (0.1 kW)',        value: '0.1 kW (min)', raw: '1', via: 'Modbus', note: '0.09 kW nameplate < 0.1 kW minimum — write 1 (drive minimum)' },
    { param: '02-06', reg: '0x0206', description: 'Rated freq (0.1 Hz)',         value: '50.0 Hz',   raw: '500',  via: 'KEYPAD', note: '500 > 255' },
    { param: '02-07', reg: '0x0207', description: 'Poles',                       value: '— (unknown)', raw: '?', via: 'KEYPAD', note: 'Pole count not on nameplate — read from motor or calculate: 120×50/850 ≈ 7.06 → likely 6-pole (sync 1000 rpm) or 8-pole (sync 750 rpm); 850 rpm slip suggests 6-pole. Confirm.' },
    { param: '00-02', reg: '0x0002', description: 'Run command source (2=Comm)', value: 'Communication', raw: '2', via: 'Modbus' },
    { param: '00-05', reg: '0x0005', description: 'Freq cmd source (5=Comm)',    value: 'Comm (reg 0x2502)', raw: '5', via: 'Modbus' },
    { param: '00-12', reg: '0x000C', description: 'Freq upper limit (0.1 Hz)',   value: '50.0 Hz',   raw: '500',  via: 'KEYPAD', note: '500 > 255' },
    { param: '00-13', reg: '0x000D', description: 'Freq lower limit (0.1 Hz)',   value: '0.0 Hz',    raw: '0',    via: 'Modbus' },
    { param: '00-14', reg: '0x000E', description: 'Accel time 1 (0.1 s)',        value: '10.0 s',    raw: '100',  via: 'Modbus', note: 'Slow load — increase to 30 s (raw 300) if it jerks' },
    { param: '00-15', reg: '0x000F', description: 'Decel time 1 (0.1 s)',        value: '10.0 s',    raw: '100',  via: 'Modbus' },
  ],
}

const DRIVES: Drive[] = [SPINNER, AGITATOR1, AGITATOR2, TRACE_CHAIN]

// Modbus CLI snippets (post-commissioning, once 09-00/01/02 set via keypad)
function modbusSnippet(drive: Drive): string {
  const modbusParams = drive.params.filter(p => p.via === 'Modbus' && p.raw !== '?' && p.param !== '09-07')
  const lines = [
    `# ${drive.name} — node ${drive.node} — Modbus-settable params`,
    `# Run on panel: sudo python3 /home/bfa/teco_cli.py write ${drive.node} <param> <value> --baud 9600 --mode rtu`,
    '',
    ...modbusParams.map(p => `write ${drive.node} ${p.param} ${p.raw}   # ${p.description} → ${p.value}`),
    '',
    `# Set run source + freq source (enables Modbus control):`,
    `write ${drive.node} 0-02 2`,
    `write ${drive.node} 0-05 5`,
    '',
    `# Verify state:`,
    `info ${drive.node} --baud 9600 --mode rtu`,
  ]
  return lines.join('\n')
}

export function VsdPrograms({ onClose }: { onClose: () => void }) {
  const [activeNode, setActiveNode] = useState<number>(5)
  const [showSnippet, setShowSnippet] = useState(false)
  const drive = DRIVES.find(d => d.node === activeNode) ?? DRIVES[0]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-700 bg-gray-900 px-5 py-3 shrink-0 rounded-t-xl">
          <h2 className="text-lg font-semibold text-white">VSD Commissioning Programs — BFD Teco E510</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-700 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Intro banner */}
        <div className="px-5 pt-3 pb-0 shrink-0">
          <div className="rounded-md border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-300 mb-3">
            <strong>KEYPAD rule:</strong> On this E510, Modbus func-06 writes to params whose stored value &gt; 255 silently revert
            to the low byte. func-16 (write-multiple) also reverts <em>and</em> trips CE fault (code 28).
            Params tagged <span className="font-bold text-amber-200">KEYPAD</span> must be entered on the drive keypad
            (or via E510 Link Pro software). Params tagged <span className="font-bold text-cyan-300">Modbus</span> commit reliably.
          </div>
          <div className="rounded-md border border-blue-700/50 bg-blue-900/20 px-3 py-2 text-xs text-blue-300 mb-3">
            <strong>Group 09 (comm setup)</strong> must be entered via keypad <em>first</em> — the drive cannot receive
            Modbus until its address/baud/format match the master. Once 09-00/01/02 are set and the bus is wired,
            the remaining Modbus-tagged params can be written with teco_cli.py.
          </div>
        </div>

        {/* Drive selector tabs */}
        <div className="flex gap-2 px-5 pb-2 shrink-0">
          {DRIVES.map(d => (
            <button
              key={d.node}
              onClick={() => { setActiveNode(d.node); setShowSnippet(false) }}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                d.node === activeNode
                  ? 'bg-gray-700 border-gray-500 text-white'
                  : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              Node {d.node} — {d.name}
              {d.node === 4 && <span className="ml-1 text-amber-400">⚠</span>}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setShowSnippet(s => !s)}
            className="px-3 py-1.5 rounded-lg text-xs font-mono border border-gray-600 bg-gray-800/60 text-gray-300 hover:bg-gray-700"
          >
            {showSnippet ? 'Hide CLI' : 'teco_cli.py'}
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-auto px-5 pb-4 min-h-0">

          {showSnippet ? (
            <pre className="rounded-lg bg-gray-950 border border-gray-700 p-4 text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed">
              {modbusSnippet(drive)}
            </pre>
          ) : (
            <>
              {/* Parameter table */}
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-gray-400 sticky top-0 bg-gray-900">
                    <th className="border-b border-gray-700 px-2 py-2 whitespace-nowrap">Param</th>
                    <th className="border-b border-gray-700 px-2 py-2 whitespace-nowrap">Reg (hex)</th>
                    <th className="border-b border-gray-700 px-2 py-2">Description</th>
                    <th className="border-b border-gray-700 px-2 py-2 whitespace-nowrap">Set to</th>
                    <th className="border-b border-gray-700 px-2 py-2 whitespace-nowrap">Raw int</th>
                    <th className="border-b border-gray-700 px-2 py-2 whitespace-nowrap">Via</th>
                    <th className="border-b border-gray-700 px-2 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {drive.params.map((p, i) => (
                    <tr
                      key={p.param}
                      className={`text-gray-100 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/30'}`}
                    >
                      <td className="px-2 py-1.5 font-mono text-cyan-400 whitespace-nowrap">{p.param}</td>
                      <td className="px-2 py-1.5 font-mono text-gray-400 whitespace-nowrap">{p.reg}</td>
                      <td className="px-2 py-1.5 text-gray-200">{p.description}</td>
                      <td className="px-2 py-1.5 font-mono whitespace-nowrap text-gray-100">{p.value}</td>
                      <td className={`px-2 py-1.5 font-mono whitespace-nowrap ${p.raw === '?' ? 'text-amber-400' : 'text-gray-300'}`}>
                        {p.raw}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${
                          p.via === 'KEYPAD'
                            ? 'bg-amber-900/60 text-amber-300 border border-amber-700/60'
                            : 'bg-cyan-900/40 text-cyan-300 border border-cyan-700/40'
                        }`}>
                          {p.via}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-gray-400 text-xs leading-snug max-w-xs">
                        {p.note ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Verify commands */}
              <div className="mt-4 rounded-md border border-gray-700 bg-gray-950 px-4 py-3 text-xs font-mono text-gray-300">
                <p className="text-gray-400 mb-1 font-sans not-italic">Quick verify (run on panel after programming):</p>
                <p className="text-green-300">sudo python3 /home/bfa/teco_cli.py info {drive.node} --baud 9600 --mode rtu</p>
                <p className="text-green-300 mt-0.5">sudo python3 /home/bfa/teco_cli.py mon {drive.node} --baud 9600 --mode rtu</p>
              </div>

              {/* Trace Chain voltage warning */}
              {drive.node === 4 && (
                <div className="mt-3 rounded-md border border-red-700/60 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                  <strong>⚠ TRACE CHAIN — CONFIRM BEFORE COMMISSIONING:</strong> Motor is 230 V delta.
                  A 400V-class E510 has voltage range 323.0~528.0 V for param 02-04 — entering 230 V (raw 2300)
                  is <em>outside that range</em>. On-site, confirm: (a) is the drive a 230V-class unit? or
                  (b) has the motor been rewired star for a 400V supply?
                  If star/400V → enter 4000. If 230V drive confirmed → enter 2300.
                  Also: pole count not stated on nameplate — calculate 120×50/850≈7.1, likely 6-pole
                  (sync 1000 rpm). Confirm on motor data plate or manufacturers data.
                </div>
              )}

              {/* Comm sequence reminder */}
              <div className="mt-3 rounded-md border border-gray-700 bg-gray-800/30 px-3 py-2 text-xs text-gray-300">
                <p className="font-semibold text-gray-200 mb-1">Commissioning sequence (one drive at a time):</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Power drive. Key all Group 09 params (addr/baud/format) via keypad.</li>
                  <li>Key KEYPAD-tagged Group 02 nameplate params (speed/voltage/freq) via keypad or E510 Link Pro.</li>
                  <li>Key 00-12 freq upper limit via keypad.</li>
                  <li>Connect bus. Run: <code className="text-cyan-300">teco_cli.py scan</code> — confirm drive responds.</li>
                  <li>Write Modbus-tagged params: current, power, poles, 00-02, 00-05, 00-13, 00-14, 00-15.</li>
                  <li>Read back to verify: <code className="text-cyan-300">teco_cli.py info {drive.node}</code></li>
                  <li>With E-stop confirmed: <code className="text-cyan-300">teco_cli.py freq {drive.node} 10.0 &amp;&amp; teco_cli.py run {drive.node}</code></li>
                  <li>Check direction, current, no faults. Ramp to 50 Hz.</li>
                </ol>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
