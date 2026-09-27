import { motion, useReducedMotion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { SproutLogo } from './SproutLogo'

/** Landing page at `/`: the title and a way into the app. Deep links (/current, /plan, /learn) skip it. */
export function HomePage() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduce ? 0 : delay, duration: 0.9, ease: [0.22, 1, 0.36, 1] as const },
  })
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0b0f0e] px-4 text-center text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(74,222,128,0.12), transparent 60%)' }}
        aria-hidden
      />
      <SproutLogo size={112} />
      <motion.h1 {...rise(0.8)} className="mt-6 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
        A Tree Grows in Baltimore
      </motion.h1>
      <motion.div {...rise(1.05)}>
        <button
          type="button"
          onClick={() => navigate('/current')}
          className="mt-8 flex items-center gap-2 rounded-lg bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        >
          Continue to Website <ArrowRight className="size-4" />
        </button>
      </motion.div>
    </div>
  )
}
