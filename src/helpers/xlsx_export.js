import ExcelJS from 'exceljs'
import { letterToSticker, targetLetters, samePiece } from '@/helpers/letters'

// Builds a workbook with one sheet per algset, replicating the layout and
// formatting of the hand-made "UF Times" sheet:
//   row 1:  merged 3-wide column headers "UB (A)" (yellow)
//   row 2:  Alg / Time / Regrips sub-headers (grey)
//   rows:   one row per second letter; cell (col X, row Y) = case XY;
//           same-piece combinations greyed out
//   below:  Average row, best cycle breaks, slowest comms and total regrips

const YELLOW = 'FFFFE599'
const GREY_HEADER = 'FFEFEFEF'
const GREY_BLOCKED = 'FFD9D9D9'
const RED_HEADER = 'FFF4CCCC'
const RED_LIGHT = 'FFFFECEC'
const ORANGE_HEADER = 'FFFCE5CD'

const FONT = { name: 'Roboto', size: 8 }
const FONT_SMALL = { name: 'Roboto', size: 7 }
const FONT_HEADER = { name: 'Roboto', size: 10, bold: true }

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const thin = { style: 'thin' }

// algset: { name, buffer, pieceType }
// rows:   [{ pair, alg, avgS: number|null, regrips: number|null }]
export const addTimesSheet = (wb, algset, rows) => {
  const { buffer, pieceType } = algset
  const letters = targetLetters(buffer)
  const byPair = new Map(rows.map((r) => [r.pair, r]))

  const ws = wb.addWorksheet(sheetName(wb, `${buffer} Times`), {
    views: [{ state: 'frozen', xSplit: 1 }],
  })

  const firstDataRow = 3
  const lastDataRow = firstDataRow + letters.length - 1
  const avgRow = lastDataRow + 1
  const breaksRow = avgRow + 1
  const bottomRow = breaksRow + 4

  // Column widths: A then Alg/Time/Regrips triples
  ws.getColumn(1).width = 13
  letters.forEach((_, i) => {
    ws.getColumn(2 + i * 3).width = 18.25
    ws.getColumn(3 + i * 3).width = 3.88
    ws.getColumn(4 + i * 3).width = 4.88
  })

  const headerLabel = (letter) => `${letterToSticker(letter, pieceType)} (${letter})`

  // Row 1 + 2: column headers
  ws.getCell(1, 1).border = { right: thin }
  const a2 = ws.getCell(2, 1)
  a2.fill = fill(GREY_HEADER)
  a2.border = { right: thin }
  letters.forEach((letter, i) => {
    const c = 2 + i * 3
    ws.mergeCells(1, c, 1, c + 2)
    const head = ws.getCell(1, c)
    head.value = headerLabel(letter)
    head.font = FONT_HEADER
    head.fill = fill(YELLOW)
    ws.getCell(1, c + 2).border = { right: thin }
    const labels = ['Alg', 'Time', 'Regrips']
    labels.forEach((label, j) => {
      const cell = ws.getCell(2, c + j)
      cell.value = label
      cell.font = FONT_SMALL
      cell.fill = fill(GREY_HEADER)
    })
    ws.getCell(2, c + 2).border = { right: thin }
  })

  // Data grid: column = first letter, row = second letter
  letters.forEach((rowLetter, rIdx) => {
    const r = firstDataRow + rIdx
    const rowHead = ws.getCell(r, 1)
    rowHead.value = headerLabel(rowLetter)
    rowHead.font = FONT_HEADER
    rowHead.fill = fill(YELLOW)
    rowHead.border = { right: thin }

    letters.forEach((colLetter, cIdx) => {
      const c = 2 + cIdx * 3
      const algCell = ws.getCell(r, c)
      const timeCell = ws.getCell(r, c + 1)
      const regripCell = ws.getCell(r, c + 2)
      for (const cell of [algCell, timeCell, regripCell]) cell.font = FONT
      timeCell.numFmt = '0.00'
      regripCell.border = { right: thin }

      const blocked = samePiece(
        letterToSticker(colLetter, pieceType),
        letterToSticker(rowLetter, pieceType)
      )
      if (blocked) {
        for (const cell of [algCell, timeCell, regripCell]) cell.fill = fill(GREY_BLOCKED)
        return
      }
      const entry = byPair.get(colLetter + rowLetter)
      if (!entry) return
      algCell.value = `${entry.alg} (${entry.pair})`
      if (entry.avgS != null) timeCell.value = entry.avgS
      if (entry.regrips != null) regripCell.value = entry.regrips
    })
  })

  // Average row
  const avgHead = ws.getCell(avgRow, 1)
  avgHead.value = 'Average'
  avgHead.font = FONT
  avgHead.border = { right: thin }
  letters.forEach((_, i) => {
    const c = 2 + i * 3
    const timeCol = ws.getCell(avgRow, c + 1)
    const regripCol = ws.getCell(avgRow, c + 2)
    const timeRange = `${colName(c + 1)}${firstDataRow}:${colName(c + 1)}${lastDataRow}`
    const regripRange = `${colName(c + 2)}${firstDataRow}:${colName(c + 2)}${lastDataRow}`
    timeCol.value = { formula: `IFERROR(AVERAGE(${timeRange}),"")` }
    timeCol.numFmt = '0.00'
    regripCol.value = { formula: `IFERROR(AVERAGE(${regripRange}),"")` }
    regripCol.numFmt = '0.00'
    for (const cell of [ws.getCell(avgRow, c), timeCol, regripCol]) {
      cell.font = FONT
      cell.border = { top: thin }
    }
    regripCol.border = { top: thin, right: thin }
  })

  // Best cycle breaks: the 3 fastest second letters per column
  const breaksHead = ws.getCell(breaksRow, 1)
  breaksHead.value = 'Best cycle breaks'
  breaksHead.font = FONT
  breaksHead.border = { right: thin }
  letters.forEach((colLetter, i) => {
    const c = 2 + i * 3
    ws.mergeCells(breaksRow, c, breaksRow, c + 2)
    const timed = letters
      .filter((rowLetter) => byPair.get(colLetter + rowLetter)?.avgS != null)
      .sort((x, y) => byPair.get(colLetter + x).avgS - byPair.get(colLetter + y).avgS)
      .slice(0, 3)
    const cell = ws.getCell(breaksRow, c)
    if (timed.length > 0) cell.value = timed.join(',')
    cell.font = FONT
    ws.getCell(breaksRow, c + 2).border = { right: thin }
  })

  // Bottom blocks: slowest comms (left) and total regrips (right)
  const slowHead = ws.getCell(bottomRow, 2)
  ws.mergeCells(bottomRow, 2, bottomRow, 4)
  slowHead.value = 'Slowest comms'
  slowHead.font = FONT_HEADER
  slowHead.fill = fill(RED_HEADER)

  const slowest = rows
    .filter((r) => r.avgS != null)
    .sort((x, y) => y.avgS - x.avgS)
    .slice(0, 10)
  slowest.forEach((entry, i) => {
    const r = bottomRow + 1 + i
    const algCell = ws.getCell(r, 2)
    const timeCell = ws.getCell(r, 3)
    const regripCell = ws.getCell(r, 4)
    algCell.value = `${entry.alg} (${entry.pair})`
    timeCell.value = entry.avgS
    timeCell.numFmt = '0.00'
    if (entry.regrips != null) regripCell.value = entry.regrips
    regripCell.numFmt = '0'
    for (const cell of [algCell, timeCell, regripCell]) {
      cell.font = FONT
      cell.fill = fill(RED_LIGHT)
    }
  })

  const regripHead = ws.getCell(bottomRow, 5)
  regripHead.value = 'Total Regrips'
  regripHead.font = FONT_HEADER
  regripHead.fill = fill(ORANGE_HEADER)
  const totalCell = ws.getCell(bottomRow, 6)
  const regripRanges = letters
    .map((_, i) => `${colName(4 + i * 3)}${firstDataRow}:${colName(4 + i * 3)}${lastDataRow}`)
    .join(',')
  totalCell.value = { formula: `SUM(${regripRanges})` }
  totalCell.font = FONT_HEADER
  totalCell.fill = fill(ORANGE_HEADER)

  const dateCell = ws.getCell(bottomRow + 1, 5)
  dateCell.value = formatToday()
  dateCell.font = { name: 'Roboto', size: 10 }
  const totalValueCell = ws.getCell(bottomRow + 1, 6)
  const totalRegrips = rows.reduce((sum, r) => sum + (r.regrips ?? 0), 0)
  totalValueCell.value = totalRegrips
  totalValueCell.font = { name: 'Roboto', size: 10 }

  return ws
}

// Full export: one sheet per algset entry {algset, rows}
export const buildTimesWorkbook = (entries) => {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Algset Timer'
  wb.created = new Date()
  for (const { algset, rows } of entries) addTimesSheet(wb, algset, rows)
  return wb
}

export const downloadWorkbook = async (wb, filename) => {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// A1-style column name for a 1-based column index
export const colName = (n) => {
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const sheetName = (wb, base) => {
  let name = base
  let i = 2
  while (wb.worksheets.some((ws) => ws.name === name)) name = `${base} ${i++}`
  return name
}

const formatToday = () => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}
