// Getrimmter Mittelwert: die schnellsten und langsamsten floor(n * fraction)
// Werte fallen weg, aus dem Rest wird der Durchschnitt gebildet. Bei den
// üblichen 12 Versuchen fällt je ein Wert oben und unten weg (wie beim
// WCA-Average), sodass ein verpatzter oder ein Glücks-Versuch das Ergebnis
// nicht verzerrt.
//
// Bei n < 10 wird nichts getrimmt (floor(n * 0.1) === 0), das Ergebnis ist
// dann der normale Durchschnitt.
export const TRIM_FRACTION = 0.1

export const trimCount = (n, fraction = TRIM_FRACTION) => Math.floor(n * fraction)

export const trimmedMean = (values, fraction = TRIM_FRACTION) => {
  const nums = (values ?? []).filter((v) => Number.isFinite(v))
  if (nums.length === 0) return null
  const sorted = nums.slice().sort((a, b) => a - b)
  const k = trimCount(sorted.length, fraction)
  // 2k < n gilt immer (k <= n/10), es bleibt also stets mindestens ein Wert.
  const kept = k > 0 ? sorted.slice(k, sorted.length - k) : sorted
  return kept.reduce((a, b) => a + b, 0) / kept.length
}

// Indizes der Werte, die der Trim entfernt — für die Darstellung der
// Versuchsliste. Bei Gleichständen entscheidet die Reihenfolge, damit genau
// k Werte pro Seite markiert werden.
export const trimmedIndices = (values, fraction = TRIM_FRACTION) => {
  const nums = (values ?? []).map((v, i) => [v, i]).filter(([v]) => Number.isFinite(v))
  const k = trimCount(nums.length, fraction)
  if (k === 0) return new Set()
  const order = nums.slice().sort((a, b) => a[0] - b[0])
  return new Set([
    ...order.slice(0, k).map(([, i]) => i),
    ...order.slice(order.length - k).map(([, i]) => i),
  ])
}
