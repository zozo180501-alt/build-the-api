// MOCK LAYER — seed data. Fictional. Replace together with the rest of src/mock when a real API exists.
import type { ApprovalStep, AuditEntry, IsolationPoint, Permit, Risk, Role, Status, User, WorkType } from '../api/types'

export const MIN = 60_000
export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export interface StoredPermit extends Omit<Permit, 'overdue' | 'expiringSoon' | 'minutesRemaining' | 'needsMyAction' | 'actions'> {
  audit: AuditEntry[]
}

export type StaticZone = {
  id: string
  name: string
  hazardLevel: 1 | 2 | 3
  capacity: number
  restricted: boolean
  restrictedReason?: string
}

export type StaticPoint = Pick<IsolationPoint, 'id' | 'tag' | 'kind' | 'zoneId'>

export function buildSeed(nowRaw: number) {
  const now = Math.floor(nowRaw / MIN) * MIN
  const iso = (ms: number) => new Date(ms).toISOString()

  const users: User[] = [
    {
      id: 'u-amira', name: 'Amira Haddad', email: 'amira.haddad@plant.example', role: 'TECHNICIAN', zoneIds: [],
      certifications: [
        { workType: 'GENERAL', expiresAt: iso(now + 400 * DAY) },
        { workType: 'ELECTRICAL', expiresAt: iso(now + 300 * DAY) },
        { workType: 'HOT_WORK', expiresAt: iso(now + 200 * DAY) },
      ],
    },
    {
      id: 'u-lucas', name: 'Lucas Moreau', email: 'lucas.moreau@plant.example', role: 'TECHNICIAN', zoneIds: [],
      certifications: [
        { workType: 'GENERAL', expiresAt: iso(now + 400 * DAY) },
        { workType: 'WORK_AT_HEIGHT', expiresAt: iso(now + 250 * DAY) },
        { workType: 'HOT_WORK', expiresAt: iso(now + 2 * DAY) },
        { workType: 'ELECTRICAL', expiresAt: iso(now - 10 * DAY) },
      ],
    },
    {
      id: 'u-priya', name: 'Priya Nair', email: 'priya.nair@plant.example', role: 'TECHNICIAN', zoneIds: [],
      certifications: [
        { workType: 'GENERAL', expiresAt: iso(now + 400 * DAY) },
        { workType: 'ELECTRICAL', expiresAt: iso(now + 100 * DAY) },
        { workType: 'CONFINED_SPACE', expiresAt: iso(now + 120 * DAY) },
      ],
    },
    { id: 'u-jonas', name: 'Jonas Weber', email: 'jonas.weber@plant.example', role: 'AREA_AUTHORITY', zoneIds: ['z-boiler', 'z-tank'], certifications: [] },
    { id: 'u-elena', name: 'Elena Rossi', email: 'elena.rossi@plant.example', role: 'AREA_AUTHORITY', zoneIds: ['z-pump', 'z-pack'], certifications: [] },
    { id: 'u-marta', name: 'Marta Kowalski', email: 'marta.kowalski@plant.example', role: 'SAFETY_OFFICER', zoneIds: [], certifications: [] },
    { id: 'u-daniel', name: 'Daniel Okafor', email: 'daniel.okafor@plant.example', role: 'PLANT_MANAGER', zoneIds: [], certifications: [] },
  ]

  const zones: StaticZone[] = [
    { id: 'z-boiler', name: 'Boiler House', hazardLevel: 3, capacity: 2, restricted: false },
    { id: 'z-tank', name: 'Tank Farm', hazardLevel: 2, capacity: 2, restricted: false },
    { id: 'z-pump', name: 'Pump House', hazardLevel: 2, capacity: 3, restricted: false },
    { id: 'z-pack', name: 'Packaging Line 2', hazardLevel: 1, capacity: 3, restricted: false },
  ]

  const points: StaticPoint[] = [
    { id: 'pt1', tag: 'B-FWP-01 Feed pump breaker', kind: 'ELECTRICAL', zoneId: 'z-boiler' },
    { id: 'pt2', tag: 'B-STM-V12 Steam trap valve', kind: 'VALVE', zoneId: 'z-boiler' },
    { id: 'pt3', tag: 'B-BRN-02 Burner damper', kind: 'MECHANICAL', zoneId: 'z-boiler' },
    { id: 'pt4', tag: 'T-TK3-V01 Tank 3 inlet valve', kind: 'VALVE', zoneId: 'z-tank' },
    { id: 'pt5', tag: 'T-TK3-M01 Tank 3 agitator', kind: 'MECHANICAL', zoneId: 'z-tank' },
    { id: 'pt6', tag: 'T-PMP-E02 Transfer pump breaker', kind: 'ELECTRICAL', zoneId: 'z-tank' },
    { id: 'pt7', tag: 'P-PMP3-E01 Pump 3 breaker', kind: 'ELECTRICAL', zoneId: 'z-pump' },
    { id: 'pt8', tag: 'P-PMP3-V02 Pump 3 discharge valve', kind: 'VALVE', zoneId: 'z-pump' },
    { id: 'pt9', tag: 'P-ACT-E07 Valve actuator supply', kind: 'ELECTRICAL', zoneId: 'z-pump' },
    { id: 'pt10', tag: 'K-CNV2-E01 Conveyor 2 starter', kind: 'ELECTRICAL', zoneId: 'z-pack' },
    { id: 'pt11', tag: 'K-CNV2-M01 Conveyor 2 drive', kind: 'MECHANICAL', zoneId: 'z-pack' },
    { id: 'pt12', tag: 'K-FIL-V03 Filler air valve', kind: 'VALVE', zoneId: 'z-pack' },
  ]

  let auditN = 0
  const au = (at: number, actor: string, action: string, from?: Status, to?: Status, comment?: string, actorRole?: Role): AuditEntry => ({
    id: `a-seed-${++auditN}`, at: iso(at), actor, actorRole, action, from, to, comment,
  })
  const step = (role: Role, status: ApprovalStep['status'], byUserId?: string, at?: number, comment?: string): ApprovalStep => ({
    role, status, byUserId, at: at ? iso(at) : undefined, comment,
  })
  const mk = (p: {
    n: number; title: string; description: string; zoneId: string; workType: WorkType; risk: Risk; status: Status
    requesterId: string; responsibleId?: string; start: number; end: number; extensions?: number
    crew: [string, boolean][]; points?: [string, string | undefined][]; approvals?: ApprovalStep[]; audit: AuditEntry[]
    handover?: StoredPermit['handover']; closure?: StoredPermit['closure']
  }): StoredPermit => ({
    id: `p${p.n}`, ref: `WP-2026-${String(100 + p.n).padStart(4, '0')}`,
    title: p.title, description: p.description, zoneId: p.zoneId, workType: p.workType, risk: p.risk, status: p.status,
    requesterId: p.requesterId, responsibleId: p.responsibleId ?? p.requesterId,
    start: iso(p.start), end: iso(p.end), extensions: p.extensions ?? 0,
    crew: p.crew.map(([userId, briefed]) => ({ userId, briefed })),
    points: (p.points ?? []).map(([pointId, lockNumber]) => ({ pointId, lockNumber })),
    approvals: p.approvals ?? [], handover: p.handover, closure: p.closure,
    version: 1, createdAt: iso(now - 2 * DAY), audit: p.audit,
  })

  const permits: StoredPermit[] = [
    mk({
      n: 1, title: 'Feed pump seal replacement', description: 'Cut out and weld the damaged seal housing on feed pump 1.',
      zoneId: 'z-boiler', workType: 'HOT_WORK', risk: 'CRITICAL', status: 'IN_APPROVAL', requesterId: 'u-amira',
      start: now + HOUR, end: now + 5 * HOUR, crew: [['u-amira', false]], points: [['pt1', undefined]],
      approvals: [step('AREA_AUTHORITY', 'APPROVED', 'u-jonas', now - 40 * MIN), step('SAFETY_OFFICER', 'PENDING'), step('PLANT_MANAGER', 'WAITING')],
      audit: [
        au(now - 3 * HOUR, 'Amira Haddad', 'Created draft', undefined, 'DRAFT', undefined, 'TECHNICIAN'),
        au(now - 2 * HOUR, 'Amira Haddad', 'Submitted', 'DRAFT', 'SUBMITTED', undefined, 'TECHNICIAN'),
        au(now - 40 * MIN, 'Jonas Weber', 'Approved', 'SUBMITTED', 'IN_APPROVAL', 'Area is clear.', 'AREA_AUTHORITY'),
      ],
    }),
    mk({
      n: 2, title: 'Conveyor 2 motor starter replacement', description: 'Replace the contactor and overload relay.',
      zoneId: 'z-pack', workType: 'ELECTRICAL', risk: 'MEDIUM', status: 'ACTIVE', requesterId: 'u-amira',
      start: now - 2 * HOUR, end: now + 45 * MIN, crew: [['u-amira', true], ['u-lucas', true]], points: [['pt10', 'L-1041']],
      approvals: [step('AREA_AUTHORITY', 'APPROVED', 'u-elena', now - 5 * HOUR)],
      audit: [
        au(now - 6 * HOUR, 'Amira Haddad', 'Submitted', 'DRAFT', 'SUBMITTED', undefined, 'TECHNICIAN'),
        au(now - 5 * HOUR, 'Elena Rossi', 'Approved', 'SUBMITTED', 'APPROVED', undefined, 'AREA_AUTHORITY'),
        au(now - 2 * HOUR, 'Amira Haddad', 'Activated', 'APPROVED', 'ACTIVE', 'Locks applied: L-1041', 'TECHNICIAN'),
      ],
    }),
    mk({
      n: 3, title: 'Tank 3 internal inspection', description: 'Entry to inspect agitator weld seams. Atmosphere testing at entry.',
      zoneId: 'z-tank', workType: 'CONFINED_SPACE', risk: 'HIGH', status: 'APPROVED', requesterId: 'u-priya',
      start: now - 30 * MIN, end: now + 6 * HOUR, crew: [['u-priya', true], ['u-lucas', false]],
      points: [['pt4', undefined], ['pt5', undefined]],
      approvals: [step('AREA_AUTHORITY', 'APPROVED', 'u-jonas', now - 4 * HOUR), step('SAFETY_OFFICER', 'APPROVED', 'u-marta', now - 3 * HOUR, 'Rescue plan verified.')],
      audit: [
        au(now - 7 * HOUR, 'Priya Nair', 'Submitted', 'DRAFT', 'SUBMITTED', undefined, 'TECHNICIAN'),
        au(now - 4 * HOUR, 'Jonas Weber', 'Approved', 'SUBMITTED', 'IN_APPROVAL', undefined, 'AREA_AUTHORITY'),
        au(now - 3 * HOUR, 'Marta Kowalski', 'Approved', 'IN_APPROVAL', 'APPROVED', 'Rescue plan verified.', 'SAFETY_OFFICER'),
      ],
    }),
    mk({
      n: 4, title: 'Gutter repair above loading dock', description: 'Replace damaged roof gutter section using a mobile platform.',
      zoneId: 'z-pack', workType: 'WORK_AT_HEIGHT', risk: 'MEDIUM', status: 'SUBMITTED', requesterId: 'u-lucas',
      start: now + 3 * HOUR, end: now + 7 * HOUR, crew: [['u-lucas', false]],
      approvals: [step('AREA_AUTHORITY', 'PENDING')],
      audit: [
        au(now - 90 * MIN, 'Lucas Moreau', 'Created draft', undefined, 'DRAFT', undefined, 'TECHNICIAN'),
        au(now - 80 * MIN, 'Lucas Moreau', 'Submitted', 'DRAFT', 'SUBMITTED', undefined, 'TECHNICIAN'),
      ],
    }),
    mk({
      n: 5, title: 'Valve actuator calibration', description: 'Calibrate and re-test actuator on discharge header.',
      zoneId: 'z-pump', workType: 'ELECTRICAL', risk: 'MEDIUM', status: 'ACTIVE', requesterId: 'u-amira',
      start: now - 6 * HOUR, end: now - 20 * MIN, crew: [['u-amira', true]], points: [['pt9', 'L-0977']],
      approvals: [step('AREA_AUTHORITY', 'APPROVED', 'u-elena', now - 8 * HOUR)],
      audit: [
        au(now - 9 * HOUR, 'Amira Haddad', 'Submitted', 'DRAFT', 'SUBMITTED', undefined, 'TECHNICIAN'),
        au(now - 8 * HOUR, 'Elena Rossi', 'Approved', 'SUBMITTED', 'APPROVED', undefined, 'AREA_AUTHORITY'),
        au(now - 6 * HOUR, 'Amira Haddad', 'Activated', 'APPROVED', 'ACTIVE', 'Locks applied: L-0977', 'TECHNICIAN'),
      ],
    }),
    mk({
      n: 6, title: 'Line 4 pipe welding', description: 'Weld replacement spool on the cleaning-in-place return line.',
      zoneId: 'z-tank', workType: 'HOT_WORK', risk: 'HIGH', status: 'DRAFT', requesterId: 'u-lucas',
      start: now + 26 * HOUR, end: now + 30 * HOUR, crew: [['u-lucas', false]],
      audit: [au(now - 30 * MIN, 'Lucas Moreau', 'Created draft', undefined, 'DRAFT', undefined, 'TECHNICIAN')],
    }),
    mk({
      n: 7, title: 'Lubrication of packing belts', description: 'Routine non-isolated lubrication round.',
      zoneId: 'z-pack', workType: 'GENERAL', risk: 'LOW', status: 'CLOSED', requesterId: 'u-lucas',
      start: now - 30 * HOUR, end: now - 27 * HOUR, crew: [['u-lucas', true]],
      approvals: [step('AREA_AUTHORITY', 'APPROVED', 'u-elena', now - 32 * HOUR)],
      closure: { checklist: [], locksRemoved: true, at: iso(now - 27 * HOUR) },
      audit: [
        au(now - 33 * HOUR, 'Lucas Moreau', 'Submitted', 'DRAFT', 'SUBMITTED', undefined, 'TECHNICIAN'),
        au(now - 32 * HOUR, 'Elena Rossi', 'Approved', 'SUBMITTED', 'APPROVED', undefined, 'AREA_AUTHORITY'),
        au(now - 30 * HOUR, 'Lucas Moreau', 'Activated', 'APPROVED', 'ACTIVE', undefined, 'TECHNICIAN'),
        au(now - 27 * HOUR, 'Lucas Moreau', 'Closure requested', 'ACTIVE', 'CLOSED', 'Checklist complete.', 'TECHNICIAN'),
      ],
    }),
    mk({
      n: 8, title: 'Steam trap replacement', description: 'Replace failed trap on steam header 2.',
      zoneId: 'z-boiler', workType: 'GENERAL', risk: 'HIGH', status: 'REJECTED', requesterId: 'u-amira',
      start: now + 2 * DAY, end: now + 2 * DAY + 4 * HOUR, crew: [['u-amira', false]],
      approvals: [step('AREA_AUTHORITY', 'APPROVED', 'u-jonas', now - 20 * HOUR), step('SAFETY_OFFICER', 'REJECTED', 'u-marta', now - 18 * HOUR, 'Header not depressurised in the plan. Add isolation of B-STM-V12.')],
      audit: [
        au(now - 22 * HOUR, 'Amira Haddad', 'Submitted', 'DRAFT', 'SUBMITTED', undefined, 'TECHNICIAN'),
        au(now - 20 * HOUR, 'Jonas Weber', 'Approved', 'SUBMITTED', 'IN_APPROVAL', undefined, 'AREA_AUTHORITY'),
        au(now - 18 * HOUR, 'Marta Kowalski', 'Rejected', 'IN_APPROVAL', 'REJECTED', 'Header not depressurised in the plan. Add isolation of B-STM-V12.', 'SAFETY_OFFICER'),
      ],
    }),
    mk({
      n: 9, title: 'Pump 3 bearing swap', description: 'Replace drive-end bearing and re-align coupling.',
      zoneId: 'z-pump', workType: 'ELECTRICAL', risk: 'MEDIUM', status: 'SUSPENDED', requesterId: 'u-priya',
      start: now - 3 * HOUR, end: now + 3 * HOUR, crew: [['u-priya', true]], points: [['pt7', 'L-1102'], ['pt8', 'L-1103']],
      approvals: [step('AREA_AUTHORITY', 'APPROVED', 'u-elena', now - 5 * HOUR)],
      audit: [
        au(now - 6 * HOUR, 'Priya Nair', 'Submitted', 'DRAFT', 'SUBMITTED', undefined, 'TECHNICIAN'),
        au(now - 5 * HOUR, 'Elena Rossi', 'Approved', 'SUBMITTED', 'APPROVED', undefined, 'AREA_AUTHORITY'),
        au(now - 3 * HOUR, 'Priya Nair', 'Activated', 'APPROVED', 'ACTIVE', 'Locks applied: L-1102, L-1103', 'TECHNICIAN'),
        au(now - 90 * MIN, 'Elena Rossi', 'Suspended', 'ACTIVE', 'SUSPENDED', 'Waiting for spare part delivery.', 'AREA_AUTHORITY'),
      ],
    }),
  ]

  return { users, zones, points, permits }
}
