import { useState, useEffect, useCallback } from 'react'
import { sileo } from 'sileo'
import { supabase } from '../../lib/supabase'
import { getCourseEnrollments, markBulkAttendance, startVirtualSession, endVirtualSession, adminRemoveEnrollment, type Course, type Enrollment } from '../../lib/queries'
import QRScanner from './QRScanner'
import Skeleton from '../ui/Skeleton'
import VideoCall from '../ui/VideoCall'

interface CourseDetailPageProps {
  course: Course
  onBack: () => void
  onVideoCallFullscreenChange?: (fullscreen: boolean) => void
}

export default function CourseDetailPage({ course, onBack, onVideoCallFullscreenChange }: CourseDetailPageProps) {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sessionActive, setSessionActive] = useState(course.session_active)
  const [inSession, setInSession] = useState(false)
  const [startingSession, setStartingSession] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await getCourseEnrollments(course.id)
      setEnrollments(data)
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudieron cargar las inscripciones' })
    } finally {
      setLoading(false)
    }
  }, [course.id])

  useEffect(() => { load() }, [load])

  // Lista en vivo: cuando un inscripto entra a la sesión virtual y su
  // asistencia pasa a presente, la fila se actualiza sin recargar.
  useEffect(() => {
    const channel = supabase
      .channel(`course-enrollments:${course.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'course_enrollments', filter: `course_id=eq.${course.id}` },
        () => { load() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [course.id, load])

  const attended = enrollments.filter((e) => e.attended)
  const notAttended = enrollments.filter((e) => !e.attended)
  const pct = enrollments.length > 0 ? Math.round((attended.length / enrollments.length) * 100) : 0

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const unmarked = enrollments.filter((e) => !e.attended)
    if (selectedIds.size === unmarked.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(unmarked.map((e) => e.id)))
    }
  }

  const handleRegisterManual = async () => {
    if (selectedIds.size === 0) {
      sileo.error({ title: 'Sin selección', description: 'Seleccioná al menos un inscripto' })
      return
    }
    try {
      const result = await markBulkAttendance([...selectedIds])
      sileo.success({
        title: 'Asistencia registrada',
        description: `${result.marked} registrado${result.marked !== 1 ? 's' : ''}${result.alreadyMarked > 0 ? `, ${result.alreadyMarked} ya marcado${result.alreadyMarked !== 1 ? 's' : ''}` : ''}`,
      })
      setSelectedIds(new Set())
      setManualMode(false)
      load()
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo registrar la asistencia' })
    }
  }

  const handleScanResult = (username: string) => {
    sileo.success({ title: 'Asistencia registrada', description: username })
    setScannerOpen(false)
    load()
  }

  const handleRemoveEnrollment = async (enr: Enrollment) => {
    const name = enr.profiles?.full_name || enr.profiles?.username || 'este usuario'
    const ok = window.confirm(
      `¿Eliminar a ${name} del curso?\n\nSe liberará su cupo y se eliminarán su código QR y su código de acceso.`
    )
    if (!ok) return
    setRemovingId(enr.id)
    try {
      await adminRemoveEnrollment(enr.id)
      sileo.success({ title: 'Inscripción eliminada', description: `${name} fue removido del curso. El cupo quedó liberado.` })
      load()
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo eliminar la inscripción' })
    } finally {
      setRemovingId(null)
    }
  }

  const handleStartSession = async () => {
    setStartingSession(true)
    try {
      const password = await startVirtualSession(course.id)
      setSessionActive(true)
      setInSession(true)
      sileo.success({ title: 'Sesión iniciada', description: `Los inscriptos pueden unirse ahora. Código: ${password}` })
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo iniciar la sesión' })
    } finally {
      setStartingSession(false)
    }
  }

  const handleEndSession = async () => {
    try {
      await endVirtualSession(course.id)
      setSessionActive(false)
      setInSession(false)
      sileo.success({ title: 'Sesión finalizada', description: 'La sesión virtual ha terminado' })
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo finalizar la sesión' })
    }
  }

  const handleSessionClose = () => {
    setInSession(false)
    // Session stays active — admin can rejoin or end it
  }

  if (loading) {
    return (
      <div className="course-detail-page">
        <button onClick={onBack} className="volver-btn-sm" type="button">
          <div className="volver-btn-sm-bg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="16px" width="16px">
              <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
              <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
            </svg>
          </div>
          <p className="volver-btn-sm-text">Volver</p>
        </button>
        <Skeleton lines={6} />
      </div>
    )
  }

  return (
    <div className="course-detail-page">
      <div className="course-detail-header">
        <button onClick={onBack} className="volver-btn-sm" type="button">
          <div className="volver-btn-sm-bg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="16px" width="16px">
              <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
              <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
            </svg>
          </div>
          <p className="volver-btn-sm-text">Volver</p>
        </button>
        <div className="course-detail-title-row">
          <h2 className="course-detail-title">{course.title}</h2>
          {course.subtitle && <p className="course-detail-subtitle">{course.subtitle}</p>}
        </div>

        <div className="course-detail-stats">
          <span className="course-detail-stat">{enrollments.length} inscripto{enrollments.length !== 1 ? 's' : ''}</span>
          <span className="course-detail-stat-sep">·</span>
          <span className="course-detail-stat course-detail-stat-attended">{attended.length} asistieron ({pct}%)</span>
          <span className="course-detail-stat-sep">·</span>
          <span className="course-detail-stat course-detail-stat-missed">{notAttended.length} pendiente{notAttended.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="course-detail-chart">
          <div className="course-detail-chart-bar">
            <div className="course-detail-chart-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="course-detail-actions">
          {course.modality === 'virtual' && (
            <>
              {sessionActive && (
                <div className="course-detail-live-badge">
                  <span className="live-dot" />
                  EN VIVO
                </div>
              )}
              {!sessionActive ? (
                <button
                  className="course-detail-action-btn course-detail-action-start"
                  onClick={handleStartSession}
                  disabled={startingSession}
                  type="button"
                >
                  {startingSession ? (
                    <>
                      <div className="curso-detail-spinner-light" />
                      Iniciando...
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Iniciar Sesión Virtual
                    </>
                  )}
                </button>
              ) : (
                <button
                  className="course-detail-action-btn course-detail-action-end"
                  onClick={handleEndSession}
                  type="button"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                  Finalizar Sesión
                </button>
              )}
            </>
          )}
          {course.modality === 'presencial' && (
            <button
              className="course-detail-action-btn course-detail-action-qr"
              onClick={() => setScannerOpen(true)}
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
              Registrar llegada QR
            </button>
          )}
          <button
            className={`course-detail-action-btn ${manualMode ? 'course-detail-action-manual-active' : 'course-detail-action-manual'}`}
            onClick={() => { setManualMode(!manualMode); setSelectedIds(new Set()) }}
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <path d="M5 7v10" />
              <path d="M5 17h10" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            {manualMode ? 'Cerrar selección' : 'Registrar llegada manual'}
          </button>
        </div>
      </div>

      {manualMode && (
        <div className="course-detail-manual-bar">
          <label className="course-detail-select-all">
            <input
              type="checkbox"
              checked={enrollments.filter((e) => !e.attended).length > 0 && selectedIds.size === enrollments.filter((e) => !e.attended).length}
              onChange={toggleAll}
            />
            <span>Seleccionar todos los pendientes</span>
          </label>
          {selectedIds.size > 0 && (
            <button className="course-detail-register-btn" onClick={handleRegisterManual} type="button">
              Registrar llegadas ({selectedIds.size})
            </button>
          )}
        </div>
      )}

      {enrollments.length === 0 ? (
        <div className="course-detail-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" x2="19" y1="8" y2="14" />
            <line x1="22" x2="16" y1="11" y2="11" />
          </svg>
          <p>No hay inscriptos aún</p>
        </div>
      ) : (
        <div className="course-detail-table">
          <div className="course-detail-table-header">
            <span className="course-detail-col course-detail-col-check" />
            <span className="course-detail-col course-detail-col-avatar" />
            <span className="course-detail-col course-detail-col-info">
              <span className="course-detail-name">Nombre</span>
              <span className="course-detail-meta">Usuario · Inscripción</span>
            </span>
            <span className="course-detail-col course-detail-col-status">Estado</span>
            <span className="course-detail-col course-detail-col-action" />
          </div>
          {enrollments.map((enr) => {
            const isSelected = selectedIds.has(enr.id)
            const isMarked = enr.attended
            return (
              <div
                key={enr.id}
                className={`course-detail-row ${isMarked ? 'course-detail-row-attended' : ''} ${isSelected ? 'course-detail-row-selected' : ''} ${manualMode && !isMarked ? 'course-detail-row-checkable' : ''}`}
                onClick={() => { if (manualMode && !isMarked) toggleSelect(enr.id) }}
                role={manualMode && !isMarked ? 'button' : undefined}
                tabIndex={manualMode && !isMarked ? 0 : undefined}
                onKeyDown={(e) => { if (manualMode && !isMarked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSelect(enr.id) } }}
              >
                <span className="course-detail-col course-detail-col-check">
                  {manualMode && !isMarked && (
                    <span className={`course-detail-checkbox ${isSelected ? 'course-detail-checkbox-checked' : ''}`}>
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                  )}
                </span>
                <span className="course-detail-col course-detail-col-avatar">
                  {enr.profiles?.avatar_url ? (
                    <img src={enr.profiles.avatar_url} alt="" className="course-detail-avatar-img" />
                  ) : (
                    <span className="course-detail-avatar-initials">
                      {getInitials(enr.profiles?.full_name)}
                    </span>
                  )}
                </span>
                <span className="course-detail-col course-detail-col-info">
                  <span className="course-detail-name">
                    {enr.profiles?.full_name || '—'}
                  </span>
                  <span className="course-detail-meta">
                    @{enr.profiles?.username || '?'} · {new Date(enr.enrolled_at).toLocaleDateString('es-MX', { dateStyle: 'short' })}
                  </span>
                </span>
                <span className={`course-detail-col course-detail-col-status ${isMarked ? 'course-detail-status-attended' : 'course-detail-status-missed'}`}>
                  {isMarked ? 'Presente' : 'Ausente'}
                </span>
                <span className="course-detail-col course-detail-col-action">
                  <button
                    className="course-detail-remove-btn"
                    onClick={(e) => { e.stopPropagation(); handleRemoveEnrollment(enr) }}
                    disabled={removingId === enr.id}
                    title="Eliminar del curso"
                    type="button"
                  >
                    {removingId === enr.id ? (
                      <span className="course-detail-remove-spinner" />
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    )}
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {scannerOpen && (
        <QRScanner
          onScanResult={handleScanResult}
          onClose={() => setScannerOpen(false)}
        />
      )}

      {inSession && (
        <VideoCall
          courseId={course.id}
          isAdmin={true}
          onClose={handleSessionClose}
          onFullscreenChange={onVideoCallFullscreenChange}
        />
      )}
    </div>
  )
}

function getInitials(name?: string | null): string {
  if (!name) return '?'
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}
