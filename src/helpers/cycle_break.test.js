import { describe, expect, it } from 'vitest'
import {
  buildAlgsetIndex,
  candidatePositions,
  choiceOutcome,
  choicePair,
  generateBreakCase,
  rankedOptions,
  rateChoice,
} from './cycle_break'
import { positionOf, solvedEdgeState, traceToFirstBreak, unsolvedPositions } from './edge_state'
import { EDGE_BUFFER_ORDER, stickerToLetter } from './letters'

// Deterministic RNG so a failing case is reproducible.
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

const generate = (mode, seed = 1) => generateBreakCase({ mode, random: seeded(seed) })

describe('generateBreakCase', () => {
  for (const mode of ['inPair', 'afterPair']) {
    it(`produces ${mode} positions that are consistent with their own trace`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const c = generate(mode, seed)
        expect(c, `seed ${seed}`).not.toBeNull()
        expect(c.unsolvedCount).toBeGreaterThanOrEqual(4)
        expect(c.unsolvedCount).toBeLessThanOrEqual(6)
        // The buffer is never already solved — otherwise one would just float.
        expect(unsolvedPositions(c.state)).toContain(positionOf('UF'))
        const trace = traceToFirstBreak(c.state, 'UF')
        expect(trace.forced).toEqual(c.forcedTargets)
        expect(trace.forced).toHaveLength(mode === 'inPair' ? 1 : 2)
        expect(trace.candidates).toEqual(c.candidates)
        expect(c.candidates.length).toBeGreaterThanOrEqual(mode === 'inPair' ? 6 : 4)
      }
    })
  }

  it('keeps the position reachable on a real cube (even edge permutation, even flips)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { state } = generate('afterPair', seed)
      expect(state.ori.reduce((a, b) => a + b, 0) % 2).toBe(0)
      const seen = new Array(12).fill(false)
      let cycles = 0
      for (let i = 0; i < 12; i++) {
        if (seen[i]) continue
        cycles++
        for (let j = i; !seen[j]; j = state.perm[j]) seen[j] = true
      }
      expect((12 - cycles) % 2, `seed ${seed}`).toBe(0)
    }
  })

  it('never puts a forced target on the buffer piece (those comms are not in an algset)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const mode of ['inPair', 'afterPair']) {
        const c = generate(mode, seed)
        expect(c.forcedTargets.every((t) => positionOf(t) !== positionOf('UF'))).toBe(true)
      }
    }
  })

  it('always offers a buffer of the personal order after a letter pair', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const c = generate('afterPair', seed)
      expect(candidatePositions(c).some((p) => EDGE_BUFFER_ORDER.includes(p.name))).toBe(true)
    }
  })

  it('honours an extra accept predicate', () => {
    const c = generateBreakCase({
      mode: 'inPair',
      random: seeded(7),
      accept: (candidate) => candidate.unsolvedCount === 6,
    })
    expect(c.unsolvedCount).toBe(6)
  })
})

describe('choiceOutcome', () => {
  it('finishes the commutator inside the pair and solves both forced targets', () => {
    const c = generate('inPair', 3)
    const before = unsolvedPositions(c.breakState).length
    const { state, followUp } = choiceOutcome(c, c.candidates[0])
    expect(followUp).toBeNull()
    // Breaking in costs a target: the buffer and the piece broken into are now
    // both out of place, so the count does not drop.
    expect(unsolvedPositions(state).length).toBeGreaterThanOrEqual(before)
  })

  it('adds the forced second target of the new commutator after the pair', () => {
    const c = generate('afterPair', 3)
    const { state, followUp } = choiceOutcome(c, c.candidates[0])
    expect(followUp).not.toBeNull()
    expect(state).not.toEqual(c.breakState)
  })

  it('gives every option a distinct resulting position', () => {
    for (const mode of ['inPair', 'afterPair']) {
      const c = generate(mode, 11)
      const seen = new Set(c.candidates.map((s) => JSON.stringify(choiceOutcome(c, s).state)))
      expect(seen.size).toBe(c.candidates.length)
    }
  })

  it('names the letter pair the choice produces', () => {
    const c = generate('inPair', 5)
    const pair = choicePair(c, c.candidates[0])
    expect(pair).toBe(stickerToLetter(c.forcedTargets[0]) + stickerToLetter(c.candidates[0]))
  })
})

// A tiny algset: every case of the column gets a time, fastest first.
const algsetWith = (times) => ({
  cases: Object.entries(times).map(([pair, avgMs]) => ({ pair, result: { avgMs } })),
})

describe('rateChoice inside a letter pair', () => {
  const breakCase = {
    buffer: 'UF',
    mode: 'inPair',
    forcedTargets: ['UB'], // letter A
    breakState: null,
    candidates: ['UR', 'RU', 'DL', 'LD', 'FR', 'RF'],
    state: null,
  }
  // Pair = A + letter of the candidate: UR=B, RU=M, DL=X, LD=G, FR=J, RF=P
  const index = buildAlgsetIndex(
    algsetWith({ AB: 1000, AM: 1100, AX: 1200, AG: 1300, AJ: 1400, AP: 1500 })
  )

  it('rates the three fastest comms as excellent', () => {
    for (const sticker of ['UR', 'RU', 'DL']) {
      expect(rateChoice(breakCase, sticker, index).rating).toBe('excellent')
    }
  })

  it('rates ranks four to seven as ok', () => {
    expect(rateChoice(breakCase, 'LD', index).rating).toBe('ok')
    expect(rateChoice(breakCase, 'RF', index).rating).toBe('ok')
  })

  it('rates anything slower as weak', () => {
    const many = { ...breakCase, candidates: [...breakCase.candidates, 'DR', 'RD'] }
    const wide = buildAlgsetIndex(
      algsetWith({ AB: 1000, AM: 1100, AX: 1200, AG: 1300, AJ: 1400, AP: 1500, AV: 1600, AO: 1700 })
    )
    expect(rateChoice(many, 'RD', wide).rating).toBe('weak')
  })

  it('cannot rate a comm without a measured time', () => {
    const partial = buildAlgsetIndex(algsetWith({ AB: 1000 }))
    expect(rateChoice(breakCase, 'DL', partial).rating).toBe('unknown')
  })

  it('can rank against the whole algset column instead of the offered options', () => {
    // AX is the fastest comm this position offers, but a fully measured column
    // holds plenty of faster ones that simply aren't available here.
    const column = { AB: 1500, AM: 1600, AX: 1000, AG: 1700, AJ: 1800, AP: 1900 }
    'DEFHIKLNOQRSTUVW'.split('').forEach((l, i) => (column['A' + l] = 500 + i * 10))
    const full = buildAlgsetIndex(algsetWith(column))
    expect(rateChoice(breakCase, 'DL', full, { scope: 'available' }).rating).toBe('excellent')
    expect(rateChoice(breakCase, 'DL', full, { scope: 'algset' }).rating).toBe('weak')
  })
})

describe('rateChoice after a letter pair', () => {
  // Buffer home, UL and BL swapped: the break may go to the UL piece (a buffer
  // of the personal order) or to the BL piece (not a buffer at all).
  const breakState = (() => {
    const state = solvedEdgeState()
    const [ul, bl] = [positionOf('UL'), positionOf('BL')]
    ;[state.perm[ul], state.perm[bl]] = [state.perm[bl], state.perm[ul]]
    return state
  })()
  const breakCase = {
    buffer: 'UF',
    mode: 'afterPair',
    state: breakState,
    breakState,
    forcedTargets: ['UB', 'UR'],
    candidates: ['UL', 'LU', 'BL', 'LB'],
  }
  const index = buildAlgsetIndex(algsetWith({ DA: 900, RA: 700 }))

  it('rewards shooting to the next buffer of the order', () => {
    for (const sticker of ['UL', 'LU']) {
      const result = rateChoice(breakCase, sticker, index)
      expect(result.rating).toBe('excellent')
      expect(result.chosen.positionName).toBe('UL')
    }
  })

  it('rates a break to a non-buffer piece as weak, even with faster comms', () => {
    const result = rateChoice(breakCase, 'BL', index)
    expect(result.rating).toBe('weak')
    expect(result.best.positionName).toBe('UL')
  })

  it('has no "ok" category', () => {
    const ratings = breakCase.candidates.map((s) => rateChoice(breakCase, s, index).rating)
    expect(ratings).not.toContain('ok')
  })

  it('orders the options by the buffer order, unknown pieces last', () => {
    const options = rankedOptions(breakCase, index)
    expect(options.map((o) => o.positionName)).toEqual(['UL', 'UL', 'BL', 'BL'])
  })
})
