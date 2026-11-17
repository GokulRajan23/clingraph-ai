/**
 * DEMO DATA: answers about Martin Keller's record by topic, for when no language model is there to
 * answer (no key, the free quota is used up, or the model fails). Each answer is written from the
 * report quotes in demo/data.ts and highlights the nodes it rests on, like the suggested questions.
 * A question gets the topic whose keywords it matches most; on a tie the earlier, more specific
 * topic wins. Changing the case means rewriting these with it.
 */
import { SUGGESTIONS, type Answer } from './script'

interface Topic {
  name: string
  keywords: RegExp
  answer: Answer
}

const suggested = (question: string): Answer => {
  const found = SUGGESTIONS.find((s) => s.question === question)
  if (!found) throw new Error(`No suggested question "${question}"`)
  return found.answer
}

const ALL_REPORTS = ['r1', 'r2', 'r3', 'r4', 'r5']

// Most specific first: a tie goes to the earlier topic.
export const TOPICS: Topic[] = [
  {
    name: 'allergies',
    keywords: /allerg|intoleran|ibuprofen|nsaid|adverse|reaction/g,
    answer: {
      sentences: ['The 12 January assessment records an ibuprofen intolerance, so NSAIDs were avoided.', 'Paracetamol was used for his pain instead.'],
      why: 'Because the 12 January assessment avoids NSAIDs for a recorded ibuprofen intolerance.',
      sources: ['r1'],
      highlight: ['patient', 'paracetamol', 'r1'],
    },
  },
  {
    name: 'infection',
    keywords: /infect|cultur|antibiotic|cefazolin|fever|\buti\b|sepsis|bacteri/g,
    answer: {
      sentences: [
        'There was no sign of infection.',
        'Urine cultures on 12, 19 and 29 January all showed no growth.',
        'He had a single 2 g dose of cefazolin before each procedure as prophylaxis, and no antibiotic course.',
      ],
      why: 'Because the culture results in the January and February reports all read no growth.',
      sources: ['r1', 'r2', 'r3', 'r4'],
      highlight: ['culture', 'cefazolin', 'r1', 'r2', 'r3', 'r4'],
    },
  },
  {
    name: 'stone composition',
    keywords: /composition|made of|oxalate|analys|kind of stone|type of stone/g,
    answer: {
      sentences: ['The fragments removed on 2 February were analysed as predominantly calcium oxalate.', 'The result is in the 2 March review.'],
      why: 'Because the 2 March review reports the stone analysis as predominantly calcium oxalate.',
      sources: ['r4', 'r5'],
      highlight: ['analysis', 'left-stone', 'r4', 'r5'],
    },
  },
  {
    name: 'right stone',
    keywords: /\bright (kidney|side|stone|renal)|other stone|second stone|surveillance|observ(ed|ation)/g,
    answer: {
      sentences: [
        'The 3 mm stone in his right kidney was first seen on the 12 January CT and has not changed.',
        "It isn't blocking anything and wasn't treated; a surveillance ultrasound is planned in six months.",
      ],
      why: 'Because the 2 March review finds the right stone unchanged and plans an ultrasound in six months.',
      sources: ['r1', 'r5'],
      highlight: ['right-stone', 'right-stone-1', 'right-stone-2', 'r1', 'r5'],
    },
  },
  {
    name: 'kidney function',
    keywords: /creatinin|kidney function|renal function|kidney injury|kidney damage|\baki\b|egfr|\blabs?\b|blood (test|work|result)/g,
    answer: {
      sentences: [
        'His kidney function dipped and then recovered.',
        'Creatinine was 1.0 mg/dL on 12 January, rose to 1.5 by 19 January with the obstruction, and was 1.1 on 21 January.',
        'By 2 March it was back to his 1.0 baseline, and the mild acute kidney injury has resolved.',
      ],
      why: 'Because the blood results in every report track his creatinine from 1.0 up to 1.5 and back.',
      sources: ['r1', 'r2', 'r3', 'r5'],
      highlight: ['creatinine', 'creatinine-1', 'creatinine-2', 'creatinine-3', 'creatinine-4', 'aki', 'r1', 'r2', 'r3', 'r5'],
    },
  },
  {
    name: 'investigations',
    keywords: /\btests?\b|investigation|scan|imaging|\bct\b|ultrasound|x-?ray|examin/g,
    answer: {
      sentences: [
        'A low-dose CT on 12 January found the 6 mm left stone and a 3 mm right kidney stone.',
        "Ultrasounds on 19 and 21 January and 2 March followed the left kidney's dilatation until it resolved.",
        'Blood tests tracked his creatinine, and urine cultures on 12, 19 and 29 January grew nothing.',
      ],
      why: 'Because the reports record the 12 January CT, three ultrasounds and every urine culture.',
      sources: ['r1', 'r2', 'r3', 'r5'],
      highlight: ['left-stone-1', 'right-stone-1', 'hydro', 'hydro-1', 'hydro-2', 'hydro-3', 'hydro-4', 'creatinine', 'culture', 'r1', 'r2', 'r3', 'r5'],
    },
  },
  {
    name: 'blood pressure',
    keywords: /blood pressure|hypertens|\bbp\b/g,
    answer: {
      sentences: ['He has long-term hypertension, treated with amlodipine 5 mg each morning.', 'It was continued unchanged through this episode.'],
      why: 'Because every report lists amlodipine 5 mg each morning as continued.',
      sources: ['r1', 'r3', 'r5'],
      highlight: ['hypertension', 'amlodipine', 'r1', 'r3', 'r5'],
    },
  },
  {
    name: 'hospital stay',
    keywords: /admi(t|ssion)|hospital stay|in hospital|inpatient|dischar|how long|day case/g,
    answer: {
      sentences: ['He was admitted on 19 January for the stent and discharged on 21 January.', 'The ureteroscopy on 2 February was a day case.'],
      why: 'Because the 21 January discharge summary and the 2 February day-case report record both stays.',
      sources: ['r2', 'r3', 'r4'],
      highlight: ['stent', 'ureteroscopy', 'r2', 'r3', 'r4'],
    },
  },
  { name: 'medication', keywords: /medic|medicine|drug|\bmeds\b|tablet|pill|prescri|\btak(e|es|ing)\b|painkiller|analgesi|amlodipine|tamsulosin|paracetamol|\bdoses?\b|treatment/g, answer: suggested('What is the current medication?') },
  {
    name: 'symptoms',
    keywords: /symptom|pain|colic|hurt|nause|vomit|blood in (the |his )?urine|haematuria|hematuria|urgency|complain|present(ed|ing)? with|came in/g,
    answer: {
      sentences: [
        'He came in on 12 January with a day of left flank pain spreading to the groin, nausea and blood in his urine.',
        'The colic became severe enough for readmission on 19 January and settled once the kidney was drained.',
        'The stent then caused mild urgency and pink urine, which has since resolved.',
      ],
      why: 'Because the 12 January assessment describes his pain, and the 2 March review records the urgency as resolved.',
      sources: ['r1', 'r2', 'r3', 'r5'],
      highlight: ['colic', 'stent-symptoms', 'r1', 'r2', 'r3', 'r5'],
    },
  },
  { name: 'procedures', keywords: /procedure|surger|operat|stent|ureteroscop|laser|intervention/g, answer: suggested('Which procedures are documented?') },
  {
    name: 'plan',
    keywords: /\bnext\b|\bplan|future|recommend|what should|monitor|outlook/g,
    answer: {
      sentences: [
        'The only planned follow-up in the reports is a surveillance ultrasound in six months for the 3 mm right kidney stone.',
        'Amlodipine continues for his blood pressure.',
      ],
      why: 'Because the 2 March review plans the ultrasound in six months and keeps amlodipine going.',
      sources: ['r5'],
      highlight: ['right-stone-2', 'amlodipine', 'r5'],
    },
  },
  {
    name: 'diagnoses',
    keywords: /diagnos|condition|problem|wrong with|illness|disease|does he have/g,
    answer: {
      sentences: [
        'Three diagnoses: an obstructing left ureteric stone, a mild acute kidney injury from the obstruction, and long-term hypertension.',
        'The obstruction and the kidney injury have resolved; the hypertension is treated with amlodipine.',
      ],
      why: 'Because the 21 January discharge summary lists the diagnoses, and the 2 March review records two as resolved.',
      sources: ['r1', 'r3', 'r5'],
      highlight: ['obstruction', 'aki', 'hypertension', 'r1', 'r3', 'r5'],
    },
  },
  { name: 'obstruction', keywords: /obstruct|hydro|dilat|block|drain|swell/g, answer: suggested('How has the left kidney obstruction changed?') },
  {
    name: 'left stone',
    keywords: /stone|calcul|lithotri/g,
    answer: {
      sentences: [
        'He had a 6 mm stone in the lower left ureter, first seen on CT on 12 January.',
        "It didn't pass, so a stent relieved the blockage on 19 January and the stone was removed by ureteroscopy on 2 February.",
        'The 2 March ultrasound shows no left stone; a separate 3 mm right kidney stone is being watched.',
      ],
      why: 'Because the 12 January CT finds the stone and the 2 February procedure report records its removal.',
      sources: ['r1', 'r2', 'r4', 'r5'],
      highlight: ['left-stone', 'left-stone-1', 'left-stone-2', 'left-stone-3', 'left-stone-4', 'ureteroscopy', 'right-stone', 'r1', 'r2', 'r4', 'r5'],
    },
  },
  {
    name: 'patient',
    keywords: /\bage\b|how old|\bborn\b|birth|\bsex\b|gender|insurance|who is (he|martin|this)/g,
    answer: {
      sentences: ['Martin Keller is 61, born on 17 April 1964.', 'His insurance number is K417064193 and his record is SYN-URO-001.'],
      why: 'Because his date of birth and insurance number are on the patient record.',
      sources: [],
      highlight: ['patient'],
    },
  },
  {
    name: 'clinician',
    keywords: /doctor|physician|surgeon|urologist|who (treated|operated|wrote|saw)|department|clinic|hospital/g,
    answer: {
      sentences: ['All five reports are from the urology department, written by Dr Lena Weber.', 'She also performed the ureteroscopy on 2 February.'],
      why: 'Because every report names Dr Lena Weber of urology as its author.',
      sources: ALL_REPORTS,
      highlight: ['ureteroscopy', ...ALL_REPORTS],
    },
  },
  { name: 'latest', keywords: /latest|last (report|visit|review|appointment)|recent|follow.?up|\bnow\b|current|how is he|doing|recover/g, answer: suggested('What changed in the latest report?') },
  {
    name: 'overview',
    keywords: /history|summar|overview|what happened|tell me|timeline|story|course|brief|everything/g,
    answer: {
      sentences: [
        'In January 2026 a 6 mm stone blocked his left ureter, with colic and a mild kidney injury.',
        'A stent drained the kidney on 19 January, and the stone was removed by ureteroscopy on 2 February.',
        'By 2 March he had recovered with kidney function back to baseline; a small right kidney stone is being watched.',
      ],
      why: 'Because the five reports from 12 January to 2 March follow the whole episode.',
      sources: ALL_REPORTS,
      highlight: ['left-stone', 'hydro', 'aki', 'stent', 'ureteroscopy', 'right-stone', ...ALL_REPORTS],
    },
  },
]

/** The topic answer a question matches best, or null when it matches none. */
export function topicAnswer(question: string): Answer | null {
  const text = question.toLowerCase()
  let best: Topic | null = null
  let bestScore = 0
  for (const topic of TOPICS) {
    const score = new Set(text.match(topic.keywords) ?? []).size
    if (score > bestScore) {
      best = topic
      bestScore = score
    }
  }
  return best?.answer ?? null
}

/** The name of the topic a question matches, for tests. */
export function topicOf(question: string): string | null {
  const answer = topicAnswer(question)
  return TOPICS.find((t) => t.answer === answer)?.name ?? null
}
