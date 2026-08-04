import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'

// bootstrap + icons
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap'
import 'bootstrap-icons/font/bootstrap-icons.css'
import '@/assets/global.css'
import '@/assets/kolibri.css'

import { useAuthStore } from '@/stores/AuthStore'
import { useAlgsetStore } from '@/stores/AlgsetStore'

// Follow the OS color scheme (Bootstrap 5.3 data-bs-theme)
const applyTheme = (dark) =>
  document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light')
const media = window.matchMedia('(prefers-color-scheme: dark)')
applyTheme(media.matches)
media.addEventListener('change', (e) => applyTheme(e.matches))

const app = createApp(App)
const pinia = createPinia()
app.use(router)
app.use(pinia)
app.mount('#app')

// Check auth first, then load the algsets in the background.
const auth = useAuthStore(pinia)
const algsets = useAlgsetStore(pinia)
auth.check().then(() => {
  if (!auth.authRequired || auth.authed) algsets.load()
})
