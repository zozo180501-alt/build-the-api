// The ONLY module the UI uses to reach data.
// To connect a real backend, replace the body of these functions (and delete src/mock).
import * as mock from '../mock/server'
import type {
  ActionName, ActionPayload, CrewEligibility, IsolationPoint, NotificationItem, Page, Permit, PermitDetail,
  PermitDraftInput, PermitQuery, PointAvailability, Preview, User, WorkType, Zone,
} from './types'

const TOKEN_KEY = 'permitdesk.token'

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
function setToken(t: string | null) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

export async function login(email: string, password: string): Promise<User> {
  const r = await mock.login(email, password)
  setToken(r.token)
  return r.user
}
export function logout() { setToken(null) }
export const currentUser = (): Promise<User> => mock.me(getToken())

export const listUsers = (): Promise<User[]> => mock.listUsers(getToken())
export const listZones = (): Promise<Zone[]> => mock.listZones(getToken())
export const setZoneRestricted = (zoneId: string, restricted: boolean, reason: string): Promise<Zone[]> =>
  mock.setRestricted(getToken(), zoneId, restricted, reason)
export const listIsolationPoints = (): Promise<IsolationPoint[]> => mock.listPoints(getToken())
export const pointAvailability = (zoneId: string, start: string, end: string, permitId?: string): Promise<PointAvailability[]> =>
  mock.pointAvailability(getToken(), zoneId, start, end, permitId)
export const eligibleCrew = (workType: WorkType, end: string): Promise<CrewEligibility[]> =>
  mock.eligibleCrew(getToken(), workType, end)

export const previewPermit = (input: PermitDraftInput, permitId?: string): Promise<Preview> =>
  mock.preview(getToken(), input, permitId)
export const listPermits = (q: PermitQuery): Promise<Page<Permit>> => mock.listPermits(getToken(), q)
export const getPermit = (id: string): Promise<PermitDetail> => mock.getPermit(getToken(), id)
export const saveDraft = (input: PermitDraftInput, permitId?: string, version?: number): Promise<PermitDetail> =>
  mock.saveDraft(getToken(), input, permitId, version)

// requestId makes retries safe: the same id must never apply the action twice.
export const performAction = (
  permitId: string, action: ActionName, payload: ActionPayload, version: number, requestId: string,
): Promise<PermitDetail> => mock.act(getToken(), permitId, action, payload, version, requestId)

export const listNotifications = (): Promise<NotificationItem[]> => mock.listNotifications(getToken())
