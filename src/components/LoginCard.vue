<script setup>
import {ref} from 'vue'
import {useAuthStore} from '@/stores/AuthStore'
import {useAlgsetStore} from '@/stores/AlgsetStore'
import KolibriBird from '@/components/KolibriBird.vue'

const auth = useAuthStore()
const algsets = useAlgsetStore()
const password = ref('')
const busy = ref(false)

const submit = async () => {
  if (busy.value) return
  busy.value = true
  const ok = await auth.login(password.value)
  busy.value = false
  if (ok) algsets.load()
}
</script>

<template>
  <div class="row justify-content-center mt-5">
    <div class="col-12 col-sm-8 col-md-5 col-lg-4">
      <div class="card">
        <div class="card-body">
          <div class="text-center mb-2">
            <KolibriBird :size="70"/>
          </div>
          <h5 class="card-title mb-1 text-center"><i class="bi bi-lock"></i> Kolibri Timer</h5>
          <p class="text-muted small text-center mb-3">Dieser Nektar ist privat — Passwort, bitte.</p>
          <form @submit.prevent="submit">
            <input v-model="password" type="password" class="form-control mb-2"
                   placeholder="Passwort" autofocus autocomplete="current-password">
            <div v-if="auth.error" class="text-danger small mb-2">{{ auth.error }}</div>
            <button class="btn btn-primary w-100" type="submit" :disabled="busy || !password">
              <span v-if="busy" class="spinner-border spinner-border-sm me-1"></span>
              Anmelden
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
