// VSD motor nameplate reference (entered from the physical motor plates, 2026-06-10).
// Primary operating column = 50 Hz (AU grid); 60 Hz figures are the alternate rating.
// Node map 2026-06-15 (final all-ATV program BFD_final.smbp, 19200 8E1): Trace=1,
// Ag1=2, Ag2=3, Spinner=4 (ATV320 3 kW). Replaces the old Teco "avoid addr 1" map.
interface Plate {
  node: number; name: string; volts: string; hz: string; rpm: string;
  kw: string; amps: string; cos: string; conn: string; poles: string; eff: string;
}

const PLATES: Plate[] = [
  { node: 1, name: 'Trace Chain', volts: '230',        hz: '50',      rpm: '850',          kw: '0.09', amps: '0.85',        cos: '0.67',        conn: 'Δ (delta)', poles: '—', eff: '39.6' },
  { node: 2, name: 'Agitator 1',  volts: '400 / 460', hz: '50 / 60', rpm: '1410 / 1720', kw: '2.2',  amps: '5.0',         cos: '0.78 / 0.80', conn: 'Y (star)',  poles: '4', eff: '—' },
  { node: 3, name: 'Agitator 2',  volts: '420 / 440', hz: '50 / 60', rpm: '1445 / 1734', kw: '1.5',  amps: '3.3 / 2.83',  cos: '0.77',        conn: 'Y (star)',  poles: '4', eff: '85.3 / 84.8 / 83.8' },
  { node: 4, name: 'Spinner',     volts: '420 / 440', hz: '50 / 60', rpm: '964 / 1157',  kw: '3.0',  amps: '7.02 / 6.66', cos: '0.74 / 0.78', conn: 'Y (star)',  poles: '6', eff: '83.3 / 83.6 / 82.3' },
]

const COLS = ['Node', 'VSD', 'Volts (50/60)', 'Hz', 'RPM (50/60)', 'kW', 'Amps (50/60)', 'cos φ', 'Conn', 'Poles', 'Eff % (100/75/50)']

export function VsdNameplates({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-xl border border-gray-700 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-700 bg-gray-900 px-5 py-3">
          <h2 className="text-lg font-semibold text-white">VSD Motor Nameplates</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-700 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="mb-3 text-xs text-gray-400">
            All motors 3-phase. <span className="text-gray-200">Primary config = 50 Hz</span> (AU grid);
            60 Hz figures are the alternate rating. Live Modbus addresses: Trace=1, Ag1=2, Ag2=3, Spinner=4
            (final all-ATV program, 19200 8E1).
          </p>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-gray-300">
                {COLS.map((c) => (
                  <th key={c} className="border-b border-gray-700 px-2 py-2 font-medium whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLATES.map((p) => (
                <tr key={p.node} className="text-gray-100 odd:bg-gray-900 even:bg-gray-800/40">
                  <td className="px-2 py-2 font-mono text-cyan-400">{p.node}</td>
                  <td className="px-2 py-2 font-medium whitespace-nowrap">{p.name}</td>
                  <td className="px-2 py-2 font-mono whitespace-nowrap">{p.volts}</td>
                  <td className="px-2 py-2 font-mono">{p.hz}</td>
                  <td className="px-2 py-2 font-mono whitespace-nowrap">{p.rpm}</td>
                  <td className="px-2 py-2 font-mono">{p.kw}</td>
                  <td className="px-2 py-2 font-mono whitespace-nowrap">{p.amps}</td>
                  <td className="px-2 py-2 font-mono">{p.cos}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{p.conn}</td>
                  <td className="px-2 py-2 font-mono">{p.poles}</td>
                  <td className="px-2 py-2 font-mono whitespace-nowrap">{p.eff}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-4 rounded-md border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
            ⚠ Trace Chain motor is 230 V delta (vs 400/420 V on the others) — confirm its drive is a 230 V
            unit (or motor rewired star for 400 V supply) before commissioning node 1.
          </p>
        </div>
      </div>
    </div>
  )
}
