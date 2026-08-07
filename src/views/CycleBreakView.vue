<script setup>
import {computed, onUnmounted, ref, watchEffect} from 'vue'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {useCycleBreakStore} from '@/stores/CycleBreakStore'
import {useBluetoothCubeStore} from '@/stores/BluetoothCubeStore'
import {useSettingsStore} from '@/stores/SettingsStore'
import {msToHumanReadable} from '@/helpers/time_formatter'
import {MODE_LABELS, RATING_LABELS} from '@/helpers/cycle_break'
import {EDGE_BUFFER_ORDER} from '@/helpers/letters'
import KolibriBird from '@/components/KolibriBird.vue'
import KolibriLoading from '@/components/KolibriLoading.vue'

const algsetStore = useAlgsetStore()
const game = useCycleBreakStore()
const btStore = useBluetoothCubeStore()
const settings = useSettingsStore()

const selectedId = ref(null)

// Nur Edge-Algsets: das Minigame würfelt Edge-Stellungen.
const edgeAlgsets = computed(() => algsetStore.algsets.filter(a => a.pieceType === 'edge'))

const selected = computed(() =>
  edgeAlgsets.value.find(a => a.id === selectedId.value) ?? edgeAlgsets.value[0] ?? null)

// Vorauswahl: das in der Übersicht aktive Algset, sonst das erste Edge-Algset.
watchEffect(() => {
  if (selectedId.value === null && selected.value) selectedId.value =
    edgeAlgsets.value.some(a => a.id === algsetStore.activeId) ? algsetStore.activeId : selected.value.id
})

const measured = computed(() => selected.value?.cases.filter(c => c.result).length ?? 0)

const rating = computed(() => game.result ? RATING_LABELS[game.result.rating] : null)

const modeLabel = computed(() => game.round ? MODE_LABELS[game.round.mode] : '')

// Die Memo-Zeile: erst die erzwungenen Targets, dann das Fragezeichen.
const memo = computed(() => {
  if (!game.round) return ''
  const forced = game.round.forced
  const chosen = game.result?.chosen?.letter
  if (game.round.mode === 'inPair') return `${forced[0]}${chosen ?? '?'}`
  return `${forced.join('')} ${chosen ?? '?'}`
})

const bufferOrderHint = computed(() =>
  EDGE_BUFFER_ORDER.filter(name => name !== game.buffer).join(' → '))

const timeLabel = (ms) => (ms === null || ms === undefined ? '–' : `${msToHumanReadable(ms)}s`)

const startGame = () => {
  if (selected.value) {
    selectedId.value = selected.value.id
    game.start(selected.value)
  }
}

onUnmounted(() => game.stop())
</script>

<template>
  <div>
    <!-- Setup -->
    <div v-if="game.stage === 'idle'" class="row justify-content-center">
      <div class="col-12 col-md-9 col-lg-7">
        <h4 class="k-title mb-1">Weggabelung</h4>
        <p class="text-muted small">
          Cycle-Break-Training: Du bekommst eine Stellung mit 4–6 ungelösten Edges, bei der
          der erste freie Break entweder <em>mitten im ersten Letterpair</em> (A[BREAK]) oder
          <em>direkt nach dem ersten Commutator</em> (AB [BREAK]) fällt. Der Buffer ist immer
          ungelöst — es geht ausdrücklich um die Fälle, in denen Floaten keine Option ist.
        </p>

        <KolibriLoading v-if="!algsetStore.loaded && algsetStore.loading"/>
        <div v-else-if="edgeAlgsets.length === 0" class="alert alert-info">
          Noch kein Edge-Algset da — zuerst unter
          <router-link to="/algsets">Algsets</router-link> eines hochladen. Die gemessenen
          Zeiten daraus sind die Grundlage der Bewertung.
        </div>

        <div v-else class="card">
          <div class="card-body">
            <label class="form-label small mb-1">Algset (Buffer und Zeiten)</label>
            <select class="form-select mb-3" v-model="selectedId">
              <option v-for="a in edgeAlgsets" :key="a.id" :value="a.id">
                {{ a.name }} · Buffer {{ a.buffer }} ({{ a.cases.filter(c => c.result).length }} Zeiten)
              </option>
            </select>

            <label class="form-label small mb-1">Wo soll der Break liegen?</label>
            <select class="form-select mb-3" v-model="settings.store.breakMode">
              <option value="mixed">Gemischt</option>
              <option value="inPair">{{ MODE_LABELS.inPair }}</option>
              <option value="afterPair">{{ MODE_LABELS.afterPair }}</option>
            </select>

            <label class="form-label small mb-1">Wertung im Letterpair vergleicht mit…</label>
            <select class="form-select mb-3" v-model="settings.store.breakRatingScope">
              <option value="available">…den Breaks, die diese Stellung anbietet</option>
              <option value="algset">…allen gemessenen Comms derselben Spalte</option>
            </select>

            <div class="form-check mb-3">
              <input class="form-check-input" type="checkbox" id="break-show-targets"
                     v-model="settings.store.breakShowTargets">
              <label class="form-check-label" for="break-show-targets">
                Erzwungene Targets vorgeben (sonst selbst tracen)
              </label>
            </div>

            <div v-if="measured === 0" class="alert alert-warning py-2 small">
              Für dieses Algset sind noch keine Zeiten gemessen. Breaks <strong>nach</strong> dem
              Letterpair lassen sich trotzdem werten (Buffer-Reihenfolge), Breaks
              <strong>im</strong> Letterpair nicht.
            </div>
            <div v-if="!btStore.connected" class="alert alert-warning py-2 small">
              <i class="bi bi-bluetooth"></i> Kein Smartcube verbunden — die Wahl lässt sich
              auch per Knopf angeben, aber gedacht ist das Spiel für den Cube.
            </div>

            <button class="btn btn-primary w-100" :disabled="!selected" @click="startGame">
              <i class="bi bi-signpost-split"></i> Losfliegen!
            </button>
            <p v-if="game.error" class="text-danger small mt-2 mb-0">{{ game.error }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Runde läuft -->
    <div v-else class="row g-3">
      <div class="col-12 col-lg-8">
        <div class="card">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <div class="text-muted small">{{ game.algset?.name }} · Buffer {{ game.buffer }}</div>
                <div class="fw-semibold">{{ modeLabel }}</div>
              </div>
              <span v-if="game.round" class="badge text-bg-secondary">
                {{ game.round.unsolvedCount }} Edges offen
              </span>
            </div>

            <div v-if="game.stage === 'preparing'" class="text-center py-4">
              <KolibriLoading/>
              <div class="text-muted small mt-2">Stellung wird gesucht…</div>
            </div>

            <template v-else-if="game.round">
              <!-- Scramble -->
              <div class="mb-3">
                <div class="text-muted small mb-1">Scramble (auf den gelösten Cube anwenden)</div>
                <div class="alg fs-5 k-scramble">{{ game.round.scramble }}</div>
              </div>

              <div v-if="game.stage === 'scramble'" class="alert alert-info py-2 small mb-3">
                <i class="bi bi-arrow-repeat"></i>
                <template v-if="btStore.connected">
                  Scramble anwenden — sobald die Stellung stimmt, geht es weiter.
                </template>
                <template v-else>
                  Scramble anwenden und dann bestätigen.
                </template>
              </div>

              <!-- Aufgabe -->
              <div v-if="game.stage !== 'scramble'" class="text-center py-2">
                <div class="d-flex justify-content-center mb-2">
                  <KolibriBird :size="70" :flying="game.stage === 'choice'"/>
                </div>
                <div v-if="settings.store.breakShowTargets">
                  <div class="text-muted small">Memo bis zum Break</div>
                  <div class="display-5 fw-bold noselect">{{ memo }}</div>
                  <div class="text-muted small mb-2">
                    {{ game.buffer }} → {{ game.round.forced.join(' → ') }} → ?
                  </div>
                </div>
                <div v-else class="text-muted small mb-2">
                  Selbst tracen: nach
                  {{ game.round.mode === 'inPair' ? 'dem ersten Target' : 'dem ersten Commutator' }}
                  schliesst sich der Zyklus.
                </div>
                <div v-if="game.stage === 'choice'" class="small text-muted">
                  <span v-if="game.round.mode === 'afterPair' && game.firstCommDone"
                        class="badge text-bg-success me-1">Erster Comm erledigt</span>
                  Wohin breakst du?
                </div>
              </div>

              <!-- Wahl -->
              <div v-if="game.stage === 'choice'" class="mt-2">
                <div class="d-flex flex-wrap gap-2 justify-content-center">
                  <button v-for="c in game.round.candidates" :key="c.sticker"
                          class="btn btn-outline-primary"
                          :title="`${c.sticker} (${c.piece})`"
                          @click="game.choose(c.sticker)">
                    {{ c.letter }} <span class="small text-muted">{{ c.sticker }}</span>
                  </button>
                </div>
                <p class="text-muted small text-center mt-2 mb-0">
                  Mit Cube einfach ausführen — die Knöpfe sind für den Notfall (oder ohne Cube).
                </p>
              </div>

              <!-- Feedback -->
              <div v-if="game.stage === 'feedback' && game.result" class="mt-3">
                <hr>
                <div class="text-center">
                  <h4 :class="`text-${rating.variant}`">
                    {{ rating.emoji }} {{ rating.label }}
                  </h4>
                  <p class="mb-1">
                    Gewählt: <strong>{{ game.result.chosen?.letter }}</strong>
                    <span class="text-muted small">({{ game.result.chosen?.sticker }})</span>
                  </p>
                  <p class="text-muted small">{{ game.result.reason }}</p>
                </div>

                <table class="table table-sm align-middle mb-2">
                  <thead>
                    <tr class="small text-muted">
                      <th>#</th>
                      <th>Break</th>
                      <th>Piece</th>
                      <template v-if="game.round.mode === 'inPair'">
                        <th>Comm</th>
                        <th>Zeit</th>
                      </template>
                      <template v-else>
                        <th>Buffer-Reihenfolge</th>
                        <th>Ø Comms des Pieces</th>
                      </template>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="o in game.options" :key="o.sticker"
                        :class="{'table-active': o.sticker === game.result.chosen?.sticker}">
                      <td class="text-muted small">{{ o.rank }}</td>
                      <td>
                        <strong>{{ o.letter }}</strong>
                        <span class="text-muted small ms-1">{{ o.sticker }}</span>
                        <i v-if="o.sticker === game.result.chosen?.sticker"
                           class="bi bi-arrow-left-short"></i>
                      </td>
                      <td class="small">{{ o.positionName }}</td>
                      <template v-if="game.round.mode === 'inPair'">
                        <td class="small">{{ o.pair ?? '–' }}</td>
                        <td class="small">{{ timeLabel(o.avgMs) }}</td>
                      </template>
                      <template v-else>
                        <td class="small">
                          {{ o.bufferOrderIndex === null ? '–' : `#${o.bufferOrderIndex + 1}` }}
                        </td>
                        <td class="small">{{ timeLabel(o.columnAvgMs) }}</td>
                      </template>
                    </tr>
                  </tbody>
                </table>
                <p v-if="game.round.mode === 'afterPair'" class="text-muted small mb-0">
                  Deine Buffer-Reihenfolge ab {{ game.buffer }}: {{ bufferOrderHint }}
                </p>
                <p class="text-muted small mb-0">
                  <i class="bi bi-arrow-right-circle"></i>
                  Cube fertig lösen — dann startet die nächste Runde von selbst.
                </p>
              </div>
            </template>
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2 mt-2">
          <button v-if="game.stage === 'scramble'" class="btn btn-sm btn-outline-primary"
                  @click="game.confirmScrambled()">
            <i class="bi bi-check2"></i> Scramble angewendet
          </button>
          <button v-if="game.stage === 'feedback'" class="btn btn-sm btn-primary"
                  @click="game.nextRound()">
            Nächste Runde <i class="bi bi-arrow-right"></i>
          </button>
          <button class="btn btn-sm btn-outline-secondary" @click="game.syncSolved()"
                  title="Virtuellen Cube zurücksetzen — nur drücken, wenn der Cube wirklich gelöst ist">
            <i class="bi bi-arrow-clockwise"></i> Cube ist gelöst
          </button>
          <button class="btn btn-sm btn-outline-secondary" @click="game.skipRound()">
            Stellung überspringen
          </button>
          <button class="btn btn-sm btn-outline-danger ms-auto" @click="game.stop()">
            <i class="bi bi-house"></i> Landen
          </button>
        </div>
      </div>

      <!-- Statistik -->
      <div class="col-12 col-lg-4">
        <div class="card">
          <div class="card-body">
            <h6 class="card-title">Diese Session</h6>
            <div class="d-flex justify-content-between"><span>⚡ Exzellent</span>
              <strong>{{ game.stats.excellent }}</strong></div>
            <div class="d-flex justify-content-between"><span>🕊️ In Ordnung</span>
              <strong>{{ game.stats.ok }}</strong></div>
            <div class="d-flex justify-content-between"><span>🥀 Schwach</span>
              <strong>{{ game.stats.weak }}</strong></div>
            <div v-if="game.stats.unknown > 0" class="d-flex justify-content-between text-muted">
              <span>❓ Nicht bewertbar</span><strong>{{ game.stats.unknown }}</strong>
            </div>
            <hr class="my-2">
            <div class="d-flex justify-content-between"><span>Runden</span>
              <strong>{{ game.stats.rounds }}</strong></div>
            <div class="d-flex justify-content-between"><span>Serie exzellent</span>
              <strong>{{ game.stats.streak }} <span class="text-muted small">(best {{ game.stats.bestStreak }})</span></strong>
            </div>
          </div>
        </div>

        <div class="card mt-2">
          <div class="card-body small text-muted">
            <div class="fw-semibold mb-1">Woran gemessen wird</div>
            <div class="mb-1">
              <strong>Im Letterpair:</strong> das erste Target steht fest, es zählt der schnellste
              Comm — Top 3 exzellent, Top 7 in Ordnung.
            </div>
            <div>
              <strong>Nach dem Letterpair:</strong> es zählt der Break zum nächsten Buffer deiner
              Reihenfolge (mögliches Sandwich); alles andere ist schwach.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.k-scramble {
  word-spacing: 0.35em;
}
</style>
