import { useRef, useState } from 'react'
import type { Patient } from '../demo/data'
import { searchPatients } from '../patients'

interface Props {
  patients: Patient[]
  onPick: (patient: Patient) => void
  /** The name of the patient with reports, pencilled in under the box as a hint; clicking it types it. */
  hint?: string
}

/** Finds a patient by name or insurance number as you type; arrows and Enter pick one. */
export function PatientSearch({ patients, onPick, hint }: Props) {
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState(0)
  const matches = searchPatients(patients, query)
  const open = query.trim() !== ''

  const pick = (patient: Patient | undefined) => {
    if (!patient) return
    onPick(patient)
    setQuery('')
  }

  return (
    <div className="search">
      <SearchIcon />
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="patient-results"
        aria-activedescendant={open && matches[active] ? `patient-${matches[active].id}` : undefined}
        aria-label="Find a patient by name or insurance number"
        placeholder="Name or insurance number"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        ref={input}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') setActive((i) => Math.min(i + 1, matches.length - 1))
          else if (event.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
          else if (event.key === 'Enter') pick(matches[active])
          else if (event.key === 'Escape') setQuery('')
          else return
          event.preventDefault()
        }}
      />
      {hint && !open && (
        <button
          type="button"
          className="hint"
          onClick={() => {
            setQuery(hint)
            setActive(0)
            input.current?.focus()
          }}
        >
          <HintArrow />
          <span>
            try <b>{hint}</b>
          </span>
        </button>
      )}
      {open && (
        <ul id="patient-results" role="listbox" className="results">
          {matches.length === 0 && <li className="empty">No patient found</li>}
          {matches.map((patient, i) => (
            <li
              key={patient.id}
              id={`patient-${patient.id}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              // mousedown, so the pick happens before the input loses focus.
              onMouseDown={(event) => {
                event.preventDefault()
                pick(patient)
              }}
            >
              <span className="name">{patient.name}</span>
              <span className="mono">
                {patient.insurance} · {patient.born}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A pencilled dotted arrow curving up from the hint to the search box. */
function HintArrow() {
  return (
    <svg className="hint-arrow" width="56" height="40" viewBox="0 0 56 40" fill="none" aria-hidden="true">
      <path d="M52 31C38 34 18 30 9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="0.1 5" />
      <path d="M3.5 13.5 8.6 7.6l5.6 4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.6 10.6 3.4 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
