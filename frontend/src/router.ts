import { createRouter, createWebHashHistory } from 'vue-router'
import { bootstrap, session } from './session'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/signin', name: 'signin', component: () => import('./views/SignInView.vue'), meta: { public: true } },
    { path: '/', redirect: '/permits' },
    { path: '/permits', name: 'permits', component: () => import('./views/PermitsView.vue') },
    { path: '/permits/new', name: 'permit-new', component: () => import('./views/PermitFormView.vue') },
    { path: '/permits/:id', name: 'permit', component: () => import('./views/PermitDetailView.vue'), props: true },
    { path: '/permits/:id/edit', name: 'permit-edit', component: () => import('./views/PermitFormView.vue'), props: true },
    { path: '/zones', name: 'zones', component: () => import('./views/ZonesView.vue') },
    { path: '/points', name: 'points', component: () => import('./views/PointsView.vue') },
    { path: '/notifications', name: 'notifications', component: () => import('./views/NotificationsView.vue') },
  ],
})

router.beforeEach(async (to) => {
  await bootstrap()
  if (!to.meta.public && !session.user) return { name: 'signin' }
  if (to.name === 'signin' && session.user) return { name: 'permits' }
  return true
})
