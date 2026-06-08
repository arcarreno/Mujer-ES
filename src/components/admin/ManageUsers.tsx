import { useState, useEffect } from 'react'
import { AnimatePresence } from 'motion/react'
import { sileo } from 'sileo'
import { listUsers, type UserRow } from '../../lib/admin'
import UserDetailModal from './UserDetailModal'
import { supabase } from '../../lib/supabase'
import { getErrorMessage } from '../../lib/queries'

interface ManageUsersProps {
  onCountsChange?: (total: number, blocked: number) => void
  onCreateUser?: () => void
}

export default function ManageUsers({ onCountsChange, onCreateUser }: ManageUsersProps) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<UserRow | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string>('')

  const loadUsers = async () => {
    setLoading(true)
    try {
      const list = await listUsers()
      setUsers(list)
      const blocked = list.filter((u) => u.blocked).length
      onCountsChange?.(list.length, blocked)
    } catch (e) {
      sileo.error({
        title: 'No pudimos cargar los usuarios',
        description: getErrorMessage(e, 'Revisá tu conexión e intentá de nuevo'),
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id)
    })
    loadUsers()
  }, [])

  return (
    <div className="manage-users">
      <div className="manage-users-header">
        <div>
          <h2 className="cursos-title">Usuarios</h2>
          <p className="cursos-subtitle">{users.length} registrado{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onCreateUser} className="manage-add-btn" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" x2="12" y1="5" y2="19" />
            <line x1="5" x2="19" y1="12" y2="12" />
          </svg>
          Nuevo
        </button>
      </div>

      {loading ? (
        <p className="manage-loading">Cargando...</p>
      ) : users.length === 0 ? (
        <p className="manage-empty">No hay usuarios registrados todavía</p>
      ) : (
        <div className="manage-users-list">
          {users.map((u, i) => (
            <button
              key={u.id}
              onClick={() => setSelected(u)}
              className="manage-user-row"
              type="button"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="manage-user-avatar">
                {u.username.charAt(0).toUpperCase()}
                {u.blocked && <span className="manage-user-blocked-dot" />}
              </div>
              <div className="manage-user-info">
                <div className="manage-user-line">
                  <h3 className="manage-user-name">{u.full_name}</h3>
                  {u.type === 'admin' && <span className="manage-user-admin">admin</span>}
                </div>
                <p className="manage-user-meta">@{u.username}</p>
              </div>
              <div className="manage-user-right">
                {u.type === 'admin' ? (
                  <span className="manage-user-status pending">Admin</span>
                ) : u.form_completed ? (
                  <span className="manage-user-status ok">Activo</span>
                ) : (
                  <span className="manage-user-status pending">Sin form</span>
                )}
                {u.blocked && <span className="manage-user-status blocked">Bloqueado</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <UserDetailModal
            user={selected}
            currentUserId={currentUserId}
            onClose={() => setSelected(null)}
            onUpdate={loadUsers}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
