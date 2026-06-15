// First-run acceptance gate for the BFD dryer HMI.
// Blocks the controls behind a full-screen overlay until the terms are read
// (scrolled to the end) and accepted. The acceptance (timestamp + terms
// version only — no operator name) is recorded in localStorage so the gate does
// not re-appear once accepted — until the terms version changes.
//
// NOTE: the kiosk browser (epiphany) runs in incognito mode, so localStorage is
// cleared when the kiosk process restarts (e.g. a power-cycle). The gate will
// therefore re-appear after a reboot. For a once-ever, server-recorded
// acceptance, a small backend endpoint can be added — see the handover notes.

import { useState, useEffect, useRef } from 'react'
import type { UIEvent } from 'react'
import {
  TERMS_VERSION,
  TERMS_TITLE,
  TERMS_INTRO,
  TERMS_SECTIONS,
} from '../termsContent'

const LS_KEY = 'bfa.terms.accepted'

export interface AcceptanceRecord {
  ts: string
  version: string
}

/** Returns the stored acceptance if it matches the current terms version. */
export function getAcceptance(): AcceptanceRecord | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const rec = JSON.parse(raw) as AcceptanceRecord
    if (!rec || rec.version !== TERMS_VERSION) return null
    return rec
  } catch {
    return null
  }
}

export const TermsGate = ({ onAccept }: { onAccept: () => void }) => {
  const [scrolledEnd, setScrolledEnd] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const canAccept = scrolledEnd

  // If the terms fit without scrolling (short terms / large screen), there is
  // nothing to scroll, so enable acceptance immediately. Re-check on resize.
  useEffect(() => {
    const check = () => {
      const el = scrollRef.current
      if (el && el.scrollHeight - el.clientHeight <= 24) setScrolledEnd(true)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setScrolledEnd(true)
  }

  const accept = () => {
    if (!canAccept) return
    const rec: AcceptanceRecord = {
      ts: new Date().toISOString(),
      version: TERMS_VERSION,
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(rec))
    } catch {
      /* incognito / storage blocked — still proceed for this session */
    }
    onAccept()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-gray-950 text-white px-6 py-6 overflow-hidden">
      <div className="flex flex-col w-full max-w-3xl h-full">
        {/* Header: logo + title */}
        <div className="flex items-center gap-4 shrink-0 mb-4">
          <span className="inline-flex items-center bg-white rounded-lg px-3 py-2 shadow">
            <img src="/sae-logo.png" alt="SAE Engineering" className="h-10 w-auto" />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{TERMS_TITLE}</h1>
        </div>

        <p className="text-gray-300 text-base shrink-0 mb-3">{TERMS_INTRO}</p>

        {/* Scrollable terms */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-5 space-y-5"
        >
          {TERMS_SECTIONS.map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-bold text-emerald-400 mb-1">{s.heading}</h2>
              <ul className="list-disc list-inside space-y-1 text-gray-200 text-[15px] leading-relaxed">
                {s.body.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-gray-500 text-sm pt-2">
            Terms version {TERMS_VERSION}. Scroll to the end to enable acceptance.
          </p>
        </div>

        {/* Accept row */}
        <div className="shrink-0 mt-4 flex items-center justify-end">
          <button
            onClick={accept}
            disabled={!canAccept}
            className={
              'px-8 py-3 rounded-lg text-lg font-bold shadow-lg transition-colors ' +
              (canAccept
                ? 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed')
            }
          >
            I Accept &amp; Unlock
          </button>
        </div>
        <p className="shrink-0 text-sm mt-2 h-5 text-right">
          {!scrolledEnd ? (
            <span className="text-amber-400">Scroll through the full terms to continue.</span>
          ) : (
            <span className="text-emerald-400">Press “I Accept &amp; Unlock” to start.</span>
          )}
        </p>
      </div>
    </div>
  )
}
