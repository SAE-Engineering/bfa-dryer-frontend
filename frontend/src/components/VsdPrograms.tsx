// VSD commissioning reference — BFD banana dryer, FINAL all-ATV architecture.
//
// The final PLC program (BFD_final.smbp) drives all four loads from the M221's
// built-in Modbus Serial IOScanner (SL1) at 19200 8E1, slaves 1-4:
//   slave 1 = %DRV0 = Trace chain  (ATV12)
//   slave 2 = %DRV1 = Agitator 1   (ATV12)
//   slave 3 = %DRV2 = Agitator 2   (ATV12)
//   slave 4 = %DRV3 = Spinner      (ATV320 3 kW — no ATV12 above 3 kW)
// Run/stop + speed reference come over Modbus from the PLC IOScanner (CMD/LFRD
// registers); the HMI command bits %MW0:Xk and Hz setpoints %MW40-43 feed the
// drive function blocks (MC_Power / MC_MoveVel) in the ladder.
//
// READ-ONLY REFERENCE. The HMI never writes drive parameters — these values are
// keyed on the drive itself (ATV keypad / SoMove) during commissioning. This
// screen is the checklist + the per-drive target settings.

import { useState } from 'react'

type Via = 'KEYPAD' | 'IOScanner'

interface Param {
  param: string       // ATV menu code, e.g. "FUn-CtL-Add"
  code: string        // short keypad mnemonic
  description: string
  value: string       // display value with unit
  via: Via
  note?: string
}

interface Drive {
  slave: number       // Modbus slave address on SL1 (1-4)
  drv: string         // PLC drive axis %DRVn
  name: string
  family: 'ATV12' | 'ATV320'
  cmdBit: string      // %MW0:Xk command bit
  hzReg: string       // %MWnn Hz setpoint the HMI writes
  permit: string      // %Mnn PLC run permit
  params: Param[]
}

// Shared comm config — IDENTICAL on every drive except the slave address.
// 19200 8E1 matches the PLC SerialLineConfiguration (Baud19200 / ParityEven /
// DataBits8 / StopBits1) in make_final.py.
function commParams(slave: number, family: 'ATV12' | 'ATV320'): Param[] {
  // ATV12: COnF > FULL > COM- ;  ATV320: COMM > Md1-
  const grp = family === 'ATV12' ? 'COM-' : 'Md1-'
  return [
    { param: `${grp} Add`,  code: 'Add',  description: 'Modbus slave address',  value: String(slave), via: 'KEYPAD', note: 'Must match the PLC IOScanner slave (1-4). Set FIRST.' },
    { param: `${grp} tbr`,  code: 'tbr',  description: 'Modbus baud rate',      value: '19.2 kbps',   via: 'KEYPAD', note: 'PLC SL1 = 19200. Mismatch = no comms.' },
    { param: `${grp} tFO`,  code: 'tFO',  description: 'Modbus format',         value: '8E1',         via: 'KEYPAD', note: '8 data / Even parity / 1 stop — matches PLC ParityEven.' },
    { param: `${grp} ttO`,  code: 'ttO',  description: 'Modbus timeout (s)',    value: '10.0 s',      via: 'KEYPAD', note: 'Comms-loss action; keep > IOScanner cycle (20 ms).' },
  ]
}

// Control config — run/ref from Modbus (the IOScanner), not the terminals/keypad.
function controlParams(family: 'ATV12' | 'ATV320'): Param[] {
  if (family === 'ATV320') {
    return [
      { param: 'CtL- Fr1', code: 'Fr1', description: 'Reference 1 channel',  value: 'Modbus (Mdb)', via: 'KEYPAD', note: 'Speed reference from the PLC LFRD register.' },
      { param: 'CtL- Cd1', code: 'Cd1', description: 'Command channel 1',    value: 'Modbus (Mdb)', via: 'KEYPAD', note: 'Run/stop from the PLC CMD register.' },
      { param: 'CtL- CHCF', code: 'CHCF', description: 'Profile',            value: 'Separate (SEP)', via: 'KEYPAD', note: 'Separate ref/cmd so both come from Modbus.' },
    ]
  }
  return [
    { param: 'CtL- Fr1', code: 'Fr1', description: 'Reference 1 channel',  value: 'Modbus (Mdb)', via: 'KEYPAD', note: 'ATV12: speed reference from the PLC LFRD register.' },
    { param: 'CtL- CHCF', code: 'CHCF', description: 'Control mode',        value: 'Modbus',       via: 'KEYPAD', note: 'Run/stop via the PLC CMD register (ETA/CMD profile).' },
  ]
}

// ── TRACE CHAIN  slave 1 = %DRV0  (ATV12) ──────────────────────────────────────
// Nameplate (VSD Nameplates): 230 V / 50 Hz / 850 rpm / 0.09 kW / 0.85 A / Δ
// ⚠ 230 V delta motor — confirm the drive is a 230 V-class ATV12, or the motor
//   is rewired star for a 400 V supply, before entering UnS.
const TRACE: Drive = {
  slave: 1, drv: '%DRV0', name: 'Trace Chain', family: 'ATV12',
  cmdBit: '%MW0:X10', hzReg: '%MW43', permit: '%M44',
  params: [
    ...commParams(1, 'ATV12'),
    { param: 'drC- bFr', code: 'bFr', description: 'Standard motor freq', value: '50 Hz', via: 'KEYPAD' },
    { param: 'drC- UnS', code: 'UnS', description: 'Rated motor voltage',  value: '⚠ CONFIRM (230 V Δ)', via: 'KEYPAD', note: '230 V delta: confirm drive is 230 V-class (UnS=230) OR motor rewired star for 400 V (UnS=400). DO NOT guess.' },
    { param: 'drC- FrS', code: 'FrS', description: 'Rated motor freq',     value: '50.0 Hz', via: 'KEYPAD' },
    { param: 'drC- nCr', code: 'nCr', description: 'Rated motor current',  value: '0.85 A', via: 'KEYPAD', note: 'Nameplate 0.85 A.' },
    { param: 'drC- nSP', code: 'nSP', description: 'Rated motor speed',    value: '850 rpm', via: 'KEYPAD', note: 'Pole count not on plate — 850 rpm slip ⇒ likely 6-pole. Confirm.' },
    ...controlParams('ATV12'),
    { param: 'SEt- ACC', code: 'ACC', description: 'Acceleration time',    value: '10.0 s', via: 'KEYPAD', note: 'Slow load — increase to 30 s if it jerks.' },
    { param: 'SEt- dEC', code: 'dEC', description: 'Deceleration time',    value: '10.0 s', via: 'KEYPAD' },
    { param: 'SEt- HSP', code: 'HSP', description: 'High speed (max Hz)',  value: '50.0 Hz', via: 'KEYPAD' },
    { param: 'SEt- LSP', code: 'LSP', description: 'Low speed (min Hz)',   value: '0.0 Hz', via: 'KEYPAD' },
  ],
}

// ── AGITATOR 1  slave 2 = %DRV1  (ATV12) ───────────────────────────────────────
// Nameplate: 400 V / 50 Hz / 1410 rpm / 2.2 kW / 5.0 A / 4-pole / Y
const AG1: Drive = {
  slave: 2, drv: '%DRV1', name: 'Agitator 1', family: 'ATV12',
  cmdBit: '%MW0:X3', hzReg: '%MW41', permit: '%M45',
  params: [
    ...commParams(2, 'ATV12'),
    { param: 'drC- bFr', code: 'bFr', description: 'Standard motor freq', value: '50 Hz', via: 'KEYPAD' },
    { param: 'drC- UnS', code: 'UnS', description: 'Rated motor voltage',  value: '400 V', via: 'KEYPAD' },
    { param: 'drC- FrS', code: 'FrS', description: 'Rated motor freq',     value: '50.0 Hz', via: 'KEYPAD' },
    { param: 'drC- nCr', code: 'nCr', description: 'Rated motor current',  value: '5.0 A', via: 'KEYPAD' },
    { param: 'drC- nSP', code: 'nSP', description: 'Rated motor speed',    value: '1410 rpm', via: 'KEYPAD', note: '4-pole.' },
    ...controlParams('ATV12'),
    { param: 'SEt- ACC', code: 'ACC', description: 'Acceleration time',    value: '10.0 s', via: 'KEYPAD' },
    { param: 'SEt- dEC', code: 'dEC', description: 'Deceleration time',    value: '10.0 s', via: 'KEYPAD' },
    { param: 'SEt- HSP', code: 'HSP', description: 'High speed (max Hz)',  value: '50.0 Hz', via: 'KEYPAD' },
    { param: 'SEt- LSP', code: 'LSP', description: 'Low speed (min Hz)',   value: '0.0 Hz', via: 'KEYPAD' },
  ],
}

// ── AGITATOR 2  slave 3 = %DRV2  (ATV12) ───────────────────────────────────────
// Nameplate: 420 V / 50 Hz / 1445 rpm / 1.5 kW / 3.3 A / 4-pole / Y
const AG2: Drive = {
  slave: 3, drv: '%DRV2', name: 'Agitator 2', family: 'ATV12',
  cmdBit: '%MW0:X9', hzReg: '%MW42', permit: '%M46',
  params: [
    ...commParams(3, 'ATV12'),
    { param: 'drC- bFr', code: 'bFr', description: 'Standard motor freq', value: '50 Hz', via: 'KEYPAD' },
    { param: 'drC- UnS', code: 'UnS', description: 'Rated motor voltage',  value: '420 V', via: 'KEYPAD' },
    { param: 'drC- FrS', code: 'FrS', description: 'Rated motor freq',     value: '50.0 Hz', via: 'KEYPAD' },
    { param: 'drC- nCr', code: 'nCr', description: 'Rated motor current',  value: '3.3 A', via: 'KEYPAD' },
    { param: 'drC- nSP', code: 'nSP', description: 'Rated motor speed',    value: '1445 rpm', via: 'KEYPAD', note: '4-pole.' },
    ...controlParams('ATV12'),
    { param: 'SEt- ACC', code: 'ACC', description: 'Acceleration time',    value: '10.0 s', via: 'KEYPAD' },
    { param: 'SEt- dEC', code: 'dEC', description: 'Deceleration time',    value: '10.0 s', via: 'KEYPAD' },
    { param: 'SEt- HSP', code: 'HSP', description: 'High speed (max Hz)',  value: '50.0 Hz', via: 'KEYPAD' },
    { param: 'SEt- LSP', code: 'LSP', description: 'Low speed (min Hz)',   value: '0.0 Hz', via: 'KEYPAD' },
  ],
}

// ── SPINNER  slave 4 = %DRV3  (ATV320 3 kW) ────────────────────────────────────
// Nameplate: 420 V / 50 Hz / 964 rpm / 3.0 kW / 7.02 A / 6-pole / Y
// ATV320 because Schneider has no ATV12 above 3 kW.
const SPINNER: Drive = {
  slave: 4, drv: '%DRV3', name: 'Spinner', family: 'ATV320',
  cmdBit: '%MW0:X2', hzReg: '%MW40', permit: '%M47',
  params: [
    ...commParams(4, 'ATV320'),
    { param: 'SIM- bFr', code: 'bFr', description: 'Standard motor freq', value: '50 Hz', via: 'KEYPAD' },
    { param: 'SIM- UnS', code: 'UnS', description: 'Rated motor voltage',  value: '420 V', via: 'KEYPAD' },
    { param: 'SIM- FrS', code: 'FrS', description: 'Rated motor freq',     value: '50.0 Hz', via: 'KEYPAD' },
    { param: 'SIM- nCr', code: 'nCr', description: 'Rated motor current',  value: '7.0 A', via: 'KEYPAD', note: 'Nameplate 7.02 A.' },
    { param: 'SIM- nSP', code: 'nSP', description: 'Rated motor speed',    value: '964 rpm', via: 'KEYPAD', note: '6-pole.' },
    { param: 'SIM- nPr', code: 'nPr', description: 'Rated motor power',    value: '3.0 kW', via: 'KEYPAD' },
    ...controlParams('ATV320'),
    { param: 'SEt- ACC', code: 'ACC', description: 'Acceleration time',    value: '10.0 s', via: 'KEYPAD' },
    { param: 'SEt- dEC', code: 'dEC', description: 'Deceleration time',    value: '10.0 s', via: 'KEYPAD' },
    { param: 'SEt- HSP', code: 'HSP', description: 'High speed (max Hz)',  value: '50.0 Hz', via: 'KEYPAD' },
    { param: 'SEt- LSP', code: 'LSP', description: 'Low speed (min Hz)',   value: '0.0 Hz', via: 'KEYPAD' },
  ],
}

const DRIVES: Drive[] = [TRACE, AG1, AG2, SPINNER]

export function VsdPrograms({ onClose }: { onClose: () => void }) {
  const [activeSlave, setActiveSlave] = useState<number>(1)
  const drive = DRIVES.find((d) => d.slave === activeSlave) ?? DRIVES[0]

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
          <h2 className="text-lg font-semibold text-white">
            VSD Commissioning Reference — BFD Schneider ATV (Modbus IOScanner)
          </h2>
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
          <div className="rounded-md border border-cyan-700/50 bg-cyan-900/20 px-3 py-2 text-xs text-cyan-300 mb-3">
            <strong>Architecture:</strong> all 4 drives on the M221 built-in Modbus
            Serial IOScanner (SL1), <span className="font-bold text-cyan-200">19200 8E1</span>, slaves 1-4.
            Run/stop + speed come over Modbus from the PLC (CMD / LFRD registers); the HMI
            command bits <span className="font-mono">%MW0:Xk</span> and Hz setpoints
            <span className="font-mono"> %MW40-43</span> feed the drive function blocks in the ladder.
          </div>
          <div className="rounded-md border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-300 mb-3">
            <strong>READ-ONLY:</strong> the HMI never writes drive parameters. Key these on the
            drive (ATV keypad / SoMove) during commissioning. Set the comm params (Add / tbr /
            tFO) <em>first</em> — the IOScanner can't reach the drive until address + 19200 8E1 match.
          </div>
        </div>

        {/* Drive selector tabs */}
        <div className="flex gap-2 px-5 pb-2 shrink-0 flex-wrap">
          {DRIVES.map((d) => (
            <button
              key={d.slave}
              onClick={() => setActiveSlave(d.slave)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                d.slave === activeSlave
                  ? 'bg-gray-700 border-gray-500 text-white'
                  : 'bg-gray-800/40 border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              s{d.slave} · {d.drv} — {d.name}
              {d.slave === 1 && <span className="ml-1 text-amber-400">⚠</span>}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-auto px-5 pb-4 min-h-0">
          {/* Drive map row */}
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded border border-gray-700 bg-gray-800/40 px-3 py-2">
              <div className="text-gray-500 uppercase tracking-wide">Family</div>
              <div className="font-semibold text-gray-100">{drive.family}</div>
            </div>
            <div className="rounded border border-gray-700 bg-gray-800/40 px-3 py-2">
              <div className="text-gray-500 uppercase tracking-wide">HMI cmd bit</div>
              <div className="font-mono text-cyan-300">{drive.cmdBit}</div>
            </div>
            <div className="rounded border border-gray-700 bg-gray-800/40 px-3 py-2">
              <div className="text-gray-500 uppercase tracking-wide">Hz setpoint</div>
              <div className="font-mono text-cyan-300">{drive.hzReg}</div>
            </div>
            <div className="rounded border border-gray-700 bg-gray-800/40 px-3 py-2">
              <div className="text-gray-500 uppercase tracking-wide">PLC permit</div>
              <div className="font-mono text-gray-300">{drive.permit}</div>
            </div>
          </div>

          {/* Parameter table */}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-gray-400 sticky top-0 bg-gray-900">
                <th className="border-b border-gray-700 px-2 py-2 whitespace-nowrap">Menu</th>
                <th className="border-b border-gray-700 px-2 py-2 whitespace-nowrap">Code</th>
                <th className="border-b border-gray-700 px-2 py-2">Description</th>
                <th className="border-b border-gray-700 px-2 py-2 whitespace-nowrap">Set to</th>
                <th className="border-b border-gray-700 px-2 py-2 whitespace-nowrap">Via</th>
                <th className="border-b border-gray-700 px-2 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {drive.params.map((p, i) => (
                <tr
                  key={`${p.param}-${i}`}
                  className={`text-gray-100 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/30'}`}
                >
                  <td className="px-2 py-1.5 font-mono text-gray-400 whitespace-nowrap">{p.param}</td>
                  <td className="px-2 py-1.5 font-mono text-cyan-400 whitespace-nowrap">{p.code}</td>
                  <td className="px-2 py-1.5 text-gray-200">{p.description}</td>
                  <td className="px-2 py-1.5 font-mono whitespace-nowrap text-gray-100">{p.value}</td>
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

          {/* Trace Chain voltage warning */}
          {drive.slave === 1 && (
            <div className="mt-3 rounded-md border border-red-700/60 bg-red-900/20 px-3 py-2 text-xs text-red-300">
              <strong>⚠ TRACE CHAIN — CONFIRM BEFORE COMMISSIONING:</strong> motor is 230 V delta.
              Confirm whether its drive is a 230 V-class ATV12 (UnS = 230) or the motor has been
              rewired star for the 400 V supply (UnS = 400). Pole count is not on the nameplate —
              850 rpm implies ~6-pole; confirm on the motor data plate. DO NOT guess UnS.
            </div>
          )}

          {/* Commissioning checklist */}
          <div className="mt-3 rounded-md border border-gray-700 bg-gray-800/30 px-3 py-2 text-xs text-gray-300">
            <p className="font-semibold text-gray-200 mb-1">Commissioning sequence (one drive at a time):</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Power the drive. Key the comm params: <span className="font-mono text-cyan-300">Add</span> = slave {drive.slave},
                <span className="font-mono text-cyan-300"> tbr</span> = 19.2k, <span className="font-mono text-cyan-300">tFO</span> = 8E1.</li>
              <li>Key the motor nameplate (UnS / FrS / nCr / nSP{drive.family === 'ATV320' ? ' / nPr' : ''}) from the data plate.</li>
              <li>Set control to Modbus: <span className="font-mono text-cyan-300">Fr1</span> / <span className="font-mono text-cyan-300">{drive.family === 'ATV320' ? 'Cd1' : 'CHCF'}</span> = Modbus.</li>
              <li>Set ramps <span className="font-mono text-cyan-300">ACC</span>/<span className="font-mono text-cyan-300">dEC</span> and limits <span className="font-mono text-cyan-300">HSP</span>/<span className="font-mono text-cyan-300">LSP</span>.</li>
              <li>Wire SL1 (A/B/0V). In MEB, the IOScanner shows slave {drive.slave} ({drive.drv}) online (no Modbus comms fault).</li>
              <li>With E-stop confirmed: from the HMI tap {drive.name} ON ({drive.cmdBit}) and set a low Hz ({drive.hzReg}); confirm direction, current, no faults.</li>
              <li>Ramp to 50 Hz; verify smooth run. Repeat for the next drive.</li>
            </ol>
            <p className="mt-2 text-gray-500">
              Drive status is read back by the PLC <span className="font-mono">MC_ReadStatus_ATV</span> function block each
              scan; actual-RPM feedback to the HMI (RFRD read words) is a deferred phase-2 item.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
