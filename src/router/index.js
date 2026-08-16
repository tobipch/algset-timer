import {createRouter, createWebHashHistory} from 'vue-router'
import OverviewView from '@/views/OverviewView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'overview', component: OverviewView },
    { path: '/timer', name: 'timer', component: () => import('@/views/TimerView.vue') },
    { path: '/breaks', name: 'breaks', component: () => import('@/views/CycleBreakView.vue') },
    { path: '/algsets', name: 'algsets', component: () => import('@/views/AlgsetsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
