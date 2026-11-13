/**
 * The only seam between the UI and graph building / querying. v1 resolves everything
 * locally from a fixture and hardcoded answers; a real backend replaces these bodies.
 */
import { answerFor, SUGGESTIONS, type Answer } from './chat/script'
import { FIXTURE } from './graph/fixture'
import { nameReports } from './graph/naming'
import type { Graph } from './graph/types'

const PROCESSING_MS = 1600
const ANSWER_MS = 700

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/** Parses the uploaded PDFs. Resolves once they are part of the graph. */
export async function processReports(_files: File[]): Promise<void> {
  await wait(PROCESSING_MS)
}

/** The knowledge graph for the processed reports, given their file names in upload order. */
export async function fetchGraph(fileNames: string[]): Promise<Graph> {
  return nameReports(FIXTURE, fileNames)
}

/** Questions to offer once the graph is ready. */
export async function fetchSuggestions(): Promise<string[]> {
  return SUGGESTIONS.map((s) => s.question)
}

/** Answers a question about the graph. */
export async function ask(question: string): Promise<Answer> {
  await wait(ANSWER_MS)
  return answerFor(question)
}
