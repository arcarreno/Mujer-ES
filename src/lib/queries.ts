import { supabase } from './supabase'
import QRCode from 'qrcode'

export interface Profile {
  id: string
  username: string
  full_name: string
  bio: string | null
  hobbies: string[] | null
  avatar_url: string | null
  blocked_until: string | null
  created_at: string
  updated_at: string
}

export interface Admin {
  id: string
  username: string
  full_name: string
  phone: string | null
  password: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface FormResponse {
  id: string
  user_id: string
  form_type: string
  responses: Record<string, unknown>
  created_at: string
}

export interface SessionUser {
  id: string
  email: string | null
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  if (data) return data

  // Fallback: check admins table
  const { data: admin } = await supabase
    .from('admins')
    .select('id, username, full_name, avatar_url')
    .eq('id', userId)
    .maybeSingle()
  if (admin) {
    return {
      id: admin.id,
      username: admin.username,
      full_name: admin.full_name,
      bio: null,
      hobbies: null,
      avatar_url: admin.avatar_url ?? null,
      blocked_until: null,
      created_at: '',
      updated_at: '',
    }
  }
  return null
}

export async function updateProfile(
  userId: string,
  updates: { bio?: string; hobbies?: string[]; avatar_url?: string }
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${userId}/avatar.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('admins')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('isUserAdmin error:', error)
    return false
  }
  return !!data
}

export async function checkUsernameExists(username: string): Promise<boolean> {
  const clean = username.trim().toLowerCase()
  if (!clean) return false
  const [{ data: p }, { data: a }] = await Promise.all([
    supabase.from('profiles').select('username').eq('username', clean).maybeSingle(),
    supabase.from('admins').select('username').eq('username', clean).maybeSingle(),
  ])
  return !!(p || a)
}

export async function hasCompletedInitialForm(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('form_responses')
    .select('id')
    .eq('user_id', userId)
    .eq('form_type', 'initial_profile')
    .maybeSingle()

  if (error) throw error
  return !!data
}

export async function saveInitialForm(
  userId: string,
  responses: object
): Promise<void> {
  const { error } = await supabase
    .from('form_responses')
    .insert({
      user_id: userId,
      form_type: 'initial_profile',
      responses,
    })

  if (error) throw error
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}

export async function checkFirstLogin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_first_login', {
    p_user_id: userId,
  })
  if (error) throw error
  return !!data
}

export async function setInitialPassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_initial_password', {
    p_user_id: userId,
    p_new_password: newPassword,
  })
  if (error) throw error
}

export async function saveOnboardingForm(
  userId: string,
  responses: Record<string, string>
): Promise<void> {
  const { error } = await supabase
    .from('form_responses')
    .insert({
      user_id: userId,
      form_type: 'initial_profile',
      responses,
    })
  if (error) throw error
}

export function isEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())
}

export async function getEmailByUsername(username: string): Promise<string | null> {
  const cleanUsername = username.trim().toLowerCase()
  const { data, error } = await supabase
    .rpc('get_email_by_username', { p_username: cleanUsername })
    .maybeSingle<{ email: string } | null>()

  if (error) {
    console.error('getEmailByUsername error:', error)
    return null
  }
  return data?.email ?? null
}

function isNetworkError(err: unknown): boolean {
  if (!err) return false
  const msg = err instanceof Error ? err.message : String(err)
  return /failed to fetch|networkerror|typeerror|err_network|ERR_INTERNET_DISCONNECTED|network request failed/i.test(msg)
}

const NETWORK_ERROR_MSG = 'No hay conexión a internet. Verificá tu red y volvé a intentar.'

export async function signInWithIdentifier(
  identifier: string,
  password: string
): Promise<{ user: SessionUser | null; error: string | null }> {
  let emailToUse = identifier.trim()

  try {
    if (!isEmail(emailToUse)) {
      const resolved = await getEmailByUsername(emailToUse)
      if (!resolved) {
        return { user: null, error: 'Usuario o contraseña incorrectos' }
      }
      emailToUse = resolved
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password,
    })

    if (error) {
      if (isNetworkError(error)) {
        return { user: null, error: NETWORK_ERROR_MSG }
      }
      return { user: null, error: 'Usuario o contraseña incorrectos' }
    }

    return {
      user: data.user ? { id: data.user.id, email: data.user.email ?? null } : null,
      error: null,
    }
  } catch (err) {
    if (isNetworkError(err)) {
      return { user: null, error: NETWORK_ERROR_MSG }
    }
    return { user: null, error: 'No se pudo conectar con el servidor' }
  }
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres'
  if (!/[A-Z]/.test(password)) return 'La contraseña debe tener al menos una mayúscula'
  if (!/[0-9]/.test(password)) return 'La contraseña debe tener al menos un número'
  return null
}

export function generatePlaceholderEmail(username: string): string {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const random = Math.random().toString(36).slice(2, 8)
  return `${clean}-${random}@noemail.mujeres.app`
}

const SUPABASE_ERROR_MAP: Record<string, string> = {
  'user already registered': 'Ya existe una cuenta con ese correo electrónico',
  'email address not authorized': 'Ese correo no está autorizado para crear cuenta',
  'email not confirmed': 'Confirmá tu correo antes de iniciar sesión',
  'invalid login credentials': 'Usuario o contraseña incorrectos',
  'invalid email or password': 'Usuario o contraseña incorrectos',
  'signup requires a valid password': 'La contraseña no es válida',
  'password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
  'unable to validate email address: invalid format': 'El formato del correo no es válido',
  'email rate limit exceeded': 'Demasiados intentos. Esperá unos minutos',
  'user not found': 'No encontramos una cuenta con esos datos',
  'token has expired or is invalid': 'El enlace expiró. Solicitá uno nuevo',
  'auth session missing': 'Tu sesión expiró. Volvé a iniciar sesión',
  'network request failed': 'Sin conexión. Revisá tu internet',
}

export function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) {
    const msg = e.message
    const lower = msg.toLowerCase()
    for (const [key, translated] of Object.entries(SUPABASE_ERROR_MAP)) {
      if (lower.includes(key)) return translated
    }
    if (msg && msg !== 'Error' && msg.length < 200) return msg
  }
  return fallback
}

// =====================================================
// Recovery flow — email code via Resend
// =====================================================

export interface VerifyRecoveryCodeResult {
  reset_token: string
  expires_at: string
}

/**
 * Sends a 6-digit recovery code to the user's email via the
 * send-recovery-code edge function (Resend).
 * Always returns ok even if the email doesn't exist (privacy).
 */
export async function sendRecoveryCode(email: string): Promise<void> {
  const { error } = await supabase.functions.invoke('send-recovery-code', {
    body: { email: email.trim().toLowerCase() },
  })
  if (error) throw error
}

/**
 * Verifies a 6-digit recovery code. If valid, returns a
 * one-time reset_token valid for 10 minutes (to be used
 * with modifyPassword).
 *
 * Throws an Error if the code is invalid or expired.
 */
export async function verifyRecoveryCode(
  email: string,
  code: string,
): Promise<VerifyRecoveryCodeResult> {
  const { data, error } = await supabase.rpc('verify_recovery_code', {
    p_email: email.trim().toLowerCase(),
    p_code: code.trim(),
  })
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Código incorrecto o expirado. Solicitá uno nuevo.')
  }
  return data[0] as VerifyRecoveryCodeResult
}

/**
 * Updates the password in both auth.users (the real login
 * password) and profiles/admins (the plaintext copy used for
 * "view my password"). The reset_token is marked as used.
 */
export async function modifyPassword(
  resetToken: string,
  newPassword: string,
): Promise<void> {
  const { error } = await supabase.rpc('modify_password_with_token', {
    p_token: resetToken,
    p_new_password: newPassword,
  })
  if (error) throw error
}

// =====================================================
// COURSES
// =====================================================

export interface Course {
  id: string
  title: string
  subtitle: string
  description: string
  modality: 'virtual' | 'presencial'
  published: boolean
  concluded: boolean
  created_by: string | null
  latitude: number | null
  longitude: number | null
  location_name: string | null
  max_enrollments: number | null
  event_date: string | null
  event_time: string | null
  event_duration_minutes: number | null
  cover_image_url: string | null
  session_active: boolean
  session_started_at: string | null
  session_password: string | null
  created_at: string
  updated_at: string
}

export interface CourseImage {
  id: string
  course_id: string
  image_url: string
  sort_order: number
  created_at: string
}

export async function listCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Course[]
}

export async function listPublishedCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('published', true)
    .eq('concluded', false)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Course[]
}

export async function createCourse(course: {
  title: string
  subtitle: string
  description: string
  modality: 'virtual' | 'presencial'
  published?: boolean
  latitude?: number | null
  longitude?: number | null
  location_name?: string | null
  max_enrollments?: number | null
  event_date?: string | null
  event_time?: string | null
  event_duration_minutes?: number | null
  cover_image_url?: string | null
}): Promise<Course> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('courses')
    .insert({
      title: course.title,
      subtitle: course.subtitle,
      description: course.description,
      modality: course.modality,
      published: course.published ?? false,
      latitude: course.latitude ?? null,
      longitude: course.longitude ?? null,
      location_name: course.location_name ?? null,
      max_enrollments: course.max_enrollments ?? null,
      event_date: course.event_date ?? null,
      event_time: course.event_time ?? null,
      event_duration_minutes: course.event_duration_minutes ?? null,
      cover_image_url: course.cover_image_url ?? null,
      created_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as Course
}

export async function updateCourse(
  id: string,
  updates: Partial<Pick<Course, 'title' | 'subtitle' | 'description' | 'modality' | 'published' | 'max_enrollments' | 'latitude' | 'longitude' | 'location_name' | 'event_date' | 'event_time' | 'event_duration_minutes' | 'cover_image_url' | 'session_active' | 'session_started_at'>>
): Promise<Course> {
  const { data, error } = await supabase
    .from('courses')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Course
}

export async function startVirtualSession(courseId: string): Promise<string> {
  const password = Math.floor(1000 + Math.random() * 9000).toString()
  const { error } = await supabase
    .from('courses')
    .update({ session_active: true, session_started_at: new Date().toISOString(), session_password: password })
    .eq('id', courseId)
  if (error) throw error
  return password
}

export async function endVirtualSession(courseId: string): Promise<void> {
  const { error } = await supabase
    .from('courses')
    .update({ session_active: false, session_started_at: null })
    .eq('id', courseId)
  if (error) throw error
}

// =====================================================
// COURSE IMAGES
// =====================================================

export async function uploadCourseImage(courseId: string, file: File): Promise<CourseImage> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${courseId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('course-images')
    .upload(path, file, { upsert: false })
  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage.from('course-images').getPublicUrl(path)
  const imageUrl = urlData.publicUrl

  // Get current max sort_order
  const { data: existing } = await supabase
    .from('course_images')
    .select('sort_order')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0

  const { data, error } = await supabase
    .from('course_images')
    .insert({
      course_id: courseId,
      image_url: imageUrl,
      sort_order: nextOrder,
    })
    .select()
    .single()

  if (error) throw error
  return data as CourseImage
}

export async function getCourseImages(courseId: string): Promise<CourseImage[]> {
  const { data, error } = await supabase
    .from('course_images')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as CourseImage[]
}

export async function deleteCourseImage(imageId: string): Promise<void> {
  // Get the image to find the storage path
  const { data: img } = await supabase
    .from('course_images')
    .select('image_url')
    .eq('id', imageId)
    .single()

  if (img) {
    // Extract path from URL: .../course-images/{path}
    const urlParts = img.image_url.split('course-images/')
    if (urlParts.length > 1) {
      await supabase.storage.from('course-images').remove([urlParts[1]])
    }
  }

  const { error } = await supabase
    .from('course_images')
    .delete()
    .eq('id', imageId)

  if (error) throw error
}

export async function uploadCoverImage(courseId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${courseId}/cover.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('course-images')
    .upload(path, file, { upsert: true })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('course-images').getPublicUrl(path)
  return data.publicUrl
}

export async function deleteCourse(id: string): Promise<void> {
  const { error } = await supabase
    .from('courses')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function concludeCourse(id: string): Promise<void> {
  const { error } = await supabase
    .from('courses')
    .update({ concluded: true })
    .eq('id', id)

  if (error) throw error
}

// =====================================================
// COURSE ENROLLMENTS
// =====================================================

export interface Enrollment {
  id: string
  user_id: string
  course_id: string
  enrolled_at: string
  qr_code: string | null
  access_code: string | null
  attended: boolean
  attended_at: string | null
  profiles?: { username: string; full_name: string; avatar_url: string | null } | null
  course?: Course | null
}

function generateAccessCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

function generateQrPayload(enrollmentId: string, courseId: string, userId: string): string {
  return JSON.stringify({ eid: enrollmentId, cid: courseId, uid: userId, t: Date.now() })
}

export async function enrollInCourse(courseId: string): Promise<{ qrCodeDataUrl?: string; qrPayload?: string; accessCode?: string; modality: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: course } = await supabase
    .from('courses')
    .select('modality')
    .eq('id', courseId)
    .single()

  const modality = course?.modality ?? 'virtual'
  const accessCode = modality === 'virtual' ? generateAccessCode() : null

  const { data: enrollment, error } = await supabase
    .from('course_enrollments')
    .insert({
      user_id: user.id,
      course_id: courseId,
      access_code: accessCode,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya estás inscripto en este curso')
    }
    throw error
  }

  if (modality === 'presencial') {
    const payload = generateQrPayload(enrollment.id, courseId, user.id)
    const qrCodeDataUrl = await QRCode.toDataURL(payload, {
      width: 256,
      margin: 2,
      color: { dark: '#581C87', light: '#ffffff' },
    })
    const { error: updateErr } = await supabase
      .from('course_enrollments')
      .update({ qr_code: payload })
      .eq('id', enrollment.id)
    if (updateErr) throw updateErr
    return { qrCodeDataUrl, qrPayload: payload, modality }
  }

  return { accessCode: accessCode ?? undefined, modality }
}

export async function getMyEnrollmentForCourse(courseId: string): Promise<Enrollment | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('user_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle()

  if (error) return null
  return data as Enrollment | null
}

export async function generateQrDataUrlFromPayload(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: 400,
    margin: 2,
    color: { dark: '#581C87', light: '#ffffff' },
  })
}

export async function getEnrollmentQrCode(enrollmentId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('qr_code')
    .eq('id', enrollmentId)
    .single()
  if (error || !data) return null
  return data.qr_code
}

export async function getUserEnrollments(userId: string): Promise<(Enrollment & { course_title: string; course_modality: string })[]> {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*, courses!inner(title, modality)')
    .eq('user_id', userId)
    .order('enrolled_at', { ascending: false })
  if (error) return []
  return (data ?? []).map((e: any) => ({
    ...e,
    course_title: e.courses?.title ?? 'Curso',
    course_modality: e.courses?.modality ?? 'virtual',
  }))
}

export async function markAttendance(qrPayload: string): Promise<{ username: string; courseName: string }> {
  let parsed: { eid: string; cid: string; uid: string }
  try {
    parsed = JSON.parse(qrPayload)
  } catch {
    throw new Error('Código QR inválido')
  }

  const { data: enrollment, error: eErr } = await supabase
    .from('course_enrollments')
    .select('id, user_id, course_id, attended')
    .eq('id', parsed.eid)
    .eq('user_id', parsed.uid)
    .eq('course_id', parsed.cid)
    .maybeSingle()

  if (eErr || !enrollment) throw new Error('Inscripción no encontrada')
  if (enrollment.attended) throw new Error('Ya se registró asistencia')

  const { error: uErr } = await supabase
    .from('course_enrollments')
    .update({ attended: true, attended_at: new Date().toISOString() })
    .eq('id', enrollment.id)

  if (uErr) throw uErr

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', enrollment.user_id)
    .single()

  const { data: courseData } = await supabase
    .from('courses')
    .select('title')
    .eq('id', enrollment.course_id)
    .single()

  return {
    username: profile?.username ?? 'Desconocido',
    courseName: courseData?.title ?? 'Curso',
  }
}

export async function markBulkAttendance(enrollmentIds: string[]): Promise<{ marked: number; alreadyMarked: number }> {
  if (enrollmentIds.length === 0) return { marked: 0, alreadyMarked: 0 }

  const { data: existing, error: fetchErr } = await supabase
    .from('course_enrollments')
    .select('id, attended')
    .in('id', enrollmentIds)

  if (fetchErr) throw fetchErr

  const alreadyMarked = (existing ?? []).filter((e) => e.attended).length
  const toMark = (existing ?? []).filter((e) => !e.attended).map((e) => e.id)

  if (toMark.length > 0) {
    const { error: updateErr } = await supabase
      .from('course_enrollments')
      .update({ attended: true, attended_at: new Date().toISOString() })
      .in('id', toMark)

    if (updateErr) throw updateErr
  }

  return { marked: toMark.length, alreadyMarked }
}

export async function unenrollFromCourse(courseId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase
    .from('course_enrollments')
    .delete()
    .eq('user_id', user.id)
    .eq('course_id', courseId)

  if (error) throw error
}

export async function isEnrolledInCourse(courseId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('id')
    .eq('user_id', user.id)
    .eq('course_id', courseId)
    .maybeSingle()

  if (error) return false
  return data !== null
}

export async function getMyEnrollments(): Promise<(Enrollment & { course: Course | null })[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*, course:courses(*)')
    .eq('user_id', user.id)
    .order('enrolled_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as (Enrollment & { course: Course | null })[]
}

export async function isCourseFull(courseId: string): Promise<boolean> {
  const { data: course, error: cErr } = await supabase
    .from('courses')
    .select('max_enrollments')
    .eq('id', courseId)
    .single()

  if (cErr || !course?.max_enrollments) return false

  const { count, error } = await supabase
    .from('course_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId)

  if (error) return false
  return (count ?? 0) >= course.max_enrollments
}

export async function getCourseEnrollments(courseId: string): Promise<Enrollment[]> {
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('course_id', courseId)
    .order('enrolled_at', { ascending: false })

  if (error) throw error
  if (!data || data.length === 0) return []

  const userIds = [...new Set(data.map((r) => r.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  return data.map((row) => ({
    ...row,
    profiles: profileMap.get(row.user_id) ?? null,
  })) as Enrollment[]
}

// =====================================================
// CHAT FUNCTIONS
// =====================================================

export interface Conversation {
  id: string
  user_id: string
  participants: any
  type: string
  state: string
  assigned_admin_id: string | null
  bot_step: number
  last_message_at: string | null
  unread_user: number
  unread_admin: number
  created_at: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  sender_role: string
  content: string
  read: boolean
  created_at: string
  username?: string
  full_name?: string
  avatar_url?: string
}

// Get the general chat (seeded via migration — no INSERT needed)
export async function getGeneralChat(): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('type', 'general')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Chat general no disponible')
  return data
}

// =====================================================
// REALTIME SUBSCRIPTIONS
// =====================================================

let messagesChannel: ReturnType<typeof supabase.channel> | null = null

export function subscribeToMessages(
  conversationId: string,
  onNewMessage: (msg: Message) => void
): void {
  // Clean up previous subscription
  if (messagesChannel) {
    supabase.removeChannel(messagesChannel)
  }

  messagesChannel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      async (payload) => {
        const raw = payload.new as Message
        // Fetch sender profile from profiles OR admins
        let profile: { username: string; full_name: string; avatar_url: string | null } | null = null
        const { data: profileData } = await supabase
          .from('profiles')
          .select('username, full_name, avatar_url')
          .eq('id', raw.sender_id)
          .maybeSingle()
        if (profileData) {
          profile = profileData
        } else {
          const { data: adminData } = await supabase
            .from('admins')
            .select('username, full_name, avatar_url')
            .eq('id', raw.sender_id)
            .maybeSingle()
          if (adminData) {
            profile = { username: adminData.username, full_name: adminData.full_name, avatar_url: adminData.avatar_url ?? null }
          }
        }
        onNewMessage({
          ...raw,
          username: profile?.username,
          full_name: profile?.full_name,
          avatar_url: profile?.avatar_url ?? undefined,
        })
      }
    )
    .subscribe()
}

export function unsubscribeFromMessages(): void {
  if (messagesChannel) {
    supabase.removeChannel(messagesChannel)
    messagesChannel = null
  }
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[ queries ] getMessages error:', error)
    throw error
  }
  // Fetch profiles for all unique sender_ids from both profiles AND admins tables
  const senderIds = [...new Set((data || []).map((m: any) => m.sender_id))]
  let profileMap: Record<string, { username: string; full_name: string; avatar_url: string | null }> = {}
  if (senderIds.length > 0) {
    const [profilesResult, adminsResult] = await Promise.all([
      supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', senderIds),
      supabase.from('admins').select('id, username, full_name, avatar_url').in('id', senderIds),
    ])
    if (profilesResult.data) {
      profilesResult.data.forEach((p: any) => {
        profileMap[p.id] = { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url }
      })
    }
    if (adminsResult.data) {
      adminsResult.data.forEach((a: any) => {
        if (!profileMap[a.id]) {
          profileMap[a.id] = { username: a.username, full_name: a.full_name, avatar_url: a.avatar_url ?? null }
        }
      })
    }
  }
  return (data || []).map((m: any) => ({
    ...m,
    username: profileMap[m.sender_id]?.username,
    full_name: profileMap[m.sender_id]?.full_name,
    avatar_url: profileMap[m.sender_id]?.avatar_url,
  }))
}

export async function sendMessage(conversationId: string, content: string): Promise<Message> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: isAdmin } = await supabase.rpc('is_admin')

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      sender_role: isAdmin ? 'admin' : 'user',
      content: content.trim(),
    })
    .select()
    .single()
  if (error) throw error

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  return data
}

export async function markMessagesRead(conversationId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('messages')
    .update({ read: true })
    .eq('conversation_id', conversationId)
    .eq('read', false)
    .neq('sender_id', user.id)
}

// Admin: get all conversations (for admin panel)
export async function getAllConversations(): Promise<(Conversation & { username: string; full_name: string })[]> {
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  if (!conversations) return []

  const results = await Promise.all(
    conversations.map(async (conv) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', conv.user_id)
        .maybeSingle()
      return {
        ...conv,
        username: profile?.username || 'unknown',
        full_name: profile?.full_name || 'Unknown',
      }
    })
  )
  return results
}

// =====================================================
// DM CONVERSATIONS
// =====================================================

// Get all conversations for current user (general + DMs)
export interface ConversationListItem extends Conversation {
  last_message?: string
  last_message_time?: string
  other_user?: { id: string; username: string; full_name: string; avatar_url: string | null }
  unread_count?: number
}

export async function getUserConversations(): Promise<ConversationListItem[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // 1. Get general chat separately (always present)
  const generalConv = await getGeneralChat().catch(() => null)

  // 2. Get DMs where user participates
  const { data: dmConvs, error: dmError } = await supabase
    .from('conversations')
    .select('*')
    .eq('type', 'dm')
    .eq('state', 'open')
    .or(`user_id.eq.${user.id},participants.cs.{${user.id}}`)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  // Combine: general first, then DMs
  const allConvs: Conversation[] = []
  if (generalConv) allConvs.push(generalConv)
  if (dmConvs && !dmError) allConvs.push(...dmConvs)

  if (allConvs.length === 0) return []

  // Pre-fetch all profiles + admins for participant lookups
  const allUserIds = new Set<string>()
  allConvs.forEach((c) => {
    const participants = (c.participants || []) as string[]
    participants.forEach((p) => allUserIds.add(p))
    if (c.user_id) allUserIds.add(c.user_id)
  })
  // Remove general chat's seeded user_id if it's just a placeholder
  allUserIds.delete(user.id)
  const userIdArr = [...allUserIds].filter((id) => id !== user.id)

  let profileMap: Record<string, { id: string; username: string; full_name: string; avatar_url: string | null }> = {}
  if (userIdArr.length > 0) {
    const [profilesResult, adminsResult] = await Promise.all([
      supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', userIdArr),
      supabase.from('admins').select('id, username, full_name, avatar_url').in('id', userIdArr),
    ])
    if (profilesResult.data) {
      profilesResult.data.forEach((p) => {
        profileMap[p.id] = { id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url }
      })
    }
    if (adminsResult.data) {
      adminsResult.data.forEach((a) => {
        if (!profileMap[a.id]) {
          profileMap[a.id] = { id: a.id, username: a.username, full_name: a.full_name, avatar_url: a.avatar_url ?? null }
        }
        // Also check profiles for admin avatar
        if (!profileMap[a.id]?.avatar_url) {
          const profAvatar = profilesResult.data?.find((p) => p.id === a.id)
          if (profAvatar?.avatar_url) {
            profileMap[a.id] = { ...profileMap[a.id], avatar_url: profAvatar.avatar_url }
          }
        }
      })
    }
  }

  const items = await Promise.all(
    allConvs.map(async (conv) => {
      let otherUser: ConversationListItem['other_user'] = undefined
      let unreadCount = 0

      if (conv.type === 'general') {
        otherUser = { id: 'general', username: 'Chat General', full_name: 'Chat General', avatar_url: null }
      } else if (conv.type === 'dm') {
        const participants = (conv.participants || []) as string[]
        const otherId = participants.find((p) => p !== user.id) || conv.user_id
        if (otherId !== user.id && profileMap[otherId]) {
          const p = profileMap[otherId]
          otherUser = { id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url }
        }
      }

      // Count unread messages
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('read', false)
        .neq('sender_id', user.id)
      unreadCount = count || 0

      // Get last message
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      return {
        ...conv,
        last_message: lastMsg?.content || '',
        last_message_time: lastMsg?.created_at || conv.last_message_at,
        other_user: otherUser,
        unread_count: unreadCount,
      }
    })
  )

  // Sort: general always first, then by last message time
  return items.sort((a, b) => {
    if (a.type === 'general') return -1
    if (b.type === 'general') return 1
    const ta = a.last_message_time ? new Date(a.last_message_time).getTime() : 0
    const tb = b.last_message_time ? new Date(b.last_message_time).getTime() : 0
    return tb - ta
  })
}

// Create or get existing DM conversation
export async function createDMConversation(targetUserId: string): Promise<Conversation> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (targetUserId === user.id) throw new Error('No puedes chatear contigo misma')

  // Check if DM already exists
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('type', 'dm')
    .eq('state', 'open')
    .or(`and(user_id.eq.${user.id},participants.cs.{${targetUserId}}),and(user_id.eq.${targetUserId},participants.cs.{${user.id}})`)
    .maybeSingle()

  if (existing) return existing

  // Create new DM
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
      type: 'dm',
      state: 'open',
      participants: [user.id, targetUserId],
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// =====================================================
// REPORTS
// =====================================================

export async function reportUser(reportedId: string, reason: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  if (reportedId === user.id) throw new Error('No te puedes reportar a ti misma')

  const { error } = await supabase
    .from('reports')
    .insert({
      reporter_id: user.id,
      reported_id: reportedId,
      reason: reason.trim(),
    })
  if (error) {
    if (error.message?.includes('unique')) {
      throw new Error('Ya reportaste a este usuario')
    }
    throw error
  }
}

// Check if current user is blocked
export async function checkUserBlocked(): Promise<{ blocked: boolean; until: string | null }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { blocked: false, until: null }

  const { data } = await supabase
    .from('profiles')
    .select('blocked_until')
    .eq('id', user.id)
    .maybeSingle()

  if (!data?.blocked_until) return { blocked: false, until: null }

  const until = new Date(data.blocked_until)
  if (until > new Date()) {
    return { blocked: true, until: data.blocked_until }
  }
  return { blocked: false, until: null }
}

// Subscribe to conversations list changes (new messages, new convos)
let conversationsChannel: ReturnType<typeof supabase.channel> | null = null

export function subscribeToConversations(onChange: () => void): void {
  if (conversationsChannel) {
    supabase.removeChannel(conversationsChannel)
  }

  conversationsChannel = supabase
    .channel('conversations-list')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversations' },
      () => onChange()
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      () => onChange()
    )
    .subscribe()
}

export function unsubscribeFromConversations(): void {
  if (conversationsChannel) {
    supabase.removeChannel(conversationsChannel)
    conversationsChannel = null
  }
}
