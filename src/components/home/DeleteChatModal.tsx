import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import lottie, { type AnimationItem } from 'lottie-web'
import trashAnimation from '../../assets/lottie/trash.json'
import { hideConversation } from '../../lib/queries'
import { sileo } from 'sileo'

interface DeleteChatModalProps {
  conversationId: string
  conversationName: string
  onClose: () => void
  onDeleted: () => void
}

export default function DeleteChatModal({
  conversationId,
  conversationName,
  onClose,
  onDeleted,
}: DeleteChatModalProps) {
  const lottieRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<AnimationItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const el = lottieRef.current
    if (!el) return
    const anim = lottie.loadAnimation({
      container: el,
      animationData: trashAnimation,
      loop: false,
      autoplay: false,
    })
    anim.goToAndStop(0, true)
    animRef.current = anim
    return () => anim.destroy()
  }, [])

  async function handleConfirm() {
    if (deleting) return
    setDeleting(true)

    const anim = animRef.current

    const animationDone = new Promise<void>((resolve) => {
      if (!anim) return resolve()
      anim.addEventListener('complete', () => resolve())
      anim.play()
    })

    const deletionDone = hideConversation(conversationId)

    try {
      await Promise.all([animationDone, deletionDone])
      sileo.success({ title: 'Chat eliminado', description: `"${conversationName}" se ocultó de tus chats` })
      onDeleted()
    } catch (e) {
      anim?.goToAndStop(0, true)
      setDeleting(false)
      sileo.error({ title: 'Error', description: e instanceof Error ? e.message : 'No se pudo eliminar el chat' })
    }
  }

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={deleting ? undefined : onClose}
    >
      <motion.div
        className="delete-chat-modal"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={lottieRef} className="delete-chat-lottie" />

        <h3 className="delete-chat-modal-title">¿Eliminar chat?</h3>
        <p className="delete-chat-modal-desc">
          El chat con <strong>{conversationName}</strong> se ocultará de tu lista. No se borra para la otra
          persona.
        </p>

        <div className="delete-chat-modal-actions">
          <button className="report-modal-btn cancel" onClick={onClose} disabled={deleting} type="button">
            Cancelar
          </button>
          <button
            className="report-modal-btn submit"
            onClick={handleConfirm}
            disabled={deleting}
            type="button"
          >
            {deleting ? 'Eliminando...' : 'Eliminar chat'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}