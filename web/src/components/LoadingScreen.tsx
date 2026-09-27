import { motion } from 'motion/react'

/** Animated sprouting logo shown while the JSON loads. */
export function LoadingScreen({ progress, error }: { progress: number; error?: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0f0e] text-white">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden>
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
      <div className="mt-4 font-display text-xl font-semibold tracking-tight">A Tree Grows in Baltimore</div>
      {error ? (
        <div className="mt-3 max-w-sm text-center text-sm text-rose-300">Couldn't load the map data: {error}</div>
      ) : (
        <div className="mt-4 h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <motion.div className="h-full bg-emerald-400" animate={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </div>
  )
}
