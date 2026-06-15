import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function usePresence(currentUserId: string | null) {
  const [onlineUsers, setOnlineUsers] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!currentUserId) return

    const presenceChannel = supabase.channel('online-users', {
      config: {
        presence: { key: currentUserId },
      },
    })

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        const users = new Map<string, string>()
        for (const [, presences] of Object.entries(state)) {
          const presence = (presences as any[])[0]
          if (presence && presence.user_id) {
            users.set(presence.user_id, presence.last_seen)
          }
        }
        setOnlineUsers(users)
      })
      .on('presence', { event: 'join' }, ({ newPresences }: any) => {
        setOnlineUsers(prev => {
          const next = new Map(prev)
          const presence = newPresences[0]
          if (presence && presence.user_id) {
            next.set(presence.user_id, presence.last_seen)
          }
          return next
        })
      })
      .on('presence', { event: 'leave' }, () => {
        setOnlineUsers(prev => {
          const next = new Map(prev)
          // Remove users that are no longer in presence state
          const state = presenceChannel.presenceState()
          const activeUsers = new Set(Object.keys(state))
          for (const key of prev.keys()) {
            if (!activeUsers.has(key)) {
              next.delete(key)
            }
          }
          return next
        })
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: currentUserId,
            last_seen: new Date().toISOString(),
          })
        }
      })

    return () => {
      presenceChannel.untrack()
      supabase.removeChannel(presenceChannel)
    }
  }, [currentUserId])

  const isUserOnline = useCallback((userId: string): boolean => {
    return onlineUsers.has(userId)
  }, [onlineUsers])

  const getUserLastSeen = useCallback((userId: string): string | null => {
    return onlineUsers.get(userId) || null
  }, [onlineUsers])

  const getOnlineCount = useCallback((): number => {
    return onlineUsers.size
  }, [onlineUsers])

  return {
    onlineUsers,
    isUserOnline,
    getUserLastSeen,
    getOnlineCount,
  }
}
