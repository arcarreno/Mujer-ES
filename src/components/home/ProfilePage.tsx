import { useState, useEffect, useRef } from 'react'
import { sileo } from 'sileo'
import { supabase } from '../../lib/supabase'
import { getProfile, updateProfile, uploadAvatar, signOut, type Profile } from '../../lib/queries'
import AvatarCropModal from '../ui/AvatarCropModal'

const SUGGESTED_HOBBIES = [
  'Lectura', 'Yoga', 'Cocina', 'Arte', 'Música',
  'Senderismo', 'Fotografía', 'Baile', 'Jardinería', 'Meditación',
  'Voluntariado', 'Tejido', 'Cine', 'Viajes', 'Deportes',
]

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bio, setBio] = useState('')
  const [hobbies, setHobbies] = useState<string[]>([])
  const [hobbyInput, setHobbyInput] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string>('')
  const [pendingAvatar, setPendingAvatar] = useState<Blob | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const objectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    getProfileFromDB()
  }, [])

  async function getProfileFromDB() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      let p = await getProfile(user.id)
      // Admins live in `admins` (no profiles row) and getProfile fabricates a
      // pseudo-profile for them. Without a real row, updateProfile() updates 0
      // rows and pretends success. Make sure a real row exists so edits persist.
      if (!p || p.created_at === '') {
        const { data: admin } = await supabase
          .from('admins')
          .select('username, full_name, avatar_url')
          .eq('id', user.id)
          .maybeSingle()
        const metaUsername = user.user_metadata?.username as string | undefined
        const metaFullName = user.user_metadata?.full_name as string | undefined
        const fallbackName =
          user.email?.split('@')[0]?.replace(/[^a-z0-9_-]/gi, '') ||
          `user_${user.id.slice(0, 8)}`
        const seed = {
          id: user.id,
          username: admin?.username || metaUsername || fallbackName,
          full_name: admin?.full_name || metaFullName || metaUsername || fallbackName,
          avatar_url: admin?.avatar_url ?? null,
          // Reaching this screen implies the user is already past the first-login
          // gate (ProfilePage renders only from `home`), so keep first_login off.
          first_login: false,
        }
        const { error: insertErr } = await supabase.from('profiles').insert(seed)
        if (insertErr) console.error('Failed to create profile row:', insertErr)
        p = await getProfile(user.id)
      }
      if (p) {
        setProfile(p)
        setBio(p.bio || '')
        setHobbies(p.hobbies || [])
        if (p.avatar_url) setAvatarPreview(p.avatar_url)
      }
    } catch (e) {
      console.error('Failed to load profile:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      sileo.error({ title: 'Archivo inválido', description: 'Elegí una imagen' })
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      sileo.error({ title: 'Foto muy grande', description: 'Máximo 8MB antes de recortar' })
      return
    }
    // Mostrar el recorte: la foto NO se sube ni se guarda hasta "Guardar perfil"
    const url = URL.createObjectURL(file)
    objectUrlsRef.current.push(url)
    setCropSrc(url)
  }

  function handleCropCancel() {
    if (cropSrc) {
      setCropSrc(null)
    }
  }

  function handleCropConfirm(blob: Blob) {
    const url = URL.createObjectURL(blob)
    objectUrlsRef.current.push(url)
    setAvatarPreview(url)
    setPendingAvatar(blob)
    setCropSrc(null)
  }

  function addHobby(hobby: string) {
    const h = hobby.trim()
    if (h && !hobbies.includes(h) && hobbies.length < 10) {
      setHobbies([...hobbies, h])
    }
    setHobbyInput('')
  }

  function removeHobby(hobby: string) {
    setHobbies(hobbies.filter((h) => h !== hobby))
  }

  function handleHobbyKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addHobby(hobbyInput)
    }
  }

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    try {
      let avatarUrl: string | undefined
      if (pendingAvatar) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Sesión no disponible')
        const file = new File([pendingAvatar], 'avatar.webp', {
          type: pendingAvatar.type || 'image/webp',
        })
        avatarUrl = await uploadAvatar(user.id, file)
      }
      await updateProfile(profile.id, {
        bio: bio.trim() || undefined,
        hobbies: hobbies.length > 0 ? hobbies : undefined,
        avatar_url: avatarUrl || avatarPreview || undefined,
      })
      setPendingAvatar(null)
      sileo.success({ title: 'Perfil guardado', description: 'Tus datos se actualizaron' })
    } catch (e: any) {
      sileo.error({ title: 'Error', description: e.message || 'No se pudo guardar' })
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await signOut()
    sileo.info({ title: 'Sesión cerrada', description: 'Hasta pronto' })
    // This will trigger App to show landing
    window.location.reload()
  }

  function getInitials() {
    if (!profile) return '?'
    return profile.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) {
    return (
      <div className="profile-page">
        <div className="manage-loading">Cargando perfil...</div>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h2 className="profile-title">Mi perfil</h2>
        <p className="profile-subtitle">Editá tu información personal</p>
      </div>

      <div className="profile-content">
        {/* Avatar */}
        <div className="profile-avatar-section">
          <button
            className="profile-avatar-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            aria-label="Cambiar foto de perfil"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="Foto de perfil" className="profile-avatar-img" />
            ) : (
              <span className="profile-avatar-initials">{getInitials()}</span>
            )}
            <div className="profile-avatar-overlay">
              {saving ? (
                <div className="profile-avatar-spinner" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            style={{ display: 'none' }}
          />
          <p className="profile-avatar-hint">Tocá para cambiar tu foto</p>
        </div>

        {/* Username (read-only) */}
        <div className="profile-field">
          <label className="profile-label">Nombre de usuario</label>
          <input
            type="text"
            className="profile-input profile-input-readonly"
            value={profile?.username || ''}
            readOnly
          />
        </div>

        {/* Full name (read-only) */}
        <div className="profile-field">
          <label className="profile-label">Nombre completo</label>
          <input
            type="text"
            className="profile-input profile-input-readonly"
            value={profile?.full_name || ''}
            readOnly
          />
        </div>

        {/* Bio */}
        <div className="profile-field">
          <label className="profile-label">Sobre mí</label>
          <textarea
            className="profile-textarea"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Contanos un poco sobre vos..."
            maxLength={300}
            rows={3}
          />
          <span className="profile-char-count">{bio.length}/300</span>
        </div>

        {/* Hobbies */}
        <div className="profile-field">
          <label className="profile-label">Hobbies e intereses</label>
          <div className="profile-hobbies-input">
            <input
              type="text"
              className="profile-input"
              value={hobbyInput}
              onChange={(e) => setHobbyInput(e.target.value)}
              onKeyDown={handleHobbyKeyDown}
              placeholder="Escribí y presioná Enter"
              maxLength={30}
            />
            <button
              className="profile-hobby-add-btn"
              onClick={() => addHobby(hobbyInput)}
              disabled={!hobbyInput.trim() || hobbies.length >= 10}
            >
              +
            </button>
          </div>

          {/* Selected hobbies */}
          {hobbies.length > 0 && (
            <div className="profile-hobbies-list">
              {hobbies.map((h) => (
                <span key={h} className="profile-hobby-tag">
                  {h}
                  <button onClick={() => removeHobby(h)} aria-label={`Quitar ${h}`}>×</button>
                </span>
              ))}
            </div>
          )}

          {/* Suggested hobbies */}
          {hobbies.length < 10 && (
            <div className="profile-hobbies-suggested">
              {SUGGESTED_HOBBIES.filter((h) => !hobbies.includes(h)).slice(0, 6).map((h) => (
                <button
                  key={h}
                  className="profile-hobby-suggestion"
                  onClick={() => addHobby(h)}
                >
                  + {h}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Save */}
        <button
          className="profile-save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Guardando...' : 'Guardar perfil'}
        </button>

        {/* Logout */}
        <button className="profile-logout-btn" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>

      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  )
}
