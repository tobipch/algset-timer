// Cycle break trainer: generate positions whose first free break choice falls
// either inside the first letter pair (UF-UB-[BREAK] → "A[BREAK]") or right
// after it (UF-UB-UR [BREAK] → "AB [BREAK]"), and score the choice that was
// made.
//
// Scoring (as trained for):
//   * break inside the pair — the first target is fixed, so the choice is just
//     the second letter of the commutator: pick one of the fastest comms.
//   * break after the pair — the whole next commutator hinges on the choice, so
//     what counts is shooting to the next buffer of the personal buffer order
//     (that is what can turn into a sandwich later on); the average speed of
//     that piece is only the tie breaker.

import { EDGE_BUFFER_ORDER, stickerToLetter } from '@/helpers/letters'
import {
  EDGE_POSITIONS,
  positionName,
  positionOf,
  readTarget,
  shoot,
  solvedEdgeState,
  traceToFirstBreak,
  unsolvedPositions,
} from '@/helpers/edge_state'

export const BREAK_MODES = ['inPair', 'afterPair']

export const MODE_LABELS = {
  inPair: 'Break im Letterpair (A[BREAK])',
  afterPair: 'Break nach dem Letterpair (AB [BREAK])',
}

// How many of the ranked options still count as a good pick.
export const EXCELLENT_RANK = 3
export const OK_RANK = 7

// --- position generation ----------------------------------------------------

const shuffled = (values, random) => {
  const out = values.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const randomInt = (min, max, random) => min + Math.floor(random() * (max - min + 1))

// Parity of the permutation (even = reachable with solved corners).
const permutationIsEven = (perm) => {
  const seen = new Array(perm.length).fill(false)
  let cycles = 0
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue
    cycles++
    for (let j = i; !seen[j]; j = perm[j]) seen[j] = true
  }
  return (perm.length - cycles) % 2 === 0
}

// A random edge-only position with `count` unsolved edges (the buffer piece
// among them) that a real cube can actually be in: even edge permutation
// (corners stay solved) and an even number of flips.
const randomEdgePosition = (bufferPosition, count, random) => {
  const others = EDGE_POSITIONS.map((_, i) => i).filter((i) => i !== bufferPosition)
  const positions = [bufferPosition, ...shuffled(others, random).slice(0, count - 1)]
  const pieces = shuffled(positions, random)

  const state = solvedEdgeState()
  positions.forEach((p, i) => {
    state.perm[p] = pieces[i]
    state.ori[p] = random() < 0.5 ? 1 : 0
  })
  if (state.ori.reduce((a, b) => a + b, 0) % 2 !== 0) state.ori[positions[0]] ^= 1

  // Every chosen piece has to be genuinely unsolved, and nothing outside the
  // chosen set may have moved.
  if (positions.some((p) => state.perm[p] === p && state.ori[p] === 0)) return null
  if (!permutationIsEven(state.perm)) return null
  return state
}

/**
 * Draw a position whose first free cycle break sits exactly where the mode
 * wants it. Returns null if nothing was found within `attempts` tries.
 *
 * The buffer piece is always unsolved: with a solved buffer the solve would
 * start with a float instead of a first commutator, and floating is exactly
 * what this drill is not about.
 */
export const generateBreakCase = ({
  buffer = 'UF',
  mode = 'inPair',
  random = Math.random,
  minUnsolved = 4,
  maxUnsolved = 6,
  // Im Letterpair entscheiden die Ränge 3 und 7 über die Wertung — mit nur
  // vier Optionen wäre die Wahl kaum noch eine. Nach dem Pair zählt die
  // Buffer-Reihenfolge, da sind auch vier Optionen eine echte Entscheidung.
  minCandidates = mode === 'inPair' ? 6 : 4,
  attempts = 4000,
  accept = null,
} = {}) => {
  const bufferPosition = positionOf(buffer)
  if (bufferPosition === null || !BREAK_MODES.includes(mode)) return null
  const forcedTargetCount = mode === 'inPair' ? 1 : 2

  for (let i = 0; i < attempts; i++) {
    const state = randomEdgePosition(bufferPosition, randomInt(minUnsolved, maxUnsolved, random), random)
    if (!state) continue

    const trace = traceToFirstBreak(state, buffer)
    if (!trace || trace.forced.length !== forcedTargetCount) continue
    // A flipped buffer would make the first target the buffer's own second
    // sticker — that "comm" is not part of any algset, so it can't be rated.
    if (trace.forced.some((t) => positionOf(t) === bufferPosition)) continue
    if (trace.candidates.length < minCandidates) continue

    const breakCase = {
      buffer,
      mode,
      state,
      unsolvedCount: unsolvedPositions(state).length,
      forcedTargets: trace.forced,
      breakState: trace.state,
      candidates: trace.candidates,
    }
    // After a pair the whole point is shooting to the next buffer of the
    // order, so at least one of the options has to be one.
    if (mode === 'afterPair' && !candidatePositions(breakCase).some((p) => EDGE_BUFFER_ORDER.includes(p.name))) {
      continue
    }
    if (accept && !accept(breakCase)) continue
    return breakCase
  }
  return null
}

// The distinct pieces that may be broken into.
export const candidatePositions = (breakCase) => {
  const seen = new Map()
  for (const sticker of breakCase.candidates) {
    const position = positionOf(sticker)
    if (!seen.has(position)) seen.set(position, { position, name: positionName(position), stickers: [] })
    seen.get(position).stickers.push(sticker)
  }
  return [...seen.values()]
}

/**
 * The position after the commutator that contains the break, plus the target
 * that the choice forces next.
 *   inPair    — the break is the second target, the comm ends right there.
 *   afterPair — the break opens a new comm, its second target follows from the
 *               cube (that is why only the break itself is a choice).
 */
export const choiceOutcome = (breakCase, sticker) => {
  const afterBreak = shoot(breakCase.breakState, breakCase.buffer, sticker)
  if (breakCase.mode === 'inPair') return { state: afterBreak, followUp: null }
  const followUp = readTarget(afterBreak, breakCase.buffer)
  return { state: shoot(afterBreak, breakCase.buffer, followUp), followUp }
}

// The letter pair the choice produces (null when the two targets share a piece,
// which happens when breaking into a flipped-in-place edge — no such comm
// exists in an algset).
export const choicePair = (breakCase, sticker) => {
  const first = breakCase.mode === 'inPair' ? breakCase.forcedTargets[0] : sticker
  const second = breakCase.mode === 'inPair' ? sticker : choiceOutcome(breakCase, sticker).followUp
  if (!first || !second || positionOf(first) === positionOf(second)) return null
  return stickerToLetter(first) + stickerToLetter(second)
}

// --- algset lookup ----------------------------------------------------------

/**
 * Everything the rating needs from the measured algset:
 *   times          pair -> trimmed average in ms
 *   columnAverages first letter -> average over all measured comms starting
 *                  with it ("how fast is that piece on average", the Average
 *                  row of the sheet)
 *   columnRanks    pair -> rank of that comm among all measured comms with the
 *                  same first letter (1 = fastest)
 */
export const buildAlgsetIndex = (algset) => {
  const times = new Map()
  const byFirstLetter = new Map()
  for (const c of algset?.cases ?? []) {
    const avgMs = c.result?.avgMs
    if (!Number.isFinite(avgMs)) continue
    times.set(c.pair, avgMs)
    const first = c.pair[0]
    if (!byFirstLetter.has(first)) byFirstLetter.set(first, [])
    byFirstLetter.get(first).push({ pair: c.pair, avgMs })
  }
  const columnAverages = new Map()
  const columnRanks = new Map()
  for (const [letter, entries] of byFirstLetter) {
    columnAverages.set(letter, entries.reduce((s, e) => s + e.avgMs, 0) / entries.length)
    entries
      .slice()
      .sort((a, b) => a.avgMs - b.avgMs)
      .forEach((e, i) => columnRanks.set(e.pair, i + 1))
  }
  return { times, columnAverages, columnRanks, measured: times.size }
}

export const emptyAlgsetIndex = () => buildAlgsetIndex(null)

// --- rating -----------------------------------------------------------------

const compareNullsLast = (a, b) => {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

/**
 * All options of a break case, best first.
 *
 * inPair:   sorted by the measured comm time. `scope` decides what the rank
 *           counts against — 'available' ranks among the options this position
 *           actually offers, 'algset' uses the rank the comm has among every
 *           measured comm of that column (the "best cycle breaks" list).
 * afterPair: sorted by the personal buffer order, average piece speed breaks
 *           ties.
 */
export const rankedOptions = (breakCase, index, { bufferOrder = EDGE_BUFFER_ORDER, scope = 'available' } = {}) => {
  const bufferPositionName = positionName(positionOf(breakCase.buffer))
  const order = bufferOrder.filter((name) => name !== bufferPositionName)

  const options = breakCase.candidates.map((sticker) => {
    const position = positionOf(sticker)
    const name = positionName(position)
    const pair = choicePair(breakCase, sticker)
    const orderIndex = order.indexOf(name)
    const letter = stickerToLetter(sticker)
    const columnLetter = breakCase.mode === 'inPair' ? pair?.[0] ?? null : letter
    return {
      sticker,
      letter,
      position,
      positionName: name,
      pair,
      avgMs: pair ? index.times.get(pair) ?? null : null,
      columnAvgMs: columnLetter ? index.columnAverages.get(columnLetter) ?? null : null,
      algsetRank: pair ? index.columnRanks.get(pair) ?? null : null,
      bufferOrderIndex: orderIndex === -1 ? null : orderIndex,
    }
  })

  if (breakCase.mode === 'inPair') {
    options.sort((a, b) => compareNullsLast(a.avgMs, b.avgMs) || a.letter.localeCompare(b.letter))
  } else {
    options.sort(
      (a, b) =>
        compareNullsLast(a.bufferOrderIndex, b.bufferOrderIndex) ||
        compareNullsLast(a.columnAvgMs, b.columnAvgMs) ||
        a.letter.localeCompare(b.letter)
    )
  }

  return options.map((o, i) => ({
    ...o,
    rank: i + 1,
    // What the rating actually counts against.
    ratingRank:
      breakCase.mode === 'inPair'
        ? scope === 'algset'
          ? o.algsetRank
          : o.avgMs === null
            ? null
            : i + 1
        : i + 1,
  }))
}

/**
 * Score a break choice.
 *   excellent — one of the 3 fastest comms; after a pair: the next buffer of
 *               the order.
 *   ok        — one of the 7 fastest comms (only exists inside a pair).
 *   weak      — anything else.
 *   unknown   — inside a pair with no measured time for that comm.
 */
export const rateChoice = (breakCase, sticker, index, options = {}) => {
  const ranked = rankedOptions(breakCase, index, options)
  const chosen = ranked.find((o) => o.sticker === sticker) ?? null
  const best = ranked[0] ?? null

  if (!chosen) return { rating: 'unknown', chosen: null, best, options: ranked, reason: 'Diese Wahl gehört nicht zu den möglichen Breaks.' }

  if (breakCase.mode === 'afterPair') {
    const bestIsBuffer = best?.bufferOrderIndex !== null && best?.bufferOrderIndex !== undefined
    const excellent = chosen.positionName === best?.positionName
    return {
      rating: excellent ? 'excellent' : 'weak',
      chosen,
      best,
      options: ranked,
      reason: excellent
        ? bestIsBuffer
          ? `${chosen.positionName} ist der nächste Buffer deiner Reihenfolge — das kann später ein Sandwich geben.`
          : `${chosen.positionName} ist von den Optionen das im Schnitt schnellste Piece.`
        : bestIsBuffer
          ? `${best.positionName} liegt in deiner Buffer-Reihenfolge weiter vorne als ${chosen.positionName}.`
          : `${best.positionName} hat im Schnitt die schnelleren Comms.`,
    }
  }

  if (chosen.ratingRank === null) {
    return {
      rating: 'unknown',
      chosen,
      best,
      options: ranked,
      reason: `Für ${chosen.pair ?? chosen.letter} ist noch keine Zeit gemessen — nicht bewertbar.`,
    }
  }
  const rating = chosen.ratingRank <= EXCELLENT_RANK ? 'excellent' : chosen.ratingRank <= OK_RANK ? 'ok' : 'weak'
  return {
    rating,
    chosen,
    best,
    options: ranked,
    reason:
      rating === 'excellent'
        ? `${chosen.pair} gehört zu den ${EXCELLENT_RANK} schnellsten Comms.`
        : rating === 'ok'
          ? `${chosen.pair} liegt unter den ${OK_RANK} schnellsten Comms.`
          : `${chosen.pair} ist Rang ${chosen.ratingRank}${best?.pair ? ` — am schnellsten wäre ${best.pair} gewesen` : ''}.`,
  }
}

export const RATING_LABELS = {
  excellent: { label: 'Exzellent', emoji: '⚡', variant: 'success' },
  ok: { label: 'In Ordnung', emoji: '🕊️', variant: 'warning' },
  weak: { label: 'Schwach', emoji: '🥀', variant: 'danger' },
  unknown: { label: 'Nicht bewertbar', emoji: '❓', variant: 'secondary' },
}

// Convenience for the UI: the letters of the forced targets before the break.
export const forcedLetters = (breakCase) => breakCase.forcedTargets.map(stickerToLetter)
