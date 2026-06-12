import { supabase } from './supabase'
import type { Profile, Admin } from './queries'

export type UserType = 'user' | 'admin'

export interface UserRow {
  id: string
  username: string
  full_name: string
  type: UserType
  email: string | null
  phone: string | null
  password: string | null
  blocked: boolean
  blocked_until: string | null
  form_completed: boolean
  form_responses: Record<string, unknown> | null
  avatar_url: string | null
  created_at: string
}

export async function listUsers(): Promise<UserRow[]> {
  const [{ data: profiles, error: pErr }, { data: admins, error: aErr }] =
    await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('admins').select('*').order('created_at', { ascending: false }),
    ])

  if (pErr) throw pErr
  if (aErr) throw aErr

  const result: UserRow[] = []
  const adminIds = new Set((admins ?? []).map((a) => a.id))

  // Build a map of admin profiles for avatar_url (use admins.avatar_url directly)
  const adminProfileMap = new Map<string, string | null>()
  for (const a of admins ?? []) {
    adminProfileMap.set(a.id, a.avatar_url ?? null)
  }

  for (const p of profiles ?? []) {
    if (adminIds.has(p.id)) continue
    const { data: fr } = await supabase
      .from('form_responses')
      .select('responses')
      .eq('user_id', p.id)
      .eq('form_type', 'initial_profile')
      .maybeSingle()

    result.push(profileToRow(p, fr?.responses as Record<string, unknown> | null))
  }

  for (const a of admins ?? []) {
    const { data: fr } = await supabase
      .from('form_responses')
      .select('responses')
      .eq('user_id', a.id)
      .eq('form_type', 'initial_profile')
      .maybeSingle()

    result.push(adminToRow(a, fr?.responses as Record<string, unknown> | null, adminProfileMap.get(a.id) ?? null))
  }

  result.sort((x, y) => (y.created_at > x.created_at ? 1 : -1))
  return result
}

function profileToRow(p: Profile, formResponses: Record<string, unknown> | null): UserRow {
  return {
    id: p.id,
    username: p.username,
    full_name: p.full_name,
    type: 'user',
    email: null,
    phone: null,
    password: null,
    blocked: p.blocked_until ? new Date(p.blocked_until) > new Date() : false,
    blocked_until: p.blocked_until,
    form_completed: !!formResponses,
    form_responses: formResponses,
    avatar_url: p.avatar_url ?? null,
    created_at: p.created_at,
  }
}

function adminToRow(a: Admin, formResponses: Record<string, unknown> | null, avatarUrl: string | null): UserRow {
  return {
    id: a.id,
    username: a.username,
    full_name: a.full_name,
    type: 'admin',
    email: null,
    phone: a.phone,
    password: a.password,
    blocked: false,
    blocked_until: null,
    form_completed: !!formResponses,
    form_responses: formResponses,
    avatar_url: avatarUrl,
    created_at: a.created_at,
  }
}

export async function blockUser(userId: string, until: Date | null): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ blocked_until: until ? until.toISOString() : null })
    .eq('id', userId)

  if (error) throw error
}

export async function unblockUser(userId: string): Promise<void> {
  await blockUser(userId, null)
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-delete-user', {
    body: { user_id: userId },
  })

  if (error) throw error
  if (data && 'error' in data) throw new Error(data.error as string)
}

export interface CreateUserPayload {
  email?: string
  password: string
  full_name: string
  username: string
  phone?: string
  is_admin?: boolean
}

export async function adminCreateUser(
  payload: CreateUserPayload
): Promise<{ type: UserType }> {
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: payload,
  })

  if (error) throw error
  if (data && 'error' in data) throw new Error(data.error as string)
  return {
    type: payload.is_admin ? 'admin' : 'user',
  }
}

export function formatBlockedDuration(until: string | null): string {
  if (!until) return 'No bloqueado'
  const date = new Date(until)
  const now = new Date()
  if (date <= now) return 'No bloqueado'

  const diffMs = date.getTime() - now.getTime()
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)

  if (days >= 1) return `${days} día${days > 1 ? 's' : ''}`
  if (hours >= 1) return `${hours} hora${hours > 1 ? 's' : ''}`
  return 'Menos de 1 hora'
}
