import {defineStore} from 'pinia'
import {ref} from 'vue'
import {apiFetch, ApiError} from '@/helpers/api'

export const useAuthStore = defineStore('auth', () => {
    const checked = ref(false)     // initial status request finished
    const authRequired = ref(false)
    const authed = ref(false)
    const error = ref(null)

    const check = async () => {
        try {
            const status = await apiFetch('/api/auth')
            authRequired.value = !!status?.authRequired
            authed.value = !!status?.authed
        } catch (e) {
            // API unreachable (e.g. `npm run dev` without `vercel dev`):
            // leave the app usable, requests will fail visibly later.
            console.error('auth check failed', e)
            authRequired.value = false
            authed.value = true
        }
        checked.value = true
    }

    const login = async (password) => {
        error.value = null
        try {
            await apiFetch('/api/auth', {method: 'POST', body: {password}})
            authed.value = true
            return true
        } catch (e) {
            error.value = e instanceof ApiError && e.status === 403
                ? 'Falsches Passwort'
                : 'Login fehlgeschlagen'
            return false
        }
    }

    const logout = async () => {
        try { await apiFetch('/api/auth', {method: 'DELETE'}) } catch (_) {}
        authed.value = false
    }

    return {checked, authRequired, authed, error, check, login, logout}
})
