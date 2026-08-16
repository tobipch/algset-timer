// Edge-only cube state for the cycle break trainer: which edge piece sits at
// which edge position, and whether it is flipped. Everything here is plain data
// (no cubing.js import), so the tracing logic stays cheap and testable; the
// conversion to/from a cubing KPattern only touches the raw pattern data.
//
// A "shoot" is one BLD target: the buffer piece and the piece at the target
// swap, with the sticker read at the buffer landing on the target sticker. Two
// shots in a row are exactly one 3-cycle commutator.

import { SPEFFZ_EDGES } from '@/helpers/letters'

// The 12 edge positions in the piece order of cubing's 3x3x3 EDGES orbit, each
// with its two sticker names. Slot 0 is the one the orbit's orientation counts
// from: the U/D sticker in the U/D layer, the F/B sticker for the four E-layer
// edges. Both the order and the slot convention are pinned down by
// edge_state.test.js, which checks them against cubing itself.
export const EDGE_POSITIONS = [
  ['UF', 'FU'], ['UR', 'RU'], ['UB', 'BU'], ['UL', 'LU'],
  ['DF', 'FD'], ['DR', 'RD'], ['DB', 'BD'], ['DL', 'LD'],
  ['FR', 'RF'], ['FL', 'LF'], ['BR', 'RB'], ['BL', 'LB'],
]

export const EDGE_COUNT = EDGE_POSITIONS.length

const LOCATIONS = new Map()
EDGE_POSITIONS.forEach((stickers, position) => {
  stickers.forEach((name, slot) => LOCATIONS.set(name, { position, slot }))
})

// 'FU' -> {position: 0, slot: 1}
export const stickerLocation = (name) => LOCATIONS.get(name) ?? null

// Position index -> the name the position is called by ('UF', 'FR', ...).
export const positionName = (position) => EDGE_POSITIONS[position]?.[0] ?? null

// The position a sticker (or a position name) belongs to.
export const positionOf = (name) => stickerLocation(name)?.position ?? null

export const solvedEdgeState = () => ({
  perm: EDGE_POSITIONS.map((_, i) => i),
  ori: EDGE_POSITIONS.map(() => 0),
})

export const cloneEdgeState = (state) => ({ perm: state.perm.slice(), ori: state.ori.slice() })

export const edgeStatesEqual = (a, b) =>
  !!a && !!b &&
  a.perm.every((v, i) => v === b.perm[i]) &&
  a.ori.every((v, i) => v === b.ori[i])

// The sticker that currently sits at (position, slot).
export const stickerAt = (state, position, slot) =>
  EDGE_POSITIONS[state.perm[position]][(slot + state.ori[position]) % 2]

export const isPieceSolved = (state, position) =>
  state.perm[position] === position && state.ori[position] === 0

export const unsolvedPositions = (state) =>
  state.perm.map((_, p) => p).filter((p) => !isPieceSolved(state, p))

// One target. The piece at the buffer moves to the target position oriented so
// that the sticker read at the buffer ends up on the target sticker; the piece
// that was there comes back to the buffer the same way. Shooting at the
// buffer's own second sticker flips the buffer piece in place.
export const shoot = (state, bufferSticker, targetSticker) => {
  const b = stickerLocation(bufferSticker)
  const t = stickerLocation(targetSticker)
  const next = cloneEdgeState(state)
  if (!b || !t) return next
  if (t.position === b.position) {
    if (t.slot !== b.slot) next.ori[b.position] ^= 1
    return next
  }
  const shift = (b.slot + t.slot) % 2
  next.perm[t.position] = state.perm[b.position]
  next.ori[t.position] = (state.ori[b.position] + shift) % 2
  next.perm[b.position] = state.perm[t.position]
  next.ori[b.position] = (state.ori[t.position] + shift) % 2
  return next
}

// The sticker currently read at the buffer — the next target. Equal to the
// buffer sticker itself exactly when the buffer piece is home and oriented,
// i.e. when the cycle has closed and a break is due.
export const readTarget = (state, bufferSticker) => {
  const b = stickerLocation(bufferSticker)
  return b ? stickerAt(state, b.position, b.slot) : null
}

export const cycleClosed = (state, bufferSticker) =>
  readTarget(state, bufferSticker) === bufferSticker

// Every sticker one may break into: both stickers of every unsolved piece,
// except the buffer piece itself (which is solved whenever a break is due).
export const breakCandidates = (state, bufferSticker) => {
  const b = stickerLocation(bufferSticker)
  const out = []
  for (const p of unsolvedPositions(state)) {
    if (p === b.position) continue
    out.push(...EDGE_POSITIONS[p])
  }
  return out
}

// Walk the solve from the buffer until the first free cycle break. Returns the
// forced targets executed before it, the state at that moment and the stickers
// that may be broken into — or null when the solve never needs a break.
export const traceToFirstBreak = (state, bufferSticker, maxTargets = 32) => {
  let cur = cloneEdgeState(state)
  const forced = []
  for (let i = 0; i < maxTargets; i++) {
    if (unsolvedPositions(cur).length === 0) return null
    const read = readTarget(cur, bufferSticker)
    if (read === bufferSticker) {
      const candidates = breakCandidates(cur, bufferSticker)
      return candidates.length === 0 ? null : { forced, state: cur, candidates }
    }
    forced.push(read)
    cur = shoot(cur, bufferSticker, read)
  }
  return null
}

// The full target sequence of a solve, breaking into the first candidate each
// time a cycle closes. Only used for the "so hätte es weitergehen können"
// hints, never for scoring.
export const traceTargets = (state, bufferSticker, pick = (candidates) => candidates[0], maxTargets = 32) => {
  let cur = cloneEdgeState(state)
  const targets = []
  for (let i = 0; i < maxTargets && unsolvedPositions(cur).length > 0; i++) {
    const read = readTarget(cur, bufferSticker)
    const isBreak = read === bufferSticker
    const target = isBreak ? pick(breakCandidates(cur, bufferSticker)) : read
    if (!target) break
    targets.push({ sticker: target, isBreak })
    cur = shoot(cur, bufferSticker, target)
  }
  return targets
}

// --- conversion to/from cubing pattern data ---------------------------------

export const edgeStateFromPatternData = (patternData) => ({
  perm: patternData.EDGES.pieces.slice(),
  ori: patternData.EDGES.orientation.slice(),
})

// Solved pattern data with the given edge state patched in (corners and
// centers stay solved, so the trainer only ever shows edge cases).
export const patternDataWithEdgeState = (solvedPatternData, state) => {
  const data = structuredClone(solvedPatternData)
  data.EDGES.pieces = state.perm.slice()
  data.EDGES.orientation = state.ori.slice()
  return data
}

// Sanity check used by the tests: every sticker name is part of the Speffz
// scheme the rest of the app speaks.
export const allStickers = () => EDGE_POSITIONS.flat()
export const isKnownSticker = (name) => name in SPEFFZ_EDGES
