import {describe, expect, it} from 'vitest'
import {algToMoveString, expandCommutator, inverseScramble, condenseMoves} from './scramble_utils'

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
