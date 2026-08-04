<script setup>
import {computed, ref} from 'vue'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import {useTimingStore} from '@/stores/TimingStore'
import {useDisplayStore} from '@/stores/DisplayStore'
import {msToHumanReadable} from '@/helpers/time_formatter'
import {useRouter} from 'vue-router'

const algsetStore = useAlgsetStore()
const timing = useTimingStore()
const display = useDisplayStore()
const router = useRouter()

const sortKey = ref('pair')   // 'pair' | 'time' | 'regrips' | 'date'
const sortAsc = ref(true)
const exporting = ref(false)

const setSort = (key) => {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    // times/regrips: slowest problems first is the interesting order
    sortAsc.value = key === 'pair'
  }
}

const sortIcon = (key) =>
  sortKey.value !== key ? 'bi-arrow-down-up text-muted' : (sortAsc.value ? 'bi-sort-down-alt' : 'bi-sort-up')

const rows = computed(() => {
  const algset = algsetStore.active
  if (!algset) return []
  const list = algset.cases.map(c => ({
    id: c.id,
    pair: c.pair,
    alg: c.alg,
    avgMs: c.result?.avgMs ?? null,
    regrips: c.result?.regrips ?? null,
    reps: c.result?.timesMs?.length ?? 0,
    date: c.result?.createdAt ?? null,
  }))
  const dir = sortAsc.value ? 1 : -1
  const nullLast = (v) => v === null || v === undefined
  list.sort((a, b) => {
    if (sortKey.value === 'pair') return a.pair.localeCompare(b.pair) * dir
    const key = sortKey.value === 'time' ? 'avgMs' : sortKey.value === 'regrips' ? 'regrips' : 'date'
    // untimed cases always at the bottom
    if (nullLast(a[key]) && nullLast(b[key])) return a.pair.localeCompare(b.pair)
    if (nullLast(a[key])) return 1
    if (nullLast(b[key])) return -1
    if (key === 'date') return (new Date(a.date) - new Date(b.date)) * dir
    return (a[key] - b[key]) * dir || a.pair.localeCompare(b.pair)
  })
  return list
})

const summary = computed(() => {
  const timed = rows.value.filter(r => r.avgMs !== null)
  if (timed.length === 0) return null
  const avg = timed.reduce((s, r) => s + r.avgMs, 0) / timed.length
  const regrips = timed.reduce((s, r) => s + (r.regrips ?? 0), 0)
  return {
    timed: timed.length,
    total: rows.value.length,
    avgS: (avg / 1000).toFixed(2),
    regrips,
  }
})

const timeCase = (row) => {
  const algset = algsetStore.active
  if (!algset) return
  timing.start(algset)
  timing.goToCase(row.id)
  router.push('/timer')
}

const clearCase = async (row) => {
  if (!confirm(`Messung von ${row.pair} löschen?`)) return
  try {
    await algsetStore.clearResult(row.id)
  } catch (e) {
    console.error(e)
    display.showToast('Löschen fehlgeschlagen', 'danger')
  }
}

const formatDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('de-CH', {day: '2-digit', month: '2-digit', year: 'numeric'})
}

const download = async () => {
  const algset = algsetStore.active
  if (!algset || exporting.value) return
  exporting.value = true
  try {
    // exceljs is heavy — load it only when exporting.
    const {buildTimesWorkbook, downloadWorkbook} = await import('@/helpers/xlsx_export')
    const exportRows = algset.cases.map(c => ({
      pair: c.pair,
      alg: c.alg,
      avgS: c.result ? c.result.avgMs / 1000 : null,
      regrips: c.result?.regrips ?? null,
    }))
    const wb = buildTimesWorkbook([{algset, rows: exportRows}])
    await downloadWorkbook(wb, `${algset.buffer}_times.xlsx`)
  } catch (e) {
    console.error('export failed', e)
    display.showToast('Export fehlgeschlagen', 'danger')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div>
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <h4 class="mb-0 me-2">Übersicht</h4>
      <select v-if="algsetStore.algsets.length > 0" class="form-select form-select-sm w-auto"
              v-model="algsetStore.activeId">
        <option v-for="a in algsetStore.algsets" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
      <button v-if="algsetStore.active" class="btn btn-sm btn-success ms-auto"
              :disabled="exporting" @click="download">
        <span v-if="exporting" class="spinner-border spinner-border-sm me-1"></span>
        <i v-else class="bi bi-file-earmark-spreadsheet"></i>
        XLSX herunterladen
      </button>
    </div>

    <div v-if="algsetStore.loading && !algsetStore.loaded" class="text-muted">
      <span class="spinner-border spinner-border-sm"></span> Laden…
    </div>
    <div v-else-if="algsetStore.algsets.length === 0" class="alert alert-info">
      Noch keine Algsets — unter <router-link to="/algsets">Algsets</router-link> eins hochladen.
    </div>

    <template v-else-if="algsetStore.active">
      <div v-if="summary" class="mb-2 small text-muted">
        {{ summary.timed }} / {{ summary.total }} Cases gemessen ·
        Ø Zeit {{ summary.avgS }}s ·
        Total Regrips {{ summary.regrips }}
      </div>

      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle">
          <thead>
            <tr>
              <th class="sortable" @click="setSort('pair')">
                Case <i class="bi" :class="sortIcon('pair')"></i>
              </th>
              <th>Alg</th>
              <th class="sortable text-end" @click="setSort('time')">
                Zeit <i class="bi" :class="sortIcon('time')"></i>
              </th>
              <th class="sortable text-end" @click="setSort('regrips')">
                Regrips <i class="bi" :class="sortIcon('regrips')"></i>
              </th>
              <th class="text-end d-none d-md-table-cell">Versuche</th>
              <th class="sortable text-end d-none d-md-table-cell" @click="setSort('date')">
                Datum <i class="bi" :class="sortIcon('date')"></i>
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" :class="{'table-warning': row.avgMs === null}">
              <td class="fw-bold">{{ row.pair }}</td>
              <td class="alg small">{{ row.alg }}</td>
              <td class="text-end">
                <template v-if="row.avgMs !== null">{{ msToHumanReadable(row.avgMs) }}</template>
                <span v-else class="text-muted">—</span>
              </td>
              <td class="text-end">
                <template v-if="row.regrips !== null">{{ row.regrips }}</template>
                <span v-else class="text-muted">—</span>
              </td>
              <td class="text-end d-none d-md-table-cell">{{ row.reps || '—' }}</td>
              <td class="text-end d-none d-md-table-cell small">{{ formatDate(row.date) }}</td>
              <td class="text-end">
                <button class="btn btn-sm btn-outline-primary py-0 px-1" title="Diesen Case (neu) messen"
                        @click="timeCase(row)">
                  <i class="bi bi-stopwatch"></i>
                </button>
                <button v-if="row.avgMs !== null" class="btn btn-sm btn-outline-danger py-0 px-1 ms-1"
                        title="Messung löschen" @click="clearCase(row)">
                  <i class="bi bi-trash"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
