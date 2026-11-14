import { useState } from 'react'
import type { Patient } from '../demo/data'
import { searchPatients } from '../patients'

interface Props {
  patients: Patient[]
  onPick: (patient: Patient) => void
}

/** Finds a patient by name or insurance number as you type; arrows and Enter pick one. */
export function PatientSearch({ patients, onPick }: Props) {
  const [query, setQuery] = useState('')
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

function SearchIcon() {
  return (
    <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.6 10.6 3.4 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
