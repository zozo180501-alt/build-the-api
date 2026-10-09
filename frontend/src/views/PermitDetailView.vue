<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as api from '../api/client'
import type { ActionName, IsolationPoint, PermitDetail } from '../api/types'
import { ApiError } from '../api/types'
import { ACTION_LABEL, ROLE_LABEL, WORK_TYPE_LABEL, fmtDateTime } from '../api/labels'
import { refreshNotifications, userName, zoneName } from '../session'
import Badge from '../components/Badge.vue'
import ActionDialog from '../components/ActionDialog.vue'

const props = defineProps<{ id: string }>()
const router = useRouter()

const permit = ref<PermitDetail | null>(null)
const points = ref<IsolationPoint[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const dialog = ref<ActionName | null>(null)
const tab = ref<'overview' | 'history'>('overview')
let poll: number | undefined

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    permit.value = await api.getPermit(props.id)
    points.value = await api.listIsolationPoints()
    error.value = ''
  } catch (e) {
    if (!silent) error.value = e instanceof ApiError ? e.message : 'Could not load the permit.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  poll = window.setInterval(() => { if (!dialog.value) load(true) }, 30_000)
})
onBeforeUnmount(() => window.clearInterval(poll))

const order: ActionName[] = [
  'edit', 'submit', 'approve', 'reject', 'revise', 'activate', 'suspend', 'resume', 'extend',
  'requestHandover', 'acceptHandover', 'requestClosure', 'countersign', 'cancel',
]

// Show an action when it is allowed, or when it is relevant to this status and role but currently blocked (with the reason).
const visibleActions = computed(() => {
  const p = permit.value
  if (!p) return []
  const relevant: Record<string, ActionName[]> = {
    DRAFT: ['edit', 'submit', 'cancel'],
    SUBMITTED: ['approve', 'reject', 'cancel'],
    IN_APPROVAL: ['approve', 'reject', 'cancel'],
    REJECTED: ['revise'],
    APPROVED: ['activate', 'cancel'],
    ACTIVE: ['suspend', 'extend', 'requestHandover', 'acceptHandover', 'requestClosure'],
    SUSPENDED: ['resume', 'requestHandover', 'acceptHandover', 'requestClosure'],
    CLOSURE_PENDING: ['countersign'],
  }
  return order
    .map((a) => p.actions.find((x) => x.action === a)!)
    .filter((a) => a && (a.allowed || (relevant[p.status] ?? []).includes(a.action)))
    .filter((a) => a.allowed || a.reason)
})

function run(a: ActionName) {
  if (a === 'edit') router.push({ name: 'permit-edit', params: { id: props.id } })
  else dialog.value = a
}

async function done(updated: PermitDetail) {
  const label = dialog.value ? ACTION_LABEL[dialog.value] : 'Action'
  dialog.value = null
  notice.value = `${label} completed.`
  permit.value = updated
  await load(true)
  refreshNotifications()
}

async function reload() {
  dialog.value = null
  notice.value = 'Permit reloaded with the latest state.'
  await load(true)
}

function pointInfo(pointId: string): IsolationPoint | undefined {
  return points.value.find((p) => p.id === pointId)
}

function remaining(p: PermitDetail): string {
  if (p.minutesRemaining === undefined) return '—'
  if (p.minutesRemaining < 0) return `Overdue by ${Math.abs(p.minutesRemaining)} min`
  const h = Math.floor(p.minutesRemaining / 60)
  return h ? `${h} h ${p.minutesRemaining % 60} min` : `${p.minutesRemaining} min`
}
</script>

<template>
  <p><RouterLink to="/permits">← All permits</RouterLink></p>
  <div v-if="loading" class="state">Loading permit…</div>
  <div v-else-if="error" class="banner error">
    {{ error }} <button @click="load()">Retry</button>
  </div>

  <template v-else-if="permit">
    <div class="row between">
      <div>
        <h1>{{ permit.ref }} · {{ permit.title }}</h1>
        <div class="row">
          <Badge :status="permit.status" />
          <Badge :risk="permit.risk" />
          <span v-if="permit.overdue" class="badge flag">Overdue</span>
          <span v-else-if="permit.expiringSoon" class="badge flag soon">Expiring soon</span>
          <span class="muted">{{ WORK_TYPE_LABEL[permit.workType] }} · {{ zoneName(permit.zoneId) }}</span>
        </div>
      </div>
      <div class="muted small">Version {{ permit.version }}</div>
    </div>

    <div v-if="notice" class="banner ok" style="margin-top: 12px">{{ notice }}</div>
    <div v-if="permit.handover" class="banner warn" style="margin-top: 12px">
      Handover to <strong>{{ userName(permit.handover.toUserId) }}</strong> requested at {{ fmtDateTime(permit.handover.requestedAt) }}.
      Unless accepted within 30 minutes the permit is suspended.
    </div>

    <div class="card" style="margin-top: 14px">
      <h2>Actions</h2>
      <div v-if="!visibleActions.length" class="muted">No actions are available to you on this permit.</div>
      <div class="actions">
        <button
          v-for="a in visibleActions" :key="a.action"
          :class="[a.allowed ? (a.action === 'approve' || a.action === 'activate' ? 'primary' : '') : 'blocked']"
          :disabled="!a.allowed" :title="a.reason" @click="run(a.action)"
        >{{ ACTION_LABEL[a.action] }}</button>
      </div>
      <ul v-if="visibleActions.some((a) => !a.allowed)" class="muted small" style="margin: 10px 0 0; padding-left: 18px">
        <li v-for="a in visibleActions.filter((x) => !x.allowed)" :key="a.action">
          <strong>{{ ACTION_LABEL[a.action] }}:</strong> {{ a.reason }}
        </li>
      </ul>
    </div>

    <div class="tabs">
      <button :class="{ on: tab === 'overview' }" @click="tab = 'overview'">Overview</button>
      <button :class="{ on: tab === 'history' }" @click="tab = 'history'">Audit history <span class="n">{{ permit.audit.length }}</span></button>
    </div>

    <template v-if="tab === 'overview'">
      <div class="grid two">
        <div class="card">
          <h2>Details</h2>
          <dl>
            <dt>Description</dt><dd>{{ permit.description || '—' }}</dd>
            <dt>Planned start</dt><dd>{{ fmtDateTime(permit.start) }}</dd>
            <dt>Planned end</dt><dd>{{ fmtDateTime(permit.end) }}</dd>
            <dt>Time remaining</dt><dd>{{ remaining(permit) }}</dd>
            <dt>Extensions used</dt><dd>{{ permit.extensions }} of 2</dd>
            <dt>Requester</dt><dd>{{ userName(permit.requesterId) }}</dd>
            <dt>Responsible</dt><dd>{{ userName(permit.responsibleId) }}</dd>
          </dl>
        </div>
        <div class="card">
          <h2>Crew and briefing</h2>
          <table>
            <tbody>
              <tr v-for="c in permit.crew" :key="c.userId">
                <td>{{ userName(c.userId) }} <span v-if="c.userId === permit.responsibleId" class="muted small">(responsible)</span></td>
                <td><span class="badge" :class="c.briefed ? 's-ACTIVE' : 's-SUBMITTED'">{{ c.briefed ? 'Briefed' : 'Not briefed' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h2>Approval chain</h2>
        <div v-if="!permit.approvals.length" class="muted">Not submitted yet. The chain is set when the permit is submitted.</div>
        <div class="chain">
          <div v-for="(s, i) in permit.approvals" :key="i" class="step" :class="s.status">
            <div class="st">{{ i + 1 }}. {{ ROLE_LABEL[s.role] }}</div>
            <div>{{ s.status === 'APPROVED' ? 'Approved' : s.status === 'REJECTED' ? 'Rejected' : s.status === 'PENDING' ? 'Waiting for decision' : 'Not yet' }}</div>
            <div v-if="s.byUserId" class="small muted">{{ userName(s.byUserId) }} · {{ s.at ? fmtDateTime(s.at) : '' }}</div>
            <div v-if="s.comment" class="small">“{{ s.comment }}”</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Isolation points</h2>
        <div v-if="!permit.points.length" class="muted">No isolation points.</div>
        <table v-else>
          <thead><tr><th>Point</th><th>State</th><th>Lock number</th></tr></thead>
          <tbody>
            <tr v-for="pp in permit.points" :key="pp.pointId">
              <td>{{ pointInfo(pp.pointId)?.tag ?? pp.pointId }}</td>
              <td>
                <span class="badge" :class="pointInfo(pp.pointId)?.state === 'LOCKED' ? 's-ACTIVE' : pointInfo(pp.pointId)?.state === 'RESERVED' ? 's-SUBMITTED' : ''">
                  {{ pointInfo(pp.pointId)?.state ?? '—' }}
                </span>
              </td>
              <td>{{ pointInfo(pp.pointId)?.state === 'LOCKED' ? pp.lockNumber : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-else class="card">
      <h2>Audit history</h2>
      <ul class="timeline">
        <li v-for="a in [...permit.audit].reverse()" :key="a.id" :class="{ system: a.actor === 'System' }">
          <strong>{{ a.action }}</strong>
          <span v-if="a.from && a.to && a.from !== a.to" class="muted small"> · {{ a.from }} → {{ a.to }}</span>
          <div class="muted small">{{ a.actor }}{{ a.actorRole ? ` (${ROLE_LABEL[a.actorRole]})` : '' }} · {{ fmtDateTime(a.at) }}</div>
          <div v-if="a.comment">{{ a.comment }}</div>
        </li>
      </ul>
    </div>

    <ActionDialog v-if="dialog" :permit="permit" :action="dialog" @close="dialog = null" @done="done" @reload="reload" />
  </template>
</template>
