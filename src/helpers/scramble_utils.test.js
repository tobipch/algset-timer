import {describe, expect, it} from 'vitest'
import {
  algToMoveString,
  condenseMoves,
  expandCommutator,
  inverseScramble,
  splitCompoundMoves,
} from './scramble_utils'

describe('expandCommutator', () => {
  it('expands a pure commutator', () => {
    expect(expandCommutator("[M', U2]")).toBe("M' U2 M U2")
  })

  it('expands a conjugated commutator', () => {
    expect(expandCommutator("[R2 U': [R2, S]]")).toBe("R2 U' R2 S R2 S' U R2")
  })

  it('expands nested setups', () => {
    expect(expandCommutator("[U' M2 U': [M, U2]]")).toBe("U' M2 U' M U2 M' U2 U M2 U")
  })

  it('accepts a bracketed plain sequence (sheet style)', () => {
    expect(expandCommutator("[M U' M' U' M U' M' U']")).toBe("M U' M' U' M U' M' U'")
    expect(expandCommutator("[D': [S, L F' L']]")).toBe("D' S L F' L' S' L F L' D")
  })

  it('rejects malformed input', () => {
    expect(expandCommutator('[R2, S')).toBeNull()
    expect(expandCommutator('R], S')).toBeNull()
  })
})

describe('algToMoveString', () => {
  it('condenses seams between setup and inner moves', () => {
    expect(algToMoveString("[U' M2 U': [M, U2]]")).toBe("U' M2 U' M U2 M' U' M2 U")
  })

  it('passes through plain move sequences', () => {
    expect(algToMoveString("M U' M' U' M U' M' U'")).toBe("M U' M' U' M U' M' U'")
  })

  it('returns empty string for malformed commutators', () => {
    expect(algToMoveString('[R2, S')).toBe('')
  })
})

describe('inverseScramble', () => {
  it('inverts order and directions', () => {
    expect(inverseScramble("R U2 M'")).toBe("M U2 R'")
  })
})

describe('condenseMoves', () => {
  it('merges same-face moves', () => {
    expect(condenseMoves("R2 R U U'")).toBe("R'")
  })
})

// Zwei gleichzeitig gedrehte Ebenen als ein Token, wie in den 3-Style-Sheets.
describe('splitCompoundMoves', () => {
  it('splits simultaneous turns into ordinary moves', () => {
    expect(splitCompoundMoves('DU')).toBe('D U')
    expect(splitCompoundMoves('R U R\' DU')).toBe("R U R' D U")
  })

  it('lets a trailing modifier apply to the whole token', () => {
    expect(splitCompoundMoves("DU'")).toBe("D' U'")
    expect(splitCompoundMoves('DU2')).toBe('D2 U2')
  })

  it('keeps modifiers that are written per face', () => {
    expect(splitCompoundMoves("D'U'")).toBe("D' U'")
    expect(splitCompoundMoves('D2U2')).toBe('D2 U2')
    expect(splitCompoundMoves("D2U'")).toBe("D2 U'")
  })

  it('leaves ordinary moves and bracket structure alone', () => {
    expect(splitCompoundMoves("R2 U' Rw2 M'")).toBe("R2 U' Rw2 M'")
    expect(splitCompoundMoves("[R U R' DU: [U2, R D R']]")).toBe("[R U R' D U: [U2, R D R']]")
    expect(splitCompoundMoves('')).toBe('')
  })
})

describe('algs with simultaneous turns', () => {
  const BRACKET = "[R U R' DU: [U2, R D R']]"
  const WRITTEN = "R U R' DU U2 R D R' U2 R D' R' DU' R U' R'"

  it('expands the commutator with the compound token split up', () => {
    expect(algToMoveString(BRACKET)).toBe("R U R' D U' R D R' U2 R D' R' U' D' R U' R'")
  })

  it('reads the written-out spelling the same way', () => {
    expect(algToMoveString(WRITTEN)).toBe("R U R' D U U2 R D R' U2 R D' R' D' U' R U' R'")
  })

  it('inverts such an alg move by move (that is the pre-alg state)', () => {
    expect(inverseScramble(algToMoveString('DU'))).toBe("U' D'")
  })
})
