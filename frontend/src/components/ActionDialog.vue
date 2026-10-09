<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import * as api from '../api/client'
import type { ActionName, ActionPayload, PermitDetail } from '../api/types'
import { ApiError } from '../api/types'
import { ACTION_LABEL, CLOSURE_CHECKLIST } from '../api/labels'
import { session, userName } from '../session'

const props = defineProps<{ permit: PermitDetail; action: ActionName }>()
const emit = defineEmits<{ close: []; done: [PermitDetail]; reload: [] }>()

// One id per dialog: a retry after a timeout re-sends the same id so the action cannot be applied twice.
const requestId = crypto.randomUUID()

const comment = ref('')
const minutes = ref(60)
const toUserId = ref('')
const confirm = ref(false)
const locksRemoved = ref(false)
const locks = reactive<Record<string, string>>({})
const briefed = reactive<Record<string, boolean>>(Object.fromEntries(props.permit.crew.map((c) => [c.userId, c.briefed])))
const checklist = reactive<boolean[]>(CLOSURE_CHECKLIST.map(() => false))

const tags = ref<Record<string, string>>({})
onMounted(async () => {
  try {
    for (const p of await api.listIsolationPoints()) tags.value[p.id] = p.tag
  } catch { /* labels are cosmetic */ }
})

const busy = ref(false)
const error = ref('')
const conflict = ref(false)
const violations = ref<string[]>([])
const fields = ref<Record<string, string>>({})

const commentRequired = computed(() => props.action === 'reject' || props.action === 'suspend')
const showsComment = computed(() => !['activate', 'acceptHandover', 'requestHandover'].includes(props.action))
const nominees = computed(() => session.users.filter((u) => u.role === 'TECHNICIAN' && u.id !== session.user?.id))
const destructive = computed(() => props.action === 'reject' || props.action === 'cancel' || props.action === 'suspend')

function nomineeNote(id: string): string {
  const u = session.users.find((x) => x.id === id)
  const c = u?.certifications.find((x) => x.workType === props.permit.workType)
  if (!c) return 'not certified'
  return Date.parse(c.expiresAt) < Date.parse(props.permit.end) ? 'certification expires too soon' : 'certified'
}

function buildPayload(): ActionPayload {
  const p: ActionPayload = {}
  if (showsComment.value && comment.value.trim()) p.comment = comment.value
  if (props.action === 'activate') {
    p.lockNumbers = { ...locks }
    p.briefedUserIds = Object.keys(briefed).filter((k) => briefed[k])
  }
  if (props.action === 'extend') p.minutes = minutes.value
  if (props.action === 'requestHandover') p.toUserId = toUserId.value
  if (props.action === 'requestClosure') {
    p.checklist = CLOSURE_CHECKLIST.filter((_, i) => checklist[i])
    p.locksRemoved = locksRemoved.value
  }
  return p
}

const canSend = computed(() => {
  if (commentRequired.value && !comment.value.trim()) return false
  if (props.action === 'acceptHandover') return confirm.value
  if (props.action === 'requestHandover') return !!toUserId.value
  return true
})

async function send() {
  busy.value = true
  error.value = ''
  violations.value = []
  fields.value = {}
  conflict.value = false
  try {
    const updated = await api.performAction(props.permit.id, props.action, buildPayload(), props.permit.version, requestId)
    emit('done', updated)
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.message
      fields.value = e.fields
      violations.value = e.violations.map((v) => v.message)
      conflict.value = e.kind === 'conflict'
    } else {
      error.value = 'Network problem. You can retry safely: the request will not be applied twice.'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <form class="dialog" @submit.prevent="send">
      <h2>{{ ACTION_LABEL[action] }} · {{ permit.ref }}</h2>

      <div v-if="error" class="banner error">
        {{ error }}
        <ul v-if="violations.length"><li v-for="m in violations" :key="m">{{ m }}</li></ul>
        <button v-if="conflict" type="button" style="margin-top: 8px" @click="emit('reload')">Reload permit</button>
      </div>

      <template v-if="action === 'activate'">
        <p class="muted">Enter the physical lock number applied to each isolation point and confirm the safety briefing of every crew member.</p>
        <div v-for="pp in permit.points" :key="pp.pointId" class="field">
          <label>Lock number for {{ tags[pp.pointId] ?? pp.pointId }}</label>
          <input v-model="locks[pp.pointId]" placeholder="e.g. L-1204" />
        </div>
        <p v-if="fields.lockNumbers" class="err" style="color: var(--bad)">{{ fields.lockNumbers }}</p>
        <p v-if="!permit.points.length" class="muted small">This permit has no isolation points.</p>
        <h2 style="margin-top: 12px">Safety briefing</h2>
        <div v-for="c in permit.crew" :key="c.userId" class="pick">
          <input :id="`b-${c.userId}`" v-model="briefed[c.userId]" type="checkbox" :disabled="c.briefed" />
          <label :for="`b-${c.userId}`">{{ userName(c.userId) }} {{ c.briefed ? '(already confirmed)' : '' }}</label>
        </div>
      </template>

      <template v-else-if="action === 'extend'">
        <div class="field">
          <label>Extension (30–120 minutes)</label>
          <input v-model.number="minutes" type="number" min="30" max="120" step="15" />
          <div v-if="fields.minutes" class="err">{{ fields.minutes }}</div>
        </div>
        <p class="muted small">Extension {{ permit.extensions + 1 }} of 2. Total duration may not exceed 16 hours.</p>
      </template>

      <template v-else-if="action === 'requestHandover'">
        <p class="muted">The nominee must accept within 30 minutes, otherwise the permit is suspended. You stay responsible until then.</p>
        <div v-for="u in nominees" :key="u.id" class="pick">
          <input :id="`n-${u.id}`" v-model="toUserId" type="radio" :value="u.id" />
          <label :for="`n-${u.id}`">{{ u.name }} <span class="muted small">· {{ nomineeNote(u.id) }}</span></label>
        </div>
        <div v-if="fields.toUserId" class="err">{{ fields.toUserId }}</div>
      </template>

      <template v-else-if="action === 'acceptHandover'">
        <p class="muted">By accepting you become the responsible person for this permit.</p>
        <div class="pick">
          <input id="conf" v-model="confirm" type="checkbox" />
          <label for="conf">I have been briefed on the work, the isolations and the current state.</label>
        </div>
      </template>

      <template v-else-if="action === 'requestClosure'">
        <h2>Site inspection checklist</h2>
        <div v-for="(item, i) in CLOSURE_CHECKLIST" :key="item" class="pick">
          <input :id="`cl-${i}`" v-model="checklist[i]" type="checkbox" />
          <label :for="`cl-${i}`">{{ item }}</label>
        </div>
        <div v-if="fields.checklist" class="err" style="color: var(--bad)">{{ fields.checklist }}</div>
        <div v-if="permit.points.length" class="pick">
          <input id="lr" v-model="locksRemoved" type="checkbox" />
          <label for="lr">I confirm every lock has been physically removed.</label>
        </div>
        <div v-if="fields.locksRemoved" class="err" style="color: var(--bad)">{{ fields.locksRemoved }}</div>
        <p class="muted small">
          {{ permit.risk === 'HIGH' || permit.risk === 'CRITICAL' ? 'This permit will wait for a countersignature before it is closed.' : 'This permit will be closed immediately.' }}
        </p>
      </template>

      <div v-if="showsComment" class="field">
        <label>Comment{{ commentRequired ? ' (required)' : ' (optional)' }}</label>
        <textarea v-model="comment" />
        <div v-if="fields.comment" class="err">{{ fields.comment }}</div>
      </div>

      <div class="foot">
        <button type="button" @click="emit('close')">Close</button>
        <button :class="destructive ? 'danger' : 'primary'" :disabled="busy || !canSend">
          {{ busy ? 'Working…' : ACTION_LABEL[action] }}
        </button>
      </div>
    </form>
  </div>
</template>
