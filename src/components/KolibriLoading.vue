<script setup>
// Ladeindikator: statt eines Spinners schwirrt der Kolibri von Blüte zu Blüte.
import KolibriBird from '@/components/KolibriBird.vue'

defineProps({
  text: { type: String, default: 'Der Kolibri sucht die Blüten…' },
  size: { type: Number, default: 34 },
})
</script>

<template>
  <div class="d-flex align-items-center gap-2 text-muted">
    <span class="k-drift"><KolibriBird :size="size" :flying="true"/></span>
    <span>{{ text }}</span>
  </div>
</template>

<style scoped>
.k-drift {
  display: inline-block;
  animation: k-drift 2.2s ease-in-out infinite alternate;
}
@keyframes k-drift {
  from { transform: translateX(0); }
  to   { transform: translateX(14px); }
}
@media (prefers-reduced-motion: reduce) {
  .k-drift { animation: none; }
}
</style>
