// MOCK LAYER — an in-memory approximation of the rules so the UI can be demonstrated.
// It is NOT the source of truth: the README is. Delete this folder when a real API exists.
import { ApiError } from '../api/types'
import type {
  ActionName, ActionPayload, AuditEntry, CrewEligibility, NotificationItem, Page, Permit, PermitDetail,
  PermitDraftInput, PermitQuery, PointAvailability, IsolationPoint, Preview, Risk, Role, Status, User, Violation,
  WorkType, Zone,
} from '../api/types'
import { ROLE_LABEL } from '../api/labels'
import { buildSeed, DAY, HOUR, MIN } from './seed'
import type { StoredPermit } from './seed'

const db = buildSeed(Date.now())
let permitCounter = 100 + db.permits.length
let auditCounter = 0
const processedRequests = new Set<string>()

const ACTIONS: ActionName[] = [
  'edit', 'submit', 'approve', 'reject', 'revise', 'cancel', 'activate', 'suspend', 'resume', 'extend',
  'requestHandover', 'acceptHandover', 'requestClosure', 'countersign',
]
const HOLDING: Status[] = ['SUBMITTED', 'IN_APPROVAL', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CLOSURE_PENDING']
const RISKS: Risk[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const CHAIN: Record<Risk, Role[]> = {
  LOW: ['AREA_AUTHORITY'],
  MEDIUM: ['AREA_AUTHORITY'],
  HIGH: ['AREA_AUTHORITY', 'SAFETY_OFFICER'],
  CRITICAL: ['AREA_AUTHORITY', 'SAFETY_OFFICER', 'PLANT_MANAGER'],
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const lag = () => sleep(120 + Math.random() * 180)
const overlap = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2
const incompatible = (a: WorkType, b: WorkType) =>
  (a === 'HOT_WORK' && (b === 'HOT_WORK' || b === 'CONFINED_SPACE')) ||
  (b === 'HOT_WORK' && (a === 'HOT_WORK' || a === 'CONFINED_SPACE'))

function userById(id: string): User {
  const u = db.users.find((x) => x.id === id)
  if (!u) throw new ApiError('notFound', 'USER_NOT_FOUND', 'User not found')
  return u
}
function zoneById(id: string) {
  const z = db.zones.find((x) => x.id === id)
  if (!z) throw new ApiError('notFound', 'ZONE_NOT_FOUND', 'Zone not found')
  return z
}

function computeRisk(workType: WorkType, hazard: number, pointCount: number): Risk {
  let base: Risk = workType === 'HOT_WORK' || workType === 'CONFINED_SPACE' ? 'HIGH'
    : workType === 'ELECTRICAL' || workType === 'WORK_AT_HEIGHT' ? 'MEDIUM' : 'LOW'
  if (workType === 'GENERAL' && pointCount > 0) base = 'MEDIUM'
  const i = RISKS.indexOf(base) + (hazard === 3 ? 1 : 0)
  return RISKS[Math.min(i, RISKS.length - 1)]
}

function validateDraft(input: PermitDraftInput, requesterId: string, selfId?: string): Violation[] {
  const v: Violation[] = []
  if (!input.title.trim()) v.push({ code: 'TITLE_REQUIRED', message: 'A title is required.', field: 'title' })
  if (!input.zoneId) {
    v.push({ code: 'ZONE_REQUIRED', message: 'Select a zone.', field: 'zoneId' })
    return v
  }
  const start = Date.parse(input.start)
  const end = Date.parse(input.end)
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    v.push({ code: 'WINDOW_INVALID', message: 'The end must be after the start.', field: 'end' })
  } else {
    if (end - start > 12 * HOUR) v.push({ code: 'WINDOW_TOO_LONG', message: 'The planned window cannot exceed 12 hours.', field: 'end' })
    if (start < Date.now()) v.push({ code: 'START_IN_PAST', message: 'The start cannot be in the past.', field: 'start' })
    const h = new Date(start).getHours()
    if ((input.workType === 'HOT_WORK' || input.workType === 'CONFINED_SPACE') && (h >= 22 || h < 6)) {
      v.push({ code: 'NIGHT_RESTRICTION', message: 'Hot work and confined space work cannot start between 22:00 and 06:00.', field: 'start' })
    }
  }
  const requester = userById(requesterId)
  const cert = requester.certifications.find((c) => c.workType === input.workType)
  if (!cert) v.push({ code: 'CERT_MISSING', message: 'You are not certified for this work type.', field: 'workType' })
  else if (!Number.isNaN(end) && Date.parse(cert.expiresAt) < end) {
    v.push({ code: 'CERT_EXPIRES', message: 'Your certification expires before the planned end.', field: 'workType' })
  }
  if ((input.workType === 'ELECTRICAL' || input.workType === 'CONFINED_SPACE') && input.pointIds.length === 0) {
    v.push({ code: 'ISOLATION_REQUIRED', message: 'This work type requires at least one isolation point.', field: 'pointIds' })
  }
  for (const pid of input.pointIds) {
    const pt = db.points.find((p) => p.id === pid)
    if (!pt) continue
    if (pt.zoneId !== input.zoneId) v.push({ code: 'POINT_WRONG_ZONE', message: `${pt.tag} is not in the selected zone.`, field: 'pointIds' })
    if (!Number.isNaN(start) && !Number.isNaN(end)) {
      const clash = db.permits.find((o) => o.id !== selfId && HOLDING.includes(o.status) && o.points.some((pp) => pp.pointId === pid) &&
        overlap(start, end, Date.parse(o.start), Date.parse(o.end)))
      if (clash) v.push({ code: 'POINT_CONFLICT', message: `${pt.tag} is already used by ${clash.ref} in an overlapping window.`, field: 'pointIds' })
    }
  }
  if (!Number.isNaN(start) && !Number.isNaN(end)) {
    const bad = db.permits.find((o) => o.id !== selfId && o.zoneId === input.zoneId && (o.status === 'APPROVED' || o.status === 'ACTIVE') &&
      overlap(start, end, Date.parse(o.start), Date.parse(o.end)) && incompatible(o.workType, input.workType))
    if (bad) v.push({ code: 'INCOMPATIBLE_WORK', message: `Incompatible with ${bad.ref} (${bad.workType.replace('_', ' ').toLowerCase()}) in the same zone and window.`, field: 'workType' })
  }
  return v
}

function previewDraft(uid: string, input: PermitDraftInput, selfId?: string): Preview {
  const zone = input.zoneId ? zoneById(input.zoneId) : undefined
  const risk = computeRisk(input.workType, zone?.hazardLevel ?? 1, input.pointIds.length)
  return { risk, approvalChain: CHAIN[risk], violations: validateDraft(input, uid, selfId) }
}

function zoneBlock(p: StoredPermit): string | null {
  const z = zoneById(p.zoneId)
  if (z.restricted && p.workType === 'HOT_WORK') return 'Zone is in restricted mode: hot work cannot proceed.'
  const active = db.permits.filter((o) => o.id !== p.id && o.zoneId === p.zoneId && o.status === 'ACTIVE')
  if (active.length >= z.capacity) return `Zone is at capacity (${z.capacity} active permits).`
  const inc = active.find((o) => incompatible(o.workType, p.workType))
  if (inc) return `Incompatible with active permit ${inc.ref}.`
  return null
}

const PRE_ACTIVATION: Status[] = ['DRAFT', 'SUBMITTED', 'IN_APPROVAL', 'APPROVED']

function check(a: ActionName, p: StoredPermit, u: User): string | null {
  const isReq = p.requesterId === u.id
  const isResp = p.responsibleId === u.id
  const aaZone = u.role === 'AREA_AUTHORITY' && u.zoneIds.includes(p.zoneId)
  const now = Date.now()
  const pastEnd = now > Date.parse(p.end)
  switch (a) {
    case 'edit':
    case 'submit':
      if (p.status !== 'DRAFT') return 'Only drafts can be edited or submitted.'
      return isReq ? null : 'Only the requester can do this.'
    case 'approve':
    case 'reject': {
      if (p.status !== 'SUBMITTED' && p.status !== 'IN_APPROVAL') return 'The permit is not awaiting approval.'
      const step = p.approvals.find((s) => s.status === 'PENDING')
      if (!step) return 'No approval step is pending.'
      if (isReq) return 'You cannot approve or reject your own permit.'
      if (u.role !== step.role) return `Waiting for the ${ROLE_LABEL[step.role]}.`
      if (step.role === 'AREA_AUTHORITY' && !u.zoneIds.includes(p.zoneId)) return 'You are not assigned to this zone.'
      return null
    }
    case 'revise':
      if (p.status !== 'REJECTED') return 'Only rejected permits can be revised.'
      return isReq ? null : 'Only the requester can revise.'
    case 'cancel':
      if (!PRE_ACTIVATION.includes(p.status)) return 'Only permits that are not yet active can be cancelled.'
      return isReq || u.role === 'PLANT_MANAGER' ? null : 'Only the requester or the Plant Manager can cancel.'
    case 'activate':
      if (p.status !== 'APPROVED') return 'The permit is not fully approved.'
      if (!isResp) return 'Only the responsible person can activate.'
      if (now < Date.parse(p.start)) return 'The planned window has not started yet.'
      if (pastEnd) return 'The planned window has ended.'
      return zoneBlock(p)
    case 'suspend':
      if (p.status !== 'ACTIVE') return 'Only active permits can be suspended.'
      return isResp || aaZone || u.role === 'SAFETY_OFFICER' || u.role === 'PLANT_MANAGER' ? null : 'You cannot suspend this permit.'
    case 'resume':
      if (p.status !== 'SUSPENDED') return 'The permit is not suspended.'
      if (pastEnd) return 'The permit is past its planned end and cannot be resumed.'
      if (!(isResp || aaZone || u.role === 'SAFETY_OFFICER')) return 'You cannot resume this permit.'
      return zoneBlock(p)
    case 'extend': {
      if (p.status !== 'ACTIVE') return 'Only active permits can be extended.'
      if (pastEnd) return 'The permit is overdue and can no longer be extended.'
      if (p.extensions >= 2) return 'The maximum of 2 extensions has been reached.'
      const high = p.risk === 'HIGH' || p.risk === 'CRITICAL'
      if (high) return u.role === 'SAFETY_OFFICER' ? null : 'High and critical permits are extended by the Safety Officer.'
      return aaZone ? null : 'Extension requires the Area Authority of this zone.'
    }
    case 'requestHandover':
      if (p.status !== 'ACTIVE' && p.status !== 'SUSPENDED') return 'Only in-progress permits can be handed over.'
      if (!isResp) return 'Only the responsible person can hand over.'
      return p.handover ? 'A handover is already pending.' : null
    case 'acceptHandover':
      return p.handover && p.handover.toUserId === u.id ? null : 'No handover is waiting for you.'
    case 'requestClosure':
      if (p.status !== 'ACTIVE' && p.status !== 'SUSPENDED') return 'Only in-progress permits can be closed.'
      if (!isResp) return 'Only the responsible person can request closure.'
      return p.handover ? 'Resolve the pending handover first.' : null
    case 'countersign':
      if (p.status !== 'CLOSURE_PENDING') return 'No closure is waiting for countersignature.'
      if (isReq || isResp) return 'The requester and responsible person cannot countersign.'
      if (p.risk === 'CRITICAL') return u.role === 'SAFETY_OFFICER' ? null : 'Critical closure is countersigned by the Safety Officer.'
      return aaZone ? null : 'High-risk closure is countersigned by the Area Authority of the zone.'
  }
}

function visible(p: StoredPermit, u: User): boolean {
  if (u.role === 'SAFETY_OFFICER' || u.role === 'PLANT_MANAGER') return true
  if (u.role === 'AREA_AUTHORITY') return u.zoneIds.includes(p.zoneId)
  return p.requesterId === u.id || p.responsibleId === u.id || p.crew.some((c) => c.userId === u.id)
}

function addAudit(p: StoredPermit, actor: User | null, action: string, to?: Status, comment?: string) {
  const entry: AuditEntry = {
    id: `a-${++auditCounter}`, at: new Date().toISOString(), actor: actor ? actor.name : 'System',
    actorRole: actor?.role, action, from: p.status, to: to ?? p.status, comment,
  }
  p.audit.push(entry)
  if (to) p.status = to
  p.version++
}

// Time-based transitions: applied lazily here, a real backend must do this on its own.
function tick() {
  const now = Date.now()
  for (const p of db.permits) {
    if (p.status === 'APPROVED' && now > Date.parse(p.start) + 2 * HOUR) {
      addAudit(p, null, 'Expired', 'EXPIRED', 'Not activated within 2 hours of the planned start.')
    }
    if (p.handover && now > Date.parse(p.handover.requestedAt) + 30 * MIN) {
      p.handover = undefined
      addAudit(p, null, 'Handover timed out', p.status === 'ACTIVE' ? 'SUSPENDED' : undefined, 'Handover was not accepted within 30 minutes.')
    }
  }
}

function toView(p: StoredPermit, u: User): PermitDetail {
  const now = Date.now()
  const end = Date.parse(p.end)
  const live = p.status === 'ACTIVE'
  const overdue = live && now > end
  const actions = ACTIONS.map((a) => {
    const reason = check(a, p, u)
    return { action: a, allowed: reason === null, reason: reason ?? undefined }
  })
  const needsMyAction = (['approve', 'acceptHandover', 'countersign'] as ActionName[]).some((a) => check(a, p, u) === null)
  return structuredClone({
    ...p,
    overdue,
    expiringSoon: live && !overdue && end - now < 60 * MIN,
    minutesRemaining: live || p.status === 'SUSPENDED' ? Math.round((end - now) / MIN) : undefined,
    needsMyAction,
    actions,
  })
}

const RISK_ORDER: Record<Risk, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }

function requireSession(uid: string | null): User {
  if (!uid) throw new ApiError('unauthenticated', 'UNAUTHENTICATED', 'Please sign in.')
  return userById(uid)
}

// ---------- public mock functions ----------

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  await lag()
  const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
  if (!u || password !== 'demo') throw new ApiError('unauthenticated', 'BAD_CREDENTIALS', 'Wrong email or password.')
  return { token: u.id, user: structuredClone(u) }
}

export async function me(uid: string | null): Promise<User> {
  await lag()
  return structuredClone(requireSession(uid))
}

export async function listUsers(uid: string | null): Promise<User[]> {
  await lag()
  requireSession(uid)
  return structuredClone(db.users)
}

export async function listZones(uid: string | null): Promise<Zone[]> {
  await lag()
  requireSession(uid)
  tick()
  return db.zones.map((z) => {
    const active = db.permits.filter((p) => p.zoneId === z.id && p.status === 'ACTIVE')
    return { ...z, activeCount: active.length, activePermitIds: active.map((p) => p.id) }
  })
}

export async function setRestricted(uid: string | null, zoneId: string, restricted: boolean, reason: string): Promise<Zone[]> {
  await lag()
  const u = requireSession(uid)
  if (u.role !== 'SAFETY_OFFICER') throw new ApiError('forbidden', 'FORBIDDEN', 'Only the Safety Officer can change restricted mode.')
  if (restricted && !reason.trim()) throw new ApiError('validation', 'REASON_REQUIRED', 'A reason is required.', { reason: 'Required' })
  const z = zoneById(zoneId)
  z.restricted = restricted
  z.restrictedReason = restricted ? reason.trim() : undefined
  if (restricted) {
    for (const p of db.permits) {
      if (p.zoneId === zoneId && p.status === 'ACTIVE' && p.workType === 'HOT_WORK') {
        addAudit(p, null, 'Suspended automatically', 'SUSPENDED', `Zone entered restricted mode: ${reason.trim()}`)
      }
    }
  }
  return listZones(uid)
}

function pointState(pt: { id: string }): Pick<IsolationPoint, 'state' | 'permitId' | 'permitRef' | 'lockNumber'> {
  const holder = db.permits.find((p) => HOLDING.includes(p.status) && p.points.some((pp) => pp.pointId === pt.id))
  if (!holder) return { state: 'FREE' }
  const pp = holder.points.find((x) => x.pointId === pt.id)!
  const locked = (holder.status === 'ACTIVE' || holder.status === 'SUSPENDED') && !!pp.lockNumber
  return { state: locked ? 'LOCKED' : 'RESERVED', permitId: holder.id, permitRef: holder.ref, lockNumber: locked ? pp.lockNumber : undefined }
}

export async function listPoints(uid: string | null): Promise<IsolationPoint[]> {
  await lag()
  requireSession(uid)
  tick()
  return db.points.map((pt) => ({ ...pt, ...pointState(pt) }))
}

export async function pointAvailability(uid: string | null, zoneId: string, start: string, end: string, permitId?: string): Promise<PointAvailability[]> {
  await lag()
  requireSession(uid)
  const s = Date.parse(start)
  const e = Date.parse(end)
  return db.points.filter((pt) => pt.zoneId === zoneId).map((pt) => {
    const clash = Number.isNaN(s) || Number.isNaN(e) ? undefined : db.permits.find((o) => o.id !== permitId && HOLDING.includes(o.status) &&
      o.points.some((pp) => pp.pointId === pt.id) && overlap(s, e, Date.parse(o.start), Date.parse(o.end)))
    return { ...pt, ...pointState(pt), available: !clash, unavailableReason: clash ? `Used by ${clash.ref} in an overlapping window` : undefined }
  })
}

export async function eligibleCrew(uid: string | null, workType: WorkType, end: string): Promise<CrewEligibility[]> {
  await lag()
  requireSession(uid)
  const e = Date.parse(end)
  return db.users.filter((x) => x.role === 'TECHNICIAN').map((user) => {
    const cert = user.certifications.find((c) => c.workType === workType)
    const ok = !!cert && (Number.isNaN(e) || Date.parse(cert.expiresAt) >= e)
    return { user: structuredClone(user), certified: ok, reason: ok ? undefined : cert ? 'Certification expires before the planned end' : 'Not certified for this work type' }
  })
}

export async function preview(uid: string | null, input: PermitDraftInput, permitId?: string): Promise<Preview> {
  await sleep(80)
  requireSession(uid)
  return previewDraft(uid as string, input, permitId)
}

export async function listPermits(uid: string | null, q: PermitQuery): Promise<Page<Permit>> {
  await lag()
  const u = requireSession(uid)
  tick()
  const all = db.permits.filter((p) => visible(p, u)).map((p) => toView(p, u))
  const counters = {
    needsMyAction: all.filter((p) => p.needsMyAction).length,
    overdue: all.filter((p) => p.overdue).length,
    expiringSoon: all.filter((p) => p.expiringSoon).length,
  }
  let items = all
  if (q.search) {
    const s = q.search.toLowerCase()
    items = items.filter((p) => `${p.ref} ${p.title} ${p.description}`.toLowerCase().includes(s))
  }
  if (q.status) items = items.filter((p) => p.status === q.status)
  if (q.zoneId) items = items.filter((p) => p.zoneId === q.zoneId)
  if (q.risk) items = items.filter((p) => p.risk === q.risk)
  if (q.workType) items = items.filter((p) => p.workType === q.workType)
  if (q.from) items = items.filter((p) => Date.parse(p.end) >= Date.parse(q.from as string))
  if (q.to) items = items.filter((p) => Date.parse(p.start) <= Date.parse(q.to as string) + DAY)
  if (q.quick === 'needsMyAction') items = items.filter((p) => p.needsMyAction)
  if (q.quick === 'overdue') items = items.filter((p) => p.overdue)
  if (q.quick === 'expiringSoon') items = items.filter((p) => p.expiringSoon)
  const dir = q.dir === 'desc' ? -1 : 1
  const key = q.sort ?? 'start'
  items = [...items].sort((a, b) => {
    const c = key === 'risk' ? RISK_ORDER[a.risk] - RISK_ORDER[b.risk]
      : key === 'status' ? a.status.localeCompare(b.status)
        : key === 'ref' ? a.ref.localeCompare(b.ref)
          : Date.parse(a.start) - Date.parse(b.start)
    return c * dir
  })
  const pageSize = q.pageSize ?? 8
  const page = q.page ?? 1
  const total = items.length
  const slice = items.slice((page - 1) * pageSize, page * pageSize).map(({ audit, ...rest }) => { void audit; return rest as Permit })
  return { items: slice, total, page, pageSize, counters }
}

export async function getPermit(uid: string | null, id: string): Promise<PermitDetail> {
  await lag()
  const u = requireSession(uid)
  tick()
  const p = db.permits.find((x) => x.id === id)
  if (!p || !visible(p, u)) throw new ApiError('notFound', 'PERMIT_NOT_FOUND', 'Permit not found.')
  return toView(p, u)
}

function applyDraft(p: StoredPermit, input: PermitDraftInput, uid: string) {
  const zone = zoneById(input.zoneId)
  p.title = input.title.trim()
  p.description = input.description.trim()
  p.zoneId = input.zoneId
  p.workType = input.workType
  p.start = input.start
  p.end = input.end
  p.risk = computeRisk(input.workType, zone.hazardLevel, input.pointIds.length)
  p.points = input.pointIds.map((pointId) => ({ pointId }))
  const ids = Array.from(new Set([uid, ...input.crewIds]))
  p.crew = ids.map((userId) => ({ userId, briefed: p.crew.find((c) => c.userId === userId)?.briefed ?? false }))
}

function basicDraftCheck(input: PermitDraftInput) {
  const fields: Record<string, string> = {}
  if (!input.title.trim()) fields.title = 'A title is required'
  if (!input.zoneId) fields.zoneId = 'Select a zone'
  if (Object.keys(fields).length) throw new ApiError('validation', 'INVALID_INPUT', 'Some fields are invalid.', fields)
}

export async function saveDraft(uid: string | null, input: PermitDraftInput, permitId?: string, version?: number): Promise<PermitDetail> {
  await lag()
  const u = requireSession(uid)
  basicDraftCheck(input)
  if (!permitId) {
    const p: StoredPermit = {
      id: `p${++permitCounter}`, ref: `WP-2026-${String(permitCounter).padStart(4, '0')}`, title: '', description: '',
      zoneId: input.zoneId, workType: input.workType, risk: 'LOW', status: 'DRAFT', requesterId: u.id, responsibleId: u.id,
      start: input.start, end: input.end, extensions: 0, crew: [], points: [], approvals: [], version: 0,
      createdAt: new Date().toISOString(), audit: [],
    }
    applyDraft(p, input, u.id)
    db.permits.push(p)
    addAudit(p, u, 'Created draft', 'DRAFT')
    return toView(p, u)
  }
  const p = db.permits.find((x) => x.id === permitId)
  if (!p || !visible(p, u)) throw new ApiError('notFound', 'PERMIT_NOT_FOUND', 'Permit not found.')
  if (version !== undefined && version !== p.version) throw new ApiError('conflict', 'VERSION_CONFLICT', 'This permit was changed by someone else. Reload to see the latest version.')
  const reason = check('edit', p, u)
  if (reason) throw new ApiError('rule', 'NOT_ALLOWED', reason)
  applyDraft(p, input, u.id)
  addAudit(p, u, 'Draft updated')
  return toView(p, u)
}

export async function act(
  uid: string | null, permitId: string, action: ActionName, payload: ActionPayload, version: number, requestId: string,
): Promise<PermitDetail> {
  await lag()
  const u = requireSession(uid)
  tick()
  const p = db.permits.find((x) => x.id === permitId)
  if (!p || !visible(p, u)) throw new ApiError('notFound', 'PERMIT_NOT_FOUND', 'Permit not found.')
  // Idempotent replay: same request id returns the current state without side effects.
  if (processedRequests.has(requestId)) return toView(p, u)
  if (version !== p.version) {
    throw new ApiError('conflict', 'VERSION_CONFLICT', 'This permit was changed by someone else while you were working. Reload to see what changed.')
  }
  const reason = check(action, p, u)
  if (reason) throw new ApiError('rule', 'ACTION_NOT_ALLOWED', reason)
  const comment = payload.comment?.trim()

  switch (action) {
    case 'submit': {
      const violations = validateDraft({
        title: p.title, description: p.description, zoneId: p.zoneId, workType: p.workType, start: p.start, end: p.end,
        pointIds: p.points.map((x) => x.pointId), crewIds: p.crew.map((c) => c.userId),
      }, u.id, p.id)
      if (violations.length) throw new ApiError('rule', 'SUBMISSION_REFUSED', 'The permit violates planning rules.', {}, violations)
      p.approvals = CHAIN[p.risk].map((role, i) => ({ role, status: i === 0 ? 'PENDING' : 'WAITING' }))
      addAudit(p, u, 'Submitted', 'SUBMITTED', comment)
      break
    }
    case 'approve': {
      const i = p.approvals.findIndex((s) => s.status === 'PENDING')
      p.approvals[i] = { ...p.approvals[i], status: 'APPROVED', byUserId: u.id, at: new Date().toISOString(), comment }
      const next = p.approvals[i + 1]
      if (next) next.status = 'PENDING'
      addAudit(p, u, 'Approved', next ? 'IN_APPROVAL' : 'APPROVED', comment)
      break
    }
    case 'reject': {
      if (!comment) throw new ApiError('validation', 'COMMENT_REQUIRED', 'A rejection requires a comment.', { comment: 'Required' })
      const i = p.approvals.findIndex((s) => s.status === 'PENDING')
      p.approvals[i] = { ...p.approvals[i], status: 'REJECTED', byUserId: u.id, at: new Date().toISOString(), comment }
      addAudit(p, u, 'Rejected', 'REJECTED', comment)
      break
    }
    case 'revise':
      p.approvals = []
      addAudit(p, u, 'Revised, approvals reset', 'DRAFT', comment)
      break
    case 'cancel':
      addAudit(p, u, 'Cancelled', 'CANCELLED', comment)
      break
    case 'activate': {
      const briefed = new Set([...p.crew.filter((c) => c.briefed).map((c) => c.userId), ...(payload.briefedUserIds ?? [])])
      const missing = p.crew.filter((c) => !briefed.has(c.userId))
      if (missing.length) {
        throw new ApiError('rule', 'BRIEFING_INCOMPLETE', `Safety briefing not confirmed for: ${missing.map((m) => userById(m.userId).name).join(', ')}.`)
      }
      const given = p.points.map((pp) => (payload.lockNumbers?.[pp.pointId] ?? '').trim())
      if (given.some((g) => !g)) throw new ApiError('validation', 'LOCK_REQUIRED', 'A lock number is required for every isolation point.', { lockNumbers: 'Required for each point' })
      if (new Set(given).size !== given.length) throw new ApiError('validation', 'LOCK_DUPLICATE', 'Lock numbers must be unique.', { lockNumbers: 'Duplicate lock number' })
      const used = db.permits.filter((o) => o.id !== p.id && (o.status === 'ACTIVE' || o.status === 'SUSPENDED')).flatMap((o) => o.points.map((x) => x.lockNumber))
      const dup = given.find((g) => used.includes(g))
      if (dup) throw new ApiError('validation', 'LOCK_IN_USE', `Lock ${dup} is already used by another permit.`, { lockNumbers: `${dup} in use` })
      p.crew.forEach((c) => { c.briefed = true })
      p.points.forEach((pp, i) => { pp.lockNumber = given[i] })
      addAudit(p, u, 'Activated', 'ACTIVE', given.length ? `Locks applied: ${given.join(', ')}` : undefined)
      break
    }
    case 'suspend':
      if (!comment) throw new ApiError('validation', 'COMMENT_REQUIRED', 'A reason is required.', { comment: 'Required' })
      addAudit(p, u, 'Suspended', 'SUSPENDED', comment)
      break
    case 'resume':
      addAudit(p, u, 'Resumed', 'ACTIVE', comment)
      break
    case 'extend': {
      const m = payload.minutes ?? 0
      if (m < 30 || m > 120) throw new ApiError('validation', 'MINUTES_INVALID', 'An extension is between 30 and 120 minutes.', { minutes: '30 to 120' })
      const total = Date.parse(p.end) + m * MIN - Date.parse(p.start)
      if (total > 16 * HOUR) throw new ApiError('rule', 'TOTAL_TOO_LONG', 'The total duration cannot exceed 16 hours.')
      p.end = new Date(Date.parse(p.end) + m * MIN).toISOString()
      p.extensions++
      addAudit(p, u, 'Extended', undefined, `+${m} minutes. ${comment ?? ''}`.trim())
      break
    }
    case 'requestHandover': {
      const to = payload.toUserId ? userById(payload.toUserId) : null
      if (!to) throw new ApiError('validation', 'NOMINEE_REQUIRED', 'Select a technician.', { toUserId: 'Required' })
      const cert = to.certifications.find((c) => c.workType === p.workType)
      if (to.id === u.id || to.role !== 'TECHNICIAN' || !cert || Date.parse(cert.expiresAt) < Date.parse(p.end)) {
        throw new ApiError('rule', 'NOMINEE_NOT_ELIGIBLE', 'The nominee must be another technician certified for this work type.')
      }
      p.handover = { toUserId: to.id, requestedAt: new Date().toISOString() }
      addAudit(p, u, 'Handover requested', undefined, `To ${to.name}. Must be accepted within 30 minutes.`)
      break
    }
    case 'acceptHandover': {
      const from = userById(p.responsibleId)
      p.responsibleId = u.id
      if (!p.crew.some((c) => c.userId === u.id)) p.crew.push({ userId: u.id, briefed: true })
      p.crew.forEach((c) => { if (c.userId === u.id) c.briefed = true })
      p.handover = undefined
      addAudit(p, u, 'Handover accepted', undefined, `From ${from.name}.`)
      break
    }
    case 'requestClosure': {
      if ((payload.checklist?.length ?? 0) < 4) throw new ApiError('validation', 'CHECKLIST_INCOMPLETE', 'Complete every item of the site inspection checklist.', { checklist: 'Incomplete' })
      if (p.points.length && !payload.locksRemoved) throw new ApiError('validation', 'LOCKS_NOT_CONFIRMED', 'Confirm that every lock has been removed.', { locksRemoved: 'Required' })
      const high = p.risk === 'HIGH' || p.risk === 'CRITICAL'
      p.closure = { checklist: payload.checklist ?? [], locksRemoved: !!payload.locksRemoved, at: new Date().toISOString() }
      p.points.forEach((pp) => { pp.removed = true })
      addAudit(p, u, 'Closure requested', high ? 'CLOSURE_PENDING' : 'CLOSED', comment)
      break
    }
    case 'countersign':
      addAudit(p, u, 'Closure countersigned', 'CLOSED', comment)
      break
    default:
      throw new ApiError('rule', 'UNSUPPORTED', 'Unsupported action.')
  }
  processedRequests.add(requestId)
  return toView(p, u)
}

export async function listNotifications(uid: string | null): Promise<NotificationItem[]> {
  await lag()
  const u = requireSession(uid)
  tick()
  const items: NotificationItem[] = []
  const now = new Date().toISOString()
  for (const p of db.permits.filter((x) => visible(x, u))) {
    const v = toView(p, u)
    if (v.actions.some((a) => (a.action === 'approve' || a.action === 'countersign') && a.allowed)) {
      items.push({ id: `n-ap-${p.id}`, kind: 'APPROVAL', permitId: p.id, at: now, message: `${p.ref} “${p.title}” is waiting for your decision.` })
    }
    if (v.actions.some((a) => a.action === 'acceptHandover' && a.allowed)) {
      items.push({ id: `n-ho-${p.id}`, kind: 'HANDOVER', permitId: p.id, at: p.handover?.requestedAt ?? now, message: `Handover of ${p.ref} is waiting for you to accept (30 min limit).` })
    }
    const mine = p.responsibleId === u.id || u.role !== 'TECHNICIAN'
    if (mine && v.overdue) items.push({ id: `n-od-${p.id}`, kind: 'OVERDUE', permitId: p.id, at: p.end, message: `${p.ref} is overdue. Locks remain in place until it is closed.` })
    else if (mine && v.expiringSoon) items.push({ id: `n-ex-${p.id}`, kind: 'EXPIRING', permitId: p.id, at: now, message: `${p.ref} has ${v.minutesRemaining} minutes remaining.` })
  }
  for (const z of db.zones.filter((x) => x.restricted)) {
    const relevant = u.role !== 'TECHNICIAN' ? (u.role !== 'AREA_AUTHORITY' || u.zoneIds.includes(z.id)) : db.permits.some((p) => p.zoneId === z.id && visible(p, u))
    if (relevant) items.push({ id: `n-rz-${z.id}`, kind: 'RESTRICTED', zoneId: z.id, at: now, message: `${z.name} is in restricted mode: ${z.restrictedReason ?? ''}` })
  }
  return items
}
