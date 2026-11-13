// Payloads of the FastAPI backend (app/main.py, app/linking.py, app/corrections.py).

export type Category = 'finding' | 'complication' | 'procedure' | 'device'
export type Assertion = 'present' | 'absent' | 'suspected' | 'historical' | 'unknown'
export type Change = 'first_documented' | 'progressed' | 'stable' | 'improved' | 'performed' | 'unknown' | 'unclear'
export type ReviewStatus = 'unreviewed' | 'confirmed' | 'corrected' | 'rejected'
export type Action = 'confirm' | 'reject' | 'restore' | 'edit'

export const CATEGORIES: Category[] = ['finding', 'complication', 'procedure', 'device']
export const ASSERTIONS: Assertion[] = ['present', 'absent', 'suspected', 'historical', 'unknown']
export const CHANGES: Change[] = ['first_documented', 'progressed', 'stable', 'improved', 'performed', 'unknown', 'unclear']

export interface Provenance {
  page: number
  bbox: Record<string, unknown> | null
  charspan: number[]
}

export interface Segment {
  id: string
  start: number
  end: number
  text: string
  provenance: Provenance[]
}

export interface DateCandidate {
  value: string
  label: string
  start: number
  end: number
  quote: string
}

export interface DateChange {
  previous: string | null
  value: string | null
  at: string
}

export interface Evidence {
  segment_id: string
  quote: string
  start: number
  end: number
  provenance: Provenance[]
}

export interface ExtractedEvent {
  id: string
  report_id: string
  concept: string
  category: Category
  assertion: Assertion
  change: Change
  event_date: string | null
  evidence: Evidence
  review_status: string
  flags: string[]
}

export interface RejectedProposal {
  proposal: { concept: string } & Record<string, unknown>
  reason: string
}

export interface Extraction {
  status: 'queued' | 'running' | 'ready' | 'failed'
  model?: string
  prompt_version?: string
  endpoint?: string
  created_at?: string
  finished_at: string | null
  latency_s: number | null
  events: ExtractedEvent[]
  rejected: RejectedProposal[]
  error: string | null
}

export interface Doc {
  id: string
  digest: string
  filename: string
  extension: '.pdf' | '.txt'
  status: 'queued' | 'processing' | 'ready' | 'failed'
  created_at: string
  report_date: string | null
  date_source: 'detected' | 'manual' | 'unknown'
  text: string
  segments: Segment[]
  date_candidates: DateCandidate[]
  date_warning: string | null
  date_history: DateChange[]
  error: string | null
  engine: string | null
  extraction?: Extraction
}

export interface EventFields {
  concept: string
  category: Category
  assertion: Assertion
  change: Change
  event_date: string | null
}
export type Field = keyof EventFields
export const FIELDS: Field[] = ['concept', 'category', 'assertion', 'change', 'event_date']

export interface Unresolved {
  observation: string
  comparison_date: string
  reason: string
  message: string
}

/** One extracted event as the linker sees it: effective (corrected) values plus review state. */
export interface Observation extends EventFields {
  id: string
  event_id: string
  patient_id: string
  report_id: string
  report_date: string | null
  filename: string | null
  quote: string
  start: number
  end: number
  laterality: 'right' | 'left' | 'bilateral' | null
  comparison_dates: string[]
  measurements: string[]
  label_key: string[]
  unresolved: Unresolved[]
  finding_id: string | null
  review_status: ReviewStatus
  original: EventFields
  corrected_fields: Field[]
  correction_ids: string[]
}

export interface Finding {
  id: string
  concept: string
  laterality: Observation['laterality']
  observations: Observation[]
  first_documented: string | null
  first_documented_uncertain: boolean
  review_required: boolean
}

export interface Link {
  id: string
  from_observation: string
  to_observation: string
  relationship: string
  comparison_date: string | null
  basis: string
  review_required: boolean
  evidence: { from: string; to: string }
}

export interface Correction {
  id: string
  seq: number
  observation_id: string
  report_id: string
  event_id: string
  action: Action
  changes: Partial<EventFields>
  previous: Partial<EventFields>
  status_before: ReviewStatus
  status_after: ReviewStatus
  note: string | null
  at: string
  target: { quote: string; filename: string | null; report_date: string | null; concept: string }
  stale: boolean
}

export interface FindingsPayload {
  findings: Finding[]
  links: Link[]
  unresolved: Unresolved[]
  rejected: Observation[]
  corrections: Correction[]
}

export interface CorrectionRequest {
  observation_id: string
  action: Action
  changes?: Partial<EventFields>
  note?: string | null
}
