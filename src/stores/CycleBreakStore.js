import {defineStore} from 'pinia'
import {computed, ref, watch} from 'vue'
import {getKPuzzle, makePattern, samePosition, scrambleForPattern} from '@/helpers/kpuzzle'
import {
    edgeStateFromPatternData,
    edgeStatesEqual,
    patternDataWithEdgeState,
    positionName,
    positionOf,
} from '@/helpers/edge_state'
import {
    buildAlgsetIndex,
    choiceOutcome,
    choicePair,
    emptyAlgsetIndex,
    forcedLetters,
    generateBreakCase,
    rankedOptions,
    rateChoice,
} from '@/helpers/cycle_break'
import {stickerToLetter} from '@/helpers/letters'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {useBluetoothCubeStore} from '@/stores/BluetoothCubeStore'
import {useDisplayStore} from '@/stores/DisplayStore'
import {useSettingsStore} from '@/stores/SettingsStore'

// Das Cycle-Break-Minigame ("Weggabelung"): eine Runde ist ein Scramble mit
// 4-6 ungelösten Edges, dessen erster freier Break entweder mitten im ersten
// Letterpair (A[BREAK]) oder direkt danach (AB [BREAK]) liegt. Gewertet wird,
// wohin gebreakt wird.
//
// Ablauf einer Runde mit Smartcube:
//   'scramble' — der Cube ist gelöst, der Scramble wird angewendet (wir merken,
//                wann die Zielstellung erreicht ist)
//   'choice'   — der/die Commutator(en) werden ausgeführt; aus der erreichten
//                Stellung lesen wir ab, welcher Break gewählt wurde
//   'feedback' — Bewertung steht; sobald der Cube fertig gelöst ist, läuft die
//                nächste Runde an
// Ohne Cube läuft derselbe Ablauf über Knöpfe.

const ROUND_MODES = ['inPair', 'afterPair']

export const emptyStats = () => ({
    rounds: 0, excellent: 0, ok: 0, weak: 0, unknown: 0, streak: 0, bestStreak: 0,
})

export const useCycleBreakStore = defineStore('cycleBreak', () => {
    const btStore = useBluetoothCubeStore()
    const settings = useSettingsStore()
    const algsetStore = useAlgsetStore()

    const stage = ref('idle')       // idle | preparing | scramble | choice | feedback
    const algsetId = ref(null)
    const breakCase = ref(null)     // aktuelle Aufgabe (siehe cycle_break.js)
    const round = ref(null)         // was die UI davon zeigt
    const result = ref(null)        // Bewertung der letzten Wahl
    const firstCommDone = ref(false)
    const error = ref(null)
    const stats = ref(emptyStats())

    // Nicht reaktiv: KPattern-Objekte sind gross und werden nur intern
    // verglichen (wie im BluetoothCubeStore).
    let targetPattern = null        // Stellung nach dem Scramble
    let solvedPattern = null
    let trackedPattern = null       // virtueller Cube
    let outcomes = []               // [{sticker, state}] — Edge-Stellung je Wahl
    let pending = null              // vorgenerierte nächste Runde

    const algset = computed(() =>
        algsetStore.algsets.find(a => a.id === algsetId.value) ?? null)

    const index = computed(() => algset.value ? buildAlgsetIndex(algset.value) : emptyAlgsetIndex())

    const buffer = computed(() => algset.value?.buffer ?? 'UF')

    const ratingScope = computed(() =>
        settings.store.breakRatingScope === 'algset' ? 'algset' : 'available')

    // Die Optionen der Runde in Bewertungsreihenfolge — erst fürs Feedback,
    // vorher würde die Reihenfolge die Antwort verraten.
    const options = computed(() =>
        breakCase.value ? rankedOptions(breakCase.value, index.value, {scope: ratingScope.value}) : [])

    // --- Runden bauen --------------------------------------------------------

    const pickMode = () => {
        const wanted = settings.store.breakMode
        return ROUND_MODES.includes(wanted) ? wanted : ROUND_MODES[Math.random() < 0.5 ? 0 : 1]
    }

    // Bevorzugt Aufgaben, bei denen jede Option auch eine gemessene Zeit hat —
    // sonst lässt sich die Wahl im Letterpair nicht sauber bewerten.
    const preferMeasured = (mode) => (candidate) => {
        if (mode !== 'inPair' || index.value.measured === 0) return true
        return candidate.candidates.every((sticker) => {
            const pair = choicePair(candidate, sticker)
            return pair !== null && index.value.times.has(pair)
        })
    }

    const buildRound = async () => {
        const mode = pickMode()
        const opts = {buffer: buffer.value, mode}
        const generated =
            generateBreakCase({...opts, accept: preferMeasured(mode)}) ?? generateBreakCase(opts)
        if (!generated) throw new Error(`Keine Stellung für Modus ${mode} gefunden`)

        const kpuzzle = await getKPuzzle()
        const solved = kpuzzle.defaultPattern()
        const pattern = await makePattern(
            kpuzzle, patternDataWithEdgeState(solved.patternData, generated.state))
        const scramble = await scrambleForPattern(pattern)
        return {generated, pattern, scramble, solved}
    }

    const applyRound = ({generated, pattern, scramble, solved}) => {
        breakCase.value = generated
        targetPattern = pattern
        solvedPattern = solved
        trackedPattern = solved
        outcomes = generated.candidates.map((sticker) => ({
            sticker,
            state: choiceOutcome(generated, sticker).state,
        }))
        result.value = null
        firstCommDone.value = false
        round.value = {
            mode: generated.mode,
            buffer: generated.buffer,
            scramble,
            unsolvedCount: generated.unsolvedCount,
            forced: forcedLetters(generated),
            // Neutrale Reihenfolge — die Bewertungsreihenfolge kommt erst
            // hinterher.
            candidates: generated.candidates
                .map((sticker) => ({
                    sticker,
                    letter: stickerToLetter(sticker),
                    piece: positionName(positionOf(sticker)),
                }))
                .sort((a, b) => a.letter.localeCompare(b.letter)),
        }
        stage.value = 'scramble'
    }

    const nextRound = async () => {
        stage.value = 'preparing'
        error.value = null
        const prefetched = pending
        pending = null
        try {
            applyRound((prefetched ? await prefetched : null) ?? await buildRound())
        } catch (e) {
            console.error('cycle break round failed', e)
            error.value = 'Stellung konnte nicht erzeugt werden — der Cube-Solver ist nicht erreichbar.'
            stage.value = 'idle'
            useDisplayStore().showToast(error.value, 'danger')
        }
    }

    // Während Feedback und Fertiglösen schon die nächste Runde rechnen lassen.
    const prefetch = () => {
        if (pending) return
        pending = buildRound().catch((e) => {
            console.error('prefetching a round failed', e)
            return null // nextRound baut dann selbst eine
        })
    }

    const start = (algsetToUse) => {
        algsetId.value = algsetToUse?.id ?? null
        stats.value = emptyStats()
        pending = null
        nextRound()
    }

    const stop = () => {
        stage.value = 'idle'
        round.value = null
        result.value = null
        breakCase.value = null
        trackedPattern = null
        targetPattern = null
        outcomes = []
        pending = null
    }

    // --- Wahl auswerten ------------------------------------------------------

    const choose = (sticker) => {
        if (stage.value !== 'choice' || !breakCase.value) return
        const rating = rateChoice(breakCase.value, sticker, index.value, {scope: ratingScope.value})
        result.value = rating
        countRating(rating.rating)
        stage.value = 'feedback'
        prefetch()
    }

    const countRating = (rating) => {
        const s = stats.value
        s.rounds++
        s[rating] = (s[rating] ?? 0) + 1
        if (rating === 'excellent') {
            s.streak++
            s.bestStreak = Math.max(s.bestStreak, s.streak)
        } else if (rating !== 'unknown') {
            s.streak = 0
        }
    }

    // Runde überspringen, ohne sie zu werten.
    const skipRound = () => {
        if (stage.value === 'idle' || stage.value === 'preparing') return
        nextRound()
    }

    // „Mein Cube ist gelöst“ — virtuellen Cube neu synchronisieren. Nach dem
    // Feedback startet das gleich die nächste Runde.
    const syncSolved = () => {
        trackedPattern = solvedPattern
        if (stage.value === 'feedback') nextRound()
        else if (stage.value === 'choice') stage.value = 'scramble'
    }

    // Ohne Cube: den Scramble von Hand als angewendet markieren.
    const confirmScrambled = () => {
        if (stage.value !== 'scramble') return
        trackedPattern = targetPattern
        stage.value = 'choice'
    }

    // --- Smartcube -----------------------------------------------------------

    const cornersSolved = (pattern) => {
        const a = pattern.patternData.CORNERS
        const b = solvedPattern.patternData.CORNERS
        return a.pieces.every((p, i) => p === b.pieces[i] && (a.orientation[i] ?? 0) === (b.orientation[i] ?? 0))
    }

    const handleMove = (move) => {
        if (!trackedPattern || stage.value === 'idle' || stage.value === 'preparing') return
        try {
            trackedPattern = trackedPattern.applyMove(move)
        } catch (_) {
            return // Move, den der virtuelle Cube nicht kennt
        }

        if (stage.value === 'scramble') {
            if (samePosition(trackedPattern, targetPattern)) stage.value = 'choice'
            return
        }
        if (stage.value === 'choice') {
            // Ein Edge-Commutator lässt die Ecken in Ruhe — erst wenn die
            // wieder stehen, ist der Alg wirklich durch.
            if (!cornersSolved(trackedPattern)) return
            const state = edgeStateFromPatternData(trackedPattern.patternData)
            if (breakCase.value.mode === 'afterPair' && edgeStatesEqual(state, breakCase.value.breakState)) {
                firstCommDone.value = true
                return
            }
            const hit = outcomes.find((o) => edgeStatesEqual(state, o.state))
            if (hit) choose(hit.sticker)
            return
        }
        if (stage.value === 'feedback' && samePosition(trackedPattern, solvedPattern)) {
            nextRound()
        }
    }

    // Synchron: Smartcubes liefern mehrere Moves in einem Paket, und ein
    // aufgeschobener Watcher würde von so einem Schwung nur den letzten Move
    // sehen.
    watch(() => btStore.moveCounter, () => {
        if (btStore.lastMove) handleMove(btStore.lastMove)
    }, {flush: 'sync'})

    // Verbindet sich der Cube mitten in der Runde, kennen wir seinen Zustand
    // nicht — der Nutzer synchronisiert über „Cube ist gelöst“.
    watch(() => btStore.connected, (connected) => {
        if (connected && stage.value !== 'idle') {
            useDisplayStore().showToast(
                'Cube verbunden — zum Erkennen muss er gelöst sein („Cube ist gelöst“ drücken).', 'info', 4000)
        }
    })

    return {
        stage, algsetId, algset, round, result, stats, error, firstCommDone,
        buffer, options,
        start, stop, nextRound, skipRound, choose, syncSolved, confirmScrambled,
    }
})
