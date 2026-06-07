import { useState, useEffect } from 'react'
import { sileo } from 'sileo'
import { listCourses, deleteCourse, type Course } from '../../lib/queries'

interface AdminCursosProps {
  onCreateCourse: () => void
}

export default function AdminCursos({ onCreateCourse }: AdminCursosProps) {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const data = await listCourses()
      setCourses(data)
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
              <div className="admin-curso-card-footer">
                <span className="admin-curso-card-date">
                  {new Date(course.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                </span>
                <div className="admin-curso-card-actions">
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
    </div>
  )
}
