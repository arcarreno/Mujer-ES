import { useState, useEffect } from 'react'
import { sileo } from 'sileo'
import { listCourses, deleteCourse, getCourseEnrollments, type Course, type Enrollment } from '../../lib/queries'

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

  return (
    <div className="admin-cursos">
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
              className="admin-curso-card"
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
                    <div className="admin-curso-enrollments-list">
                      {enrollments[course.id]?.map((enr) => (
                        <div key={enr.id} className="admin-curso-enrollment-item">
                          <div className="admin-curso-enrollment-avatar">
                            {(enr.profiles?.full_name?.[0] || enr.profiles?.username?.[0] || '?').toUpperCase()}
                          </div>
                          <div className="admin-curso-enrollment-info">
                            <span className="admin-curso-enrollment-name">{enr.profiles?.full_name || enr.profiles?.username || 'Sin nombre'}</span>
                            <span className="admin-curso-enrollment-date">
                              {new Date(enr.enrolled_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
