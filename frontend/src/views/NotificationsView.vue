<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as api from '../api/client'
import type { NotificationItem } from '../api/types'
import { ApiError } from '../api/types'
import { fmtDateTime } from '../api/labels'
import { refreshNotifications } from '../session'

const items = ref<NotificationItem[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await api.listNotifications()
    await refreshNotifications()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Could not load notifications.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const kindLabel: Record<NotificationItem['kind'], string> = {
  APPROVAL: 'Decision needed', HANDOVER: 'Handover', EXPIRING: 'Expiring soon', OVERDUE: 'Overdue', RESTRICTED: 'Restricted zone',
}
</script>

<template>
  <h1>Notifications</h1>
  <p class="sub">Items that need your attention, limited to permits you may see.</p>
  <div class="card">
    <div v-if="loading" class="state">Loading…</div>
    <div v-else-if="error" class="banner error">{{ error }} <button @click="load">Retry</button></div>
    <div v-else-if="!items.length" class="state">Nothing needs your attention.</div>
    <table v-else>
      <tbody>
        <tr v-for="n in items" :key="n.id">
          <td style="width: 150px"><span class="badge" :class="n.kind === 'OVERDUE' || n.kind === 'RESTRICTED' ? 'flag' : n.kind === 'EXPIRING' ? 'flag soon' : 's-SUBMITTED'">{{ kindLabel[n.kind] }}</span></td>
          <td>
            <RouterLink v-if="n.permitId" :to="{ name: 'permit', params: { id: n.permitId } }">{{ n.message }}</RouterLink>
            <RouterLink v-else to="/zones">{{ n.message }}</RouterLink>
          </td>
          <td class="muted small">{{ fmtDateTime(n.at) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
