import { reactive } from 'vue'
import * as api from './api/client'
import type { User, Zone } from './api/types'

export const session = reactive({
  user: null as User | null,
  users: [] as User[],
  zones: [] as Zone[],
  ready: false,
  notificationCount: 0,
})

export async function bootstrap(): Promise<void> {
  if (session.ready) return
  if (api.getToken()) {
    try {
      session.user = await api.currentUser()
      await loadLookups()
    } catch {
      api.logout()
      session.user = null
    }
  }
  session.ready = true
}

export async function loadLookups(): Promise<void> {
  const [users, zones] = await Promise.all([api.listUsers(), api.listZones()])
  session.users = users
  session.zones = zones
  await refreshNotifications()
}

export async function refreshNotifications(): Promise<void> {
  try {
    session.notificationCount = (await api.listNotifications()).length
  } catch {
    session.notificationCount = 0
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  session.user = await api.login(email, password)
  await loadLookups()
}

export function signOut(): void {
  api.logout()
  session.user = null
  session.notificationCount = 0
}

export const userName = (id: string): string => session.users.find((u) => u.id === id)?.name ?? 'Unknown'
export const zoneName = (id: string): string => session.zones.find((z) => z.id === id)?.name ?? id
