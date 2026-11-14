import type { Patient } from './demo/data'

/** Lower case without accents, so "muller" finds "Müller" and "yilmaz" finds "Yılmaz". */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .toLowerCase()

/**
 * Patients whose name contains every word of the query, or whose insurance number starts with it
 * (spaces ignored). An empty query finds no one.
 */
export function searchPatients(patients: Patient[], query: string, limit = 5): Patient[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const number = words.join('')
  return patients
    .filter((p) => fold(p.insurance).startsWith(number) || words.every((w) => fold(p.name).includes(w)))
    .slice(0, limit)
}

export function firstName(patient: Patient): string {
  return patient.name.split(' ')[0]
}
