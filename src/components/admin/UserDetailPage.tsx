import { motion } from 'motion/react'
import { sileo } from 'sileo'
import { useState, useEffect } from 'react'
import type { UserRow } from '../../lib/admin'
import { blockUser, unblockUser, adminDeleteUser } from '../../lib/admin'
import { getErrorMessage, getUserEnrollments, generateQrDataUrlFromPayload, type Enrollment } from '../../lib/queries'

interface UserDetailPageProps {
  user: UserRow
  currentUserId: string
  onBack: () => void
  onUpdate: () => void
}

const BLOCK_OPTIONS: { label: string; hours: number | null }[] = [
  { label: '24 horas', hours: 24 },
  { label: '7 días', hours: 24 * 7 },
  { label: '30 días', hours: 24 * 30 },
]

const EDUCATION_LABELS: Record<string, string> = {
  sin_estudios: 'Sin estudios',
  primaria: 'Primaria',
  secundaria: 'Secundaria',
  preparatoria: 'Preparatoria',
  universidad: 'Universidad',
  posgrado: 'Posgrado',
}

export default function UserDetailPage({ user, currentUserId, onBack, onUpdate }: UserDetailPageProps) {
  const [loading, setLoading] = useState(false)
  const [userEnrollments, setUserEnrollments] = useState<(Enrollment & { course_title: string; course_modality: string })[]>([])
  const [qrModalData, setQrModalData] = useState<{ dataUrl: string; courseName: string } | null>(null)
  const isSelf = user.id === currentUserId
  const isAdmin = user.type === 'admin'

  useEffect(() => {
    if (!isAdmin) {
      getUserEnrollments(user.id).then(setUserEnrollments).catch(() => {})
    }
  }, [user.id, isAdmin])

  const handleBlock = async (hours: number | null) => {
    setLoading(true)
    try {
      if (hours === null) {
        await unblockUser(user.id)
        sileo.success({
          title: 'Usuario desbloqueado',
          description: `${user.username} ya puede volver a iniciar sesión`,
        })
      } else {
        const until = new Date(Date.now() + hours * 60 * 60 * 1000)
        await blockUser(user.id, until)
        sileo.success({
          title: 'Usuario bloqueado',
          description: `${user.username} no podrá iniciar sesión por ${BLOCK_OPTIONS.find((b) => b.hours === hours)?.label}`,
        })
      }
      onUpdate()
      onBack()
    } catch (e) {
      sileo.error({
        title: 'No pudimos cambiar el estado',
        description: getErrorMessage(e, 'Revisá tu conexión e intentá de nuevo'),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar a ${user.username}? Esta acción no se puede deshacer.`)) return
    setLoading(true)
    try {
      await adminDeleteUser(user.id)
      sileo.success({
        title: 'Usuario eliminado',
        description: `${user.username} ya no tiene acceso a la plataforma`,
      })
      onUpdate()
      onBack()
    } catch (e) {
      sileo.error({
        title: 'No pudimos eliminar al usuario',
        description: getErrorMessage(e, 'Revisá tu conexión e intentá de nuevo'),
      })
    } finally {
      setLoading(false)
    }
  }

  function getInitials(name: string) {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <motion.div
      className="user-detail-page"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.25 }}
    >
      {/* Header with back button */}
      <div className="user-detail-page-header">
        <button className="volver-btn-sm" onClick={onBack} aria-label="Volver">
          <div className="volver-btn-sm-bg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" height="16px" width="16px">
              <path d="M224 480h640a32 32 0 1 1 0 64H224a32 32 0 0 1 0-64z" fill="#000000" />
              <path d="m237.248 512 265.408 265.344a32 32 0 0 1-45.312 45.312l-288-288a32 32 0 0 1 0-45.312l288-288a32 32 0 1 1 45.312 45.312L237.248 512z" fill="#000000" />
            </svg>
          </div>
          <p className="volver-btn-sm-text">Volver</p>
        </button>
        <h2 className="user-detail-page-title">Perfil de usuario</h2>
      </div>

      {/* Content */}
      <div className="user-detail-page-content">
        {/* Avatar */}
        <div className="user-detail-avatar-lg">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="user-detail-avatar-img" />
          ) : (
            getInitials(user.full_name)
          )}
        </div>

        <h2 className="user-detail-name">{user.full_name}</h2>
        <p className="user-detail-username">@{user.username}</p>

        <div className="user-detail-tags">
          <span className={`user-tag role-${user.type}`}>
            {isAdmin ? 'admin' : 'usuario'}
          </span>
          {!isAdmin && user.blocked && <span className="user-tag blocked">Bloqueado</span>}
          {user.form_completed && <span className="user-tag completed">Form completo</span>}
          {!user.form_completed && <span className="user-tag pending">Sin form</span>}
        </div>

        <div className="user-detail-section">
          <h3 className="user-detail-section-title">Información de cuenta</h3>
          <div className="user-detail-row">
            <span>Registrado</span>
            <strong>{new Date(user.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
          </div>
          {isAdmin && user.phone && (
            <div className="user-detail-row">
              <span>Teléfono</span>
              <strong>{user.phone}</strong>
            </div>
          )}
          {isAdmin && user.password && (
            <div className="user-detail-row">
              <span>Contraseña inicial</span>
              <strong style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{user.password}</strong>
            </div>
          )}
          {!isAdmin && user.blocked_until && new Date(user.blocked_until) > new Date() && (
            <div className="user-detail-row">
              <span>Bloqueado hasta</span>
              <strong>{new Date(user.blocked_until).toLocaleString('es-MX')}</strong>
            </div>
          )}
        </div>

        {!isAdmin && user.form_responses && (
          <div className="user-detail-section">
            <h3 className="user-detail-section-title">Cuestionario inicial</h3>
            <div className="user-detail-row">
              <span>Fecha de nacimiento</span>
              <strong>{user.form_responses.birthdate as string}</strong>
            </div>
            <div className="user-detail-row">
              <span>Ocupación</span>
              <strong>{user.form_responses.occupation as string}</strong>
            </div>
            <div className="user-detail-row">
              <span>Ubicación</span>
              <strong>{user.form_responses.location as string}</strong>
            </div>
            <div className="user-detail-row">
              <span>Estudios</span>
              <strong>{EDUCATION_LABELS[user.form_responses.education as string] ?? (user.form_responses.education as string)}</strong>
            </div>
            {Boolean(user.form_responses.phone) && (
              <div className="user-detail-row">
                <span>Teléfono</span>
                <strong>{user.form_responses.phone as string}</strong>
              </div>
            )}
          </div>
        )}

        {!isAdmin && userEnrollments.length > 0 && (
          <div className="user-detail-section">
            <h3 className="user-detail-section-title">Cursos inscripto ({userEnrollments.length})</h3>
            {userEnrollments.map((enr) => (
              <div key={enr.id} className="user-enrollment-row">
                <div className="user-enrollment-info">
                  <span className="user-enrollment-name">{enr.course_title}</span>
                  <span className="user-enrollment-meta">
                    {enr.course_modality === 'presencial' ? 'Presencial' : 'Virtual'}
                    {enr.attended && ' · Presente'}
                  </span>
                </div>
                {enr.course_modality === 'presencial' && enr.qr_code && (
                  <button
                    className="user-enrollment-qr-btn"
                    onClick={async () => {
                      try {
                        const dataUrl = await generateQrDataUrlFromPayload(enr.qr_code!)
                        setQrModalData({ dataUrl, courseName: enr.course_title })
                      } catch {
                        sileo.error({ title: 'Error', description: 'No se pudo generar el QR' })
                      }
                    }}
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
                {enr.course_modality === 'virtual' && enr.access_code && (
                  <span className="user-enrollment-code">{enr.access_code}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {!isSelf && !isAdmin && (
          <div className="user-detail-actions">
            {user.blocked ? (
              <button onClick={() => handleBlock(null)} disabled={loading} className="user-action-btn primary">
                Desbloquear
              </button>
            ) : (
              <>
                {BLOCK_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => handleBlock(opt.hours)}
                    disabled={loading}
                    className="user-action-btn"
                    type="button"
                  >
                    Bloquear {opt.label}
                  </button>
                ))}
              </>
            )}
            <button onClick={handleDelete} disabled={loading} className="user-action-btn danger">
              Eliminar usuario
            </button>
          </div>
        )}
        {!isSelf && isAdmin && (
          <div className="user-detail-actions">
            <button onClick={handleDelete} disabled={loading} className="user-action-btn danger">
              Eliminar administrador
            </button>
          </div>
        )}
        {isSelf && <p className="user-self-note">No puedes modificar tu propia cuenta desde aquí</p>}
      </div>

      {/* QR Modal overlay */}
      {qrModalData && (
        <div className="admin-qr-overlay" onClick={(e) => { if (e.target === e.currentTarget) setQrModalData(null) }} style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
          <div className="admin-qr-modal">
            <div className="admin-qr-header">
              <h3 className="admin-qr-title">QR — {user.username}</h3>
              <button className="admin-qr-close" onClick={() => setQrModalData(null)} type="button">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="admin-qr-body">
              <p className="admin-qr-course">{qrModalData.courseName}</p>
              <div className="admin-qr-img">
                <img src={qrModalData.dataUrl} alt={`QR de ${user.username}`} width="220" height="220" />
              </div>
              <p className="admin-qr-sub">Código QR personal e intransferible</p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
