// ───────────────────────────────────────────────────────────────────────────
// EDITABLE — terms shown on the BFD dryer HMI first-run acceptance gate.
// Richard: replace/extend this wording freely (paste from SAE's Terms of Trade
// if you want the full commercial text). Bump TERMS_VERSION to force every
// operator to re-accept after a change.
// ───────────────────────────────────────────────────────────────────────────

export const TERMS_VERSION = '2026-06-11'

export const TERMS_TITLE = 'Terms of Supply & Safe Operation'

export const TERMS_INTRO =
  'This banana dryer and its control system are supplied by SAE Engineering. ' +
  'Read the following before operating. Starting the machine constitutes ' +
  'acceptance of these terms.'

export interface TermsSection {
  heading: string
  body: string[]
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: 'Safe operation',
    body: [
      'The operator confirms they are trained to operate this machine and understand its hazards — rotating machinery, hot surfaces, and a gas burner.',
      'All guards must be in place and the emergency-stop circuit tested and functional before the machine is started.',
      'Never bypass, defeat, or modify any safety interlock, guard, or the emergency-stop chain.',
      'The forced-air fan must be running before the burner is enabled. The control system enforces this; do not attempt to work around it.',
    ],
  },
  {
    heading: 'Before you start',
    body: [
      'Confirm no person is inside or reaching into the machine.',
      'Know the location of the nearest emergency stop before starting any drive.',
      'If a fault or warning is shown on this screen, resolve it before continuing.',
    ],
  },
  {
    heading: 'Supply & licence',
    body: [
      'The machine and its control software are supplied by SAE Engineering under SAE Engineering’s Terms of Trade.',
      'The control software is licensed, not sold, and remains the property of SAE Engineering.',
      'A copy of SAE Engineering’s full Terms of Trade is available on request.',
    ],
  },
]

// Plain-text version of the full terms, recorded with the acceptance so there
// is a record of exactly what was accepted.
export const TERMS_PLAINTEXT =
  `${TERMS_TITLE} (v${TERMS_VERSION})\n\n${TERMS_INTRO}\n\n` +
  TERMS_SECTIONS.map(
    (s) => `${s.heading}\n` + s.body.map((b) => `  - ${b}`).join('\n'),
  ).join('\n\n')
