import type { ActionName, Risk, Role, Status, WorkType } from './types'

export const ROLE_LABEL: Record<Role, string> = {
  TECHNICIAN: 'Technician',
  AREA_AUTHORITY: 'Area Authority',
  SAFETY_OFFICER: 'Safety Officer',
  PLANT_MANAGER: 'Plant Manager',
}

export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  GENERAL: 'General',
  ELECTRICAL: 'Electrical',
  WORK_AT_HEIGHT: 'Work at height',
  HOT_WORK: 'Hot work',
  CONFINED_SPACE: 'Confined space',
}

export const RISK_LABEL: Record<Risk, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
}

export const STATUS_LABEL: Record<Status, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  IN_APPROVAL: 'In approval',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  CLOSURE_PENDING: 'Closure pending',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

export const ACTION_LABEL: Record<ActionName, string> = {
  edit: 'Edit draft',
  submit: 'Submit',
  approve: 'Approve',
  reject: 'Reject',
  revise: 'Revise',
  cancel: 'Cancel permit',
  activate: 'Activate',
  suspend: 'Suspend',
  resume: 'Resume',
  extend: 'Extend',
  requestHandover: 'Hand over',
  acceptHandover: 'Accept handover',
  requestClosure: 'Request closure',
  countersign: 'Countersign closure',
}

export const CLOSURE_CHECKLIST = [
  'Work area cleaned and tools removed',
  'Guards and covers refitted',
  'Equipment tested and returned to service state',
  'Crew accounted for and permit area handed back',
]

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fromLocalInput(value: string): string {
  return value ? new Date(value).toISOString() : ''
}
