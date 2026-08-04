import {defineStore} from 'pinia'
import {ref, computed} from 'vue'
import {algToMoveString} from '@/helpers/scramble_utils'
import {speedRating} from '@/helpers/kolibri'
import {useBluetoothCubeStore} from '@/stores/BluetoothCubeStore'
import {useSettingsStore} from '@/stores/SettingsStore'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {useDisplayStore} from '@/stores/DisplayStore'

// The timing session: walks case by case through an algset, collects the
// configured number of attempts per case, then asks for the regrip count and
// saves the result.
export const useTimingStore = defineStore('timing', () => {
    const btStore = useBluetoothCubeStore()
    const settings = useSettingsStore()
    const algsetStore = useAlgsetStore()

    // 'idle'    : no session
    // 'reps'    : collecting attempts for the current case
    // 'regrips' : all attempts done, asking for the regrip count
    // 'done'    : no cases left in the queue
    const stage = ref('idle')
    const algsetId = ref(null)
    const queue = ref([])          // case ids in timing order
    const index = ref(0)
    const repTimes = ref([])       // ms of the completed attempts of the current case
    const saving = ref(false)

    // Manual (no smart cube) stopwatch
    const manualStartedAt = ref(null)

    const algset = computed(() =>
        algsetStore.algsets.find(a => a.id === algsetId.value) ?? null)

    const currentCase = computed(() => {
        if (!algset.value || index.value >= queue.value.length) return null
        const id = queue.value[index.value]
        return algset.value.cases.find(c => c.id === id) ?? null
    })

    const repsTarget = computed(() => Math.max(1, Number(settings.store.reps) || 12))

    const avgMs = computed(() => {
        if (repTimes.value.length === 0) return null
        return Math.round(repTimes.value.reduce((a, b) => a + b, 0) / repTimes.value.length)
    })

    const start = (algsetToTime) => {
        algsetId.value = algsetToTime.id
        const cases = algsetToTime.cases.slice()
            .sort((a, b) => a.sortIndex - b.sortIndex || a.pair.localeCompare(b.pair))
        queue.value = cases.map(c => c.id)
        let startIdx = 0
        if (settings.store.skipCompleted) {
            startIdx = cases.findIndex(c => !c.result)
            if (startIdx === -1) startIdx = cases.length // everything timed already
        }
        index.value = startIdx
        repTimes.value = []
        manualStartedAt.value = null
        stage.value = index.value >= queue.value.length ? 'done' : 'reps'
        armCase()
    }

    const stop = () => {
        stage.value = 'idle'
        algsetId.value = null
        queue.value = []
        repTimes.value = []
        manualStartedAt.value = null
        btStore.resetTracking()
    }

    // Arm smart cube tracking for the current case (no-op without connection).
    const armCase = () => {
        manualStartedAt.value = null
        if (!btStore.connected) return
        const c = currentCase.value
        if (stage.value === 'reps' && c) {
            const moves = algToMoveString(c.alg)
            if (moves) {
                btStore.resumeTracking()
                btStore.startTracking(moves)
            } else {
                useDisplayStore().showToast(`Alg von ${c.pair} konnte nicht geparst werden`, 'danger')
            }
        } else {
            btStore.resetTracking()
        }
    }

    const recordRep = (ms) => {
        if (stage.value !== 'reps' || !currentCase.value) return
        if (!Number.isFinite(ms) || ms <= 0) return
        repTimes.value.push(Math.round(ms))
        manualStartedAt.value = null
        if (repTimes.value.length >= repsTarget.value) {
            stage.value = 'regrips'
            btStore.pauseTracking()
        } else if (btStore.connected) {
            // Re-arm for the next attempt: the cube is wherever the last
            // attempt left it; only relative moves matter.
            btStore.resetToStart()
        }
    }

    // Remove the last recorded attempt (misturn, distraction, ...).
    const undoRep = () => {
        if (repTimes.value.length === 0) return
        repTimes.value.pop()
        if (stage.value === 'regrips') stage.value = 'reps'
        armCase()
    }

    const restartCase = () => {
        repTimes.value = []
        if (stage.value === 'regrips') stage.value = 'reps'
        armCase()
    }

    const saveAndNext = async (regrips) => {
        const c = currentCase.value
        if (!c || repTimes.value.length === 0 || saving.value) return
        saving.value = true
        const {emoji} = speedRating(avgMs.value)
        const pair = c.pair
        const seconds = (avgMs.value / 1000).toFixed(2)
        try {
            await algsetStore.saveResult(c.id, repTimes.value.slice(), regrips)
            useDisplayStore().showToast(
                `${emoji} Blüte ${pair} bestäubt — ${seconds}s`, 'success', 2500)
            advance()
        } catch (e) {
            console.error('saving result failed', e)
            useDisplayStore().showToast('Speichern fehlgeschlagen — Verbindung/DB prüfen', 'danger')
        } finally {
            saving.value = false
        }
    }

    const advance = () => {
        repTimes.value = []
        let next = index.value + 1
        if (settings.store.skipCompleted && algset.value) {
            while (next < queue.value.length) {
                const c = algset.value.cases.find(c => c.id === queue.value[next])
                if (c && !c.result) break
                next++
            }
        }
        index.value = next
        stage.value = index.value >= queue.value.length ? 'done' : 'reps'
        armCase()
    }

    const skipCase = () => {
        if (stage.value !== 'reps' && stage.value !== 'regrips') return
        advance()
    }

    const prevCase = () => {
        if (index.value === 0) return
        index.value--
        repTimes.value = []
        stage.value = 'reps'
        armCase()
    }

    // Jump to a specific case of the running session's algset.
    const goToCase = (caseId) => {
        const i = queue.value.indexOf(caseId)
        if (i === -1) return
        index.value = i
        repTimes.value = []
        stage.value = 'reps'
        armCase()
    }

    // Manual stopwatch (no smart cube): space starts/stops each attempt.
    const manualToggle = () => {
        if (stage.value !== 'reps') return
        if (manualStartedAt.value === null) {
            manualStartedAt.value = Date.now()
        } else {
            const ms = Date.now() - manualStartedAt.value
            manualStartedAt.value = null
            recordRep(ms)
            // Flowing like the self-paced letter-pair mode in Algfolded would
            // auto-start the next attempt; here each attempt is armed manually
            // so the inspection between attempts isn't timed.
        }
    }

    const progress = computed(() => {
        if (!algset.value) return {timed: 0, total: 0}
        const total = algset.value.cases.length
        const timed = algset.value.cases.filter(c => c.result).length
        return {timed, total}
    })

    return {
        stage, algsetId, algset, queue, index, repTimes, saving, manualStartedAt,
        currentCase, repsTarget, avgMs, progress,
        start, stop, armCase, recordRep, undoRep, restartCase,
        saveAndNext, skipCase, prevCase, goToCase, manualToggle,
    }
})
