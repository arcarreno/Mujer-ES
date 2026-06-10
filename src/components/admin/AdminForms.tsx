import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { sileo } from 'sileo'
import Skeleton from '../ui/Skeleton'

interface FormRow {
  id: string
  user_id: string
  username: string
  full_name: string
  avatar_url: string | null
  form_type: string
  responses: Record<string, unknown>
  submitted_at: string
}

const EDUCATION_LABELS: Record<string, string> = {
  sin_estudios: 'Sin estudios',
  primaria: 'Primaria',
  secundaria: 'Secundaria',
  preparatoria: 'Preparatoria',
  universidad: 'Universidad',
  posgrado: 'Posgrado',
}

export default function AdminForms() {
  const [forms, setForms] = useState<FormRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadForms()
  }, [])

  async function loadForms() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('form_responses')
        .select('*')
        .eq('form_type', 'initial_profile')
        .order('submitted_at', { ascending: false })

      if (error) throw error

      // Fetch profiles for all users
      const userIds = [...new Set((data || []).map((f) => f.user_id))]
      let profileMap: Record<string, { username: string; full_name: string; avatar_url: string | null }> = {}
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', userIds)
        if (profiles) {
          profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]))
        }
      }

      setForms((data || []).map((f) => ({
        ...f,
        username: profileMap[f.user_id]?.username || '.usuario',
        full_name: profileMap[f.user_id]?.full_name || 'Sin nombre',
        avatar_url: profileMap[f.user_id]?.avatar_url ?? null,
      })))
    } catch (e) {
      sileo.error({ title: 'Error al cargar formularios', description: 'Revisá tu conexión' })
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return forms
    const q = searchQuery.toLowerCase()
    return forms.filter(
      (f) =>
        f.username.toLowerCase().includes(q) ||
        f.full_name.toLowerCase().includes(q)
    )
  }, [forms, searchQuery])

  function getInitials(name: string) {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="admin-forms">
      <div className="admin-dashboard-header">
        <h2 className="cursos-title">Formularios</h2>
        <p className="cursos-subtitle">{forms.length} respuesta{forms.length !== 1 ? 's' : ''} recibida{forms.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Search */}
      <div className="manage-users-header">
        <div />
        <div className="manage-users-actions">
          <div className="manage-search-wrapper">
            <svg className="manage-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="manage-search-input"
              placeholder="Buscar por nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="manage-search-clear" onClick={() => setSearchQuery('')} aria-label="Limpiar">×</button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <Skeleton lines={4} />
      ) : filtered.length === 0 ? (
        <p className="manage-empty">{searchQuery ? 'No se encontraron resultados' : 'Aún no hay formularios respondidos'}</p>
      ) : (
        <div className="admin-forms-list">
          {filtered.map((f) => {
            const isExpanded = expandedId === f.id
            const r = f.responses
            return (
              <div key={f.id} className={`admin-form-card ${isExpanded ? 'expanded' : ''}`}>
                <button
                  className="admin-form-header"
                  onClick={() => setExpandedId(isExpanded ? null : f.id)}
                  type="button"
                >
                  <div className="admin-form-user">
                    <div className="manage-user-avatar">
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" className="manage-user-avatar-img" />
                      ) : (
                        getInitials(f.full_name)
                      )}
                    </div>
                    <div className="manage-user-info">
                      <div className="manage-user-line">
                        <h3 className="manage-user-name">{f.full_name}</h3>
                      </div>
                      <p className="manage-user-meta">@{f.username} · {formatDate(f.submitted_at)}</p>
                    </div>
                  </div>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round"
                    className={`admin-form-chevron ${isExpanded ? 'rotated' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="admin-form-body">
                    <div className="admin-form-field">
                      <span className="admin-form-label">Fecha de nacimiento</span>
                      <strong>{r.birthdate as string || '—'}</strong>
                    </div>
                    <div className="admin-form-field">
                      <span className="admin-form-label">Ocupación</span>
                      <strong>{r.occupation as string || '—'}</strong>
                    </div>
                    <div className="admin-form-field">
                      <span className="admin-form-label">Ubicación</span>
                      <strong>{r.location as string || '—'}</strong>
                    </div>
                    <div className="admin-form-field">
                      <span className="admin-form-label">Estudios</span>
                      <strong>{(EDUCATION_LABELS[r.education as string] ?? (r.education as string)) || '—'}</strong>
                    </div>
                    {Boolean(r.phone) && (
                      <div className="admin-form-field">
                        <span className="admin-form-label">Teléfono</span>
                        <strong>{r.phone as string}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
