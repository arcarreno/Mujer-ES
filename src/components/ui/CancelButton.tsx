import { motion } from 'motion/react'
import type { ReactNode } from 'react'

interface CancelButtonProps {
  onClick: () => void
  disabled?: boolean
  children?: ReactNode
}

export default function CancelButton({
  onClick,
  disabled,
  children = 'Atrás',
}: CancelButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      className="privacy-modal-cancel"
      type="button"
      disabled={disabled}
      initial={{ opacity: 0, scale: 0.3 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {children}
    </motion.button>
  )
}
