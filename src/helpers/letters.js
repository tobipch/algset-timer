// Speffz letter scheme (matches the letters used in the BLD sheets).
export const SPEFFZ_EDGES = {
  UB: 'A', UR: 'B', UF: 'C', UL: 'D',
  LU: 'E', LF: 'F', LD: 'G', LB: 'H',
  FU: 'I', FR: 'J', FD: 'K', FL: 'L',
  RU: 'M', RB: 'N', RD: 'O', RF: 'P',
  BU: 'Q', BL: 'R', BD: 'S', BR: 'T',
  DF: 'U', DR: 'V', DB: 'W', DL: 'X',
}

export const SPEFFZ_CORNERS = {
  UBL: 'A', UBR: 'B', UFR: 'C', UFL: 'D',
  LUB: 'E', LUF: 'F', LDF: 'G', LDB: 'H',
  FUL: 'I', FUR: 'J', FDR: 'K', FDL: 'L',
  RUF: 'M', RUB: 'N', RDB: 'O', RDF: 'P',
  BUR: 'Q', BUL: 'R', BDL: 'S', BDR: 'T',
  DFL: 'U', DFR: 'V', DBR: 'W', DBL: 'X',
}

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWX'.split('')

const invert = (map) => {
  const out = {}
  for (const [sticker, letter] of Object.entries(map)) out[letter] = sticker
  return out
}

const EDGE_BY_LETTER = invert(SPEFFZ_EDGES)
const CORNER_BY_LETTER = invert(SPEFFZ_CORNERS)

export const pieceTypeOf = (sticker) => (sticker.length === 3 ? 'corner' : 'edge')

export const letterToSticker = (letter, pieceType) =>
  (pieceType === 'corner' ? CORNER_BY_LETTER : EDGE_BY_LETTER)[letter] ?? null

export const stickerToLetter = (sticker) =>
  pieceTypeOf(sticker) === 'corner' ? SPEFFZ_CORNERS[sticker] : SPEFFZ_EDGES[sticker]

// Two stickers belong to the same physical piece iff they touch the same faces.
export const samePiece = (a, b) =>
  a.split('').sort().join('') === b.split('').sort().join('')

// All letters that can be a target for the given buffer: every letter whose
// sticker is not on the buffer piece itself. Speffz order.
export const targetLetters = (buffer) => {
  const pieceType = pieceTypeOf(buffer)
  return LETTERS.filter((l) => !samePiece(letterToSticker(l, pieceType), buffer))
}

// "BA" -> ['UR', 'UB'] (for edges)
export const pairToStickers = (pair, pieceType) =>
  pair.split('').map((l) => letterToSticker(l, pieceType))

// Buffers offered in the upload form: the common trainer buffers first,
// then every remaining sticker.
const withRest = (preferred, all) => [...preferred, ...all.filter((s) => !preferred.includes(s))]
export const EDGE_BUFFERS = withRest(
  ['UF', 'UB', 'UR', 'UL', 'FR', 'FL', 'DF', 'DB', 'DR', 'DL'],
  Object.keys(SPEFFZ_EDGES)
)
export const CORNER_BUFFERS = withRest(
  ['UFR', 'UFL', 'UBR', 'UBL', 'RDF', 'FDL'],
  Object.keys(SPEFFZ_CORNERS)
)
