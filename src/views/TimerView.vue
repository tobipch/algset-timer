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
import {msToWingBeats, randomFact, speedRating} from '@/helpers/kolibri'
import KolibriBird from '@/components/KolibriBird.vue'
import KolibriLoading from '@/components/KolibriLoading.vue'
import RegripCorrection from '@/components/RegripCorrection.vue'

const algsetStore = useAlgsetStore()
const timing = useTimingStore()
const btStore = useBluetoothCubeStore()
const settings = useSettingsStore()
const display = useDisplayStore()

const regripsInput = ref(0)
const showExpanded = ref(false)
const doneFact = ref(randomFact())

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
    if (settings.store.timerUpdate === 'off') return '🐦'
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
  display.showToast('Kurz gerüttelt, neu angeflogen — der nächste Move startet den Versuch neu', 'info', 2500)
})

// (Re-)arm tracking when the cube connects mid-session.
watch(() => btStore.connected, (connected) => {
  if (connected) timing.armCase()
})

// When entering the regrips stage, preset the input; a fresh fact for the
// done screen each time it appears.
watch(() => timing.stage, (stage) => {
  if (stage === 'regrips') regripsInput.value = 0
  if (stage === 'done') doneFact.value = randomFact()
})

const currentAlgMoves = computed(() =>
  timing.currentCase ? algToMoveString(timing.currentCase.alg) : '')

const caseStickers = computed(() => {
  if (!timing.currentCase || !timing.algset) return ''
  const [t1, t2] = pairToStickers(timing.currentCase.pair, timing.algset.pieceType)
  return `${timing.algset.buffer} → ${t1} → ${t2}`
})

// Schnellster Anflug, der auch in die Wertung eingeht (nicht getrimmt).
const bestCountingMs = computed(() => {
  const counting = timing.repTimes.filter((_, i) => !timing.trimmedReps.has(i))
  return counting.length > 0 ? Math.min(...counting) : null
})

const rating = computed(() =>
  timing.avgMs !== null ? speedRating(timing.avgMs) : null)

const trimPerSide = computed(() => timing.trimmedReps.size / 2)

const trimHint = computed(() => trimPerSide.value > 0
  ? `Getrimmter Durchschnitt: ${trimPerSide.value === 1
      ? 'die schnellste und die langsamste Zeit fliegen'
      : `je die ${trimPerSide.value} schnellsten und langsamsten Zeiten fliegen`} aus der Wertung.`
  : 'Durchschnitt aller Anflüge (ab 10 Anflügen wird getrimmt).')

const progressPercent = computed(() =>
  timing.progress.total === 0 ? 0 : Math.round(100 * timing.progress.timed / timing.progress.total))

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
        <h4 class="k-title mb-3">Timing-Session</h4>
        <KolibriLoading v-if="!algsetStore.loaded && algsetStore.loading"/>
        <div v-else-if="algsetStore.algsets.length === 0" class="alert alert-info">
          Noch keine Blütenwiese angelegt — zuerst unter
          <router-link to="/algsets">Algsets</router-link> eine hochladen.
        </div>
        <div v-else class="card">
          <div class="card-body">
            <label class="form-label small mb-1">Algset</label>
            <select class="form-select mb-3" v-model="algsetStore.activeId">
              <option v-for="a in algsetStore.algsets" :key="a.id" :value="a.id">
                {{ a.name }} ({{ a.cases.filter(c => c.result).length }}/{{ a.cases.length }} Blüten besucht)
              </option>
            </select>

            <div class="row g-2 mb-3">
              <div class="col-6">
                <label class="form-label small mb-1">Anflüge pro Blüte (Versuche pro Case)</label>
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
                Bereits besuchte Blüten (gemessene Cases) überspringen
              </label>
            </div>

            <div v-if="!btStore.connected" class="alert alert-warning py-2 small">
              <i class="bi bi-bluetooth"></i> Kein Smartcube verbunden — Verbindung oben rechts.
              Ohne Cube läuft die Session mit der Leertaste (Start/Stopp pro Versuch).
            </div>

            <button class="btn btn-primary w-100" :disabled="!algsetStore.active" @click="startSession">
              <i class="bi bi-play-fill"></i> Abflug!
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- all done -->
    <div v-else-if="timing.stage === 'done'" class="text-center py-5">
      <div class="d-flex justify-content-center mb-2">
        <KolibriBird :size="90" :flying="true"/>
      </div>
      <h3>🌺 Alle Blüten besucht!</h3>
      <p class="text-muted">{{ timing.progress.timed }} / {{ timing.progress.total }} Cases von
        „{{ timing.algset?.name }}“ haben eine Zeit.</p>
      <p class="k-fact d-inline-block text-start">🐦 {{ doneFact }}</p>

      <div class="row justify-content-center mb-3">
        <div class="col-12 col-md-7 col-lg-5">
          <RegripCorrection/>
        </div>
      </div>

      <div class="mt-2">
        <router-link class="btn btn-primary me-2" to="/">Zur Übersicht</router-link>
        <button class="btn btn-outline-secondary" @click="timing.stop()">Landen</button>
      </div>
    </div>

    <!-- running session -->
    <div v-else class="row g-3">
      <div class="col-12 col-lg-8">
        <div class="card">
          <div class="card-body text-center">
            <div class="d-flex justify-content-between text-muted small mb-1">
              <span>{{ timing.algset?.name }}</span>
              <span>Blüte {{ timing.index + 1 }} / {{ timing.queue.length }}
                · {{ timing.progress.timed }} besucht</span>
            </div>
            <div class="progress k-progress mb-3" :title="`${timing.progress.timed} von ${timing.progress.total} Blüten besucht`">
              <div class="progress-bar" :style="{width: progressPercent + '%'}"></div>
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
              <h5 class="mb-1" :title="trimHint">Ø {{ msToHumanReadable(timing.avgMs ?? 0) }}s
                <span class="text-muted fw-normal fs-6">≈ {{ msToWingBeats(timing.avgMs ?? 0) }} Flügelschläge</span>
              </h5>
              <p v-if="timing.trimmedReps.size > 0" class="text-muted small mb-1">
                getrimmt: {{ trimPerSide === 1 ? 'schnellster und langsamster Anflug fliegen'
                  : `je ${trimPerSide} schnellste und langsamste Anflüge fliegen` }} aus der Wertung
              </p>
              <p v-if="rating" class="small text-muted mb-2">{{ rating.emoji }} {{ rating.label }}</p>
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
              <div class="text-muted small">Taste 0–9 speichert direkt und fliegt zur nächsten Blüte.</div>
            </div>

            <!-- timer -->
            <div v-else>
              <div class="d-flex align-items-center justify-content-center gap-3">
                <KolibriBird :size="76" :flying="running || btStore.phase === 'awaiting_solve'"/>
                <h1 class="timer noselect my-2"
                    :class="{running: running}"
                    @touchstart.prevent="!btStore.connected && timing.manualToggle()">
                  {{ timerLabel }}
                </h1>
              </div>
              <div class="mb-2">
                <span class="badge text-bg-primary fs-6">
                  Anflug {{ timing.repTimes.length + 1 }} / {{ timing.repsTarget }}
                </span>
              </div>
              <div v-if="btStore.connected" class="text-muted small">
                <template v-if="btStore.phase === 'awaiting_solve'">
                  Bereit zum Abflug — der erste Move startet den Timer.
                </template>
                <template v-else-if="btStore.phase === 'solving'">
                  Im Flug… (D- oder U-Layer 360° drehen = zurück zur Blüte)
                </template>
                <template v-else>Tracking wird vorbereitet…</template>
              </div>
              <div v-else class="text-muted small">
                Leertaste: Versuch starten / stoppen (kein Cube verbunden)
              </div>
              <div v-if="btStore.tooFarFromSolved" class="alert alert-warning py-1 small mt-2 mb-0">
                Von der Blüte abgekommen — falscher Alg? D-Layer 360° drehen setzt den Versuch zurück.
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2 mt-2">
          <button class="btn btn-sm btn-outline-secondary" @click="timing.prevCase()"
                  :disabled="timing.index === 0">
            <i class="bi bi-skip-backward"></i> Blüte zurück
          </button>
          <button class="btn btn-sm btn-outline-secondary" @click="timing.skipCase()">
            Weiterfliegen <i class="bi bi-skip-forward"></i>
          </button>
          <button class="btn btn-sm btn-outline-warning" @click="timing.undoRep()"
                  :disabled="timing.repTimes.length === 0">
            <i class="bi bi-arrow-counterclockwise"></i> Letzten Versuch löschen
          </button>
          <button class="btn btn-sm btn-outline-warning" @click="timing.restartCase()"
                  :disabled="timing.repTimes.length === 0">
            Blüte neu anfliegen
          </button>
          <button class="btn btn-sm btn-outline-danger ms-auto" @click="timing.stop()"
                  title="Session beenden">
            <i class="bi bi-house"></i> Landen
          </button>
        </div>
      </div>

      <!-- rep times -->
      <div class="col-12 col-lg-4">
        <div class="card">
          <div class="card-body">
            <h6 class="card-title">Anflüge
              <span v-if="timing.avgMs !== null" class="text-muted fw-normal"
                    :title="trimHint">
                · Ø {{ msToHumanReadable(timing.avgMs) }}s
                ≈ {{ msToWingBeats(timing.avgMs) }} Flügelschläge
              </span>
            </h6>
            <ol class="mb-0">
              <li v-for="(t, i) in timing.repTimes" :key="i"
                  :class="{'k-trimmed': timing.trimmedReps.has(i), 'k-best': !timing.trimmedReps.has(i) && t === bestCountingMs}">
                <template v-if="timing.trimmedReps.has(i)">
                  <span title="Vom getrimmten Durchschnitt ausgenommen">{{ msToHumanReadable(t) }}</span>
                </template>
                <template v-else>
                  {{ msToHumanReadable(t) }}<span v-if="t === bestCountingMs" title="Schnellster gewerteter Anflug"> 🪶</span>
                </template>
              </li>
            </ol>
            <div v-if="timing.repTimes.length === 0" class="text-muted small">Noch keine Anflüge.</div>
            <div v-else-if="timing.trimmedReps.size > 0" class="text-muted small mt-1">
              Durchgestrichen = getrimmt ({{ timing.trimmedReps.size }} von
              {{ timing.repTimes.length }} Anflügen fliegen aus der Wertung).
            </div>
          </div>
        </div>
        <!-- Nachträgliche Regrip-Korrektur für den zuletzt gespeicherten Case -->
        <RegripCorrection class="mt-2"/>

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
</style>
