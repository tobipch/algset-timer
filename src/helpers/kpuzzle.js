// Lazy access to the cubing.js 3x3x3 puzzle. The cubing chunk is large, so it
// is only imported when something actually needs a virtual cube (smart cube
// tracking, cycle break trainer).

let kpuzzlePromise = null

export const getKPuzzle = () => {
  if (!kpuzzlePromise) {
    kpuzzlePromise = import('cubing/puzzles').then((m) => m.puzzles['3x3x3'].kpuzzle())
  }
  return kpuzzlePromise
}

// Build a KPattern from raw pattern data (see edge_state.js for the data).
export const makePattern = async (kpuzzle, patternData) => {
  const { KPattern } = await import('cubing/kpuzzle')
  return new KPattern(kpuzzle, patternData)
}

// Solve a pattern with the built-in 3x3x3 solver and return the scramble that
// produces it from a solved cube (i.e. the inverse of the solution).
export const scrambleForPattern = async (pattern) => {
  const { experimentalSolve3x3x3IgnoringCenters } = await import('cubing/search')
  const solution = await experimentalSolve3x3x3IgnoringCenters(pattern)
  const { inverseScramble } = await import('@/helpers/scramble_utils')
  return inverseScramble(solution.toString())
}

// Two patterns are the same position for our purposes when pieces and
// orientations of edges and corners match. The centers orbit is not compared —
// what matters is the position a solver would see.
export const samePosition = (a, b) => {
  if (!a || !b) return false
  for (const orbit of ['EDGES', 'CORNERS']) {
    const oa = a.patternData[orbit]
    const ob = b.patternData[orbit]
    if (!oa || !ob) return false
    for (let i = 0; i < oa.pieces.length; i++) {
      if (oa.pieces[i] !== ob.pieces[i]) return false
      if ((oa.orientation[i] ?? 0) !== (ob.orientation[i] ?? 0)) return false
    }
  }
  return true
}
