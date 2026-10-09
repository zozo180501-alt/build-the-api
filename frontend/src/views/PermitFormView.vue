<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as api from '../api/client'
import type { CrewEligibility, PermitDraftInput, PointAvailability, Preview, WorkType } from '../api/types'
import { ApiError } from '../api/types'
import { ROLE_LABEL, WORK_TYPE_LABEL, fromLocalInput, toLocalInput } from '../api/labels'
import { session } from '../session'
import Badge from '../components/Badge.vue'

const props = defineProps<{ id?: string }>()
const router = useRouter()

const hour = 3_600_000
const startDefault = new Date(Math.ceil((Date.now() + hour) / 900_000) * 900_000)

const form = reactive({
  title: '',
  description: '',
  zoneId: '',
  workType: 'GENERAL' as WorkType,
  start: toLocalInput(startDefault.toISOString()),
  end: toLocalInput(new Date(startDefault.getTime() + 4 * hour).toISOString()),
  pointIds: [] as string[],
  crewIds: [] as string[],
})
const version = ref<number | undefined>()
const points = ref<PointAvailability[]>([])
const crew = ref<CrewEligibility[]>([])
const preview = ref<Preview | null>(null)
const previewBusy = ref(false)
const loading = ref(!!props.id)
const busy = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
const submitViolations = ref<string[]>([])
const workTypes = Object.keys(WORK_TYPE_LABEL) as WorkType[]

function toInput(): PermitDraftInput {
  return {
    title: form.title, description: form.description, zoneId: form.zoneId, workType: form.workType,
    start: fromLocalInput(form.start), end: fromLocalInput(form.end), pointIds: [...form.pointIds], crewIds: [...form.crewIds],
  }
}

onMounted(async () => {
  if (!props.id) return
  try {
    const p = await api.getPermit(props.id)
    if (!p.actions.find((a) => a.action === 'edit')?.allowed) {
      error.value = 'This permit can no longer be edited.'
      return
    }
    Object.assign(form, {
      title: p.title, description: p.description, zoneId: p.zoneId, workType: p.workType,
      start: toLocalInput(p.start), end: toLocalInput(p.end),
      pointIds: p.points.map((x) => x.pointId), crewIds: p.crew.map((c) => c.userId).filter((id) => id !== p.requesterId),
    })
    version.value = p.version
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Could not load the permit.'
  } finally {
    loading.value = false
  }
})

let t: number | undefined
let seq = 0
watch(form, () => {
  window.clearTimeout(t)
  t = window.setTimeout(refresh, 300)
}, { deep: true, immediate: true })

async function refresh() {
  const my = ++seq
  const input = toInput()
  previewBusy.value = true
  try {
    const [pv, pts, cr] = await Promise.all([
      api.previewPermit(input, props.id),
      input.zoneId ? api.pointAvailability(input.zoneId, input.start, input.end, props.id) : Promise.resolve([] as PointAvailability[]),
      api.eligibleCrew(input.workType, input.end),
    ])
    if (my !== seq) return
    preview.value = pv
    points.value = pts
    crew.value = cr
  } catch { /* preview is advisory only */ } finally {
    if (my === seq) previewBusy.value = false
  }
}

watch(() => form.zoneId, () => { form.pointIds = [] })

function toggle(list: string[], id: string) {
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else list.push(id)
}

async function save(thenSubmit: boolean) {
  busy.value = true
  error.value = ''
  fieldErrors.value = {}
  submitViolations.value = []
  let savedId = props.id
  try {
    const saved = await api.saveDraft(toInput(), props.id, version.value)
    savedId = saved.id
    version.value = saved.version
    if (thenSubmit) {
      await api.performAction(saved.id, 'submit', {}, saved.version, crypto.randomUUID())
    }
    router.push({ name: 'permit', params: { id: saved.id } })
  } catch (e) {
    if (e instanceof ApiError) {
      fieldErrors.value = e.fields
      error.value = e.message
      submitViolations.value = e.violations.map((v) => v.message)
      if (e.kind === 'conflict') error.value += ' Reload the page to continue.'
      // A draft that was saved but not submitted stays editable.
      if (thenSubmit && savedId && !props.id) router.replace({ name: 'permit-edit', params: { id: savedId } })
    } else {
      error.value = 'Network problem. Nothing was lost; try again.'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <h1>{{ id ? 'Edit draft permit' : 'New work permit' }}</h1>
  <p class="sub">The preview on the right is computed before anything is saved.</p>

  <div v-if="loading" class="state">Loading…</div>
  <div v-else class="grid" style="grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr)">
    <div>
      <div v-if="error" class="banner error">
        {{ error }}
        <ul v-if="submitViolations.length"><li v-for="m in submitViolations" :key="m">{{ m }}</li></ul>
      </div>

      <div class="card">
        <h2>Work</h2>
        <div class="field">
          <label>Title</label>
          <input v-model="form.title" maxlength="120" />
          <div v-if="fieldErrors.title" class="err">{{ fieldErrors.title }}</div>
        </div>
        <div class="field">
          <label>Description</label>
          <textarea v-model="form.description" />
        </div>
        <div class="row">
          <div class="field spacer">
            <label>Zone</label>
            <select v-model="form.zoneId">
              <option value="">Select…</option>
              <option v-for="z in session.zones" :key="z.id" :value="z.id">
                {{ z.name }} (hazard {{ z.hazardLevel }}){{ z.restricted ? ' · restricted' : '' }}
              </option>
            </select>
            <div v-if="fieldErrors.zoneId" class="err">{{ fieldErrors.zoneId }}</div>
          </div>
          <div class="field spacer">
            <label>Work type</label>
            <select v-model="form.workType">
              <option v-for="w in workTypes" :key="w" :value="w">{{ WORK_TYPE_LABEL[w] }}</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field spacer"><label>Planned start</label><input v-model="form.start" type="datetime-local" /></div>
          <div class="field spacer"><label>Planned end</label><input v-model="form.end" type="datetime-local" /></div>
        </div>
      </div>

      <div class="card">
        <h2>Isolation points</h2>
        <p v-if="!form.zoneId" class="muted">Select a zone to see its isolation points.</p>
        <div v-for="p in points" :key="p.id" class="pick" :class="{ off: !p.available }">
          <input :id="p.id" type="checkbox" :disabled="!p.available" :checked="form.pointIds.includes(p.id)" @change="toggle(form.pointIds, p.id)" />
          <label :for="p.id">
            {{ p.tag }} <span class="muted small">· {{ p.kind.toLowerCase() }}</span>
            <div v-if="!p.available" class="small" style="color: var(--bad)">{{ p.unavailableReason }}</div>
          </label>
        </div>
        <div v-if="fieldErrors.pointIds" class="err">{{ fieldErrors.pointIds }}</div>
      </div>

      <div class="card">
        <h2>Crew</h2>
        <p class="muted small">You are included automatically as the responsible person.</p>
        <div v-for="c in crew.filter((x) => x.user.id !== session.user?.id)" :key="c.user.id" class="pick" :class="{ off: !c.certified }">
          <input :id="`c-${c.user.id}`" type="checkbox" :checked="form.crewIds.includes(c.user.id)" @change="toggle(form.crewIds, c.user.id)" />
          <label :for="`c-${c.user.id}`">
            {{ c.user.name }}
            <div class="small" :style="{ color: c.certified ? 'var(--ok)' : 'var(--warn)' }">
              {{ c.certified ? 'Certified for this work type' : c.reason }}
            </div>
          </label>
        </div>
      </div>

      <div class="row">
        <button :disabled="busy" @click="save(false)">Save draft</button>
        <button class="primary" :disabled="busy || (preview?.violations.length ?? 0) > 0" @click="save(true)">Save and submit</button>
        <button @click="router.back()">Cancel</button>
      </div>
    </div>

    <aside>
      <div class="card">
        <h2>Preview <span v-if="previewBusy" class="muted small">updating…</span></h2>
        <template v-if="preview">
          <p>Computed risk: <Badge :risk="preview.risk" /></p>
          <p class="muted small" style="margin-bottom: 4px">Approval chain</p>
          <ol style="margin: 0 0 12px; padding-left: 18px">
            <li v-for="r in preview.approvalChain" :key="r">{{ ROLE_LABEL[r] }}</li>
          </ol>
          <div v-if="preview.violations.length" class="banner warn">
            <strong>{{ preview.violations.length }} rule violation(s)</strong>
            <ul><li v-for="v in preview.violations" :key="v.code + v.message">{{ v.message }}</li></ul>
          </div>
          <div v-else class="banner ok">No planning rule violations.</div>
        </template>
        <p v-else class="muted">Computing…</p>
      </div>
    </aside>
  </div>
</template>
