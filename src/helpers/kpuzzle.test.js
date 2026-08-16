import { describe, expect, it } from 'vitest'
import { getKPuzzle, makePattern, samePosition, scrambleForPattern } from './kpuzzle'
import { generateBreakCase } from './cycle_break'
import { edgeStateFromPatternData, patternDataWithEdgeState } from './edge_state'

const kpuzzle = await getKPuzzle()
const solved = kpuzzle.defaultPattern()

const applyMoves = (pattern, moves) => {
  let p = pattern
  for (const m of moves.split(/\s+/).filter(Boolean)) p = p.applyMove(m)
  return p
}

describe('samePosition', () => {
  it('compares the pieces, not the way there', () => {
    expect(samePosition(solved, applyMoves(solved, "U U'"))).toBe(true)
    expect(samePosition(solved, applyMoves(solved, 'U U U U'))).toBe(true)
    expect(samePosition(solved, applyMoves(solved, 'U'))).toBe(false)
    // Six sexy moves are the identity, one is not.
    expect(samePosition(solved, applyMoves(solved, "R U R' U' ".repeat(6)))).toBe(true)
    expect(samePosition(solved, applyMoves(solved, "R U R' U'"))).toBe(false)
  })
})

describe('scrambles for generated break cases', () => {
  it('produces a scramble that reproduces the position from a solved cube', async () => {
    for (const mode of ['inPair', 'afterPair']) {
      const breakCase = generateBreakCase({ mode })
      const pattern = await makePattern(
        kpuzzle,
        patternDataWithEdgeState(solved.patternData, breakCase.state)
      )
      const scramble = await scrambleForPattern(pattern)
      const scrambled = applyMoves(solved, scramble)

      expect(edgeStateFromPatternData(scrambled.patternData)).toEqual(breakCase.state)
      // Only edges are scrambled — the trainer never shows a corner case.
      expect(scrambled.patternData.CORNERS).toEqual(solved.patternData.CORNERS)
      expect(samePosition(scrambled, pattern)).toBe(true)
    }
  }, 60000)
})
