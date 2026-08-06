import {defineStore} from 'pinia'
import {ref, computed} from 'vue'
import {apiFetch} from '@/helpers/api'
import {useDisplayStore} from '@/stores/DisplayStore'

// Algsets and their cases incl. the latest result per case, loaded from the
// API. An algset: {id, name, pieceType, buffer, createdAt, cases: [
//   {id, pair, alg, sortIndex, result: {timesMs, avgMs, regrips, createdAt}|null}
// ]}
export const useAlgsetStore = defineStore('algsets', () => {
    const algsets = ref([])
    const loading = ref(false)
    const loaded = ref(false)
    const activeId = ref(null)

    const active = computed(() =>
        algsets.value.find(a => a.id === activeId.value) ?? null)

    const load = async () => {
        loading.value = true
        try {
            const data = await apiFetch('/api/algsets')
            algsets.value = data?.algsets ?? []
            if (activeId.value === null && algsets.value.length > 0) {
                activeId.value = algsets.value[0].id
            }
            loaded.value = true
        } catch (e) {
            console.error('loading algsets failed', e)
            useDisplayStore().showToast('Algsets konnten nicht geladen werden — läuft die API / stimmt die DB-Konfiguration?', 'danger')
        } finally {
            loading.value = false
        }
    }

    const create = async ({name, pieceType, buffer, cases}) => {
        const created = await apiFetch('/api/algsets', {
            method: 'POST',
            body: {name, pieceType, buffer, cases},
        })
        await load()
        if (created?.id) activeId.value = created.id
        return created?.id
    }

    const remove = async (id) => {
        await apiFetch(`/api/algsets?id=${id}`, {method: 'DELETE'})
        algsets.value = algsets.value.filter(a => a.id !== id)
        if (activeId.value === id) {
            activeId.value = algsets.value[0]?.id ?? null
        }
    }

    const saveResult = async (caseId, timesMs, regrips) => {
        const data = await apiFetch('/api/results', {
            method: 'POST',
            body: {caseId, timesMs, regrips},
        })
        applyResult(caseId, data?.result ?? null)
        return data?.result
    }

    // Nachträgliche Korrektur der Regrips — die Zeiten bleiben unangetastet.
    const updateRegrips = async (caseId, regrips) => {
        const data = await apiFetch('/api/results', {
            method: 'PATCH',
            body: {caseId, regrips},
        })
        applyResult(caseId, data?.result ?? null)
        return data?.result
    }

    const clearResult = async (caseId) => {
        await apiFetch(`/api/results?caseId=${caseId}`, {method: 'DELETE'})
        applyResult(caseId, null)
    }

    const applyResult = (caseId, result) => {
        for (const algset of algsets.value) {
            const c = algset.cases.find(c => c.id === caseId)
            if (c) { c.result = result; return }
        }
    }

    return {
        algsets, loading, loaded, activeId, active,
        load, create, remove, saveResult, updateRegrips, clearResult,
    }
})
