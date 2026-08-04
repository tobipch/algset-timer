<script setup>
import {computed, ref, watch} from 'vue'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {useDisplayStore} from '@/stores/DisplayStore'
import {EDGE_BUFFERS, CORNER_BUFFERS} from '@/helpers/letters'
import {parseSimpleText, parseAlgfoldedJson} from '@/helpers/parse_algset'

const algsetStore = useAlgsetStore()
const display = useDisplayStore()

// --- upload form ---
const name = ref('')
const pieceType = ref('edge')
const buffer = ref('UF')
const format = ref('text') // 'text' | 'json'
const input = ref('')
const busy = ref(false)

const bufferOptions = computed(() =>
  pieceType.value === 'corner' ? CORNER_BUFFERS : EDGE_BUFFERS)

watch(pieceType, () => {
  buffer.value = pieceType.value === 'corner' ? 'UFR' : 'UF'
})

// Suggest a name from the buffer as long as the user hasn't typed one.
const nameTouched = ref(false)
watch(buffer, () => {
  if (!nameTouched.value) name.value = `${buffer.value} Comms`
}, {immediate: true})

const parsed = computed(() => {
  if (!input.value.trim()) return {cases: [], errors: []}
  return format.value === 'json'
    ? parseAlgfoldedJson(input.value, buffer.value)
    : parseSimpleText(input.value, buffer.value)
})

const onFile = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  input.value = await file.text()
  if (file.name.endsWith('.json')) format.value = 'json'
  event.target.value = ''
}

const submit = async () => {
  if (busy.value || parsed.value.cases.length === 0) return
  busy.value = true
  try {
    await algsetStore.create({
      name: name.value.trim(),
      pieceType: pieceType.value,
      buffer: buffer.value,
      cases: parsed.value.cases,
    })
    display.showToast(`Algset "${name.value.trim()}" mit ${parsed.value.cases.length} Cases angelegt`, 'success')
    input.value = ''
    nameTouched.value = false
    name.value = `${buffer.value} Comms`
  } catch (e) {
    console.error('creating algset failed', e)
    display.showToast('Anlegen fehlgeschlagen — API/DB prüfen', 'danger')
  } finally {
    busy.value = false
  }
}

const removeAlgset = async (algset) => {
  const timed = algset.cases.filter(c => c.result).length
  const warning = timed > 0
    ? `Algset "${algset.name}" wirklich löschen? ${timed} gemessene Cases gehen verloren!`
    : `Algset "${algset.name}" wirklich löschen?`
  if (!confirm(warning)) return
  try {
    await algsetStore.remove(algset.id)
    display.showToast('Algset gelöscht', 'info')
  } catch (e) {
    console.error('deleting algset failed', e)
    display.showToast('Löschen fehlgeschlagen', 'danger')
  }
}

const placeholder = computed(() => format.value === 'json'
  ? '{ "ACE": { "algs": ["[L2 U: [L2, S\']]", ...], "buffers": { "UF": ["UL", "UB"], ... } }, ... }'
  : `Ein Case pro Zeile, z.B.:\nBA: [R2 U': [R2, S]]\noder wie in deinem Sheet:\n[R2 U': [R2, S]] (BA)`)
</script>

<template>
  <div class="row g-4">
    <!-- existing algsets -->
    <div class="col-12 col-lg-5">
      <h4>Algsets</h4>
      <div v-if="algsetStore.loading" class="text-muted"><span class="spinner-border spinner-border-sm"></span> Laden…</div>
      <div v-else-if="algsetStore.algsets.length === 0" class="text-muted">
        Noch keine Algsets — rechts eins hochladen.
      </div>
      <div v-for="algset in algsetStore.algsets" :key="algset.id" class="card mb-2">
        <div class="card-body py-2 d-flex align-items-center">
          <div class="me-auto">
            <strong>{{ algset.name }}</strong>
            <span class="badge text-bg-secondary ms-2">{{ algset.buffer }}</span>
            <span class="badge text-bg-light ms-1">{{ algset.pieceType === 'corner' ? 'Corner' : 'Edge' }}</span>
            <div class="small text-muted">
              {{ algset.cases.filter(c => c.result).length }} / {{ algset.cases.length }} Cases gemessen
            </div>
          </div>
          <router-link class="btn btn-sm btn-outline-primary me-2" to="/timer"
                       @click="algsetStore.activeId = algset.id">
            <i class="bi bi-play-fill"></i>
          </router-link>
          <button class="btn btn-sm btn-outline-danger" @click="removeAlgset(algset)">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- upload -->
    <div class="col-12 col-lg-7">
      <h4>Algset hochladen</h4>
      <div class="card">
        <div class="card-body">
          <div class="row g-2 mb-2">
            <div class="col-6 col-md-4">
              <label class="form-label small mb-1">Piece-Typ</label>
              <select v-model="pieceType" class="form-select form-select-sm">
                <option value="edge">Edges</option>
                <option value="corner">Corners</option>
              </select>
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label small mb-1">Buffer</label>
              <select v-model="buffer" class="form-select form-select-sm">
                <option v-for="b in bufferOptions" :key="b" :value="b">{{ b }}</option>
              </select>
            </div>
            <div class="col-12 col-md-5">
              <label class="form-label small mb-1">Name</label>
              <input v-model="name" @input="nameTouched = true" class="form-control form-control-sm">
            </div>
          </div>

          <div class="btn-group btn-group-sm mb-2" role="group">
            <input type="radio" class="btn-check" id="fmt-text" value="text" v-model="format">
            <label class="btn btn-outline-secondary" for="fmt-text">Text / Liste</label>
            <input type="radio" class="btn-check" id="fmt-json" value="json" v-model="format">
            <label class="btn btn-outline-secondary" for="fmt-json">Algfolded-JSON</label>
          </div>

          <textarea v-model="input" rows="10" class="form-control form-control-sm alg mb-2"
                    :placeholder="placeholder"></textarea>

          <div class="d-flex align-items-center gap-2 mb-2">
            <input type="file" class="form-control form-control-sm w-auto"
                   accept=".txt,.csv,.json" @change="onFile">
          </div>

          <div v-if="input.trim()" class="mb-2">
            <span class="badge" :class="parsed.cases.length > 0 ? 'text-bg-success' : 'text-bg-danger'">
              {{ parsed.cases.length }} Cases erkannt
            </span>
            <span v-if="parsed.errors.length > 0" class="badge text-bg-warning ms-1">
              {{ parsed.errors.length }} Probleme
            </span>
            <ul v-if="parsed.errors.length > 0" class="small text-danger mt-1 mb-0">
              <li v-for="(err, i) in parsed.errors.slice(0, 10)" :key="i">{{ err }}</li>
              <li v-if="parsed.errors.length > 10">… und {{ parsed.errors.length - 10 }} weitere</li>
            </ul>
          </div>

          <button class="btn btn-primary" :disabled="busy || !name.trim() || parsed.cases.length === 0"
                  @click="submit">
            <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>
            Algset anlegen
          </button>
        </div>
      </div>

      <div class="text-muted small mt-2">
        <p class="mb-1"><strong>Text-Format:</strong> ein Case pro Zeile — <code>BA: [Alg]</code> oder
          <code>[Alg] (BA)</code> (so wie die Zellen im BLD-Sheet). Zeilen mit <code>#</code> werden ignoriert.</p>
        <p class="mb-0"><strong>Algfolded-JSON:</strong> <code>edge_comms.json</code> /
          <code>corner_comms.json</code> aus Algfolded hochladen — die Cases für den gewählten Buffer werden
          extrahiert (jeweils der erste Alg pro Case). Buchstaben: Speffz.</p>
      </div>
    </div>
  </div>
</template>
