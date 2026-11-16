import { describe, expect, it } from 'vitest'
import { pickVoice, recognitionProblem, transcriptOf } from './browser'

const voice = (name: string, lang: string) => ({ name, lang, localService: true })

describe('picking the browser voice', () => {
  it('prefers a natural English voice over plain ones', () => {
    const voices = [voice('Anna', 'de-DE'), voice('Fred', 'en-US'), voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US'), voice('Google UK English Male', 'en-GB')]
    expect(pickVoice(voices)?.name).toContain('Natural')
  })

  it('takes a known good voice when no natural one is there', () => {
    expect(pickVoice([voice('Fred', 'en-US'), voice('Samantha', 'en-US')])?.name).toBe('Samantha')
  })

  it('never picks a macOS novelty voice when a real one is there', () => {
    const mac = ['Albert', 'Bad News', 'Bubbles', 'Fred', 'Rishi', 'Zarvox'].map((n) => voice(n, n === 'Rishi' ? 'en-IN' : 'en-US'))
    expect(pickVoice(mac)?.name).toBe('Rishi')
    expect(pickVoice([...mac, voice('Daniel', 'en-GB')])?.name).toBe('Daniel')
  })

  it('accepts underscore language tags (Android)', () => {
    expect(pickVoice([voice('English', 'en_GB')])?.name).toBe('English')
  })

  it('has no pick without an English voice', () => {
    expect(pickVoice([voice('Anna', 'de-DE')])).toBeNull()
    expect(pickVoice([])).toBeNull()
  })
})

describe('recognition results', () => {
  const result = (transcript: string, isFinal = true) => Object.assign([{ transcript }], { isFinal })

  it('joins every result into one question', () => {
    expect(transcriptOf([result('Which procedures'), result(' are  documented', false)])).toBe('Which procedures are documented')
  })

  it('is empty when nothing was heard', () => {
    expect(transcriptOf([])).toBe('')
  })

  it('says nothing for a cancelled recognition and explains the rest', () => {
    expect(recognitionProblem('aborted')).toBeNull()
    expect(recognitionProblem('not-allowed')).toMatch(/blocked/)
    expect(recognitionProblem('no-speech')).toMatch(/catch/)
    expect(recognitionProblem('something-new')).toMatch(/Type your question/)
  })
})
