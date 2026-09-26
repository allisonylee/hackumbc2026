import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { useStore } from '@/store'
import { prefersReducedMotion } from './ui'

// Canopy layers in the data: `canopy13` (2013 land cover) and `canopy` (2021/22 land cover).
export const YEAR0 = 2013
export const YEAR1 = 2021
const STEP_MS = 650

/** Drives `current.timelapse.t` one year at a time and shows the big year ticker. */
export function Timelapse() {
  const timelapse = useStore((s) => s.current.timelapse)
  const setCurrent = useStore((s) => s.setCurrent)
  const playing = !!timelapse?.playing

  useEffect(() => {
    if (!playing) return
    const steps = YEAR1 - YEAR0
    const id = window.setInterval(() => {
      const tl = useStore.getState().current.timelapse
      if (!tl) return
      if (prefersReducedMotion()) {
        setCurrent({ timelapse: { playing: false, t: 1 } })
        return
      }
      const t = Math.min(1, Math.round(tl.t * steps + 1) / steps)
      setCurrent({ timelapse: { playing: t < 1, t } })
    }, STEP_MS)
    return () => window.clearInterval(id)
  }, [playing, setCurrent])

  const year = timelapse ? Math.round(YEAR0 + (YEAR1 - YEAR0) * timelapse.t) : null
  return (
    <AnimatePresence>
      {timelapse && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="glass pointer-events-auto absolute top-16 left-1/2 flex -translate-x-1/2 items-center gap-3 px-4 py-2"
        >
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-white/50">Tree canopy</div>
            <div className="font-display text-4xl font-semibold tabular-nums text-emerald-300" aria-live="polite">{year}</div>
          </div>
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-emerald-400 transition-[width] duration-500" style={{ width: `${timelapse.t * 100}%` }} />
          </div>
          <button
            type="button"
            aria-label="Close time-lapse"
            onClick={() => setCurrent({ timelapse: null })}
            className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
