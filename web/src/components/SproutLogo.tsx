import { motion } from 'motion/react'

/** The sprouting-tree mark (stem draws in, then two leaves pop). Used by the loading screen and the homepage. */
export function SproutLogo({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden>
      <motion.path
        d="M48 88 V46"
        stroke="#4ade80" strokeWidth="4" strokeLinecap="round" fill="none"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      <motion.path
        d="M48 58 C 30 58, 22 44, 24 30 C 38 30, 48 40, 48 58 Z"
        fill="#4ade80" style={{ originX: '48px', originY: '58px' }}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6, type: 'spring', stiffness: 120 }}
      />
      <motion.path
        d="M48 50 C 64 50, 74 38, 72 22 C 58 22, 48 32, 48 50 Z"
        fill="#22c55e" style={{ originX: '48px', originY: '50px' }}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.85, type: 'spring', stiffness: 120 }}
      />
    </svg>
  )
}
