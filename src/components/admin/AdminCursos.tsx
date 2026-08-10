import { useState, useEffect } from 'react'
import { sileo } from 'sileo'
import { listCourses, deleteCourse, concludeCourse, getCourseEnrollments, type Course } from '../../lib/queries'
import EditCoursePage from './EditCoursePage'
import Skeleton from '../ui/Skeleton'

interface AdminCursosProps {
  onCreateCourse: () => void
  onSelectCourse: (course: Course) => void
}

export default function AdminCursos({ onCreateCourse, onSelectCourse }: AdminCursosProps) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [enrollmentCounts, setEnrollmentCounts] = useState<Record<string, number>>({})
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [tab, setTab] = useState<'activos' | 'concluidos'>('activos')

  const activeCourses = courses.filter((c) => !c.concluded)
  const concludedCourses = courses.filter((c) => c.concluded)
  const visibleCourses = tab === 'activos' ? activeCourses : concludedCourses

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
          <div className="cursos-title-row">
            <h2 className="cursos-title">Cursos</h2>
            <div className="admin-cursos-pills" role="tablist" aria-label="Filtrar cursos">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'activos'}
                className={`admin-cursos-pill ${tab === 'activos' ? 'admin-cursos-pill-active' : ''}`}
                onClick={() => setTab('activos')}
              >
                Activos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'concluidos'}
                className={`admin-cursos-pill ${tab === 'concluidos' ? 'admin-cursos-pill-active' : ''}`}
                onClick={() => setTab('concluidos')}
              >
                Concluidos
              </button>
            </div>
          </div>
          <p className="cursos-subtitle">
            {tab === 'activos'
              ? `${activeCourses.length} curso${activeCourses.length !== 1 ? 's' : ''} activo${activeCourses.length !== 1 ? 's' : ''}`
              : `${concludedCourses.length} curso${concludedCourses.length !== 1 ? 's' : ''} concluido${concludedCourses.length !== 1 ? 's' : ''}`}
          </p>
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
          <Skeleton lines={3} />
        </div>
      ) : visibleCourses.length === 0 ? (
        <div className="admin-cursos-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <p>
            {tab === 'activos'
              ? 'No hay cursos activos'
              : 'No hay cursos concluidos'}
          </p>
          <span>
            {tab === 'activos'
              ? 'Creá el primer curso con el botón de arriba'
              : 'Los cursos que concluyas aparecerán acá'}
          </span>
        </div>
      ) : (
        <div className="admin-cursos-list">
          {visibleCourses.map((course, i) => (
            <div
              key={course.id}
              className={`admin-curso-card ${course.cover_image_url ? 'admin-curso-card-photo' : ''}`}
              style={{
                backgroundImage: course.cover_image_url
                  ? `url("${course.cover_image_url}")`
                  : undefined,
                animationDelay: `${i * 60}ms`,
              }}
              onClick={() => onSelectCourse(course)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectCourse(course) } }}
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
                <span className="admin-curso-card-date">
                  {new Date(course.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                </span>
                <div className="admin-curso-card-actions" onClick={(e) => e.stopPropagation()}>
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
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}
