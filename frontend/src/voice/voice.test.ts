import { describe, expect, it } from 'vitest'
import { FALLBACK, SUGGESTIONS, speechText } from '../chat/script'
import { rms, SilenceDetector } from './silence'

const options = { threshold: 0.1, trailingSilenceMs: 1000, noSpeechMs: 3000, maxMs: 10000 }

describe('silence detection', () => {
  it('keeps listening while speaking and stops after a pause', () => {
    const d = new SilenceDetector(options)
    expect(d.update(0, 0)).toBe('listening')
    expect(d.update(0.5, 500)).toBe('listening')
    expect(d.update(0.5, 1500)).toBe('listening')
    expect(d.update(0.01, 2000)).toBe('listening')
    expect(d.update(0.01, 2499)).toBe('listening')
    expect(d.update(0.01, 2500)).toBe('done')
    expect(d.heardSpeech).toBe(true)
  })

  it('a short pause mid-sentence does not end the recording', () => {
    const d = new SilenceDetector(options)
    d.update(0.5, 0)
    expect(d.update(0, 900)).toBe('listening')
    expect(d.update(0.5, 950)).toBe('listening')
    expect(d.update(0, 1900)).toBe('listening')
  })

  it('gives up when nothing is said', () => {
    const d = new SilenceDetector(options)
    d.update(0, 0)
    expect(d.update(0.05, 2999)).toBe('listening')
    expect(d.update(0.05, 3000)).toBe('no-speech')
    expect(d.heardSpeech).toBe(false)
  })

  it('ends at the hard limit even while still talking', () => {
    const d = new SilenceDetector(options)
    d.update(0.5, 0)
    expect(d.update(0.5, 9999)).toBe('listening')
    expect(d.update(0.5, 10000)).toBe('done')
  })

  it('measures loudness around the 128 midpoint', () => {
    expect(rms(new Uint8Array([128, 128, 128]))).toBe(0)
    expect(rms(new Uint8Array([0, 0]))).toBe(1)
    expect(rms(new Uint8Array([]))).toBe(0)
  })
})

describe('spoken answers', () => {
  it('joins lines and spells out clinical units', () => {
    const text = speechText(SUGGESTIONS[0].answer)
    expect(text).toContain('14 millimetres in the right upper lobe.')
    expect(text).not.toMatch(/\bmm\b/)
    expect(text).not.toContain('[')
  })

  it('reads doses, percentages, volumes and regimens naturally', () => {
    expect(speechText(SUGGESTIONS[1].answer)).toContain('PD-L1 60 percent')
    expect(speechText(SUGGESTIONS[1].answer)).toContain('1,200 millilitres')
    expect(speechText(SUGGESTIONS[3].answer)).toContain('carboplatin and pemetrexed')
  })

  it('reads dates in full, without a leading zero', () => {
    const text = speechText(SUGGESTIONS[1].answer)
    expect(text).toContain('(2 March 2022)')
    expect(text).toContain('(21 June 2023)')
    expect(speechText(SUGGESTIONS[0].answer)).toMatch(/^February 2022: first documented/)
    expect(text).not.toMatch(/\b(Mar|Jun) \d{4}/)
  })

  it('speaks the fallback as is', () => {
    expect(speechText(FALLBACK)).toBe(FALLBACK.lines[0].text)
  })
})
