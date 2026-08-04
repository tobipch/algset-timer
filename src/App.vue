<script setup>
import NavBar from '@/components/NavBar.vue'
import LoginCard from '@/components/LoginCard.vue'
import {useAuthStore} from '@/stores/AuthStore'
import {useDisplayStore} from '@/stores/DisplayStore'

const auth = useAuthStore()
const display = useDisplayStore()
</script>

<template>
  <NavBar/>

  <div class="container-lg py-3">
    <div v-if="!auth.checked" class="text-center py-5">
      <div class="spinner-border" role="status"></div>
    </div>
    <LoginCard v-else-if="auth.authRequired && !auth.authed"/>
    <router-view v-else/>
  </div>

  <!-- toasts -->
  <div class="toast-container position-fixed bottom-0 end-0 p-3">
    <div v-for="toast in display.toasts" :key="toast.id"
         class="toast show align-items-center border-0"
         :class="'text-bg-' + toast.variant">
      <div class="d-flex">
        <div class="toast-body">{{ toast.message }}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto"
                @click="display.dismissToast(toast.id)"></button>
      </div>
    </div>
  </div>
</template>
