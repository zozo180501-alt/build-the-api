<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { signIn } from '../session'
import { ROLE_LABEL } from '../api/labels'
import type { Role } from '../api/types'
import { ApiError } from '../api/types'

const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

const demo: { email: string; name: string; role: Role }[] = [
  { email: 'amira.haddad@plant.example', name: 'Amira Haddad', role: 'TECHNICIAN' },
  { email: 'lucas.moreau@plant.example', name: 'Lucas Moreau', role: 'TECHNICIAN' },
  { email: 'priya.nair@plant.example', name: 'Priya Nair', role: 'TECHNICIAN' },
  { email: 'jonas.weber@plant.example', name: 'Jonas Weber (Boiler House, Tank Farm)', role: 'AREA_AUTHORITY' },
  { email: 'elena.rossi@plant.example', name: 'Elena Rossi (Pump House, Packaging)', role: 'AREA_AUTHORITY' },
  { email: 'marta.kowalski@plant.example', name: 'Marta Kowalski', role: 'SAFETY_OFFICER' },
  { email: 'daniel.okafor@plant.example', name: 'Daniel Okafor', role: 'PLANT_MANAGER' },
]

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await signIn(email.value, password.value)
    router.push({ name: 'permits' })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Could not sign in. Try again.'
  } finally {
    busy.value = false
  }
}

function pick(e: string) {
  email.value = e
  password.value = 'demo'
}
</script>

<template>
  <h1>PermitDesk</h1>
  <p class="sub">Permit-to-work for plant maintenance</p>
  <form class="card" @submit.prevent="submit">
    <div v-if="error" class="banner error">{{ error }}</div>
    <div class="field">
      <label for="email">Email</label>
      <input id="email" v-model="email" type="email" autocomplete="username" required />
    </div>
    <div class="field">
      <label for="pw">Password</label>
      <input id="pw" v-model="password" type="password" autocomplete="current-password" required />
    </div>
    <button class="primary" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
  </form>
  <div class="card demo">
    <h2>Demo accounts <span class="muted small">(password: demo)</span></h2>
    <button v-for="d in demo" :key="d.email" type="button" @click="pick(d.email)">
      {{ d.name }} <span class="muted small">· {{ ROLE_LABEL[d.role] }}</span>
    </button>
  </div>
</template>
