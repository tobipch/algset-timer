import {describe, expect, it} from 'vitest'
import {KOLIBRI_FACTS, msToWingBeats, randomFact, speedRating} from './kolibri'

describe('msToWingBeats', () => {
  it('rechnet Sekunden in Flügelschläge um', () => {
    expect(msToWingBeats(1000)).toBe(50)
    expect(msToWingBeats(960)).toBe(48)
  })

  it('zeigt nie null Schläge an', () => {
    expect(msToWingBeats(1)).toBe(1)
    expect(msToWingBeats(0)).toBe(1)
  })
})

describe('speedRating', () => {
  it('staffelt von Sturzflug bis Gleitflug', () => {
    expect(speedRating(560).emoji).toBe('⚡')
    expect(speedRating(850).emoji).toBe('💨')
    expect(speedRating(1000).emoji).toBe('🕊️')
    expect(speedRating(1270).emoji).toBe('🥀')
  })

  it('liefert immer ein Label', () => {
    for (const ms of [100, 700, 900, 1100, 5000]) {
      expect(speedRating(ms).label).toBeTruthy()
    }
  })
})

describe('randomFact', () => {
  it('liefert einen Fakt aus der Liste', () => {
    for (let i = 0; i < 20; i++) {
      expect(KOLIBRI_FACTS).toContain(randomFact())
    }
  })
})
