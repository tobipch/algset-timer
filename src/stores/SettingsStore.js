import {defineStore} from 'pinia'
import {reactive, watch} from 'vue'

const STORAGE_KEY = 'algset-timer-settings'

const defaults = () => ({
    reps: 12,              // attempts per case
    cubeOrientation: '',   // e.g. "z2" if the cube is held white-top-red-front etc.
    skipCompleted: true,   // timing session skips cases that already have a result
    timerUpdate: 'on',     // 'on' | 'seconds' | 'off'

    // Cycle break trainer
    breakMode: 'mixed',            // 'inPair' | 'afterPair' | 'mixed'
    breakRatingScope: 'available', // 'available' (rank among the offered breaks)
                                   // | 'algset' (rank in the whole column)
    breakShowTargets: true,        // show the forced targets before the break
})

export const useSettingsStore = defineStore('settings', () => {
    const store = reactive(defaults())

    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
        for (const key of Object.keys(store)) {
            if (key in saved) store[key] = saved[key]
        }
    } catch (_) { /* corrupted storage: keep defaults */ }

    watch(store, () => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)) } catch (_) {}
    }, {deep: true})

    return {store}
})
