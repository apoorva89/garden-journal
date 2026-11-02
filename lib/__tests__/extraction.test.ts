import { describe, it, expect } from 'vitest'
import { ExtractedEventSchema } from '../ai/extractionSpec'

describe('ExtractedEventSchema', () => {
  it('accepts a well-formed event with all fields', () => {
    const result = ExtractedEventSchema.parse({
      eventType: 'observation',
      matchedRosterName: 'Tomatoes',
      linkedProblemRef: null,
      notes: 'Plants looking healthy with new growth',
      eventDate: '2026-07-01',
      nurseryName: null,
      variety: null,
    })
    expect(result.eventType).toBe('observation')
    expect(result.matchedRosterName).toBe('Tomatoes')
    expect(result.notes).toBe('Plants looking healthy with new growth')
    expect(result.eventDate).toBe('2026-07-01')
  })

  it('accepts null for all nullable fields', () => {
    const result = ExtractedEventSchema.parse({
      eventType: 'general',
      matchedRosterName: null,
      linkedProblemRef: null,
      notes: 'Garden looking good overall',
      eventDate: null,
      nurseryName: null,
      variety: null,
    })
    expect(result.matchedRosterName).toBeNull()
    expect(result.linkedProblemRef).toBeNull()
    expect(result.eventDate).toBeNull()
    expect(result.nurseryName).toBeNull()
    expect(result.variety).toBeNull()
  })

  it('accepts all valid eventType values', () => {
    const types = ['observation', 'problem', 'fix', 'nursery_pickup', 'harvest', 'lesson', 'general'] as const
    for (const eventType of types) {
      const result = ExtractedEventSchema.parse({
        eventType,
        matchedRosterName: null,
        linkedProblemRef: null,
        notes: 'test note',
        eventDate: null,
        nurseryName: null,
        variety: null,
      })
      expect(result.eventType).toBe(eventType)
    }
  })

  it('accepts a fix event with a linkedProblemRef', () => {
    const result = ExtractedEventSchema.parse({
      eventType: 'fix',
      matchedRosterName: 'Peppers',
      linkedProblemRef: 'P1',
      notes: 'Applied neem oil to affected leaves',
      eventDate: null,
      nurseryName: null,
      variety: null,
    })
    expect(result.linkedProblemRef).toBe('P1')
  })

  it('throws when notes is missing', () => {
    expect(() =>
      ExtractedEventSchema.parse({
        eventType: 'observation',
        matchedRosterName: null,
        linkedProblemRef: null,
        eventDate: null,
        nurseryName: null,
        variety: null,
      }),
    ).toThrow()
  })

  it('throws when eventType is an unrecognised value', () => {
    expect(() =>
      ExtractedEventSchema.parse({
        eventType: 'watering',
        matchedRosterName: null,
        linkedProblemRef: null,
        notes: 'test',
        eventDate: null,
        nurseryName: null,
        variety: null,
      }),
    ).toThrow()
  })

  it('throws when matchedRosterName is the wrong type', () => {
    expect(() =>
      ExtractedEventSchema.parse({
        eventType: 'observation',
        matchedRosterName: 42,
        linkedProblemRef: null,
        notes: 'test',
        eventDate: null,
        nurseryName: null,
        variety: null,
      }),
    ).toThrow()
  })

  it('throws when eventDate is the wrong type', () => {
    expect(() =>
      ExtractedEventSchema.parse({
        eventType: 'observation',
        matchedRosterName: null,
        linkedProblemRef: null,
        notes: 'test',
        eventDate: 20260701,
        nurseryName: null,
        variety: null,
      }),
    ).toThrow()
  })

  it('accepts nurseryName and variety; updated fixtures pass', () => {
    // Non-null nurseryName and variety on a nursery_pickup event
    const pickup = ExtractedEventSchema.parse({
      eventType: 'nursery_pickup',
      matchedRosterName: 'Tomatoes',
      linkedProblemRef: null,
      notes: 'Picked up Sun Gold seedlings from Thompson Nursery.',
      eventDate: '2026-05-10',
      nurseryName: 'Thompson Nursery',
      variety: 'Sun Gold',
    })
    expect(pickup.nurseryName).toBe('Thompson Nursery')
    expect(pickup.variety).toBe('Sun Gold')

    // Both null is also valid
    const pickupNulls = ExtractedEventSchema.parse({
      eventType: 'nursery_pickup',
      matchedRosterName: 'Peppers',
      linkedProblemRef: null,
      notes: 'Picked up pepper seedlings.',
      eventDate: '2026-05-11',
      nurseryName: null,
      variety: null,
    })
    expect(pickupNulls.nurseryName).toBeNull()
    expect(pickupNulls.variety).toBeNull()
  })
})
