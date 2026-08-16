import { describe, expect, it } from 'vitest'
import { puzzles } from 'cubing/puzzles'
import {
  EDGE_POSITIONS,
  breakCandidates,
  cycleClosed,
  edgeStateFromPatternData,
  isPieceSolved,
  isKnownSticker,
  patternDataWithEdgeState,
  positionOf,
  readTarget,
  shoot,
  solvedEdgeState,
  stickerAt,
  traceToFirstBreak,
  unsolvedPositions,
} from './edge_state'
import { SPEFFZ_EDGES } from './letters'

const kpuzzle = await puzzles['3x3x3'].kpuzzle()
const solvedPattern = kpuzzle.defaultPattern()

const applyMoves = (moves) => {
  let p = solvedPattern
  for (const m of moves.split(/\s+/).filter(Boolean)) p = p.applyMove(m)
  return p
}

const stateAfter = (moves) => edgeStateFromPatternData(applyMoves(moves).patternData)

describe('edge position table', () => {
  it('names every sticker of the Speffz scheme exactly once', () => {
    const names = EDGE_POSITIONS.flat()
    expect(names).toHaveLength(24)
    expect(new Set(names).size).toBe(24)
    expect(names.every(isKnownSticker)).toBe(true)
    expect(new Set(Object.keys(SPEFFZ_EDGES))).toEqual(new Set(names))
  })

  it('matches the piece order cubing uses for the EDGES orbit', () => {
    // U turns UF->UL->UB->UR->UF, so afterwards UL holds the piece from UF.
    const afterU = stateAfter('U')
    expect(afterU.perm[positionOf('UL')]).toBe(positionOf('UF'))
    expect(afterU.perm[positionOf('UF')]).toBe(positionOf('UR'))

    // R turns FR->UR->BR->DR->FR.
    const afterR = stateAfter('R')
    expect(afterR.perm[positionOf('UR')]).toBe(positionOf('FR'))
    expect(afterR.perm[positionOf('BR')]).toBe(positionOf('UR'))

    // L turns UL->FL->DL->BL->UL.
    const afterL = stateAfter('L')
    expect(afterL.perm[positionOf('FL')]).toBe(positionOf('UL'))
    expect(afterL.perm[positionOf('UL')]).toBe(positionOf('BL'))

    // D turns DF->DR->DB->DL->DF.
    const afterD = stateAfter('D')
    expect(afterD.perm[positionOf('DR')]).toBe(positionOf('DF'))
  })

  it('matches the slot convention cubing counts orientation from', () => {
    // F brings FL to UF; the L sticker of that piece ends up on the U face.
    const afterF = stateAfter('F')
    expect(stickerAt(afterF, positionOf('UF'), 0)).toBe('LF')
    expect(stickerAt(afterF, positionOf('UF'), 1)).toBe('FL')
    // R brings FR to UR without flipping anything: the F sticker faces up.
    const afterR = stateAfter('R')
    expect(stickerAt(afterR, positionOf('UR'), 0)).toBe('FR')
  })

  it('round-trips through cubing pattern data', () => {
    const state = stateAfter("R U R' F2 D B' L2")
    const data = patternDataWithEdgeState(solvedPattern.patternData, state)
    expect(edgeStateFromPatternData(data)).toEqual(state)
    expect(data.CORNERS).toEqual(solvedPattern.patternData.CORNERS)
  })
})

describe('shooting targets', () => {
  it('reads the target the buffer sticker points at', () => {
    // T-perm-ish setup is overkill; a plain U puts the UR piece into UF.
    const state = stateAfter('U')
    expect(readTarget(state, 'UF')).toBe('UR')
  })

  it('places the piece from the buffer correctly on the target it was read at', () => {
    const state = stateAfter('U')
    const pieceInBuffer = state.perm[positionOf('UF')]
    const afterFirst = shoot(state, 'UF', 'UR')
    expect(afterFirst.perm[positionOf('UR')]).toBe(pieceInBuffer)
    expect(isPieceSolved(afterFirst, positionOf('UR'))).toBe(true)
  })

  it('solves a whole cycle by following the read targets', () => {
    let state = stateAfter('U') // 4-cycle of the U-layer edges, buffer included
    for (let i = 0; i < 10 && unsolvedPositions(state).length > 0; i++) {
      const target = readTarget(state, 'UF')
      if (target === 'UF') break
      state = shoot(state, 'UF', target)
    }
    expect(unsolvedPositions(state)).toEqual([])
  })

  it('flips the buffer when shot at its own second sticker', () => {
    const state = solvedEdgeState()
    const flipped = shoot(state, 'UF', 'FU')
    expect(flipped.perm[positionOf('UF')]).toBe(positionOf('UF'))
    expect(flipped.ori[positionOf('UF')]).toBe(1)
    expect(readTarget(flipped, 'UF')).toBe('FU')
    expect(shoot(flipped, 'UF', 'FU')).toEqual(state)
  })

  it('recognises a closed cycle', () => {
    expect(cycleClosed(solvedEdgeState(), 'UF')).toBe(true)
    expect(cycleClosed(stateAfter('U'), 'UF')).toBe(false)
  })
})

describe('traceToFirstBreak', () => {
  const swap = (state, a, b) => {
    const next = { perm: state.perm.slice(), ori: state.ori.slice() }
    const [pa, pb] = [positionOf(a), positionOf(b)]
    ;[next.perm[pa], next.perm[pb]] = [next.perm[pb], next.perm[pa]]
    return next
  }

  it('reports the break after one target when the first cycle is a 2-swap', () => {
    // UF <-> UB and UR <-> UL: after shooting A the buffer is home again.
    let state = swap(solvedEdgeState(), 'UF', 'UB')
    state = swap(state, 'UR', 'UL')
    const trace = traceToFirstBreak(state, 'UF')
    expect(trace.forced).toEqual(['UB'])
    expect(trace.candidates.sort()).toEqual(['LU', 'RU', 'UL', 'UR'].sort())
  })

  it('reports the break after two targets when the first cycle is a 3-cycle', () => {
    // UF -> UB -> UR -> UF plus a separate 3-cycle of D edges.
    const state = solvedEdgeState()
    const cycle = (a, b, c) => {
      const [pa, pb, pc] = [positionOf(a), positionOf(b), positionOf(c)]
      const tmp = state.perm[pa]
      state.perm[pa] = state.perm[pc]
      state.perm[pc] = state.perm[pb]
      state.perm[pb] = tmp
    }
    cycle('UF', 'UB', 'UR')
    cycle('DF', 'DR', 'DL')
    const trace = traceToFirstBreak(state, 'UF')
    expect(trace.forced).toEqual(['UR', 'UB'])
    expect(new Set(trace.candidates)).toEqual(new Set(['DF', 'FD', 'DR', 'RD', 'DL', 'LD']))
  })

  it('returns null when the solve never needs a break', () => {
    expect(traceToFirstBreak(stateAfter('U'), 'UF')).toBeNull()
    expect(traceToFirstBreak(solvedEdgeState(), 'UF')).toBeNull()
  })

  it('never offers the buffer piece as a break candidate', () => {
    let state = swap(solvedEdgeState(), 'UF', 'UB')
    state = swap(state, 'UR', 'UL')
    const trace = traceToFirstBreak(state, 'UF')
    expect(breakCandidates(trace.state, 'UF').some((s) => positionOf(s) === positionOf('UF'))).toBe(false)
  })
})
