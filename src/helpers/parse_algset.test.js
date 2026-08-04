import {describe, expect, it} from 'vitest'
import {parseAlgfoldedJson, parseSimpleText} from './parse_algset'

describe('parseSimpleText', () => {
  it('parses "pair: alg" lines', () => {
    const {cases, errors} = parseSimpleText("BA: [R2 U': [R2, S]]\nDA: [U' M2 U': [M, U2]]", 'UF')
    expect(errors).toEqual([])
    expect(cases).toEqual([
      {pair: 'BA', alg: "[R2 U': [R2, S]]", sortIndex: 0},
      {pair: 'DA', alg: "[U' M2 U': [M, U2]]", sortIndex: 1},
    ])
  })

  it('parses sheet-style "alg (pair)" lines', () => {
    const {cases, errors} = parseSimpleText("[R2 U': [R2, S]] (BA)\n[M', U2] (UA)", 'UF')
    expect(errors).toEqual([])
    expect(cases.map(c => c.pair)).toEqual(['BA', 'UA'])
    expect(cases[0].alg).toBe("[R2 U': [R2, S]]")
  })

  it('strips pasted spreadsheet columns', () => {
    const {cases, errors} = parseSimpleText("[R2 U': [R2, S]] (BA)\t0.96\t0", 'UF')
    expect(errors).toEqual([])
    expect(cases).toHaveLength(1)
    expect(cases[0].pair).toBe('BA')
  })

  it('skips comments and blank lines', () => {
    const {cases} = parseSimpleText('# comment\n\nBA: [R2, S]\n', 'UF')
    expect(cases).toHaveLength(1)
  })

  it('rejects targets on the buffer piece', () => {
    // C = UF itself, I = FU (same piece)
    const {cases, errors} = parseSimpleText('CA: [R2, S]\nIA: [R2, S]', 'UF')
    expect(cases).toHaveLength(0)
    expect(errors).toHaveLength(2)
  })

  it('rejects pairs on the same piece and malformed algs', () => {
    const {errors: same} = parseSimpleText('AQ: [R2, S]', 'UF') // UB + BU
    expect(same).toHaveLength(1)
    const {errors: malformed} = parseSimpleText('BA: [R2, S', 'UF')
    expect(malformed).toHaveLength(1)
  })

  it('flags duplicates', () => {
    const {cases, errors} = parseSimpleText('BA: [R2, S]\nBA: [S, R2]', 'UF')
    expect(cases).toHaveLength(1)
    expect(errors).toHaveLength(1)
  })

  it('sorts cases alphabetically', () => {
    const {cases} = parseSimpleText('XA: [L2, S]\nBA: [R2, S]', 'UF')
    expect(cases.map(c => c.pair)).toEqual(['BA', 'XA'])
  })
})

describe('parseAlgfoldedJson', () => {
  const json = JSON.stringify({
    ACE: {
      algs: ["[L2 U: [L2, S']]", "[U' M2 U': [M, U2]]"],
      buffers: {UF: ['UL', 'UB'], UB: ['UF', 'UL'], UL: ['UB', 'UF']},
    },
    ABC: {
      algs: ['[R2, S]'],
      buffers: {UB: ['UR', 'UF']},
    },
  })

  it('extracts the cases of the chosen buffer with Speffz pairs', () => {
    const {cases, errors} = parseAlgfoldedJson(json, 'UF')
    expect(errors).toEqual([])
    expect(cases).toEqual([
      {pair: 'DA', alg: "[L2 U: [L2, S']]", sortIndex: 0},
    ])
  })

  it('uses the buffer-specific targets', () => {
    const {cases} = parseAlgfoldedJson(json, 'UB')
    expect(cases.map(c => c.pair).sort()).toEqual(['BC', 'CD'])
  })

  it('reports invalid JSON', () => {
    const {cases, errors} = parseAlgfoldedJson('{oops', 'UF')
    expect(cases).toHaveLength(0)
    expect(errors).toHaveLength(1)
  })
})
