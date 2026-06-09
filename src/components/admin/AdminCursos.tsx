import { useState, useEffect } from 'react'
import { sileo } from 'sileo'
import { listCourses, deleteCourse, concludeCourse, getCourseEnrollments, generateQrDataUrlFromPayload, type Course, type Enrollment } from '../../lib/queries'
import QRScanner from './QRScanner'
import EditCoursePage from './EditCoursePage'

interface AdminCursosProps {
  onCreateCourse: () => void
}

export default function AdminCursos({ onCreateCourse }: AdminCursosProps) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [enrollments, setEnrollments] = useState<Record<string, Enrollment[]>>({})
  const [enrollmentsLoading, setEnrollmentsLoading] = useState<Record<string, boolean>>({})
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({})
  const [scannerCourseId, setScannerCourseId] = useState<string | null>(null)
  const [qrModalEnrollment, setQrModalEnrollment] = useState<{ enrollmentId: string; username: string; courseName: string } | null>(null)
  const [qrModalDataUrl, setQrModalDataUrl] = useState<string | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)

  const load = async () => {
    try {
      const data = await listCourses()
      setCourses(data)
      const counts: Record<string, number> = {}
      await Promise.all(
        data.map(async (c) => {
          const enrollments = await getCourseEnrollments(c.id)
          counts[c.id] = enrollments.length
        })
      )
      setEnrollmentCounts(counts)
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudieron cargar los cursos' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`¿Eliminar el curso "${title}"?`)) return
    try {
      await deleteCourse(id)
      setCourses((prev) => prev.filter((c) => c.id !== id))
      sileo.success({ title: 'Curso eliminado', description: `"${title}" fue eliminado` })
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo eliminar el curso' })
    }
  }

  const handleConclude = async (id: string, title: string) => {
    if (!confirm(`¿Concluir el curso "${title}"? Ya no será visible para los usuarios.`)) return
    try {
      await concludeCourse(id)
      setCourses((prev) => prev.map((c) => c.id === id ? { ...c, concluded: true } : c))
      sileo.success({ title: 'Curso concluido', description: `"${title}" fue concluido` })
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo concluir el curso' })
    }
  }

  const toggleEnrollments = async (courseId: string) => {
    if (expandedId === courseId) {
      setExpandedId(null)
      return
    }
    setExpandedId(courseId)
    if (!enrollments[courseId]) {
      setEnrollmentsLoading((prev) => ({ ...prev, [courseId]: true }))
      try {
        const data = await getCourseEnrollments(courseId)
        setEnrollments((prev) => ({ ...prev, [courseId]: data }))
      } catch {
        sileo.error({ title: 'Error', description: 'No se pudieron cargar inscripciones' })
      } finally {
        setEnrollmentsLoading((prev) => ({ ...prev, [courseId]: false }))
      }
    }
  }

  const showQrModal = async (enrollmentId: string, username: string, courseName: string) => {
    setQrModalEnrollment({ enrollmentId, username, courseName })
    setQrModalDataUrl(null)
    try {
      const enrollment = enrollments[Object.keys(enrollments).find(k =>
        enrollments[k].some(e => e.id === enrollmentId)
      ) ?? '']?.find(e => e.id === enrollmentId)
      if (enrollment?.qr_code) {
        const dataUrl = await generateQrDataUrlFromPayload(enrollment.qr_code)
        setQrModalDataUrl(dataUrl)
      }
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo generar el código QR' })
    }
  }

  return (
    <div className="admin-cursos">
      {editingCourse && (
        <EditCoursePage
          course={editingCourse}
          enrollmentCount={enrollmentCounts[editingCourse.id] ?? 0}
          onUpdated={() => { setEditingCourse(null); load() }}
          onBack={() => setEditingCourse(null)}
        />
      )}

      {!editingCourse && (
      <>
      <div className="admin-cursos-header">
        <div>
          <h2 className="cursos-title">Cursos</h2>
          <p className="cursos-subtitle">{courses.length} curso{courses.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          className="admin-create-btn"
          onClick={onCreateCourse}
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" x2="12" y1="5" y2="19" />
            <line x1="5" x2="19" y1="12" y2="12" />
          </svg>
          Crear curso
        </button>
      </div>

      {loading ? (
        <div className="admin-cursos-empty">
          <p>Cargando cursos...</p>
        </div>
      ) : courses.length === 0 ? (
        <div className="admin-cursos-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <p>No hay cursos creados</p>
          <span>Creá el primer curso con el botón de arriba</span>
        </div>
      ) : (
        <div className="admin-cursos-list">
          {courses.map((course, i) => (
            <div
              key={course.id}
              className={`admin-curso-card ${course.concluded ? 'admin-curso-card-concluded' : ''}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="admin-curso-card-header">
                <div className="admin-curso-card-info">
                  <h3 className="admin-curso-card-title">{course.title}</h3>
                  {course.subtitle && (
                    <p className="admin-curso-card-subtitle">{course.subtitle}</p>
                  )}
                </div>
                <div className="admin-curso-card-badges">
                  {course.concluded && (
                    <span className="admin-curso-badge admin-curso-badge-concluded">Concluido</span>
                  )}
                  <span className={`admin-curso-badge ${course.published ? 'admin-curso-badge-published' : 'admin-curso-badge-draft'}`}>
                    {course.published ? 'Publicado' : 'Borrador'}
                  </span>
                  <span className="admin-curso-badge admin-curso-badge-modality">
                    {course.modality === 'virtual' ? 'Virtual' : 'Presencial'}
                  </span>
                </div>
              </div>
              {course.description && (
                <p className="admin-curso-card-desc">{course.description}</p>
              )}
              {course.location_name && (
                <p className="admin-curso-card-location">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {course.location_name}
                </p>
              )}
              <div className="admin-curso-card-vacancies">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" x2="19" y1="8" y2="14" />
                  <line x1="22" x2="16" y1="11" y2="11" />
                </svg>
                <span>
                  {enrollmentCounts[course.id] ?? 0}
                  {course.max_enrollments ? ` / ${course.max_enrollments}` : ''} inscripto{(enrollmentCounts[course.id] ?? 0) !== 1 ? 's' : ''}
                </span>
                {course.max_enrollments && (enrollmentCounts[course.id] ?? 0) >= course.max_enrollments && (
                  <span className="admin-curso-badge admin-curso-badge-full">Lleno</span>
                )}
              </div>
              <div className="admin-curso-card-footer">
                <button
                  className="admin-curso-enrollments-btn"
                  onClick={() => toggleEnrollments(course.id)}
                  type="button"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" x2="19" y1="8" y2="14" />
                    <line x1="22" x2="16" y1="11" y2="11" />
                  </svg>
                  Inscriptos
                </button>
                <div className="admin-curso-card-actions">
                  <span className="admin-curso-card-date">
                    {new Date(course.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                  </span>
                  <button
                    className="admin-curso-action-btn"
                    onClick={() => setEditingCourse(course)}
                    type="button"
                    aria-label={`Editar curso ${course.title}`}
                    title="Editar"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      <path d="m15 5 4 4" />
                    </svg>
                  </button>
                  {!course.concluded && (
                    <button
                      className="admin-curso-action-btn admin-curso-conclude-btn"
                      onClick={() => handleConclude(course.id, course.title)}
                      type="button"
                      aria-label={`Concluir curso ${course.title}`}
                      title="Marcar como concluido"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </button>
                  )}
                  <button
                    className="admin-curso-action-btn"
                    onClick={() => handleDelete(course.id, course.title)}
                    type="button"
                    aria-label={`Eliminar curso ${course.title}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>

              {expandedId === course.id && (
                <div className="admin-curso-enrollments">
                  {enrollmentsLoading[course.id] ? (
                    <p className="admin-curso-enrollments-loading">Cargando inscriptos...</p>
                  ) : enrollments[course.id]?.length === 0 ? (
                    <p className="admin-curso-enrollments-empty">No hay inscriptos aún</p>
                  ) : (
                    <>
                      {(() => {
                        const enrList = enrollments[course.id] ?? []
                        const attended = enrList.filter((e) => e.attended)
                        const notAttended = enrList.filter((e) => !e.attended)
                        const total = enrList.length
                        const pct = total > 0 ? Math.round((attended.length / total) * 100) : 0

                        return (
                          <>
                            <div className="admin-curso-attendance-chart">
                              <div className="admin-curso-chart-bar">
                                <div className="admin-curso-chart-fill" style={{ width: `${pct}%` }} />
                              </div>
                              <div className="admin-curso-chart-labels">
                                <span className="admin-curso-chart-label-attended">
                                  {attended.length} asistieron ({pct}%)
                                </span>
                                <span className="admin-curso-chart-label-missed">
                                  {notAttended.length} no asistieron
                                </span>
                              </div>
                            </div>

                            <div className="admin-curso-enrollments-scroll">
                              <div className="admin-curso-enrollments-table">
                                <div className="admin-curso-table-header">
                                  <span className="admin-curso-table-col admin-curso-table-col-name">Nombre</span>
                                  <span className="admin-curso-table-col admin-curso-table-col-username">Usuario</span>
                                  <span className="admin-curso-table-col admin-curso-table-col-date">Inscripción</span>
                                  <span className="admin-curso-table-col admin-curso-table-col-status">Estado</span>
                                  {course.modality === 'presencial' && (
                                    <span className="admin-curso-table-col admin-curso-table-col-qr">QR</span>
                                  )}
                                </div>
                                {enrList.map((enr) => (
                                  <div key={enr.id} className={`admin-curso-table-row ${enr.attended ? 'admin-curso-table-row-attended' : ''}`}>
                                    <span className="admin-curso-table-col admin-curso-table-col-name">
                                      {enr.profiles?.full_name || '—'}
                                    </span>
                                    <span className="admin-curso-table-col admin-curso-table-col-username">
                                      @{enr.profiles?.username || '?'}
                                    </span>
                                    <span className="admin-curso-table-col admin-curso-table-col-date">
                                      {new Date(enr.enrolled_at).toLocaleDateString('es-MX', { dateStyle: 'short' })}
                                    </span>
                                    <span className={`admin-curso-table-col admin-curso-table-col-status ${enr.attended ? 'admin-curso-status-attended' : 'admin-curso-status-missed'}`}>
                                      {enr.attended ? 'Presente' : 'Ausente'}
                                    </span>
                                    {course.modality === 'presencial' && (
                                      <span className="admin-curso-table-col admin-curso-table-col-qr">
                                        {enr.qr_code && (
                                          <button
                                            className="admin-curso-qr-btn"
                                            onClick={() => showQrModal(enr.id, enr.profiles?.username ?? '?', course.title)}
                                            type="button"
                                            title="Ver QR"
                                          >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <rect x="3" y="3" width="7" height="7" />
                                              <rect x="14" y="3" width="7" height="7" />
                                              <rect x="3" y="14" width="7" height="7" />
                                              <rect x="14" y="14" width="3" height="3" />
                                            </svg>
                                          </button>
                                        )}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {course.modality === 'presencial' && (
                              <button
                                className="admin-curso-scan-btn"
                                onClick={() => setScannerCourseId(course.id)}
                                type="button"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                                  <line x1="7" y1="12" x2="17" y2="12" />
                                </svg>
                                Escanear QR
                              </button>
                            )}
                          </>
                        )
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </>
      )}

      {scannerCourseId && (
        <QRScanner
          onScanResult={(username, courseName) => {
            sileo.success({ title: 'Asistencia registrada', description: `${username} — ${courseName}` })
            setScannerCourseId(null)
            if (expandedId) toggleEnrollments(expandedId)
          }}
          onClose={() => setScannerCourseId(null)}
        />
      )}

      {qrModalEnrollment && (
        <div className="admin-qr-overlay" onClick={(e) => { if (e.target === e.currentTarget) setQrModalEnrollment(null) }}>
          <div className="admin-qr-modal">
            <div className="admin-qr-header">
              <h3 className="admin-qr-title">QR — {qrModalEnrollment.username}</h3>
              <button className="admin-qr-close" onClick={() => setQrModalEnrollment(null)} type="button">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="admin-qr-body">
              <p className="admin-qr-course">{qrModalEnrollment.courseName}</p>
              {qrModalDataUrl ? (
                <>
                  <div className="admin-qr-img">
                    <img src={qrModalDataUrl} alt={`QR de ${qrModalEnrollment.username}`} width="220" height="220" />
                  </div>
                  <p className="admin-qr-sub">Código QR personal e intransferible</p>
                </>
              ) : (
                <div className="admin-qr-loading">
                  <div className="curso-detail-spinner" />
                  <p>Generando código...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
