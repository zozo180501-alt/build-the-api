<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import * as api from '../api/client'
import type { Zone } from '../api/types'
import { ApiError } from '../api/types'
import { session } from '../session'

const zones = ref<Zone[]>([])
const permitRefs = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref('')
const busyZone = ref('')
const reasons = ref<Record<string, string>>({})
const formError = ref<Record<string, string>>({})
const isSafety = computed(() => session.user?.role === 'SAFETY_OFFICER')

async function load() {
  loading.value = true
  error.value = ''
  try {
    zones.value = await api.listZones()
    const page = await api.listPermits({ status: 'ACTIVE', pageSize: 50 })
    permitRefs.value = Object.fromEntries(page.items.map((p) => [p.id, `${p.ref} · ${p.title}`]))
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Could not load zones.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function toggle(z: Zone) {
  busyZone.value = z.id
  formError.value = { ...formError.value, [z.id]: '' }
  try {
    zones.value = await api.setZoneRestricted(z.id, !z.restricted, reasons.value[z.id] ?? '')
    reasons.value[z.id] = ''
    await load()
  } catch (e) {
    formError.value = { ...formError.value, [z.id]: e instanceof ApiError ? e.message : 'Failed.' }
  } finally {
    busyZone.value = ''
  }
}
</script>

<template>
  <h1>Zones</h1>
  <p class="sub">Capacity counts active permits only. Restricted mode blocks hot work and suspends active hot-work permits.</p>
  <div v-if="loading" class="state">Loading zones…</div>
  <div v-else-if="error" class="banner error">{{ error }} <button @click="load">Retry</button></div>
  <div v-else class="grid two">
    <div v-for="z in zones" :key="z.id" class="card">
      <div class="row between">
        <h2 style="margin: 0">{{ z.name }}</h2>
        <span v-if="z.restricted" class="badge flag">Restricted</span>
      </div>
      <p class="muted small">Hazard level {{ z.hazardLevel }}</p>
      <div class="gauge" :class="{ full: z.activeCount >= z.capacity }">
        <div :style="{ width: `${Math.min(100, (z.activeCount / z.capacity) * 100)}%` }" />
      </div>
      <p class="small">{{ z.activeCount }} of {{ z.capacity }} active permits</p>
      <ul v-if="z.activePermitIds.length" style="padding-left: 18px; margin: 0 0 10px">
        <li v-for="id in z.activePermitIds" :key="id"><RouterLink :to="{ name: 'permit', params: { id } }">{{ permitRefs[id] ?? id }}</RouterLink></li>
      </ul>
      <p v-else class="muted small">No active permits.</p>
      <p v-if="z.restricted" class="banner warn">Reason: {{ z.restrictedReason }}</p>
      <div v-if="isSafety">
        <div v-if="!z.restricted" class="field">
          <label>Reason for restriction</label>
          <input v-model="reasons[z.id]" placeholder="e.g. Gas leak alarm" />
        </div>
        <div v-if="formError[z.id]" class="banner error">{{ formError[z.id] }}</div>
        <button :class="z.restricted ? '' : 'danger'" :disabled="busyZone === z.id" @click="toggle(z)">
          {{ z.restricted ? 'Clear restricted mode' : 'Set restricted mode' }}
        </button>
      </div>
    </div>
  </div>
</template>
