<script setup>
import {ref} from 'vue'
import {Dropdown} from 'bootstrap'
import {useBluetoothCubeStore} from '@/stores/BluetoothCubeStore'

const btStore = useBluetoothCubeStore()
const toggleButton = ref(null)

// Bootstrap doesn't reliably auto-close the menu when Vue re-renders it on
// connection state change — close it explicitly around every action.
const closeMenu = () => {
  if (toggleButton.value) Dropdown.getOrCreateInstance(toggleButton.value).hide()
}

const connect = (brand) => { closeMenu(); btStore.connect(brand) }
const connectKeyboard = () => { closeMenu(); btStore._getInternals().connectKeyboard() }
const disconnect = () => { closeMenu(); btStore.disconnect() }
</script>

<template>
  <nav class="navbar navbar-expand bg-body-tertiary border-bottom">
    <div class="container-lg">
      <router-link class="navbar-brand" to="/">
        <i class="bi bi-stopwatch"></i> Algset Timer
      </router-link>

      <ul class="navbar-nav me-auto">
        <li class="nav-item">
          <router-link class="nav-link" active-class="active" to="/timer">
            <i class="bi bi-play-circle"></i><span class="d-none d-sm-inline"> Timing</span>
          </router-link>
        </li>
        <li class="nav-item">
          <router-link class="nav-link" active-class="active" to="/" exact-active-class="active">
            <i class="bi bi-table"></i><span class="d-none d-sm-inline"> Übersicht</span>
          </router-link>
        </li>
        <li class="nav-item">
          <router-link class="nav-link" active-class="active" to="/algsets">
            <i class="bi bi-collection"></i><span class="d-none d-sm-inline"> Algsets</span>
          </router-link>
        </li>
      </ul>

      <!-- Smart cube connection -->
      <div class="dropdown">
        <button ref="toggleButton" class="btn btn-sm dropdown-toggle"
                :class="btStore.connected ? 'btn-success' : 'btn-outline-secondary'"
                data-bs-toggle="dropdown"
                @pointerenter="btStore.warmupLibraries()"
                @click="btStore.warmupLibraries()">
          <i class="bi bi-bluetooth"></i>
          <span v-if="btStore.connected" class="d-none d-sm-inline">
            {{ btStore.deviceName }}
            <span v-if="btStore.battery !== null" class="ms-1 small">{{ btStore.battery }}%</span>
          </span>
        </button>
        <ul class="dropdown-menu dropdown-menu-end">
          <template v-if="!btStore.connected">
            <li><button class="dropdown-item" @click="connect('moyu')">
              <i class="bi bi-bluetooth"></i> MoYu / QiYi verbinden
            </button></li>
            <li><button class="dropdown-item" @click="connect('gan')">
              <i class="bi bi-bluetooth"></i> GAN verbinden
            </button></li>
            <li><hr class="dropdown-divider"></li>
            <li><button class="dropdown-item" @click="connectKeyboard()">
              <i class="bi bi-keyboard"></i> Keyboard-Simulator
            </button></li>
          </template>
          <template v-else>
            <li><span class="dropdown-item-text small text-muted">
              {{ btStore.deviceName }}
              <span v-if="btStore.battery !== null"> · Akku {{ btStore.battery }}%</span>
            </span></li>
            <li><button class="dropdown-item" @click="disconnect()">
              <i class="bi bi-x-circle"></i> Trennen
            </button></li>
          </template>
        </ul>
      </div>
    </div>
  </nav>
</template>
