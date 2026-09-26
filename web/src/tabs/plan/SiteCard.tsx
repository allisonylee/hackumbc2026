// Site details + "Why here?" (§8.3), docked at the bottom center while a site is selected.
import { useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MessageCircleQuestion, X } from 'lucide-react'
import { useStore } from '@/store'
import { featureLabel, fmtF, fmtInt, fmtUsd } from '@/lib/format'
import { cn } from '@/lib/utils'

function ShapBars({ shap }: { shap: [string, number][] }) {
  const max = Math.max(1e-9, ...shap.map(([, v]) => Math.abs(v)))
  return (
    <div className="space-y-1">
      {shap.map(([f, v]) => (
        <div key={f} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 text-[11px]">
          <span className="truncate text-white/75">{featureLabel(f)}</span>
          <div className="relative h-2 rounded-full bg-white/5">
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
            <div
              className={cn('absolute inset-y-0 rounded-full', v >= 0 ? 'left-1/2 bg-heat' : 'right-1/2 bg-sky-400')}
              style={{ width: `${(Math.abs(v) / max) * 50}%` }}
            />
          </div>
          <span className="text-right tabular-nums text-white/60">{v >= 0 ? '+' : '−'}{Math.abs(v).toFixed(2)}°F</span>
        </div>
      ))}
    </div>
  )
}

export function SiteCard() {
  const id = useStore((s) => s.selectedSite)
  const data = useStore((s) => s.data)
  const result = useStore((s) => s.plan.result)
  const setSelectedSite = useStore((s) => s.setSelectedSite)
  const openChat = useStore((s) => s.openChat)

  const info = useMemo(() => {
    if (!id || !data) return null
    const site = data.siteById.get(id)
    if (!site) return null
    const hex = data.hexById.get(site.h3)
    const species = data.speciesByName.get(site.species)
    const rankIdx = result ? result.siteIds.indexOf(id) : -1
    const inHex = result?.perHex[site.h3] ?? 0
    // Which tree in its hex this is: its order among the plan's picks there, or the next tree if unplanned.
    let k = inHex
    if (result && rankIdx >= 0) {
      k = 0
      for (let i = 0; i < rankIdx; i++) if (data.siteById.get(result.siteIds[i])?.h3 === site.h3) k++
    }
    const gain = hex && k < hex.gains.length ? hex.gains[k] : undefined
    return { site, hex, species, rank: rankIdx >= 0 ? rankIdx + 1 : null, gain, inHex }
  }, [id, data, result])

  const ask = () => {
    if (!info) return
    const { site, hex, rank } = info
    const where = site.space ? `${site.space.toLowerCase()} in ${site.nb}` : `site in ${site.nb}`
    const q = rank
      ? `Why is the ${where} ranked #${rank} in my plan for planting a ${site.species}?`
      : `Would the ${where} be a good place to plant a ${site.species}?`
    openChat(q, {
      nb: site.nb,
      site: { id: site.id, nb: site.nb, species: site.species, cost: site.cost, space: site.space, rank: rank ?? undefined, shap: hex?.shap },
    })
  }

  return (
    <AnimatePresence>
      {info && (
        <motion.div
          key={info.site.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="glass pointer-events-auto w-[min(360px,calc(100vw-2rem))] p-3.5 text-sm text-white"
          role="dialog"
          aria-label="Planting site details"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] tracking-wider text-white/50 uppercase">
                {info.rank ? <>Pick <span className="text-canopy">#{fmtInt(info.rank)}</span> of {fmtInt(result!.siteIds.length)}</> : 'Not in this plan'}
              </div>
              <div className="font-display text-base font-semibold">{info.site.nb}</div>
              <div className="text-xs text-white/60">
                {info.site.space ?? (info.site.type === 'pit' ? 'Empty tree pit' : 'Potential site')}
                {info.site.width != null && ` · ${info.site.width} ft wide`}
                {info.site.util && ' · under power lines'}
              </div>
            </div>
            <button type="button" aria-label="Close" onClick={() => setSelectedSite(null)} className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white">
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-white/5 px-2 py-1.5">
              <div className="text-white/50">Suggested tree</div>
              <div className="font-medium">{info.site.species}</div>
              {info.species && (
                <div className="text-[11px] text-white/50">
                  <i>{info.species.latin}</i> · {info.species.size}{info.species.native ? ' · native' : ''}
                </div>
              )}
            </div>
            <div className="rounded-md bg-white/5 px-2 py-1.5">
              <div className="text-white/50">Cost</div>
              <div className="font-medium tabular-nums">{fmtUsd(info.site.cost, false)}</div>
              <div className="text-[11px] text-white/50">{info.site.type === 'pit' ? 'existing pit' : 'new cut'}</div>
            </div>
          </div>

          {info.hex && (
            <div className="mt-3 space-y-1.5">
              <div className="text-[11px] font-medium tracking-wider text-white/50 uppercase">Why here?</div>
              <p className="text-xs leading-snug text-white/75">
                This block is {fmtF(info.hex.heat ?? info.hex.heatPred)} on a summer afternoon
                {' '}({info.hex.heatAnom >= 0 ? '+' : '−'}{Math.abs(info.hex.heatAnom).toFixed(1)}°F vs. the city median), with {Math.round(info.hex.canopy * 100)}% tree cover
                and ~{fmtInt(info.hex.pop)} residents.
                {info.gain != null && <> The heat model predicts {info.rank ? 'this tree cools' : 'a tree here would cool'} the block by <b className="text-cool">{info.gain.toFixed(2)}°F</b>.</>}
                {info.inHex > 0 && <> The plan puts {info.inHex} tree{info.inHex === 1 ? '' : 's'} on this block.</>}
              </p>
              {info.hex.shap.length > 0 && (
                <>
                  <div className="text-[10px] text-white/40">What drives this block's heat (model explanation)</div>
                  <ShapBars shap={info.hex.shap} />
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={ask}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-canopy/15 px-3 py-2 text-xs font-medium text-canopy hover:bg-canopy/25"
          >
            <MessageCircleQuestion className="size-4" aria-hidden /> Ask the AI to explain
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
