// Shared types describing what the UI needs from the API.
// The shapes are the frontend's expectation; the backend designer decides how to expose them.

export type Role = 'TECHNICIAN' | 'AREA_AUTHORITY' | 'SAFETY_OFFICER' | 'PLANT_MANAGER'
export type WorkType = 'GENERAL' | 'ELECTRICAL' | 'WORK_AT_HEIGHT' | 'HOT_WORK' | 'CONFINED_SPACE'
export type Risk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type Status =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'CLOSURE_PENDING'
  | 'CLOSED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED'

export type ActionName =
  | 'edit'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'revise'
  | 'cancel'
  | 'activate'
  | 'suspend'
  | 'resume'
  | 'extend'
  | 'requestHandover'
  | 'acceptHandover'
  | 'requestClosure'
  | 'countersign'

export interface Certification {
  workType: WorkType
  expiresAt: string
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  zoneIds: string[]
  certifications: Certification[]
}

export interface Zone {
  id: string
  name: string
  hazardLevel: 1 | 2 | 3
  capacity: number
  activeCount: number
  restricted: boolean
  restrictedReason?: string
  activePermitIds: string[]
}

export interface IsolationPoint {
  id: string
  tag: string
  kind: 'ELECTRICAL' | 'VALVE' | 'MECHANICAL'
  zoneId: string
  state: 'FREE' | 'RESERVED' | 'LOCKED'
  permitId?: string
  permitRef?: string
  lockNumber?: string
}

export interface PointAvailability extends IsolationPoint {
  available: boolean
  unavailableReason?: string
}

export interface CrewEligibility {
  user: User
  certified: boolean
  reason?: string
}

export interface ApprovalStep {
  role: Role
  status: 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED'
  byUserId?: string
  at?: string
  comment?: string
}

export interface CrewMember {
  userId: string
  briefed: boolean
}

export interface PermitPoint {
  pointId: string
  lockNumber?: string
  removed?: boolean
}

export interface AuditEntry {
  id: string
  at: string
  actor: string // user name or "System"
  actorRole?: Role
  action: string
  from?: Status
  to?: Status
  comment?: string
}

export interface ActionState {
  action: ActionName
  allowed: boolean
  reason?: string
}

export interface Permit {
  id: string
  ref: string
  title: string
  description: string
  zoneId: string
  workType: WorkType
  risk: Risk
  status: Status
  requesterId: string
  responsibleId: string
  start: string
  end: string
  extensions: number
  crew: CrewMember[]
  points: PermitPoint[]
  approvals: ApprovalStep[]
  handover?: { toUserId: string; requestedAt: string }
  closure?: { checklist: string[]; locksRemoved: boolean; at: string }
  version: number
  createdAt: string
  // computed by the server for the current user
  overdue: boolean
  expiringSoon: boolean
  minutesRemaining?: number
  needsMyAction: boolean
  actions: ActionState[]
}

export interface PermitDetail extends Permit {
  audit: AuditEntry[]
}

export interface PermitDraftInput {
  title: string
  description: string
  zoneId: string
  workType: WorkType
  start: string
  end: string
  pointIds: string[]
  crewIds: string[]
}

export interface Violation {
  code: string
  message: string
  field?: string
}

export interface Preview {
  risk: Risk
  approvalChain: Role[]
  violations: Violation[]
}

export interface PermitQuery {
  search?: string
  status?: Status | ''
  zoneId?: string
  risk?: Risk | ''
  workType?: WorkType | ''
  from?: string
  to?: string
  quick?: '' | 'needsMyAction' | 'overdue' | 'expiringSoon'
  sort?: 'start' | 'risk' | 'status' | 'ref'
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  counters: { needsMyAction: number; overdue: number; expiringSoon: number }
}

export interface NotificationItem {
  id: string
  kind: 'APPROVAL' | 'HANDOVER' | 'EXPIRING' | 'OVERDUE' | 'RESTRICTED'
  message: string
  permitId?: string
  zoneId?: string
  at: string
}

export interface ActionPayload {
  comment?: string
  lockNumbers?: Record<string, string>
  minutes?: number
  toUserId?: string
  checklist?: string[]
  locksRemoved?: boolean
  briefedUserIds?: string[]
}

export type ErrorKind = 'validation' | 'rule' | 'forbidden' | 'notFound' | 'conflict' | 'unauthenticated' | 'network'

export class ApiError extends Error {
  kind: ErrorKind
  code: string
  fields: Record<string, string>
  violations: Violation[]
  constructor(
    kind: ErrorKind,
    code: string,
    message: string,
    fields: Record<string, string> = {},
    violations: Violation[] = [],
  ) {
    super(message)
    this.kind = kind
    this.code = code
    this.fields = fields
    this.violations = violations
  }
}
