import { describe, expect, it } from 'vitest'
import { FALLBACK, speakable, SUGGESTIONS, speechText } from '../chat/script'
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
  it('joins sentences and spells out clinical units', () => {
    const text = speechText(SUGGESTIONS[0].answer)
    expect(speechText(SUGGESTIONS[1].answer)).toContain('removed the 6 millimetre stone')
    expect(text).not.toMatch(/\bmm\b/)
  })

  it('reads doses, percentages, volumes and shorthand naturally', () => {
    expect(speechText(SUGGESTIONS[2].answer)).toContain('back to 1.0 milligrams per decilitre')
    expect(speakable('a 6 Fr x 26 cm stent')).toBe('a 6 French x 26 cm stent')
    expect(speakable('Tamsulosin MR 0.4 mg')).toBe('Tamsulosin modified release 0.4 milligrams')
    expect(speakable('200 mg q3w')).toBe('200 milligrams every three weeks')
    expect(speakable('grew to 19 mm in May, a 3 mm stone')).toBe('grew to 19 millimetres in May, a 3 millimetre stone')
  })

  it('reads dates in full, without a leading zero', () => {
    expect(speakable('on 02 Mar 2022')).toBe('on 2 March 2022')
    expect(speakable('since Jun 2023')).toBe('since June 2023')
  })

  it('speaks the fallback as is', () => {
    expect(speechText(FALLBACK)).toBe(FALLBACK.sentences[0])
  })
})
