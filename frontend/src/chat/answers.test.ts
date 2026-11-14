import { describe, expect, it } from 'vitest'
import { historyOf, scriptedAnswer, SUGGESTIONS, toAnswer } from './script'

describe('answers from the backend', () => {
  it('reads a well-formed answer', () => {
    const body = { lines: [{ text: ' Pembrolizumab, ongoing. ', cites: ['r5'] }], highlight: ['pembrolizumab', 'r5'] }
    expect(toAnswer(body)).toEqual({ lines: [{ text: 'Pembrolizumab, ongoing.', cites: ['r5'] }], highlight: ['pembrolizumab', 'r5'] })
  })

  it('rejects the wrong shape or an empty answer', () => {
    expect(toAnswer(null)).toBeNull()
    expect(toAnswer({ lines: 'text', highlight: [] })).toBeNull()
    expect(toAnswer({ lines: [{ text: 'x', cites: [1] }], highlight: [] })).toBeNull()
    expect(toAnswer({ lines: [{ text: '  ', cites: [] }], highlight: [] })).toBeNull()
  })

  it('only suggested questions are scripted', () => {
    expect(scriptedAnswer(SUGGESTIONS[0].question)).toBe(SUGGESTIONS[0].answer)
    expect(scriptedAnswer("what's her current treatment")).toBeNull()
  })

  it('passes recent turns as context, answers as plain text', () => {
    const answer = SUGGESTIONS[3].answer
    const history = historyOf([
      { role: 'user', text: 'old' },
      { role: 'user', text: 'What is the current treatment?' },
      { role: 'assistant', answer },
    ], 2)
    expect(history).toEqual([
      { role: 'user', text: 'What is the current treatment?' },
      { role: 'assistant', text: answer.lines.map((l) => l.text).join(' ') },
    ])
  })
})
