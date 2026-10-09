<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as api from '../api/client'
import type { Page, Permit, PermitQuery, Risk, Status, WorkType } from '../api/types'
import { ApiError } from '../api/types'
import { RISK_LABEL, STATUS_LABEL, WORK_TYPE_LABEL, fmtDateTime } from '../api/labels'
import { session, userName, zoneName } from '../session'
import Badge from '../components/Badge.vue'

const router = useRouter()
const q = reactive<Required<Pick<PermitQuery, 'search' | 'status' | 'zoneId' | 'risk' | 'workType' | 'from' | 'to' | 'quick' | 'sort' | 'dir' | 'page'>>>({
  search: '', status: '', zoneId: '', risk: '', workType: '', from: '', to: '', quick: '', sort: 'start', dir: 'asc', page: 1,
})
const data = ref<Page<Permit> | null>(null)
const loading = ref(true)
const error = ref('')
const pageSize = 8
let timer: number | undefined
let seq = 0

async function load() {
  const my = ++seq
  loading.value = true
  error.value = ''
  try {
    const res = await api.listPermits({ ...q, pageSize })
    if (my === seq) data.value = res
  } catch (e) {
    if (my === seq) error.value = e instanceof ApiError ? e.message : 'Could not load permits.'
  } finally {
    if (my === seq) loading.value = false
  }
}

watch(() => [q.status, q.zoneId, q.risk, q.workType, q.from, q.to, q.quick, q.sort, q.dir, q.page], load)
watch(() => q.search, () => {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => { q.page = 1; load() }, 250)
})
watch(() => [q.status, q.zoneId, q.risk, q.workType, q.from, q.to, q.quick], () => { q.page = 1 })
onMounted(load)

const pages = computed(() => Math.max(1, Math.ceil((data.value?.total ?? 0) / pageSize)))
const canCreate = computed(() => session.user?.role === 'TECHNICIAN')

function sortBy(key: 'start' | 'risk' | 'status' | 'ref') {
  if (q.sort === key) q.dir = q.dir === 'asc' ? 'desc' : 'asc'
  else { q.sort = key; q.dir = 'asc' }
}
function arrow(key: string) { return q.sort === key ? (q.dir === 'asc' ? ' ▲' : ' ▼') : '' }
function reset() {
  Object.assign(q, { search: '', status: '', zoneId: '', risk: '', workType: '', from: '', to: '', quick: '', page: 1 })
}
const statuses = Object.keys(STATUS_LABEL) as Status[]
const risks = Object.keys(RISK_LABEL) as Risk[]
const workTypes = Object.keys(WORK_TYPE_LABEL) as WorkType[]
</script>

<template>
  <div class="row between">
    <div>
      <h1>Work permits</h1>
      <p class="sub">Only permits you are allowed to see are listed.</p>
    </div>
    <button v-if="canCreate" class="primary" @click="router.push({ name: 'permit-new' })">New permit</button>
  </div>

  <div class="tabs">
    <button :class="{ on: q.quick === '' }" @click="q.quick = ''">All</button>
    <button :class="{ on: q.quick === 'needsMyAction' }" @click="q.quick = 'needsMyAction'">
      Needs my action <span class="n">{{ data?.counters.needsMyAction ?? 0 }}</span>
    </button>
    <button :class="{ on: q.quick === 'overdue' }" @click="q.quick = 'overdue'">
      Overdue <span class="n">{{ data?.counters.overdue ?? 0 }}</span>
    </button>
    <button :class="{ on: q.quick === 'expiringSoon' }" @click="q.quick = 'expiringSoon'">
      Expiring within 60 min <span class="n">{{ data?.counters.expiringSoon ?? 0 }}</span>
    </button>
  </div>

  <div class="card filters">
    <div><label>Search</label><input v-model="q.search" placeholder="Reference, title, description" /></div>
    <div><label>Status</label>
      <select v-model="q.status"><option value="">Any</option><option v-for="s in statuses" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option></select></div>
    <div><label>Zone</label>
      <select v-model="q.zoneId"><option value="">Any</option><option v-for="z in session.zones" :key="z.id" :value="z.id">{{ z.name }}</option></select></div>
    <div><label>Risk</label>
      <select v-model="q.risk"><option value="">Any</option><option v-for="r in risks" :key="r" :value="r">{{ RISK_LABEL[r] }}</option></select></div>
    <div><label>Work type</label>
      <select v-model="q.workType"><option value="">Any</option><option v-for="w in workTypes" :key="w" :value="w">{{ WORK_TYPE_LABEL[w] }}</option></select></div>
    <div><label>From</label><input v-model="q.from" type="date" /></div>
    <div><label>To</label><input v-model="q.to" type="date" /></div>
    <div><button @click="reset">Clear filters</button></div>
  </div>

  <div class="card">
    <div v-if="error" class="banner error">
      {{ error }} <button @click="load">Retry</button>
    </div>
    <div v-else-if="loading && !data" class="state">Loading permits…</div>
    <div v-else-if="data && data.items.length === 0" class="state">No permits match these filters.</div>
    <template v-else-if="data">
      <table>
        <thead>
          <tr>
            <th class="sortable" @click="sortBy('ref')">Reference{{ arrow('ref') }}</th>
            <th>Title</th>
            <th>Zone</th>
            <th class="sortable" @click="sortBy('risk')">Risk{{ arrow('risk') }}</th>
            <th class="sortable" @click="sortBy('status')">Status{{ arrow('status') }}</th>
            <th class="sortable" @click="sortBy('start')">Window{{ arrow('start') }}</th>
            <th>Responsible</th>
          </tr>
        </thead>
        <tbody :style="{ opacity: loading ? 0.5 : 1 }">
          <tr v-for="p in data.items" :key="p.id">
            <td><RouterLink :to="{ name: 'permit', params: { id: p.id } }">{{ p.ref }}</RouterLink></td>
            <td>
              {{ p.title }}
              <div class="muted small">{{ WORK_TYPE_LABEL[p.workType] }}</div>
              <span v-if="p.needsMyAction" class="badge s-SUBMITTED">Needs your action</span>
            </td>
            <td>{{ zoneName(p.zoneId) }}</td>
            <td><Badge :risk="p.risk" /></td>
            <td>
              <Badge :status="p.status" />
              <span v-if="p.overdue" class="badge flag">Overdue</span>
              <span v-else-if="p.expiringSoon" class="badge flag soon">{{ p.minutesRemaining }} min left</span>
            </td>
            <td class="small">{{ fmtDateTime(p.start) }}<br />→ {{ fmtDateTime(p.end) }}</td>
            <td>{{ userName(p.responsibleId) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="pager">
        <span class="muted">{{ data.total }} permits · page {{ q.page }} of {{ pages }}</span>
        <button :disabled="q.page <= 1" @click="q.page--">Previous</button>
        <button :disabled="q.page >= pages" @click="q.page++">Next</button>
      </div>
    </template>
  </div>
</template>
