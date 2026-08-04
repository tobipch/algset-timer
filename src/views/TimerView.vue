<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {useTimingStore} from '@/stores/TimingStore'
import {useBluetoothCubeStore} from '@/stores/BluetoothCubeStore'
import {useSettingsStore} from '@/stores/SettingsStore'
import {useDisplayStore} from '@/stores/DisplayStore'
import {msToHumanReadable} from '@/helpers/time_formatter'
import {algToMoveString} from '@/helpers/scramble_utils'
import {pairToStickers} from '@/helpers/letters'

const algsetStore = useAlgsetStore()
const timing = useTimingStore()
const btStore = useBluetoothCubeStore()
const settings = useSettingsStore()
const display = useDisplayStore()

const regripsInput = ref(0)
const showExpanded = ref(false)

// --- live clock ---
const now = ref(Date.now())
let clockInterval = null
const running = computed(() =>
  btStore.attemptStartedAt !== null || timing.manualStartedAt !== null)
watch(running, (isRunning) => {
  if (isRunning && !clockInterval) {
    clockInterval = setInterval(() => { now.value = Date.now() }, 31)
  } else if (!isRunning && clockInterval) {
    clearInterval(clockInterval)
    clockInterval = null
  }
})

const timerLabel = computed(() => {
  const startedAt = btStore.attemptStartedAt ?? timing.manualStartedAt
  if (startedAt !== null) {
    if (settings.store.timerUpdate === 'off') return '⏱️'
    return msToHumanReadable(now.value - startedAt, 2, settings.store.timerUpdate === 'on')
  }
  const last = timing.repTimes[timing.repTimes.length - 1]
  return msToHumanReadable(last ?? 0, 2, true)
})

// --- session wiring ---

// A finished smart cube attempt records a rep.
watch(() => btStore.solveCounter, () => {
  if (btStore.lastSolveMs !== null) timing.recordRep(btStore.lastSolveMs)
})

// Reset gesture: drop nothing, just notify (the attempt restarts itself).
watch(() => btStore.resetSignal, () => {
  display.showToast('Versuch zurückgesetzt — nächster Move startet neu', 'info', 2000)
})

// (Re-)arm tracking when the cube connects mid-session.
watch(() => btStore.connected, (connected) => {
  if (connected) timing.armCase()
})

// When entering the regrips stage, preset the input and focus.
watch(() => timing.stage, (stage) => {
  if (stage === 'regrips') regripsInput.value = 0
})

const currentAlgMoves = computed(() =>
  timing.currentCase ? algToMoveString(timing.currentCase.alg) : '')

const caseStickers = computed(() => {
  if (!timing.currentCase || !timing.algset) return ''
  const [t1, t2] = pairToStickers(timing.currentCase.pair, timing.algset.pieceType)
  return `${timing.algset.buffer} → ${t1} → ${t2}`
})

const startSession = () => {
  if (!algsetStore.active) return
  timing.start(algsetStore.active)
}

const saveRegrips = async (n) => {
  await timing.saveAndNext(n)
}

// --- keyboard ---
const onKeyDown = (event) => {
  // Regrips prompt: 0-9 saves directly
  if (timing.stage === 'regrips' && /^[0-9]$/.test(event.key) && !event.repeat) {
    event.preventDefault()
    saveRegrips(Number(event.key))
    return
  }
  // Manual stopwatch without a cube
  if (event.key === ' ' && timing.stage === 'reps' && !btStore.connected) {
    event.preventDefault()
    if (!event.repeat) timing.manualToggle()
    return
  }
  if (event.key === 'Backspace' && timing.stage !== 'idle' && !event.repeat) {
    event.preventDefault()
    timing.undoRep()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  if (clockInterval) { clearInterval(clockInterval); clockInterval = null }
})
</script>

<template>
  <div>
    <!-- no session yet: setup -->
    <div v-if="timing.stage === 'idle'" class="row justify-content-center">
      <div class="col-12 col-md-8 col-lg-6">
        <h4>Timing-Session</h4>
        <div v-if="!algsetStore.loaded && algsetStore.loading" class="text-muted">
          <span class="spinner-border spinner-border-sm"></span> Algsets laden…
        </div>
        <div v-else-if="algsetStore.algsets.length === 0" class="alert alert-info">
          Noch kein Algset vorhanden — zuerst unter
          <router-link to="/algsets">Algsets</router-link> eins hochladen.
        </div>
        <div v-else class="card">
          <div class="card-body">
            <label class="form-label small mb-1">Algset</label>
            <select class="form-select mb-3" v-model="algsetStore.activeId">
              <option v-for="a in algsetStore.algsets" :key="a.id" :value="a.id">
                {{ a.name }} ({{ a.cases.filter(c => c.result).length }}/{{ a.cases.length }} gemessen)
              </option>
            </select>

            <div class="row g-2 mb-3">
              <div class="col-6">
                <label class="form-label small mb-1">Versuche pro Case</label>
                <input type="number" min="1" max="50" class="form-control"
                       v-model.number="settings.store.reps">
              </div>
              <div class="col-6">
                <label class="form-label small mb-1">Cube-Orientierung (optional)</label>
                <input type="text" class="form-control" placeholder="z.B. z2"
                       v-model="settings.store.cubeOrientation">
              </div>
            </div>
            <div class="form-check mb-3">
              <input class="form-check-input" type="checkbox" id="skip-completed"
                     v-model="settings.store.skipCompleted">
              <label class="form-check-label" for="skip-completed">
                Bereits gemessene Cases überspringen
              </label>
            </div>

            <div v-if="!btStore.connected" class="alert alert-warning py-2 small">
              <i class="bi bi-bluetooth"></i> Kein Smartcube verbunden — Verbindung oben rechts.
              Ohne Cube läuft die Session mit der Leertaste (Start/Stopp pro Versuch).
            </div>

            <button class="btn btn-primary w-100" :disabled="!algsetStore.active" @click="startSession">
              <i class="bi bi-play-fill"></i> Session starten
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- all done -->
    <div v-else-if="timing.stage === 'done'" class="text-center py-5">
      <h3><i class="bi bi-check-circle text-success"></i> Alle Cases gemessen!</h3>
      <p class="text-muted">{{ timing.progress.timed }} / {{ timing.progress.total }} Cases von
        „{{ timing.algset?.name }}“ haben eine Zeit.</p>
      <router-link class="btn btn-primary me-2" to="/">Zur Übersicht</router-link>
      <button class="btn btn-outline-secondary" @click="timing.stop()">Session beenden</button>
    </div>

    <!-- running session -->
    <div v-else class="row g-3">
      <div class="col-12 col-lg-8">
        <div class="card">
          <div class="card-body text-center">
            <div class="d-flex justify-content-between text-muted small mb-2">
              <span>{{ timing.algset?.name }}</span>
              <span>Case {{ timing.index + 1 }} / {{ timing.queue.length }}
                · {{ timing.progress.timed }} gemessen</span>
            </div>

            <div class="display-3 fw-bold noselect">{{ timing.currentCase?.pair }}</div>
            <div class="text-muted mb-2">{{ caseStickers }}</div>
            <div class="fs-4 alg mb-1">{{ timing.currentCase?.alg }}</div>
            <div v-if="showExpanded" class="text-muted alg small mb-2">{{ currentAlgMoves }}</div>
            <button class="btn btn-link btn-sm p-0 mb-3" @click="showExpanded = !showExpanded">
              {{ showExpanded ? 'Moves ausblenden' : 'Moves anzeigen' }}
            </button>

            <!-- regrips prompt -->
            <div v-if="timing.stage === 'regrips'">
              <hr>
              <h5 class="mb-1">Ø {{ msToHumanReadable(timing.avgMs ?? 0) }}s</h5>
              <p class="mb-2">Wie viele Regrips hat der Alg?</p>
              <div class="btn-group mb-3">
                <button v-for="n in [0, 1, 2, 3, 4]" :key="n"
                        class="btn btn-outline-primary btn-lg"
                        :disabled="timing.saving"
                        @click="saveRegrips(n)">{{ n }}</button>
              </div>
              <div class="input-group input-group-sm justify-content-center mb-2" style="max-width: 220px; margin: 0 auto;">
                <input type="number" min="0" max="20" class="form-control" v-model.number="regripsInput">
                <button class="btn btn-primary" :disabled="timing.saving" @click="saveRegrips(regripsInput)">
                  Speichern
                </button>
              </div>
              <div class="text-muted small">Taste 0–9 speichert direkt und geht zum nächsten Case.</div>
            </div>

            <!-- timer -->
            <div v-else>
              <h1 class="timer noselect my-2"
                  :class="{running: running}"
                  @touchstart.prevent="!btStore.connected && timing.manualToggle()">
                {{ timerLabel }}
              </h1>
              <div class="mb-2">
                <span class="badge text-bg-primary fs-6">
                  Versuch {{ timing.repTimes.length + 1 }} / {{ timing.repsTarget }}
                </span>
              </div>
              <div v-if="btStore.connected" class="text-muted small">
                <template v-if="btStore.phase === 'awaiting_solve'">
                  Erster Move startet den Timer.
                </template>
                <template v-else-if="btStore.phase === 'solving'">
                  Läuft… (D- oder U-Layer 360° drehen = Versuch zurücksetzen)
                </template>
                <template v-else>Tracking wird vorbereitet…</template>
              </div>
              <div v-else class="text-muted small">
                Leertaste: Versuch starten / stoppen (kein Cube verbunden)
              </div>
              <div v-if="btStore.tooFarFromSolved" class="alert alert-warning py-1 small mt-2 mb-0">
                Cube weit vom Zielzustand entfernt — falscher Alg? D-Layer 360° drehen zum Zurücksetzen.
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2 mt-2">
          <button class="btn btn-sm btn-outline-secondary" @click="timing.prevCase()"
                  :disabled="timing.index === 0">
            <i class="bi bi-skip-backward"></i> Vorheriger
          </button>
          <button class="btn btn-sm btn-outline-secondary" @click="timing.skipCase()">
            Überspringen <i class="bi bi-skip-forward"></i>
          </button>
          <button class="btn btn-sm btn-outline-warning" @click="timing.undoRep()"
                  :disabled="timing.repTimes.length === 0">
            <i class="bi bi-arrow-counterclockwise"></i> Letzten Versuch löschen
          </button>
          <button class="btn btn-sm btn-outline-warning" @click="timing.restartCase()"
                  :disabled="timing.repTimes.length === 0">
            Case neu starten
          </button>
          <button class="btn btn-sm btn-outline-danger ms-auto" @click="timing.stop()">
            Session beenden
          </button>
        </div>
      </div>

      <!-- rep times -->
      <div class="col-12 col-lg-4">
        <div class="card">
          <div class="card-body">
            <h6 class="card-title">Versuche
              <span v-if="timing.avgMs !== null" class="text-muted fw-normal">
                · Ø {{ msToHumanReadable(timing.avgMs) }}s
              </span>
            </h6>
            <ol class="mb-0">
              <li v-for="(t, i) in timing.repTimes" :key="i">{{ msToHumanReadable(t) }}</li>
            </ol>
            <div v-if="timing.repTimes.length === 0" class="text-muted small">Noch keine Versuche.</div>
          </div>
        </div>
        <div class="text-muted small mt-2">
          <div>Backspace: letzten Versuch löschen</div>
          <div v-if="btStore.connected">Cube-Geste: D/U-Layer 360° = Versuch neu starten</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timer {
  font-size: 64px;
  font-weight: 700;
  font-family: 'Roboto Mono', ui-monospace, monospace;
}
.timer.running {
  color: var(--bs-success);
}
</style>
