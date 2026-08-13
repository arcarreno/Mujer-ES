import { motion } from 'motion/react'
import ConocenosPage from './ConocenosPage'

interface ConocenosExperienceProps {
  onClose: () => void
}

export default function ConocenosExperience({ onClose }: ConocenosExperienceProps) {
  return (
    <div className="conocenos-experience">
      <motion.div
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
        className="conocenos-page-wrap"
      >
        <ConocenosPage onBack={onClose} />
      </motion.div>
    </div>
  )
}