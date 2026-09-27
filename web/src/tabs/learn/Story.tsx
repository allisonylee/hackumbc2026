// Scroll story (implementation_plan.md §9.1). Scrollama drives store.story.step; the camera, 3D buildings
// and the Learn map layers react to it. The How to help section is the final scroll step.
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import scrollama from 'scrollama'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowDown } from 'lucide-react'
import { DEFAULT_PARAMS, useStore } from '@/store'
import type { Params } from '@/lib/types'
import { cn } from '@/lib/utils'
import { avgSiteCost, optimizer } from '@/tabs/plan/optimizerClient'
import { hottestCoolest } from './helpers'
import { useLearn } from './learnStore'
import { HELP_ANCHOR_ID, STEP_ATTR, scrollToHelp, scrollToStep } from './nav'
import { BUILDING_STEPS, HELP_INDEX, STEPS, type StoryCtx } from './steps'
import TakeAction from './TakeAction'
import { resolveCamera, useViewport } from './viewport'

const TURN_TREES = 1000

/** Runs the optimizer for beat 7 once per data load. */
function useStoryRuns() {
  const data = useStore((s) => s.data)
  useEffect(() => {
    if (!data || useLearn.getState().turn) return
    let cancelled = false
    const set = useLearn.getState().set
    const avg = avgSiteCost()
    const turnParams: Params = { ...DEFAULT_PARAMS, budget: TURN_TREES * avg }
    ;(async () => {
      try {
        const b = await optimizer.baselines(turnParams)
        const random = b.result.random
        // The optimizer favors cheaper sites, so the same budget buys it more trees. For a like-for-like
        // "same trees, different places" comparison, shrink its budget until it plants no more than random.
        let best = await optimizer.allocate(turnParams)
        let bestParams = turnParams
        if (best.result.impact.trees > random.impact.trees) {
          let lo = turnParams.budget * 0.4, hi = turnParams.budget
          for (let i = 0; i < 12 && !cancelled; i++) {
            const mid = (lo + hi) / 2
            const p = { ...turnParams, budget: mid }
            const r = await optimizer.allocate(p)
            if (r.result.impact.trees <= random.impact.trees) {
              lo = mid
              if (best.result.impact.trees > random.impact.trees || r.result.impact.trees >= best.result.impact.trees) {
                best = r
                bestParams = p
              }
            } else hi = mid
          }
        }
        if (cancelled) return
        set({ turn: { params: bestParams, random, optimized: best.result, ms: best.ms } })
      } catch (e) {
        if (!cancelled) set({ error: (e as Error).message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [data])
}

function StepCard({ active, children, className }: { active: boolean; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.article
      className={cn('glass pointer-events-auto w-full p-5 text-white', className)}
      initial={false}
      animate={{ opacity: active ? 1 : 0.35, y: active || reduce ? 0 : 12 }}
      transition={{ duration: reduce ? 0 : 0.45, ease: 'easeOut' }}
    >
      {children}
    </motion.article>
  )
}

export default function Story() {
  const data = useStore((s) => s.data)
  const step = useStore((s) => s.story.step)
  const setStory = useStore((s) => s.setStory)
  const mapReady = useStore((s) => !!s.map.labelLayerId)
  const turn = useLearn((s) => s.turn)
  const reduce = useReducedMotion()
  const vp = useViewport()
  const scrollRef = useRef<HTMLDivElement>(null)

  useStoryRuns()

  const hc = useMemo(() => (data ? hottestCoolest(data.nbs.features.map((f) => f.properties)) : null), [data])
  const ctx: StoryCtx | null = data ? { data, hc, turn } : null

  // Scrollama: one step per beat, plus the How to help section.
  useEffect(() => {
    setStory({ step: 0, progress: 0 })
    const root = scrollRef.current
    if (!root) return
    const scroller = scrollama()
    scroller
      .setup({ step: Array.from(root.querySelectorAll<HTMLElement>(`[${STEP_ATTR}]`)), offset: 0.6 })
      .onStepEnter(({ index }) => setStory({ step: index }))
    const onResize = () => scroller.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      scroller.destroy()
    }
  }, [setStory])

  // Camera per beat. The help section moves the camera itself once a spot is chosen.
  const { w, h, desktop, column } = vp
  useEffect(() => {
    if (!data || !mapReady || step >= HELP_INDEX) return
    // Camera specs read only data and hc; optimizer results must not re-trigger a flight mid-beat.
    const spec = STEPS[step].camera({ data, hc, turn: null })
    if (!spec) return
    const view = resolveCamera(spec, { w, h, desktop, column })
    useStore.getState().flyTo({ ...view, duration: reduce ? 0 : 2200 })
  }, [step, mapReady, data, hc, w, h, desktop, column, reduce])

  // 3D buildings for the street-level beat; restore the user's setting afterwards.
  const buildingsBefore = useRef<boolean | null>(null)
  useEffect(() => {
    const want = step < HELP_INDEX && BUILDING_STEPS.has(STEPS[step].id)
    const { map, setMap } = useStore.getState()
    if (want && buildingsBefore.current === null) {
      buildingsBefore.current = map.buildings
      setMap({ buildings: true })
    } else if (!want && buildingsBefore.current !== null) {
      setMap({ buildings: buildingsBefore.current })
      buildingsBefore.current = null
    }
  }, [step])
  useEffect(
    () => () => {
      if (buildingsBefore.current !== null) useStore.getState().setMap({ buildings: buildingsBefore.current })
    },
    [],
  )

  if (!ctx) return null
  const onLast = step >= STEPS.length - 1

  return (
    <div ref={scrollRef} className="pointer-events-auto absolute inset-0 overflow-y-auto overscroll-contain scroll-smooth motion-reduce:scroll-auto">
      {/* Skip link */}
      <div className="pointer-events-none sticky top-0 z-20 h-0">
        <div className="flex px-4 pt-[4.25rem] md:px-8">
          <button
            type="button"
            onClick={() => scrollToHelp(reduce)}
            className={cn(
              'glass pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/75 transition-opacity hover:text-white',
              onLast && 'pointer-events-none opacity-0',
            )}
            tabIndex={onLast ? -1 : 0}
          >
            Skip to how to help <ArrowDown className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8" style={desktop ? { width: column } : undefined}>
        {STEPS.map((s, i) => {
          const active = step === i
          const Overlay = s.Overlay
          return (
            <section
              key={s.id}
              {...{ [STEP_ATTR]: i }}
              className={cn('flex min-h-[100svh] py-24', desktop ? 'items-center' : 'items-end pb-10')}
              aria-label={s.title(ctx)}
            >
              <StepCard active={active}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/90">{s.kicker(ctx)}</div>
                <h2 className="mt-1 font-display text-2xl font-semibold leading-tight tracking-tight md:text-[1.7rem]">{s.title(ctx)}</h2>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-white/80">{s.body(ctx)}</p>
                {Overlay && (
                  <div className="mt-4">
                    <Overlay active={active} />
                  </div>
                )}
                <p className="mt-4 border-t border-white/10 pt-2 text-[11px] leading-snug text-white/45">Source: {s.source}</p>
              </StepCard>
            </section>
          )
        })}

        <section
          id={HELP_ANCHOR_ID}
          {...{ [STEP_ATTR]: HELP_INDEX }}
          className="min-h-[100svh] scroll-mt-16 pt-20 pb-16"
          aria-label="How to help"
        >
          <TakeAction active={step === HELP_INDEX} vp={vp} />
        </section>
      </div>

      {/* Progress dots */}
      <nav
        aria-label="Story progress"
        className="pointer-events-auto fixed top-1/2 right-3 z-20 flex -translate-y-1/2 flex-col gap-2.5 md:right-5"
      >
        {[...STEPS.map((s) => s.title(ctx)), 'How to help'].map((title, i) => (
          <button
            key={title}
            type="button"
            onClick={() => scrollToStep(i, reduce)}
            aria-label={title}
            aria-current={step === i ? 'step' : undefined}
            title={title}
            className="group flex size-4 items-center justify-center"
          >
            <span
              className={cn(
                'block rounded-full transition-all duration-300',
                step === i ? 'size-2.5 bg-emerald-400' : 'size-1.5 bg-white/40 group-hover:bg-white/80',
                i === HELP_INDEX && step !== i && 'bg-violet-300/60',
              )}
            />
          </button>
        ))}
      </nav>
    </div>
  )
}
