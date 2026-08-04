import { pieceTypeOf, stickerToLetter, targetLetters, samePiece, letterToSticker } from '@/helpers/letters'
import { algToMoveString } from '@/helpers/scramble_utils'

// --- Simple text format -----------------------------------------------------
// One case per line, two supported spellings:
//   BA: [R2 U': [R2, S]]          (pair first, separated by : ; tab or spaces)
//   [R2 U': [R2, S]] (BA)         (alg with the pair in parentheses at the end,
//                                  i.e. exactly how the cells in the BLD sheet look)
// Empty lines and lines starting with # or // are ignored.

const LEADING_PAIR = /^([A-Xa-x]{2})\s*[:,;\t]\s*(.+)$/
const LEADING_PAIR_SPACE = /^([A-Xa-x]{2})\s+(.+)$/
const TRAILING_PAIR = /^(.+?)\s*\(([A-Xa-x]{2})\)\s*$/

// A pasted spreadsheet row carries extra columns (time, regrips, ...) after
// the alg cell. Keep the first tab-cell when the rest is numeric/empty.
const stripExtraColumns = (line) => {
  if (!line.includes('\t')) return line
  const cells = line.split('\t').map((c) => c.trim())
  const rest = cells.slice(1)
  if (cells[0] && rest.every((c) => c === '' || /^[\d.,]+$/.test(c))) return cells[0]
  return line
}

export const parseSimpleText = (text, buffer) => {
  const pieceType = pieceTypeOf(buffer)
  const valid = new Set(targetLetters(buffer))
  const cases = []
  const errors = []
  const seen = new Map()

  const lines = (text || '').split('\n')
  lines.forEach((rawLine, idx) => {
    const line = stripExtraColumns(rawLine.trim())
    if (!line || line.startsWith('#') || line.startsWith('//')) return

    let pair = null
    let alg = null
    let m
    if ((m = line.match(TRAILING_PAIR))) {
      alg = m[1].trim()
      pair = m[2].toUpperCase()
    } else if ((m = line.match(LEADING_PAIR))) {
      pair = m[1].toUpperCase()
      alg = m[2].trim()
    } else if ((m = line.match(LEADING_PAIR_SPACE)) && !m[2].startsWith('(')) {
      // "BA [R2 ...]" — only when the rest doesn't look like a trailing pair
      pair = m[1].toUpperCase()
      alg = m[2].trim()
    } else {
      errors.push(`Zeile ${idx + 1}: Format nicht erkannt: "${line}"`)
      return
    }

    const problem = validateCase(pair, alg, valid, pieceType)
    if (problem) {
      errors.push(`Zeile ${idx + 1}: ${problem}`)
      return
    }
    if (seen.has(pair)) {
      errors.push(`Zeile ${idx + 1}: Case ${pair} ist doppelt (Zeile ${seen.get(pair)})`)
      return
    }
    seen.set(pair, idx + 1)
    cases.push({ pair, alg })
  })

  return { cases: sortCases(cases), errors }
}

// --- Algfolded JSON format --------------------------------------------------
// The raw commutator files from Algfolded (edge_comms.json / corner_comms.json):
//   { "<caseId>": { "algs": [...], "buffers": { "<buffer>": ["<t1>", "<t2>"] } } }
// Cases are filtered to the chosen buffer, the pair letters come from the two
// targets (Speffz), and the first alg of each case is used.

export const parseAlgfoldedJson = (text, buffer) => {
  const pieceType = pieceTypeOf(buffer)
  const valid = new Set(targetLetters(buffer))
  const cases = []
  const errors = []

  let raw
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { cases: [], errors: ['Kein gültiges JSON: ' + e.message] }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { cases: [], errors: ['JSON hat nicht das erwartete Format (Objekt mit Cases)'] }
  }

  const seen = new Map()
  for (const [id, c] of Object.entries(raw)) {
    const targets = c?.buffers?.[buffer]
    if (!targets) continue // case doesn't involve the chosen buffer piece
    if (!Array.isArray(targets) || targets.length !== 2) {
      errors.push(`Case ${id}: buffers["${buffer}"] hat nicht genau 2 Targets`)
      continue
    }
    const alg = Array.isArray(c.algs) ? c.algs.find((a) => typeof a === 'string' && a.trim()) : null
    if (!alg) {
      errors.push(`Case ${id}: kein Algorithmus vorhanden`)
      continue
    }
    const letters = targets.map((t) => stickerToLetter(t))
    if (letters.some((l) => !l)) {
      errors.push(`Case ${id}: unbekannte Sticker ${targets.join(', ')}`)
      continue
    }
    const pair = letters.join('')
    const problem = validateCase(pair, alg.trim(), valid, pieceType)
    if (problem) {
      errors.push(`Case ${id}: ${problem}`)
      continue
    }
    if (seen.has(pair)) {
      errors.push(`Case ${id}: Pair ${pair} ist doppelt (bereits aus Case ${seen.get(pair)})`)
      continue
    }
    seen.set(pair, id)
    cases.push({ pair, alg: alg.trim() })
  }

  return { cases: sortCases(cases), errors }
}

const validateCase = (pair, alg, validLetters, pieceType) => {
  const [a, b] = pair.split('')
  if (!validLetters.has(a)) return `Buchstabe ${a} ist kein gültiges Target für diesen Buffer`
  if (!validLetters.has(b)) return `Buchstabe ${b} ist kein gültiges Target für diesen Buffer`
  if (samePiece(letterToSticker(a, pieceType), letterToSticker(b, pieceType))) {
    return `${pair}: beide Targets liegen auf demselben Piece`
  }
  if (!algToMoveString(alg)) return `Algorithmus "${alg}" ist ungültig (Klammern prüfen)`
  return null
}

const sortCases = (cases) =>
  cases
    .slice()
    .sort((x, y) => x.pair.localeCompare(y.pair))
    .map((c, i) => ({ ...c, sortIndex: i }))
