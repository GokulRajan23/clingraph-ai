import { describe, expect, it } from 'vitest'
import { historyOf, readAnswer, scriptedAnswer, SUGGESTIONS } from './script'

describe('answers', () => {
  it('only suggested questions are scripted', () => {
    expect(scriptedAnswer(SUGGESTIONS[0].question)).toBe(SUGGESTIONS[0].answer)
    expect(scriptedAnswer("what's her current treatment")).toBeNull()
  })

  it('passes recent turns as context, answers as the model wrote them', () => {
    const answer = SUGGESTIONS[3].answer
    const history = historyOf([
      { role: 'user', text: 'old' },
      { role: 'user', text: 'What is the current treatment?' },
      { role: 'assistant', answer },
    ], 2)
    expect(history).toEqual([
      { role: 'user', text: 'What is the current treatment?' },
      { role: 'assistant', text: [...answer.sentences, `HIGHLIGHT: ${answer.highlight.join(', ')}`].join('\n') },
    ])
  })
})

/** A response body that arrives in the given pieces. */
const body = (...pieces: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(new TextEncoder().encode(piece))
      controller.close()
    },
  })

const event = (value: object) => JSON.stringify(value) + '\n'

describe('streamed answers', () => {
  it('hands over each sentence as it arrives, then the sources and highlights', async () => {
    const seen: string[][] = []
    const first = event({ type: 'sentence', text: "She's on pembrolizumab." })
    const answer = await readAnswer(
      body(first.slice(0, 10), first.slice(10), event({ type: 'sentence', text: 'She started it in January 2023.' }), event({ type: 'done', sources: ['r3'], highlight: ['pembrolizumab', 'r3'] })),
      (sentences) => seen.push(sentences),
    )
    expect(seen.map((sentences) => sentences.length)).toEqual([1, 2])
    expect(answer).toEqual({ sentences: ["She's on pembrolizumab.", 'She started it in January 2023.'], sources: ['r3'], highlight: ['pembrolizumab', 'r3'] })
  })

  it('keeps the lines already said when the answer fails partway', async () => {
    const answer = await readAnswer(body(event({ type: 'sentence', text: 'Pembrolizumab.' }), event({ type: 'error', detail: 'Too slow' })), () => undefined)
    expect(answer).toEqual({ sentences: ['Pembrolizumab.'], sources: [], highlight: [], cutShort: true })
  })

  it('says what went wrong when nothing was answered', async () => {
    const answer = await readAnswer(body(event({ type: 'error', detail: 'The language model failed (RuntimeError)' })), () => undefined)
    expect(answer.cutShort).toBeUndefined()
    expect(answer.sentences[0]).toContain('The language model failed')
  })

  it('treats a stream that just stops as cut short', async () => {
    const answer = await readAnswer(body(event({ type: 'sentence', text: 'Stable.' })), () => undefined)
    expect(answer.cutShort).toBe(true)
  })
})
