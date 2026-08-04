import {describe, expect, it} from 'vitest'
import {trimCount, trimmedIndices, trimmedMean} from './stats'
import {trimmedMean as apiTrimmedMean} from '../../api/_lib/stats'

describe('trimCount', () => {
  it('trimmt floor(10%) pro Seite', () => {
    expect(trimCount(12)).toBe(1)
    expect(trimCount(10)).toBe(1)
    expect(trimCount(19)).toBe(1)
    expect(trimCount(20)).toBe(2)
    expect(trimCount(35)).toBe(3)
  })

  it('trimmt unter 10 Werten nicht', () => {
    for (const n of [1, 2, 5, 9]) expect(trimCount(n)).toBe(0)
  })
})

describe('trimmedMean', () => {
  it('lässt bei 12 Werten je den schnellsten und langsamsten weg', () => {
    // 10 x 1000 plus ein Ausreisser nach unten und einer nach oben
    const times = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 200, 5000]
    expect(trimmedMean(times)).toBe(1000)
  })

  it('trimmt unabhängig von der Reihenfolge', () => {
    const times = [5000, 1000, 1000, 200, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]
    expect(trimmedMean(times)).toBe(1000)
  })

  it('ist unter 10 Werten der normale Durchschnitt', () => {
    expect(trimmedMean([1000, 2000, 3000])).toBe(2000)
    expect(trimmedMean([900, 1000, 1100, 1200, 5000])).toBe(1840)
  })

  it('trimmt bei 20 Werten je zwei pro Seite', () => {
    const times = [100, 200, ...Array(16).fill(1000), 8000, 9000]
    expect(trimmedMean(times)).toBe(1000)
  })

  it('behält bei Gleichständen den korrekten Mittelwert', () => {
    expect(trimmedMean(Array(12).fill(800))).toBe(800)
  })

  it('gibt null zurück, wenn nichts Verwertbares da ist', () => {
    expect(trimmedMean([])).toBeNull()
    expect(trimmedMean(null)).toBeNull()
    expect(trimmedMean([NaN, Infinity])).toBeNull()
  })

  it('lässt immer mindestens einen Wert übrig', () => {
    for (let n = 1; n <= 60; n++) {
      const values = Array.from({length: n}, (_, i) => 500 + i * 10)
      expect(Number.isFinite(trimmedMean(values))).toBe(true)
    }
  })
})

// Die Formel steht doppelt im Code (Frontend rechnet live, die API rechnet
// beim Speichern selbst). Dieser Test schlägt an, wenn eine Seite driftet.
describe('API- und Frontend-Formel stimmen überein', () => {
  it('liefert für zufällige Serien identische Werte', () => {
    for (let run = 0; run < 200; run++) {
      const n = 1 + Math.floor(Math.random() * 30)
      const times = Array.from({length: n}, () => 300 + Math.floor(Math.random() * 2000))
      expect(apiTrimmedMean(times)).toBe(trimmedMean(times))
    }
  })

  it('behandelt leere Eingaben gleich', () => {
    expect(apiTrimmedMean([])).toBeNull()
    expect(apiTrimmedMean([])).toBe(trimmedMean([]))
  })
})

describe('trimmedIndices', () => {
  it('markiert die Positionen der getrimmten Werte', () => {
    const times = [1000, 200, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 5000]
    expect([...trimmedIndices(times)].sort((a, b) => a - b)).toEqual([1, 11])
  })

  it('markiert genau 2k Werte, auch bei Gleichständen', () => {
    const times = Array(12).fill(800)
    expect(trimmedIndices(times).size).toBe(2)
  })

  it('markiert unter 10 Werten nichts', () => {
    expect(trimmedIndices([1000, 200, 5000]).size).toBe(0)
  })

  it('deckt sich mit dem, was trimmedMean weglässt', () => {
    const times = [1200, 900, 1000, 1100, 950, 1050, 980, 1020, 990, 1010, 300, 4000]
    const trimmed = trimmedIndices(times)
    const kept = times.filter((_, i) => !trimmed.has(i))
    const manual = kept.reduce((a, b) => a + b, 0) / kept.length
    expect(trimmedMean(times)).toBeCloseTo(manual, 10)
  })
})
