// Kolibri-Spielereien: Flügelschläge, Fakten und Flug-Bewertungen.

// Ein flotter Kolibri schlägt rund 50-mal pro Sekunde mit den Flügeln.
export const WING_BEATS_PER_SECOND = 50

export const msToWingBeats = (ms) =>
  Math.max(1, Math.round((ms / 1000) * WING_BEATS_PER_SECOND))

export const KOLIBRI_FACTS = [
  'Kolibris schlagen bis zu 80-mal pro Sekunde mit den Flügeln — schneller als jeder Commutator.',
  'Kolibris sind die einzigen Vögel, die rückwärts fliegen können. Inverse Algs, sozusagen.',
  'Das Herz eines Kolibris schlägt im Flug über 1200-mal pro Minute.',
  'Die Bienenelfe ist mit rund 5 cm der kleinste Vogel der Welt — kleiner als dein Cube.',
  'Kolibris besuchen bis zu 2000 Blüten am Tag. Deine Algset-Queue ist dagegen ein Klacks.',
  'Kolibris können als einzige Vögel auf der Stelle schweben — die perfekte Lookahead-Pause.',
  'Kolibris merken sich, welche Blüten sie schon besucht haben — genau wie dieser Timer.',
  'Manche Kolibris wiegen weniger als 2 Gramm — ungefähr vier Cube-Sticker.',
  'Im Sturzflug erreichen Kolibris fast 100 km/h.',
  'Die Zunge eines Kolibris schnellt bis zu 15-mal pro Sekunde in den Nektar.',
  'Kolibris verbrauchen so viel Energie, dass sie täglich etwa die Hälfte ihres Körpergewichts an Nektar trinken.',
]

export const randomFact = () =>
  KOLIBRI_FACTS[Math.floor(Math.random() * KOLIBRI_FACTS.length)]

// Wie schnell war der Anflug auf diese Blüte?
export const speedRating = (avgMs) => {
  const s = avgMs / 1000
  if (s < 0.7) return { emoji: '⚡', label: 'Sturzflug! Diese Blüte kennst du im Schlaf.' }
  if (s < 0.9) return { emoji: '💨', label: 'Flinker Flügelschlag.' }
  if (s < 1.1) return { emoji: '🕊️', label: 'Ruhiger Schwirrflug.' }
  return { emoji: '🥀', label: 'Gemütlicher Gleitflug — diese Blüte braucht noch Nektar.' }
}
