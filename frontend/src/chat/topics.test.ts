import { describe, expect, it } from 'vitest'
import { DEMO_GRAPH } from '../demo/data'
import { TOPICS, topicAnswer, topicOf } from './topics'

describe('topic answers', () => {
  it.each([
    ['Does he have any allergies', 'allergies'],
    ['Did he get antibiotics before the procedure?', 'infection'],
    ['Was there an infection', 'infection'],
    ['What was the stone made of?', 'stone composition'],
    ['What about the right kidney stone', 'right stone'],
    ['How is his kidney function', 'kidney function'],
    ['what were his creatinine levels', 'kidney function'],
    ['Which scans were done', 'investigations'],
    ['Does he have high blood pressure', 'blood pressure'],
    ['When was he discharged', 'hospital stay'],
    ['What symptoms did he come in with', 'symptoms'],
    ['Is he in pain', 'symptoms'],
    ['what meds is he on', 'medication'],
    ['What pain medication does he take', 'medication'],
    ['Is he taking anything for the pain', 'medication'],
    ['What surgery did he have for the stone', 'procedures'],
    ['when was the stent put in', 'procedures'],
    ["what's the plan", 'plan'],
    ['what are his diagnoses', 'diagnoses'],
    ['Is the kidney still blocked', 'obstruction'],
    ['tell me about the kidney stone', 'left stone'],
    ['How old is Martin', 'patient'],
    ['Who is his doctor', 'clinician'],
    ['How is he doing now', 'latest'],
    ['Give me a summary of his history', 'overview'],
  ])('%s → %s', (question, topic) => {
    expect(topicOf(question)).toBe(topic)
  })

  it('leaves questions about anything else to the fallback', () => {
    expect(topicAnswer("What's the weather like in Erlangen")).toBeNull()
    expect(topicAnswer('')).toBeNull()
  })

  it('only cites reports and highlights nodes that are in the graph', () => {
    const ids = new Set(DEMO_GRAPH.nodes.map((n) => n.id))
    const reports = new Set(DEMO_GRAPH.nodes.filter((n) => n.type === 'report').map((n) => n.id))
    for (const topic of TOPICS) {
      for (const id of topic.answer.highlight) expect(ids, `${topic.name}: ${id}`).toContain(id)
      for (const id of topic.answer.sources) expect(reports, `${topic.name}: ${id}`).toContain(id)
      expect(topic.answer.sentences.length).toBeGreaterThan(0)
    }
  })
})
