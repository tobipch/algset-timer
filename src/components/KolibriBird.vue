<script setup>
// Der Haus-Kolibri: ein stilisierter SVG-Vogel. Mit `flying` schwirrt er
// (Flügel flattern, sanftes Auf und Ab), sonst sitzt er still.
defineProps({
  size: { type: Number, default: 40 },
  flying: { type: Boolean, default: false },
})

// Eindeutige Gradient-IDs, falls mehrere Kolibris auf der Seite schwirren.
const uid = Math.random().toString(36).slice(2, 8)
</script>

<template>
  <svg class="kolibri" :class="{ flying }" :width="size" :height="size * 0.8"
       viewBox="0 0 64 52" fill="none" aria-hidden="true">
    <defs>
      <linearGradient :id="`k-body-${uid}`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#12b077"/>
        <stop offset="55%" stop-color="#0a8f8f"/>
        <stop offset="100%" stop-color="#2b6cb0"/>
      </linearGradient>
      <linearGradient :id="`k-wing-${uid}`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#28d19a"/>
        <stop offset="100%" stop-color="#7c5cd6"/>
      </linearGradient>
    </defs>
    <g class="bird">
      <!-- Schwanzfedern -->
      <path d="M14 34 L2 46 L10 32 Z" fill="#2b6cb0" opacity="0.9"/>
      <path d="M15 36 L7 48 L17 35 Z" fill="#7c5cd6" opacity="0.8"/>
      <!-- Körper -->
      <path d="M10 33 C13 24 26 18 36 21 C45 24 46 33 38 37 C28 42 15 41 10 33 Z" :fill="`url(#k-body-${uid})`"/>
      <!-- Kehlfleck (Gorget) -->
      <path d="M37 30 C41 28 45 30 43 34 C41 37 36 35 37 30 Z" fill="#e0388f"/>
      <!-- Kopf -->
      <circle cx="41" cy="23" r="7" :fill="`url(#k-body-${uid})`"/>
      <!-- Auge -->
      <circle cx="43.6" cy="21.4" r="1.4" fill="#10222c"/>
      <circle cx="44.1" cy="20.9" r="0.45" fill="#ffffff"/>
      <!-- Schnabel -->
      <path d="M47 21.5 L63 18.5 L47 25 Z" fill="#4a3728"/>
      <!-- Flügel -->
      <path class="wing" d="M27 27 C17 12 33 4 40 12 C44 17 38 25 27 27 Z" :fill="`url(#k-wing-${uid})`"/>
    </g>
  </svg>
</template>

<style scoped>
/* Die Keyframes (k-flap, k-hover) sind global in kolibri.css definiert,
   damit auch der Navbar-Hover sie nutzen kann. */
.kolibri {
  overflow: visible;
}
.wing {
  transform-origin: 28px 26px;
  transform: rotate(8deg);
}
.kolibri.flying .wing {
  animation: k-flap 0.12s ease-in-out infinite alternate;
}
.kolibri.flying .bird {
  animation: k-hover 0.9s ease-in-out infinite alternate;
}
@media (prefers-reduced-motion: reduce) {
  .kolibri.flying .wing, .kolibri.flying .bird { animation: none; }
}
</style>
