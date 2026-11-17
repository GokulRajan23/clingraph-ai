import { describe, expect, it } from 'vitest'
import { historyOf, readAnswer, scriptedAnswer, SUGGESTIONS, withWhy } from './script'

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
      { role: 'assistant', text: [...answer.sentences, `WHY: ${answer.why}`, `HIGHLIGHT: ${answer.highlight.join(', ')}`].join('\n') },
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

  it('keeps the why line apart from the sentences', async () => {
    const seen: (string | undefined)[] = []
    const answer = await readAnswer(
      body(event({ type: 'sentence', text: 'Pembrolizumab.' }), event({ type: 'why', text: 'Because the March letter starts it.' }), event({ type: 'done', sources: ['r3'], highlight: ['r3'] })),
      (_, why) => seen.push(why),
    )
    expect(seen).toEqual([undefined, 'Because the March letter starts it.'])
    expect(answer).toEqual({ sentences: ['Pembrolizumab.'], why: 'Because the March letter starts it.', sources: ['r3'], highlight: ['r3'] })
  })

  it('treats a stream that just stops as cut short', async () => {
    const answer = await readAnswer(body(event({ type: 'sentence', text: 'Stable.' })), () => undefined)
    expect(answer.cutShort).toBe(true)
  })
})

describe('why lines', () => {
  const label = (id: string) => ({ r1: 'Initial urology assessment · 12 Jan 2026', r5: 'Follow-up and medication review · 2 Mar 2026' })[id]

  it('every suggested answer gives its claim', () => {
    for (const s of SUGGESTIONS) expect(s.answer.why).toMatch(/^Because /)
  })

  it('builds one from the sources when the model gave none', () => {
    expect(withWhy({ sentences: ['Stable.'], sources: ['r1', 'r5'], highlight: [] }, label).why).toBe(
      "Because it's in the initial urology assessment of 12 Jan 2026 and the follow-up and medication review of 2 Mar 2026.",
    )
  })

  it("keeps the model's own, and adds none without sources", () => {
    expect(withWhy({ sentences: ['x'], why: 'Because r1.', sources: ['r1'], highlight: [] }, label).why).toBe('Because r1.')
    expect(withWhy({ sentences: ['x'], sources: [], highlight: [] }, label).why).toBeUndefined()
  })
})
