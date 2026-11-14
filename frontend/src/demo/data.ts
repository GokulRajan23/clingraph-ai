/**
 * DEMO DATA: hardcoded for the demo.
 *
 * For the demo the reports are taken as already uploaded (or connected from an external source),
 * so everything the app shows comes from this one module: the patients the search finds, the
 * knowledge graph of the one patient with a record, and the report excerpts the source pop-up
 * quotes. The record is the synthetic urology case in the five demo PDFs (SYN-URO-001, Martin
 * Keller, Jan-Mar 2026, all fictional); the quotes follow the PDFs' wording. To change the case,
 * change this file only: keep the shapes, and keep each quote keyed by the node it supports.
 */
import type { Graph, GraphEdge, GraphNode } from '../graph/types'

export interface Patient {
  id: string
  name: string
  /** Health insurance number (German KVNR style: a letter and nine digits). */
  insurance: string
  born: string
  /** The knowledge graph built from this patient's reports; null when none are connected. */
  record: Graph | null
  /** The history at a glance, one stop per report, oldest first. */
  timeline: TimelineStop[]
}

/** One stop on the patient's timeline: a report, a short heading and what happened. */
export interface TimelineStop {
  report: string
  date: string
  heading: string
  points: string[]
}

/** What one report says: a one-line summary and the sentence behind each node it documents. */
export interface ReportSource {
  summary: string
  /** Node ID → the sentence in this report that the node was extracted from. */
  quotes: Record<string, string>
}

export const REPORT_IDS = ['r1', 'r2', 'r3', 'r4', 'r5'] as const

const DEPARTMENT: [string, string] = ['Department', 'Urology']
const AUTHOR: [string, string] = ['Author', 'Dr Lena Weber']

const nodes: GraphNode[] = [
  { id: 'patient', type: 'patient', label: 'Martin Keller · 61 y', props: [['Insurance no.', 'K417064193'], ['Record', 'SYN-URO-001'], ['Born', '17 Apr 1964'], ['Sex', 'Male'], ['Reports', '5']] },

  // The five PDFs, D01-D05.
  { id: 'r1', type: 'report', label: 'Initial urology assessment · 12 Jan 2026', props: [['Kind', 'Outpatient assessment'], ['Report date', '12 Jan 2026'], DEPARTMENT, AUTHOR] },
  { id: 'r2', type: 'report', label: 'Admission and stent procedure · 19 Jan 2026', props: [['Kind', 'Admission and procedure report'], ['Report date', '19 Jan 2026'], DEPARTMENT, AUTHOR] },
  { id: 'r3', type: 'report', label: 'Hospital discharge summary · 21 Jan 2026', props: [['Kind', 'Discharge summary'], ['Report date', '21 Jan 2026'], DEPARTMENT, AUTHOR] },
  { id: 'r4', type: 'report', label: 'Ureteroscopy and day-case discharge · 2 Feb 2026', props: [['Kind', 'Procedure report'], ['Report date', '2 Feb 2026'], DEPARTMENT, AUTHOR] },
  { id: 'r5', type: 'report', label: 'Follow-up and medication review · 2 Mar 2026', props: [['Kind', 'Follow-up review'], ['Report date', '2 Mar 2026'], DEPARTMENT, AUTHOR] },

  // Findings, and how each one changed from report to report.
  { id: 'left-stone', type: 'finding', label: 'Left distal ureteric stone, 6 mm', props: [['Category', 'Finding'], ['Site', 'Left distal ureter, ~15 mm above the UVJ'], ['Course', 'Obstructing, then removed']] },
  { id: 'left-stone-1', type: 'observation', label: 'Stone 6 mm, obstructing', props: [['Change', 'First documented'], ['Size', '6 mm'], ['Date', '12 Jan 2026']] },
  { id: 'left-stone-2', type: 'observation', label: 'Stone still in place', props: [['Change', 'Not passed'], ['Size', '6 mm'], ['Date', '19 Jan 2026']] },
  { id: 'left-stone-3', type: 'observation', label: 'Stone removed', props: [['Change', 'Removed'], ['Result', 'No residual fragments seen'], ['Date', '2 Feb 2026']] },
  { id: 'left-stone-4', type: 'observation', label: 'No left stone on ultrasound', props: [['Change', 'Cleared'], ['Date', '2 Mar 2026']] },

  { id: 'hydro', type: 'finding', label: 'Left hydroureteronephrosis', props: [['Category', 'Finding'], ['Site', 'Left collecting system'], ['Course', 'Worsened, drained, then resolved']] },
  { id: 'hydro-1', type: 'observation', label: 'Mild dilatation', props: [['Change', 'First documented'], ['Grade', 'Mild'], ['Date', '12 Jan 2026']] },
  { id: 'hydro-2', type: 'observation', label: 'Moderate dilatation', props: [['Change', 'Progressed'], ['Grade', 'Moderate'], ['Date', '19 Jan 2026']] },
  { id: 'hydro-3', type: 'observation', label: 'Mild residual dilatation', props: [['Change', 'Improved'], ['Grade', 'Mild residual'], ['Date', '21 Jan 2026']] },
  { id: 'hydro-4', type: 'observation', label: 'Hydronephrosis resolved', props: [['Change', 'Resolved'], ['Grade', 'None'], ['Date', '2 Mar 2026']] },

  { id: 'right-stone', type: 'finding', label: 'Right lower-pole renal stone, 3 mm', props: [['Category', 'Finding'], ['Site', 'Right lower renal calyx'], ['Course', 'Stable, non-obstructing; under surveillance']] },
  { id: 'right-stone-1', type: 'observation', label: 'Right stone 3 mm', props: [['Change', 'First documented'], ['Size', '3 mm, non-obstructing'], ['Date', '12 Jan 2026']] },
  { id: 'right-stone-2', type: 'observation', label: 'Right stone 3 mm, unchanged', props: [['Change', 'Stable'], ['Size', '3 mm, non-obstructing'], ['Date', '2 Mar 2026']] },

  { id: 'creatinine', type: 'finding', label: 'Serum creatinine', props: [['Category', 'Laboratory'], ['Baseline', '1.0 mg/dL'], ['Course', 'Rose with obstruction, back to baseline']] },
  { id: 'creatinine-1', type: 'observation', label: 'Creatinine 1.0 mg/dL', props: [['Change', 'Baseline'], ['Value', '1.0 mg/dL'], ['Date', '12 Jan 2026']] },
  { id: 'creatinine-2', type: 'observation', label: 'Creatinine 1.5 mg/dL', props: [['Change', 'Worse'], ['Value', '1.5 mg/dL'], ['Date', '19 Jan 2026']] },
  { id: 'creatinine-3', type: 'observation', label: 'Creatinine 1.1 mg/dL', props: [['Change', 'Improved'], ['Value', '1.1 mg/dL'], ['Date', '21 Jan 2026']] },
  { id: 'creatinine-4', type: 'observation', label: 'Creatinine 1.0 mg/dL, baseline', props: [['Change', 'Back to baseline'], ['Value', '1.0 mg/dL'], ['Date', '2 Mar 2026']] },

  { id: 'colic', type: 'finding', label: 'Left renal colic', props: [['Category', 'Symptom'], ['Features', 'Flank pain to the groin, nausea, visible haematuria'], ['Course', 'Severe on 19 Jan, resolved after drainage']] },
  { id: 'stent-symptoms', type: 'finding', label: 'Stent-related urgency and haematuria', props: [['Category', 'Complication'], ['Features', 'Mild urgency, intermittent pink urine'], ['Course', 'Resolved after stent removal']] },
  { id: 'culture', type: 'finding', label: 'Urine cultures', props: [['Category', 'Laboratory'], ['Taken', '12 Jan, 19 Jan, 29 Jan 2026'], ['Result', 'No growth each time']] },
  { id: 'analysis', type: 'finding', label: 'Stone composition: calcium oxalate', props: [['Category', 'Laboratory'], ['Sample', 'Fragments from 2 Feb 2026'], ['Result', 'Predominantly calcium oxalate']] },

  { id: 'obstruction', type: 'diagnosis', label: 'Obstructing left ureteric stone', props: [['Status', 'Treated; obstruction resolved'], ['ICD-10', 'N13.2']] },
  { id: 'aki', type: 'diagnosis', label: 'Acute kidney injury, mild', props: [['Status', 'Resolved'], ['ICD-10', 'N17.9'], ['Cause', 'Obstruction and dehydration']] },
  { id: 'hypertension', type: 'diagnosis', label: 'Hypertension', props: [['Status', 'Long-term, treated'], ['ICD-10', 'I10']] },

  { id: 'stent', type: 'procedure', label: 'Left double-J stent insertion', props: [['Date', '19 Jan 2026'], ['Details', 'Cystoscopy, retrograde study, 6 Fr x 26 cm stent'], ['Anaesthesia', 'General']] },
  { id: 'ureteroscopy', type: 'procedure', label: 'Left ureteroscopy, laser lithotripsy', props: [['Date', '2 Feb 2026'], ['Details', 'Semirigid, holmium laser, basket extraction; stent removed'], ['Result', 'No residual fragments seen, no new stent']] },

  { id: 'amlodipine', type: 'medication', label: 'Amlodipine', props: [['Dose', '5 mg orally each morning'], ['For', 'Hypertension'], ['Status', 'Active, only regular medication']] },
  { id: 'tamsulosin', type: 'medication', label: 'Tamsulosin MR', props: [['Dose', '0.4 mg orally once daily'], ['For', 'Stone expulsion, then stent symptoms (off-label)'], ['Started', '12 Jan 2026'], ['Stopped', '2 Feb 2026']] },
  { id: 'paracetamol', type: 'medication', label: 'Paracetamol', props: [['Dose', '1 g as needed, max 3 g/day'], ['For', 'Pain'], ['Status', 'No longer used, last taken 5 Feb 2026']] },
  { id: 'cefazolin', type: 'medication', label: 'Cefazolin', props: [['Dose', '2 g IV, single dose before each procedure'], ['For', 'Peri-operative prophylaxis'], ['Given', '19 Jan and 2 Feb 2026'], ['Status', 'Completed']] },
]

const e = (source: string, relation: string, target: string): GraphEdge => ({ source, target, relation })

const edges: GraphEdge[] = [
  ...REPORT_IDS.map((r) => e('patient', 'has_report', r)),
  e('patient', 'has_diagnosis', 'obstruction'),
  e('patient', 'has_diagnosis', 'aki'),
  e('patient', 'has_diagnosis', 'hypertension'),
  e('patient', 'has_finding', 'right-stone'),

  // The left stone over time.
  e('left-stone', 'has_observation', 'left-stone-1'),
  e('left-stone-1', 'persisted_as', 'left-stone-2'),
  e('left-stone-2', 'removed_as', 'left-stone-3'),
  e('left-stone-3', 'cleared_as', 'left-stone-4'),
  e('left-stone-1', 'documented_in', 'r1'),
  e('left-stone-2', 'documented_in', 'r2'),
  e('left-stone', 'documented_in', 'r3'),
  e('left-stone-3', 'documented_in', 'r4'),
  e('left-stone-4', 'documented_in', 'r5'),

  // The obstruction it caused.
  e('hydro', 'has_observation', 'hydro-1'),
  e('hydro-1', 'progressed_to', 'hydro-2'),
  e('hydro-2', 'improved_to', 'hydro-3'),
  e('hydro-3', 'resolved_to', 'hydro-4'),
  e('hydro-1', 'documented_in', 'r1'),
  e('hydro-2', 'documented_in', 'r2'),
  e('hydro-3', 'documented_in', 'r3'),
  e('hydro-4', 'documented_in', 'r5'),
  e('left-stone', 'causes', 'hydro'),
  e('left-stone', 'causes', 'colic'),

  // The right stone, watched.
  e('right-stone', 'has_observation', 'right-stone-1'),
  e('right-stone-1', 'stable_as', 'right-stone-2'),
  e('right-stone-1', 'documented_in', 'r1'),
  e('right-stone', 'documented_in', 'r2'),
  e('right-stone', 'documented_in', 'r3'),
  e('right-stone', 'documented_in', 'r4'),
  e('right-stone-2', 'documented_in', 'r5'),

  // Kidney function.
  e('creatinine', 'has_observation', 'creatinine-1'),
  e('creatinine-1', 'rose_to', 'creatinine-2'),
  e('creatinine-2', 'fell_to', 'creatinine-3'),
  e('creatinine-3', 'returned_to', 'creatinine-4'),
  e('creatinine-1', 'documented_in', 'r1'),
  e('creatinine-2', 'documented_in', 'r2'),
  e('creatinine-3', 'documented_in', 'r3'),
  e('creatinine', 'documented_in', 'r4'),
  e('creatinine-4', 'documented_in', 'r5'),

  // Symptoms and tests.
  e('colic', 'documented_in', 'r1'),
  e('colic', 'documented_in', 'r2'),
  e('colic', 'documented_in', 'r3'),
  e('stent', 'causes', 'stent-symptoms'),
  e('stent-symptoms', 'documented_in', 'r3'),
  e('stent-symptoms', 'documented_in', 'r4'),
  e('stent-symptoms', 'documented_in', 'r5'),
  e('culture', 'documented_in', 'r1'),
  e('culture', 'documented_in', 'r2'),
  e('culture', 'documented_in', 'r3'),
  e('culture', 'documented_in', 'r4'),
  e('left-stone', 'analysed_as', 'analysis'),
  e('analysis', 'documented_in', 'r4'),
  e('analysis', 'documented_in', 'r5'),

  // Diagnoses.
  e('obstruction', 'evidenced_by', 'left-stone'),
  e('obstruction', 'evidenced_by', 'hydro'),
  e('obstruction', 'infection_excluded_by', 'culture'),
  e('obstruction', 'documented_in', 'r1'),
  e('obstruction', 'documented_in', 'r3'),
  e('obstruction', 'documented_in', 'r5'),
  e('aki', 'evidenced_by', 'creatinine'),
  e('aki', 'caused_by', 'hydro'),
  e('aki', 'documented_in', 'r2'),
  e('aki', 'documented_in', 'r3'),
  e('aki', 'documented_in', 'r5'),
  e('hypertension', 'documented_in', 'r1'),
  e('hypertension', 'documented_in', 'r3'),

  // Procedures.
  e('stent', 'treats', 'hydro'),
  e('stent', 'documented_in', 'r2'),
  e('stent', 'documented_in', 'r3'),
  e('ureteroscopy', 'treats', 'left-stone'),
  e('ureteroscopy', 'removes', 'stent'),
  e('ureteroscopy', 'documented_in', 'r3'),
  e('ureteroscopy', 'documented_in', 'r4'),

  // Medication.
  e('hypertension', 'treated_with', 'amlodipine'),
  e('obstruction', 'treated_with', 'tamsulosin'),
  e('tamsulosin', 'relieves', 'stent-symptoms'),
  e('paracetamol', 'relieves', 'colic'),
  e('cefazolin', 'prophylaxis_for', 'stent'),
  e('cefazolin', 'prophylaxis_for', 'ureteroscopy'),
  ...REPORT_IDS.map((r) => e('amlodipine', 'documented_in', r)),
  ...REPORT_IDS.map((r) => e('tamsulosin', 'documented_in', r)),
  e('paracetamol', 'documented_in', 'r1'),
  e('paracetamol', 'documented_in', 'r4'),
  e('paracetamol', 'documented_in', 'r5'),
  e('cefazolin', 'documented_in', 'r2'),
  e('cefazolin', 'documented_in', 'r4'),
  e('cefazolin', 'documented_in', 'r5'),
]

/** The demo patient's knowledge graph. */
export const DEMO_GRAPH: Graph = { nodes, edges }

/** What each report says, for the source pop-up, in the PDFs' words. Keys are report node IDs. */
export const SOURCES: Record<string, ReportSource> = {
  r1: {
    summary: 'Outpatient assessment for 24 hours of left flank pain, with low-dose CT; conservative management agreed.',
    quotes: {
      'left-stone-1': 'A 6 mm calculus in the left distal ureter, approximately 15 mm above the ureterovesical junction, causes mild left hydroureteronephrosis.',
      'hydro-1': 'Low-dose non-contrast CT, 12 January 2026: a 6 mm calculus in the left distal ureter causes mild left hydroureteronephrosis.',
      'right-stone-1': 'A separate 3 mm non-obstructing calculus is present in the right lower renal calyx. There is no right hydronephrosis.',
      'creatinine-1': 'Creatinine 1.0 mg/dL, white cell count 7.2 x 10^9/L, CRP 3 mg/L.',
      colic: 'Intermittent left flank pain radiating to the groin for 24 hours, with nausea and visible haematuria.',
      culture: 'Urine dipstick: blood positive, nitrite negative, leukocytes negative. Urine culture was collected; the result is pending.',
      obstruction: 'Symptomatic left distal ureteric stone with mild obstruction. No current clinical evidence of a urinary tract infection.',
      hypertension: 'Hypertension treated with amlodipine. No previous stone procedure or chronic kidney disease.',
      amlodipine: 'Amlodipine 5 mg orally each morning, continued as long-term hypertension treatment.',
      tamsulosin: 'Tamsulosin was started for medical expulsive therapy after discussion of its off-label use.',
      paracetamol: 'Paracetamol 1 g as needed, up to three times a day; NSAIDs avoided because of a recorded ibuprofen intolerance.',
    },
  },
  r2: {
    summary: 'Readmission with persistent severe colic; urgent decompression with a left double-J stent.',
    quotes: {
      'left-stone-2': 'No stone passage was reported. The 6 mm left distal ureteric stone remains visible.',
      'hydro-2': 'Ultrasound shows moderate left hydroureteronephrosis, increased from mild dilatation on 12 January.',
      'right-stone': 'The right lower-pole 3 mm non-obstructing stone is unchanged, without right hydronephrosis.',
      'creatinine-2': 'Creatinine has risen to 1.5 mg/dL from 1.0 mg/dL on 12 January.',
      colic: 'The patient returned with persistent severe left renal colic despite oral analgesia, vomiting and poor oral intake.',
      culture: 'The urine culture collected on 12 January showed no growth. Repeat urine culture was obtained today.',
      aki: 'Consistent with mild acute kidney injury in the setting of obstruction and dehydration.',
      stent: 'Cystoscopy, left retrograde study and insertion of a left 6 Fr x 26 cm double-J ureteral stent were performed under general anaesthesia.',
      amlodipine: 'Amlodipine 5 mg orally each morning, continued.',
      tamsulosin: 'Tamsulosin MR 0.4 mg once daily, continued, now also for stent-related symptoms.',
      cefazolin: 'Cefazolin 2 g intravenously once before instrumentation; peri-operative prophylaxis, no ongoing course.',
    },
  },
  r3: {
    summary: 'Inpatient stay 19-21 January: colic resolved after drainage; definitive stone treatment booked.',
    quotes: {
      'left-stone': 'The distal ureteric stone remains present; relief of obstruction does not represent stone clearance.',
      'hydro-3': 'Ultrasound on 21 January shows only mild residual left collecting-system dilatation, reduced from the moderate dilatation on 19 January.',
      'right-stone': 'Stable 3 mm non-obstructing right renal calculus. The right renal stone will be observed.',
      'creatinine-3': 'Creatinine is 1.1 mg/dL, down from 1.5 mg/dL on admission.',
      colic: 'Renal colic resolved after drainage and fluid replacement.',
      'stent-symptoms': 'There is mild urinary urgency and intermittent pink urine attributed to the stent, without clots, fever or dysuria.',
      culture: 'Repeat urine culture from 19 January shows no growth.',
      obstruction: 'Obstructive left hydroureteronephrosis is improving after drainage.',
      aki: 'Mild acute kidney injury has improved.',
      hypertension: 'Discharge diagnoses: ... Stable 3 mm non-obstructing right renal calculus. Hypertension.',
      stent: 'A left double-J stent was inserted on 19 January. Stent coils are appropriately positioned.',
      ureteroscopy: 'Left ureteroscopy with laser lithotripsy and stent removal is booked for 2 February 2026. This treatment has not yet occurred.',
      amlodipine: 'Amlodipine 5 mg each morning, continue long-term.',
      tamsulosin: 'Tamsulosin is continued while the stent is present, for off-label stent symptom relief.',
    },
  },
  r4: {
    summary: 'Definitive treatment of the left ureteric stone as a day case; stent removed.',
    quotes: {
      'left-stone-3': 'No residual stone fragments were visible in the inspected left ureter at completion.',
      'right-stone': 'The separate right renal calculus was not treated during this left-sided procedure.',
      creatinine: 'Creatinine on 29 January was 1.0 mg/dL.',
      'stent-symptoms': 'The left double-J stent placed on 19 January remains in situ. The patient reports mild urgency but no fever or renal colic.',
      culture: 'The pre-operative urine culture showed no growth.',
      analysis: 'Stone fragments were sent for compositional analysis; the result is pending.',
      ureteroscopy: 'Dr Lena Weber removed the existing left double-J stent and performed left semirigid ureteroscopy, holmium laser lithotripsy and basket extraction of the 6 mm distal ureteric calculus.',
      amlodipine: 'Amlodipine 5 mg each morning, continue as long-term hypertension treatment.',
      tamsulosin: 'Tamsulosin is stopped today because the left stent has been removed and the ureteric stone has been treated.',
      paracetamol: 'Paracetamol 1 g as needed for up to three days after the procedure, maximum 3 g a day.',
      cefazolin: 'Cefazolin 2 g intravenously once before instrumentation; prophylaxis completed, no take-home antibiotic.',
    },
  },
  r5: {
    summary: 'Review four weeks after left ureteroscopy: recovered, obstruction and kidney injury resolved.',
    quotes: {
      'left-stone-4': 'No left renal calculus is visualised. Ultrasound does not exclude tiny residual or ureteric fragments.',
      'hydro-4': 'Renal ultrasound shows resolution of the previously documented left hydronephrosis.',
      'right-stone-2': 'The separate 3 mm right lower-pole calculus is unchanged and remains non-obstructing. Surveillance ultrasound is planned in six months.',
      'creatinine-4': 'Creatinine is 1.0 mg/dL, back to the baseline recorded on 12 January.',
      'stent-symptoms': 'The previous stent-related urinary urgency has resolved.',
      analysis: 'Stone analysis from the 2 February procedure reports predominantly calcium oxalate composition.',
      obstruction: 'Recovery after left ureteric stone treatment, with resolved obstruction and acute kidney injury.',
      aki: 'Recovery after left ureteric stone treatment, with resolved obstruction and acute kidney injury.',
      amlodipine: 'Amlodipine 5 mg each morning is the only regular medication at this review.',
      tamsulosin: 'Tamsulosin was stopped on 2 February and remains discontinued.',
      paracetamol: 'He has taken no analgesic since 5 February; paracetamol is removed from the active list.',
      cefazolin: 'Peri-operative cefazolin doses on 19 January and 2 February are historical, not active therapy.',
    },
  },
}

/** Martin Keller's care at a glance, from the five PDFs. */
const TIMELINE: TimelineStop[] = [
  {
    report: 'r1',
    date: '12 Jan',
    heading: 'Stone found',
    points: ['6 mm left distal ureteric stone with mild obstruction on CT', '3 mm right kidney stone, not obstructing', 'Tamsulosin started to help the stone pass'],
  },
  {
    report: 'r2',
    date: '19 Jan',
    heading: 'Stent placed',
    points: ['Severe colic; the stone had not passed', 'Obstruction now moderate, creatinine up to 1.5 mg/dL', 'Left double-J stent inserted under general anaesthesia'],
  },
  {
    report: 'r3',
    date: '21 Jan',
    heading: 'Discharged',
    points: ['Colic resolved, dilatation down to mild', 'Creatinine back down to 1.1 mg/dL', 'Ureteroscopy booked for 2 February'],
  },
  {
    report: 'r4',
    date: '2 Feb',
    heading: 'Stone removed',
    points: ['Ureteroscopy with laser lithotripsy, 6 mm stone extracted', 'Stent removed, no new stent needed', 'Tamsulosin stopped'],
  },
  {
    report: 'r5',
    date: '2 Mar',
    heading: 'Recovered',
    points: ['Obstruction and kidney injury resolved, creatinine 1.0 mg/dL', 'Stone was calcium oxalate', 'Right stone unchanged; ultrasound again in six months'],
  },
]

/** Everyone the patient search finds. Only the first has reports connected. */
export const PATIENTS: Patient[] = [
  { id: 'p-martin', name: 'Martin Keller', insurance: 'K417064193', born: '1964', record: DEMO_GRAPH, timeline: TIMELINE },
  { id: 'p-anna', name: 'Anna Schröder', insurance: 'A123456789', born: '1960', record: null, timeline: [] },
  { id: 'p-jonas', name: 'Jonas Hartmann', insurance: 'B482915736', born: '1978', record: null, timeline: [] },
  { id: 'p-fatma', name: 'Fatma Yılmaz', insurance: 'C905173248', born: '1985', record: null, timeline: [] },
  { id: 'p-sofia', name: 'Sofia Rossi', insurance: 'E264809157', born: '1992', record: null, timeline: [] },
]
