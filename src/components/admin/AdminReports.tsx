import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { sileo } from 'sileo'
import Skeleton from '../ui/Skeleton'

interface ReportStats {
  totalUsers: number
  totalAdmins: number
  blockedUsers: number
  formCompleted: number
  totalEnrollments: number
  totalCourses: number
  totalMessages: number
  recentUsers: { date: string; count: number }[]
  educationBreakdown: { label: string; count: number }[]
  occupationTop: { label: string; count: number }[]
}

export default function AdminReports() {
  const [stats, setStats] = useState<ReportStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    setLoading(true)
    try {
      const [
        { count: totalUsers },
        { count: totalAdmins },
        { data: profiles },
        { count: totalEnrollments },
        { count: totalCourses },
        { count: totalMessages },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('admins').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('blocked_until'),
        supabase.from('course_enrollments').select('*', { count: 'exact', head: true }),
        supabase.from('courses').select('*', { count: 'exact', head: true }),
        supabase.from('messages').select('*', { count: 'exact', head: true }),
      ])

      // Blocked users
      const blockedUsers = (profiles || []).filter(
        (p) => p.blocked_until && new Date(p.blocked_until) > new Date()
      ).length

      // Form completion
      const { data: formResponses } = await supabase
        .from('form_responses')
        .select('user_id')
        .eq('form_type', 'initial_profile')
      const formUserIds = new Set((formResponses || []).map((f) => f.user_id))
      const formCompleted = formUserIds.size

      // Recent users (last 30 days) by day
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentProfiles } = await supabase
        .from('profiles')
        .select('created_at')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: true })

      const recentUsersMap: Record<string, number> = {}
      for (const p of recentProfiles || []) {
        const day = p.created_at.slice(0, 10)
        recentUsersMap[day] = (recentUsersMap[day] || 0) + 1
      }
      const recentUsers = Object.entries(recentUsersMap).map(([date, count]) => ({ date, count }))

      // Education breakdown from form_responses
      const { data: allForms } = await supabase
        .from('form_responses')
        .select('responses')
        .eq('form_type', 'initial_profile')

      const eduCount: Record<string, number> = {}
      const occCount: Record<string, number> = {}
      for (const f of allForms || []) {
        const r = f.responses as Record<string, unknown>
        const edu = (r.education as string) || 'No especificado'
        const occ = (r.occupation as string) || 'No especificado'
        eduCount[edu] = (eduCount[edu] || 0) + 1
        occCount[occ] = (occCount[occ] || 0) + 1
      }

      const EDUCATION_LABELS: Record<string, string> = {
        sin_estudios: 'Sin estudios',
        primaria: 'Primaria',
        secundaria: 'Secundaria',
        preparatoria: 'Preparatoria',
        universidad: 'Universidad',
        posgrado: 'Posgrado',
      }

      const educationBreakdown = Object.entries(eduCount)
        .map(([label, count]) => ({ label: EDUCATION_LABELS[label] || label, count }))
        .sort((a, b) => b.count - a.count)

      const occupationTop = Object.entries(occCount)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)

      setStats({
        totalUsers: totalUsers || 0,
        totalAdmins: totalAdmins || 0,
        blockedUsers,
        formCompleted,
        totalEnrollments: totalEnrollments || 0,
        totalCourses: totalCourses || 0,
        totalMessages: totalMessages || 0,
        recentUsers,
        educationBreakdown,
        occupationTop,
      })
    } catch (e) {
      console.error('Failed to load stats:', e)
      sileo.error({ title: 'Error al cargar reportes', description: 'Revisá tu conexión' })
    } finally {
      setLoading(false)
    }
  }

  function getBarWidth(count: number, max: number) {
    return max > 0 ? `${(count / max) * 100}%` : '0%'
  }

  if (loading) {
    return (
      <div className="admin-reports">
        <div className="admin-dashboard-header">
          <h2 className="cursos-title">Reportes</h2>
          <p className="cursos-subtitle">Estadísticas de la plataforma</p>
        </div>
        <Skeleton lines={6} />
      </div>
    )
  }

  if (!stats) return null

  const totalRegistered = stats.totalUsers + stats.totalAdmins
  const formRate = totalRegistered > 0 ? Math.round((stats.formCompleted / totalRegistered) * 100) : 0
  const maxRecentUsers = Math.max(...stats.recentUsers.map((r) => r.count), 1)
  const maxEdu = Math.max(...stats.educationBreakdown.map((e) => e.count), 1)
  const maxOcc = Math.max(...stats.occupationTop.map((o) => o.count), 1)

  return (
    <div className="admin-reports">
      <div className="admin-dashboard-header">
        <h2 className="cursos-title">Reportes</h2>
        <p className="cursos-subtitle">Estadísticas de la plataforma</p>
      </div>

      {/* KPI Cards */}
      <div className="reports-kpi-grid">
        <div className="reports-kpi">
          <span className="reports-kpi-value">{totalRegistered}</span>
          <span className="reports-kpi-label">Usuarios totales</span>
        </div>
        <div className="reports-kpi">
          <span className="reports-kpi-value">{stats.totalAdmins}</span>
          <span className="reports-kpi-label">Administradores</span>
        </div>
        <div className="reports-kpi">
          <span className="reports-kpi-value">{stats.blockedUsers}</span>
          <span className="reports-kpi-label">Bloqueados</span>
        </div>
        <div className="reports-kpi">
          <span className="reports-kpi-value">{formRate}%</span>
          <span className="reports-kpi-label">Form completado</span>
        </div>
        <div className="reports-kpi">
          <span className="reports-kpi-value">{stats.totalCourses}</span>
          <span className="reports-kpi-label">Cursos</span>
        </div>
        <div className="reports-kpi">
          <span className="reports-kpi-value">{stats.totalEnrollments}</span>
          <span className="reports-kpi-label">Inscripciones</span>
        </div>
        <div className="reports-kpi">
          <span className="reports-kpi-value">{stats.totalMessages}</span>
          <span className="reports-kpi-label">Mensajes</span>
        </div>
      </div>

      {/* Registrations chart */}
      {stats.recentUsers.length > 0 && (
        <div className="reports-section">
          <h3 className="reports-section-title">Registros últimos 30 días</h3>
          <div className="reports-bar-chart">
            {stats.recentUsers.map((r) => (
              <div key={r.date} className="reports-bar-col">
                <div className="reports-bar-wrapper">
                  <div
                    className="reports-bar"
                    style={{ height: getBarWidth(r.count, maxRecentUsers) }}
                  >
                    <span className="reports-bar-value">{r.count}</span>
                  </div>
                </div>
                <span className="reports-bar-label">{new Date(r.date).getDate()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education breakdown */}
      {stats.educationBreakdown.length > 0 && (
        <div className="reports-section">
          <h3 className="reports-section-title">Nivel de estudios</h3>
          <div className="reports-horizontal-bars">
            {stats.educationBreakdown.map((e) => (
              <div key={e.label} className="reports-hbar-row">
                <span className="reports-hbar-label">{e.label}</span>
                <div className="reports-hbar-track">
                  <div
                    className="reports-hbar-fill"
                    style={{ width: getBarWidth(e.count, maxEdu) }}
                  />
                </div>
                <span className="reports-hbar-count">{e.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top occupations */}
      {stats.occupationTop.length > 0 && (
        <div className="reports-section">
          <h3 className="reports-section-title">Ocupaciones principales</h3>
          <div className="reports-horizontal-bars">
            {stats.occupationTop.map((o) => (
              <div key={o.label} className="reports-hbar-row">
                <span className="reports-hbar-label">{o.label}</span>
                <div className="reports-hbar-track">
                  <div
                    className="reports-hbar-fill occupation"
                    style={{ width: getBarWidth(o.count, maxOcc) }}
                  />
                </div>
                <span className="reports-hbar-count">{o.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
