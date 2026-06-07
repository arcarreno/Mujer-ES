import { useState } from 'react'
import { motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { sileo } from 'sileo'
import { createCourse, type Course } from '../../lib/queries'
import SubmitButton from '../ui/SubmitButton'

interface CreateCourseModalProps {
  onClose: () => void
  onCreated: (course: Course) => void
}

export default function CreateCourseModal({ onClose, onCreated }: CreateCourseModalProps) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState('')
  const [modality, setModality] = useState<'virtual' | 'presencial'>('virtual')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      sileo.error({ title: 'Faltan datos', description: 'El título es obligatorio' })
      return
    }
    setLoading(true)
    try {
      const course = await createCourse({
        title: title.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        modality,
      })
      sileo.success({ title: 'Curso creado', description: `"${course.title}" fue creado exitosamente` })
      onCreated(course)
    } catch {
      sileo.error({ title: 'Error', description: 'No se pudo crear el curso' })
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-card create-course-modal"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Crear curso</h2>
        <p className="modal-subtitle">Completá los datos del nuevo curso</p>

        <form onSubmit={handleSubmit} className="create-course-form">
          <div className="login-field">
            <label htmlFor="course-title">Título *</label>
            <input
              id="course-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nombre del curso"
              maxLength={100}
            />
          </div>

          <div className="login-field">
            <label htmlFor="course-subtitle">Subtítulo</label>
            <input
              id="course-subtitle"
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Breve descripción del curso"
              maxLength={200}
            />
          </div>

          <div className="login-field">
            <label htmlFor="course-desc">Descripción</label>
            <textarea
              id="course-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles del curso, temario, requisitos..."
              rows={4}
              maxLength={2000}
            />
          </div>

          <div className="login-field">
            <label>Modalidad</label>
            <div className="create-course-modality">
              <button
                type="button"
                className={`create-course-modality-btn ${modality === 'virtual' ? 'active' : ''}`}
                onClick={() => setModality('virtual')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" x2="16" y1="21" y2="21" />
                  <line x1="12" x2="12" y1="17" y2="21" />
                </svg>
                Virtual
              </button>
              <button
                type="button"
                className={`create-course-modality-btn ${modality === 'presencial' ? 'active' : ''}`}
                onClick={() => setModality('presencial')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                Presencial
              </button>
            </div>
          </div>

          <div className="create-course-actions">
            <button
              type="button"
              className="login-link login-link-btn"
              onClick={onClose}
            >
              Cancelar
            </button>
            <SubmitButton loading={loading}>Crear curso</SubmitButton>
          </div>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  )
}
