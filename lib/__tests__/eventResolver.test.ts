import { describe, expect, it } from 'vitest'
import { resolveExtractedEvents } from '../ai/eventResolver'
import type { ExtractedEvent } from '../ai/extractionSpec'
import type { CropType } from '../db'

const roster: CropType[] = [{ id: 'crop-id', name: ' Tomatoes ', lessons: [] }]
const entryDate = '2024-06-15'
const event = (overrides: Partial<ExtractedEvent> = {}): ExtractedEvent => ({
  eventType: 'observation', matchedRosterName: null, linkedProblemRef: null,
  notes: 'Growing well', eventDate: null, nurseryName: null, variety: null, ...overrides,
})
const resolve = (events: ExtractedEvent[], labelMap: Record<string, string> = {}) =>
  resolveExtractedEvents(events, roster, labelMap, entryDate)

describe('resolveExtractedEvents', () => {
  it('crop name match is case- and whitespace-insensitive; null and misspelled resolve to null', () => {
    expect(resolve(['  tomatoes  ', 'TOMATOES', null, 'Tomatos'].map(matchedRosterName => event({ matchedRosterName })))
      .map(review => review.resolvedCropTypeId)).toEqual(['crop-id', 'crop-id', null, null])
  })
  it('general events skip crop resolution', () => {
    expect(resolve([event({ eventType: 'general', matchedRosterName: 'Tomatoes' })])[0].resolvedCropTypeId).toBeNull()
  })
  it('general events still resolve problem links', () => {
    const extracted = event({ eventType: 'general', matchedRosterName: 'Tomatoes', linkedProblemRef: 'P1' })
    const [review] = resolve([extracted], { P1: 'problem-id' })
    expect(review.resolvedCropTypeId).toBeNull()
    expect(review.resolvedLinkedProblemId).toBe('problem-id')
    expect(review.extracted).toEqual(extracted)
    expect(review.extracted.linkedProblemRef).toBe('P1')
  })
  it('label resolves to problem id via labelMap; unknown and null resolve to null; no label in resolved fields', () => {
    const reviews = resolve(['P1', 'P2', null, 'toString', '__proto__'].map(linkedProblemRef => event({ linkedProblemRef })), { P1: 'problem-id' })
    expect(reviews.map(review => review.resolvedLinkedProblemId)).toEqual(['problem-id', null, null, null, null])
    expect(reviews[0].extracted.linkedProblemRef).toBe('P1')
    for (const review of reviews) {
      expect([review.resolvedCropTypeId, review.resolvedLinkedProblemId, review.resolvedInstanceId, review.resolvedDate]).not.toContain('P1')
    }
  })
  it('resolvedDate keeps in-bound dates and falls back at both edges, on null, and on invalid input', () => {
    const dates = [null, 'invalid', '2023-12-31', '2025-01-01', '2024-01-01', '2024-12-31', '2024-02-29', '2024-02-30', '2024-04-31', '2024-6-01', '2024-00-01', '2024-13-01', '2024-01-00']
    expect(resolve(dates.map(eventDate => event({ eventDate }))).map(review => review.resolvedDate))
      .toEqual([entryDate, entryDate, entryDate, entryDate, '2024-01-01', '2024-12-31', '2024-02-29', entryDate, entryDate, entryDate, entryDate, entryDate, entryDate])
    expect(resolveExtractedEvents([event({ eventDate: '2023-02-29' })], roster, {}, '2023-06-15')[0].resolvedDate).toBe('2023-06-15')
  })
  it('one pending review per event with extracted preserved unmodified', () => {
    const events = [event(), event({ notes: 'Second', eventType: 'fix', linkedProblemRef: 'P1' })]
    const before = structuredClone(events)
    events.forEach(Object.freeze)
    const reviews = resolve(events)
    expect(reviews).toHaveLength(events.length)
    reviews.forEach((review, index) => {
      expect(review.extracted).toEqual(before[index])
      expect(review.status).toBe('pending')
      expect(review.resolvedInstanceId).toBeNull()
      expect(review).not.toHaveProperty('edits')
      expect(review.id).toMatch(/^[\w-]{21}$/)
    })
    expect(events).toEqual(before)
    expect(new Set([...reviews, ...resolve(events)].map(review => review.id)).size).toBe(4)
    expect(resolve([])).toEqual([])
  })
  it('resolved IDs come only from roster and labelMap', () => {
    const reviews = resolve([event({ matchedRosterName: 'Tomatoes', linkedProblemRef: 'P1' }), event({ matchedRosterName: 'model-crop-id', linkedProblemRef: 'model-problem-id' })], { P1: 'problem-id' })
    expect(reviews.map(review => [review.resolvedCropTypeId, review.resolvedLinkedProblemId])).toEqual([['crop-id', 'problem-id'], [null, null]])
  })
  it('first roster match wins on duplicate normalized names', () => {
    expect(resolveExtractedEvents([event({ matchedRosterName: 'tomatoes' })], [...roster, { id: 'second', name: 'TOMATOES', lessons: [] }], {}, entryDate)[0].resolvedCropTypeId).toBe('crop-id')
  })
})
