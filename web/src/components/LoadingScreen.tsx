import { motion } from 'motion/react'
import { SproutLogo } from './SproutLogo'

/** Animated sprouting logo shown while the JSON loads. */
export function LoadingScreen({ progress, error }: { progress: number; error?: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0f0e] text-white">
      <SproutLogo />
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
