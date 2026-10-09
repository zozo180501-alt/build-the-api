<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import * as api from '../api/client'
import type { IsolationPoint } from '../api/types'
import { ApiError } from '../api/types'
import { session, zoneName } from '../session'

const points = ref<IsolationPoint[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const zoneId = ref('')
const state = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    points.value = await api.listIsolationPoints()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Could not load isolation points.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const filtered = computed(() => points.value.filter((p) =>
  (!search.value || p.tag.toLowerCase().includes(search.value.toLowerCase())) &&
  (!zoneId.value || p.zoneId === zoneId.value) && (!state.value || p.state === state.value)))
</script>

<template>
  <h1>Isolation points</h1>
  <p class="sub">Reserved on submission, locked on activation, freed when the permit ends.</p>
  <div class="card filters">
    <div><label>Search</label><input v-model="search" placeholder="Tag" /></div>
    <div><label>Zone</label>
      <select v-model="zoneId"><option value="">Any</option><option v-for="z in session.zones" :key="z.id" :value="z.id">{{ z.name }}</option></select></div>
    <div><label>State</label>
      <select v-model="state"><option value="">Any</option><option>FREE</option><option>RESERVED</option><option>LOCKED</option></select></div>
  </div>
  <div class="card">
    <div v-if="loading" class="state">Loading…</div>
    <div v-else-if="error" class="banner error">{{ error }} <button @click="load">Retry</button></div>
    <div v-else-if="!filtered.length" class="state">No isolation points match.</div>
    <table v-else>
      <thead><tr><th>Tag</th><th>Kind</th><th>Zone</th><th>State</th><th>Held by</th><th>Lock</th></tr></thead>
      <tbody>
        <tr v-for="p in filtered" :key="p.id">
          <td>{{ p.tag }}</td>
          <td>{{ p.kind.toLowerCase() }}</td>
          <td>{{ zoneName(p.zoneId) }}</td>
          <td><span class="badge" :class="p.state === 'LOCKED' ? 's-ACTIVE' : p.state === 'RESERVED' ? 's-SUBMITTED' : ''">{{ p.state }}</span></td>
          <td><RouterLink v-if="p.permitId" :to="{ name: 'permit', params: { id: p.permitId } }">{{ p.permitRef }}</RouterLink><span v-else>—</span></td>
          <td>{{ p.lockNumber ?? '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
