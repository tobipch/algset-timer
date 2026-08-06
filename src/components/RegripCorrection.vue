<script setup>
// Nachträgliche Korrektur der Regrip-Zahl am zuletzt gespeicherten Case —
// für den Fall "0 angegeben, direkt danach den Regrip bemerkt".
import {useTimingStore} from '@/stores/TimingStore'
import {msToHumanReadable} from '@/helpers/time_formatter'

const timing = useTimingStore()
</script>

<template>
  <div v-if="timing.lastSaved" class="card">
    <div class="card-body py-2">
      <div class="small text-muted mb-1">
        Zuletzt: <strong>{{ timing.lastSaved.pair }}</strong>
        · {{ msToHumanReadable(timing.lastSaved.avgMs) }}s
        · {{ timing.lastSaved.regrips }}
        {{ timing.lastSaved.regrips === 1 ? 'Regrip' : 'Regrips' }}
      </div>
      <div class="d-flex align-items-center justify-content-center gap-2 flex-wrap">
        <span class="small">Regrips korrigieren:</span>
        <div class="btn-group btn-group-sm">
          <button v-for="n in [0, 1, 2, 3, 4]" :key="n"
                  class="btn"
                  :class="n === timing.lastSaved.regrips ? 'btn-primary' : 'btn-outline-primary'"
                  :disabled="timing.correctingRegrips"
                  @click="timing.correctLastRegrips(n)">{{ n }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
