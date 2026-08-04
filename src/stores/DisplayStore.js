import {defineStore} from 'pinia'
import {ref} from 'vue'

let nextToastId = 1

export const useDisplayStore = defineStore('display', () => {
    // [{id, message, variant}] — variant is a bootstrap color: success/info/danger
    const toasts = ref([])

    const showToast = (message, variant = 'info', timeoutMs = 4000) => {
        const id = nextToastId++
        toasts.value.push({id, message, variant})
        setTimeout(() => dismissToast(id), timeoutMs)
    }

    const dismissToast = (id) => {
        toasts.value = toasts.value.filter(t => t.id !== id)
    }

    return {toasts, showToast, dismissToast}
})
