<script setup lang="ts">
import { useRouter } from 'vue-router'
import { session, signOut } from './session'
import { ROLE_LABEL } from './api/labels'

const router = useRouter()
function leave() {
  signOut()
  router.push({ name: 'signin' })
}
</script>

<template>
  <header v-if="session.user" class="topbar">
    <div class="brand">PermitDesk <span>Northfield Foods</span></div>
    <nav>
      <RouterLink to="/permits">Permits</RouterLink>
      <RouterLink to="/zones">Zones</RouterLink>
      <RouterLink to="/points">Isolation points</RouterLink>
      <RouterLink to="/notifications">
        Notifications
        <span v-if="session.notificationCount" class="count">{{ session.notificationCount }}</span>
      </RouterLink>
    </nav>
    <div class="who">
      <strong>{{ session.user.name }}</strong>
      <small>{{ ROLE_LABEL[session.user.role] }}</small>
      <button class="link" @click="leave">Sign out</button>
    </div>
  </header>
  <main :class="{ narrow: !session.user }">
    <RouterView />
  </main>
</template>
