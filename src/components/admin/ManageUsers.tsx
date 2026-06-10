import { useState, useEffect, useMemo } from 'react'
import { sileo } from 'sileo'
import { listUsers, type UserRow } from '../../lib/admin'
import { getErrorMessage } from '../../lib/queries'
import Skeleton from '../ui/Skeleton'

interface ManageUsersProps {
  onCountsChange?: (total: number, blocked: number) => void
  onCreateUser?: () => void
  onSelectUser?: (user: UserRow) => void
}

export default function ManageUsers({ onCountsChange, onCreateUser, onSelectUser }: ManageUsersProps) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const q = searchQuery.toLowerCase()
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q))
    )
  }, [users, searchQuery])

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
    loadUsers()
  }, [])

  function getInitials(name: string) {
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="manage-users">
      <div className="manage-users-header">
        <div>
          <h2 className="cursos-title">Usuarios</h2>
          <p className="cursos-subtitle">
            {searchQuery
              ? `${filteredUsers.length} resultado${filteredUsers.length !== 1 ? 's' : ''}`
              : `${users.length} registrado${users.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="manage-users-actions">
          <div className="manage-search-wrapper">
            <svg className="manage-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="manage-search-input"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="manage-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
              >
                ×
              </button>
            )}
          </div>
          <button onClick={onCreateUser} className="manage-add-btn" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" x2="12" y1="5" y2="19" />
              <line x1="5" x2="19" y1="12" y2="12" />
            </svg>
            Nuevo
          </button>
        </div>
      </div>

      {loading ? (
        <Skeleton lines={5} />
      ) : filteredUsers.length === 0 ? (
        <p className="manage-empty">
          {searchQuery ? 'No se encontraron usuarios' : 'No hay usuarios registrados todavía'}
        </p>
      ) : (
        <div className="manage-users-list">
          {filteredUsers.map((u, i) => (
            <button
              key={u.id}
              onClick={() => onSelectUser?.(u)}
              className="manage-user-row"
              type="button"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="manage-user-avatar">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="manage-user-avatar-img" />
                ) : (
                  getInitials(u.full_name)
                )}
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
    </div>
  )
}
