/**
 * Hardcoded answers for v1. Each suggested question has a scripted answer about the
 * patient's history: lines of text, each citing the reports it comes from, plus the graph
 * nodes the answer is about (highlighted when the answer appears).
 */

export interface AnswerLine {
  text: string
  /** Report node IDs this line is grounded in. */
  cites: string[]
}

export interface Answer {
  lines: AnswerLine[]
  /** Node IDs to highlight in the graph. Empty for the fallback answer. */
  highlight: string[]
}

export interface Suggestion {
  question: string
  answer: Answer
}

export const SUGGESTIONS: Suggestion[] = [
  {
    question: 'How has the lung nodule changed over time?',
    answer: {
      lines: [
        { text: 'Feb 2022: first documented, 14 mm in the right upper lobe.', cites: ['r1'] },
        { text: 'Jan 2023: progressed to 19 mm.', cites: ['r3'] },
        { text: 'May 2024: unchanged at 19 mm compared with the prior examination.', cites: ['r5'] },
      ],
      highlight: ['nodule', 'nodule-1', 'nodule-2', 'nodule-3', 'r1', 'r3', 'r5'],
    },
  },
  {
    question: 'Which procedures are documented?',
    answer: {
      lines: [
        { text: 'CT-guided lung biopsy (02 Mar 2022): adenocarcinoma, PD-L1 60 %.', cites: ['r2'] },
        { text: 'Port catheter implantation (09 Mar 2022) before chemotherapy.', cites: ['r2'] },
        { text: 'Thoracentesis, left (21 Jun 2023): 1,200 ml serous fluid drained.', cites: ['r4'] },
      ],
      highlight: ['biopsy', 'port', 'thoracentesis', 'r2', 'r4'],
    },
  },
  {
    question: 'What changed in the latest report?',
    answer: {
      lines: [
        { text: 'Lung nodule stable at 19 mm.', cites: ['r5', 'r3'] },
        { text: 'Liver lesion no longer detectable (9 mm before).', cites: ['r5', 'r3'] },
        { text: 'Left pleural effusion resolved after thoracentesis.', cites: ['r5', 'r4'] },
      ],
      highlight: ['r5', 'r3', 'r4', 'nodule-3', 'liver-3', 'effusion', 'thoracentesis'],
    },
  },
  {
    question: 'What is the current treatment?',
    answer: {
      lines: [
        { text: 'First line: carboplatin / pemetrexed from Mar 2022.', cites: ['r2'] },
        { text: 'Switched to pembrolizumab monotherapy in Jan 2023 after the nodule progressed; still ongoing in May 2024.', cites: ['r3', 'r5'] },
      ],
      highlight: ['nsclc', 'carboplatin', 'pemetrexed', 'pembrolizumab', 'r2', 'r3', 'r5'],
    },
  },
]

export const FALLBACK: Answer = {
  lines: [
    {
      text: "I couldn't find a confident answer to that in the uploaded reports. Try asking how a finding changed, which procedures are documented, or what the current treatment is.",
      cites: [],
    },
  ],
  highlight: [],
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/[?.!\s]+$/, '').replace(/\s+/g, ' ')

/** The scripted answer for a suggested question (typed or clicked), otherwise the fallback. */
export function answerFor(question: string): Answer {
  const key = normalize(question)
  return SUGGESTIONS.find((s) => normalize(s.question) === key)?.answer ?? FALLBACK
}

/** The reports an answer cites, in first-cited order; line markers number into this list. */
export function citationsOf(answer: Answer): string[] {
  return [...new Set(answer.lines.flatMap((line) => line.cites))]
}

// Clinical shorthand a voice would read letter by letter.
const SPOKEN: [RegExp, string][] = [
  [/(\d) ?mm\b/g, '$1 millimetres'],
  [/(\d) ?ml\b/g, '$1 millilitres'],
  [/(\d) ?mg\b/g, '$1 milligrams'],
  [/(\d) ?%/g, '$1 percent'],
  [/\bq3w\b/g, 'every three weeks'],
  [/ \/ /g, ' and '],
  // "02 Mar 2022" is read as "zero two Mar"; say "2 March 2022".
  [/\b0(\d) (?=[A-Z][a-z]{2} \d{4})/g, '$1 '],
]

const MONTHS: Record<string, string> = {
  Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', Jun: 'June', Jul: 'July',
  Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
}

/** The answer as one passage to read aloud: lines joined, citations left out, units and dates spelled out. */
export function speechText(answer: Answer): string {
  let text = answer.lines.map((line) => line.text.trim()).join(' ')
  for (const [pattern, spoken] of SPOKEN) text = text.replace(pattern, spoken)
  return text.replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?= \d{4})/g, (m) => MONTHS[m])
}
