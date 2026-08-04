import {describe, expect, it} from 'vitest'
import {buildTimesWorkbook, colName} from './xlsx_export'

const algset = {name: 'UF Comms', buffer: 'UF', pieceType: 'edge'}
const rows = [
  {pair: 'AB', alg: "[R2 U': [S, R2]]", avgS: 0.8, regrips: 1},
  {pair: 'AU', alg: '[U2, M\']', avgS: 0.56, regrips: 0},
  {pair: 'AW', alg: '[M, U2]', avgS: 0.49, regrips: 0},
  {pair: 'BA', alg: "[R2 U': [R2, S]]", avgS: 0.96, regrips: 0},
  {pair: 'DA', alg: "[U' M2 U': [M, U2]]", avgS: 1.02, regrips: 0},
  {pair: 'UA', alg: "[M', U2]", avgS: null, regrips: null},
]

describe('colName', () => {
  it('converts 1-based indices to A1 letters', () => {
    expect(colName(1)).toBe('A')
    expect(colName(26)).toBe('Z')
    expect(colName(27)).toBe('AA')
    expect(colName(67)).toBe('BO')
  })
})

describe('buildTimesWorkbook', () => {
  const wb = buildTimesWorkbook([{algset, rows}])
  const ws = wb.worksheets[0]

  it('names the sheet after the buffer', () => {
    expect(ws.name).toBe('UF Times')
  })

  it('writes merged column headers for all 22 targets', () => {
    // Column A header (first target) in B1, "UB (A)"
    expect(ws.getCell('B1').value).toBe('UB (A)')
    // Last target X = DL: column index 2 + 21*3 = 65 -> BM
    expect(ws.getCell('BM1').value).toBe('DL (X)')
    expect(ws.getCell('B2').value).toBe('Alg')
    expect(ws.getCell('C2').value).toBe('Time')
    expect(ws.getCell('D2').value).toBe('Regrips')
  })

  it('places cases at (column = first letter, row = second letter)', () => {
    // BA: column B (letter index 1 -> col E), row A (first data row 3)
    expect(ws.getCell('E3').value).toBe("[R2 U': [R2, S]] (BA)")
    expect(ws.getCell('F3').value).toBeCloseTo(0.96)
    expect(ws.getCell('G3').value).toBe(0)
    // AB: column A, row B
    expect(ws.getCell('B4').value).toBe("[R2 U': [S, R2]] (AB)")
    expect(ws.getCell('C4').value).toBeCloseTo(0.8)
    // UA without a time (column U -> BD, row A): alg only
    expect(ws.getCell('BD3').value).toBe("[M', U2] (UA)")
    expect(ws.getCell('BE3').value).toBeNull()
  })

  it('greys out same-piece combinations', () => {
    // Column A (=UB) x row Q (=BU): same piece -> grey, no value.
    // Row letters for UF: A,B,D,E,F,G,H,J,K,L,M,N,O,P,Q -> Q at index 14 -> row 17
    expect(ws.getCell('B17').value).toBeNull()
    expect(ws.getCell('B17').fill?.fgColor?.argb).toBe('FFD9D9D9')
    // Diagonal AA at B3
    expect(ws.getCell('B3').fill?.fgColor?.argb).toBe('FFD9D9D9')
  })

  it('writes AVERAGE formulas below the grid', () => {
    // 22 letters -> data rows 3..24, average row 25
    expect(ws.getCell('A25').value).toBe('Average')
    expect(ws.getCell('C25').value?.formula).toBe('IFERROR(AVERAGE(C3:C24),"")')
  })

  it('computes best cycle breaks from the times', () => {
    // Cases starting with A: AW 0.49 < AU 0.56 < AB 0.80 -> "W,U,B"
    expect(ws.getCell('B26').value).toBe('W,U,B')
    // Cases starting with B: only BA -> "A"
    expect(ws.getCell('E26').value).toBe('A')
  })

  it('lists the slowest comms and total regrips', () => {
    // bottom block starts at row 26 + 4 = 30
    expect(ws.getCell('B30').value).toBe('Slowest comms')
    expect(ws.getCell('B31').value).toBe("[U' M2 U': [M, U2]] (DA)")
    expect(ws.getCell('C31').value).toBeCloseTo(1.02)
    expect(ws.getCell('E30').value).toBe('Total Regrips')
    expect(ws.getCell('F30').value?.formula).toContain('SUM(D3:D24')
    expect(ws.getCell('F31').value).toBe(1)
  })
})
