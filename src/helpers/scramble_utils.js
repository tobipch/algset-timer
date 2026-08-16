// Move/alg utilities, taken from Algfolded (https://github.com/tobipch/algfolded).

export const invertMove = (m) => {
  if (!m || m.length === 0) return ""
  if (m[m.length - 1] === '2') return m
  if (m[m.length - 1] === '\'') return m.slice(0, -1)
  return `${m}'`
}

export const inverseScramble = s => {
  return s.split(" ").filter(m => m.length > 0).map(invertMove).reverse().join(" ");
}

export const moveFace = (m) => m[0]

export const moveAmount = (m) => {
  if (m.includes("2")) return 2   // R2 and the R2' spelling of it
  if (m.endsWith("'")) return 3
  return 1
}

// Expand commutator / conjugate notation into a plain move sequence:
//   [A, B] -> A B A' B'   (commutator)
//   [A: B] -> A B A'      (conjugate)
// A and B are themselves sequences that may contain nested brackets. Returns a
// space-joined move string, or null if the brackets/separators are malformed.
export const expandCommutator = (str) => {
  const s = (str || '').trim()
  if (!s) return null
  const invert = (moves) => moves.slice().reverse().map(invertMove)
  let i = 0
  const parseSeq = (stops) => {
    const moves = []
    let buf = ''
    const flush = () => {
      const t = buf.trim()
      if (t) for (const tok of t.split(/\s+/)) moves.push(tok)
      buf = ''
    }
    while (i < s.length) {
      const c = s[i]
      if (stops.includes(c)) break
      if (c === '[') {
        flush()
        i++ // consume '['
        const a = parseSeq([',', ':', ']'])
        const sep = s[i]
        if (a === null || (sep !== ',' && sep !== ':' && sep !== ']')) return null
        i++ // consume separator (or closing bracket of a plain group)
        if (sep === ']') {
          // "[A]" without separator: just a bracketed move sequence
          moves.push(...a)
          continue
        }
        const b = parseSeq([']'])
        if (b === null || s[i] !== ']') return null
        i++ // consume ']'
        if (sep === ',') moves.push(...a, ...b, ...invert(a), ...invert(b))
        else moves.push(...a, ...b, ...invert(a))
      } else if (c === ']' || c === ',' || c === ':') {
        return null // stray separator/closer at this level
      } else {
        buf += c
        i++
      }
    }
    flush()
    return moves
  }
  const result = parseSeq([])
  if (result === null || i < s.length) return null
  return result.join(' ')
}

// One turn inside a token: face (optionally wide), amount, prime.
const MOVE_PART = /^([UDFBLRMESudfblrxyz]w?)(\d*)('*)/

// Turns of two opposite layers that are done at the same time are written as
// one token: "DU" is D and U together, "DU'" both the other way round. Split
// them into ordinary moves ("D U" / "D' U'") — opposite faces commute, so that
// is the very same alg, and only in that form can it be applied to a virtual
// cube or inverted. Anything that doesn't read as a run of turns is left alone.
//
// This has to happen before an alg is expanded or inverted: the inverse of
// "DU" is "D' U'", so inverting the token as a whole ("DU'") would flip only
// the last layer.
export const splitCompoundMoves = (alg) =>
  (alg || '').replace(/[A-Za-z0-9']+/g, (word) => {
    const parts = []
    let rest = word
    while (rest.length > 0) {
      const m = MOVE_PART.exec(rest)
      if (!m || m[0].length === 0) return word
      parts.push({ face: m[1], amount: m[2], prime: m[3] })
      rest = rest.slice(m[0].length)
    }
    if (parts.length < 2) return word
    // A modifier written after the last face belongs to the whole token
    // ("DU'" = D' U'), one per face is taken as written ("D2U'" = D2 U').
    const last = parts[parts.length - 1]
    const distribute =
      (last.amount || last.prime) && parts.slice(0, -1).every((p) => !p.amount && !p.prime)
    return parts
      .map((p) => (distribute ? p.face + last.amount + last.prime : p.face + p.amount + p.prime))
      .join(' ')
  })

// The plain move sequence for an alg, expanding commutator notation when
// present (otherwise the alg as-is). '' if commutator notation is malformed.
// The expansion is condensed ("[R' B' R: [R D R', U']]" seams as R2, not R R)
// so setups and playback never show back-to-back same-face moves.
export const algToMoveString = (alg) => {
  const normalized = splitCompoundMoves(alg)
  if (/[[\],:]/.test(normalized)) {
    const expanded = expandCommutator(normalized)
    return expanded === null ? '' : condenseMoves(expanded)
  }
  return normalized
}

// Merge adjacent moves of the same base token ("R2 R" -> "R'", "x x'" -> gone;
// works for wide/slice moves and rotations too), so a commutator expanded for
// display reads like a hand-written alg instead of "R' B' R R D ...".
export const condenseMoves = (moveStr) => {
  let tokens = (moveStr || '').split(/\s+/).filter(Boolean)
  for (;;) {
    const out = []
    for (const tok of tokens) {
      const base = tok.replace(/['2]+$/, '')
      const prev = out[out.length - 1]
      if (prev && prev.replace(/['2]+$/, '') === base) {
        out.pop()
        const merged = amountToMove(base, moveAmount(prev) + moveAmount(tok))
        if (merged) out.push(merged)
      } else {
        out.push(tok)
      }
    }
    if (out.length === tokens.length) return out.join(' ')
    tokens = out
  }
}

export const amountToMove = (face, amount) => {
  const a = ((amount % 4) + 4) % 4
  if (a === 0) return null
  if (a === 1) return face
  if (a === 2) return face + '2'
  return face + "'"
}

// How each rotation remaps face positions: rotation → { newPosition: originalFace }
export const ROTATION_MAP = {
  'x':   { U:'F', D:'B', F:'D', B:'U', L:'L', R:'R' },
  "x'":  { U:'B', D:'F', F:'U', B:'D', L:'L', R:'R' },
  'x2':  { U:'D', D:'U', F:'B', B:'F', L:'L', R:'R' },
  'y':   { U:'U', D:'D', F:'R', B:'L', L:'F', R:'B' },
  "y'":  { U:'U', D:'D', F:'L', B:'R', L:'B', R:'F' },
  'y2':  { U:'U', D:'D', F:'B', B:'F', L:'R', R:'L' },
  'z':   { U:'L', D:'R', F:'F', B:'B', L:'D', R:'U' },
  "z'":  { U:'R', D:'L', F:'F', B:'B', L:'U', R:'D' },
  'z2':  { U:'D', D:'U', F:'F', B:'B', L:'R', R:'L' },
}

export function applyRotation(map, rot) {
  const rmap = ROTATION_MAP[rot]
  if (!rmap) return map
  const result = {}
  for (const face of Object.keys(rmap)) {
    result[face] = map[rmap[face]]
  }
  return result
}

// Build a function that remaps cube-reported moves to match the user's oriented frame.
// With z2 orientation: D' → U', D2 → U2, etc. (face swap, direction preserved).
// Returns null if no orientation is set.
export function buildMoveRemap(orientationString) {
  const rotations = (orientationString || '').trim().split(/\s+/).filter(Boolean)
  if (rotations.length === 0) return null

  // Build position→originalFace mapping
  let mapping = { U:'U', D:'D', F:'F', B:'B', L:'L', R:'R' }
  for (const rot of rotations) {
    mapping = applyRotation(mapping, rot)
  }

  // Invert to get standardFace→userPosition
  const inverse = {}
  for (const [pos, face] of Object.entries(mapping)) {
    inverse[face] = pos
  }

  return (move) => {
    const face = moveFace(move)
    const target = inverse[face]
    if (!target || target === face) return move
    return target + move.slice(1)
  }
}
