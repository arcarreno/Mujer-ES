import { supabase } from './supabase'
import QRCode from 'qrcode'

export interface Profile {
  id: string
  username: string
  full_name: string
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
  return data
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
// Security questions — recovery flow
// =====================================================

export interface SecurityQuestionsData {
  user_id: string
  is_admin: boolean
  question_1: string
  question_2: string
  question_3: string
  has_answer_1: boolean
  has_answer_2: boolean
  has_answer_3: boolean
}

/**
 * Returns the 3 security questions for the given identifier
 * (username or email), plus flags indicating which ones
 * actually have answers (i.e. weren't N/A at signup).
 *
 * Returns null if the account doesn't exist.
 */
export async function getSecurityQuestions(
  identifier: string,
): Promise<SecurityQuestionsData | null> {
  const { data, error } = await supabase.rpc('get_security_questions', {
    p_identifier: identifier.trim().toLowerCase(),
  })
  if (error) throw error
  if (!data || data.length === 0) return null
  return data[0] as SecurityQuestionsData
}

export interface VerifyAnswersResult {
  reset_token: string
  user_id: string
  expires_at: string
}

/**
 * Verifies the 3 security question answers. If all the
 * answered questions match (NULL stored = user picked N/A,
 * treated as correct), returns a one-time reset_token valid
 * for 10 minutes.
 *
 * Throws an Error if the answers don't match.
 */
export async function verifySecurityAnswers(
  identifier: string,
  a1: string,
  a2: string,
  a3: string,
): Promise<VerifyAnswersResult> {
  const { data, error } = await supabase.rpc('verify_security_answers', {
    p_identifier: identifier.trim().toLowerCase(),
    p_answer_1: a1,
    p_answer_2: a2,
    p_answer_3: a3,
  })
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Las respuestas no son correctas')
  }
  return data[0] as VerifyAnswersResult
}

/**
 * Returns the plaintext password from profiles or admins if
 * the reset_token is valid (not used, not expired). The token
 * is marked as used atomically — calling twice with the same
 * token returns an error the second time.
 */
export async function viewPassword(resetToken: string): Promise<string> {
  const { data, error } = await supabase.rpc('view_password_with_token', {
    p_token: resetToken,
  })
  if (error) throw error
  if (!data) {
    throw new Error('El enlace expiró. Volvé a verificar tus respuestas')
  }
  return data as string
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
  created_at: string
  updated_at: string
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
      created_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as Course
}

export async function updateCourse(
  id: string,
  updates: Partial<Pick<Course, 'title' | 'subtitle' | 'description' | 'modality' | 'published'>>
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
  profiles?: { username: string; full_name: string } | null
}

function generateAccessCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

function generateQrPayload(enrollmentId: string, courseId: string, userId: string): string {
  return JSON.stringify({ eid: enrollmentId, cid: courseId, uid: userId, t: Date.now() })
}

export async function enrollInCourse(courseId: string): Promise<{ qrCodeDataUrl?: string; accessCode?: string; modality: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: course } = await supabase
    .from('courses')
    .select('modality')
    .eq('id', courseId)
    .single()

  const modality = course?.modality ?? 'virtual'
  const accessCode = modality === 'virtual' ? generateAccessCode() : null

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    course_id: courseId,
    access_code: accessCode,
  }

  let qrCodeDataUrl: string | undefined

  if (modality === 'presencial') {
    const tempId = crypto.randomUUID()
    const payload = generateQrPayload(tempId, courseId, user.id)
    const dataUrl = await QRCode.toDataURL(payload, {
      width: 256,
      margin: 2,
      color: { dark: '#581C87', light: '#ffffff' },
    })
    insertData.qr_code = payload
    qrCodeDataUrl = dataUrl
  }

  const { data: enrollment, error } = await supabase
    .from('course_enrollments')
    .insert(insertData)
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Ya estás inscripto en este curso')
    }
    throw error
  }

  if (modality === 'presencial' && qrCodeDataUrl) {
    const payload = generateQrPayload(enrollment.id, courseId, user.id)
    const freshDataUrl = await QRCode.toDataURL(payload, {
      width: 256,
      margin: 2,
      color: { dark: '#581C87', light: '#ffffff' },
    })
    await supabase
      .from('course_enrollments')
      .update({ qr_code: payload })
      .eq('id', enrollment.id)
    return { qrCodeDataUrl: freshDataUrl, modality }
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
    .eq('qr_code', qrPayload)
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
    .select('id, username, full_name')
    .in('id', userIds)

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  return data.map((row) => ({
    ...row,
    profiles: profileMap.get(row.user_id) ?? null,
  })) as Enrollment[]
}
