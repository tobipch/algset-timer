import {describe, expect, it} from 'vitest'
import {
  CORNER_BUFFER_ORDER,
  EDGE_BUFFER_ORDER,
  SPEFFZ_CORNERS,
  SPEFFZ_EDGES,
  bufferOrderFor,
  letterToSticker,
  samePiece,
  stickerToLetter,
  targetLetters,
} from './letters'

describe('letters', () => {
  it('maps stickers to Speffz letters', () => {
    expect(stickerToLetter('UB')).toBe('A')
    expect(stickerToLetter('UR')).toBe('B')
    expect(stickerToLetter('DL')).toBe('X')
    expect(stickerToLetter('UFR')).toBe('C')
    expect(stickerToLetter('DBL')).toBe('X')
  })

  it('maps letters back to stickers per piece type', () => {
    expect(letterToSticker('A', 'edge')).toBe('UB')
    expect(letterToSticker('A', 'corner')).toBe('UBL')
  })

  it('detects same-piece stickers', () => {
    expect(samePiece('UB', 'BU')).toBe(true)
    expect(samePiece('UB', 'UR')).toBe(false)
    expect(samePiece('UFR', 'RUF')).toBe(true)
    expect(samePiece('UFR', 'FUL')).toBe(false)
  })

  it('lists 22 targets for an edge buffer (buffer piece excluded)', () => {
    const letters = targetLetters('UF')
    expect(letters).toHaveLength(22)
    expect(letters).not.toContain('C') // UF
    expect(letters).not.toContain('I') // FU
    expect(letters[0]).toBe('A')
  })

  it('lists 21 targets for a corner buffer', () => {
    const letters = targetLetters('UFR')
    expect(letters).toHaveLength(21)
    expect(letters).not.toContain('C') // UFR
    expect(letters).not.toContain('J') // FUR
    expect(letters).not.toContain('M') // RUF
  })

  it('names real stickers in both buffer orders', () => {
    expect(EDGE_BUFFER_ORDER.every((s) => s in SPEFFZ_EDGES)).toBe(true)
    expect(CORNER_BUFFER_ORDER.every((s) => s in SPEFFZ_CORNERS)).toBe(true)
    expect(new Set(EDGE_BUFFER_ORDER).size).toBe(EDGE_BUFFER_ORDER.length)
    expect(bufferOrderFor('edge')).toBe(EDGE_BUFFER_ORDER)
    expect(bufferOrderFor('corner')).toBe(CORNER_BUFFER_ORDER)
  })
})
