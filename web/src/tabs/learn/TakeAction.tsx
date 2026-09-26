// How to help (implementation_plan.md §9.2): find empty tree sites near you, request a tree, get involved.
// Location is used only in this browser to measure distances; it is never sent anywhere.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useReducedMotion } from 'motion/react'
import {
  CalendarDays, Check, ChevronsUpDown, Copy, ExternalLink, HandHeart, LocateFixed, MapPin, MessageCircle, Shovel,
  Sprout, TreeDeciduous, Users,
} from 'lucide-react'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fmtF, fmtInt, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { boundsOf, fmtDist, haversineM, nearestSites, parseNbParam, shareUrl, type LngLat, type NearSite } from './helpers'
import { useLearn } from './learnStore'
import { scrollToHelp } from './nav'
import { resolveCamera, type Viewport } from './viewport'

// Verified 2026-09-26 (see the Learn lane report).
const LINKS = {
  streetTree: 'https://www.treebaltimore.org/street-tree-request-form',
  plantYourself: 'https://www.treebaltimore.org/tree-order',
  events: 'https://www.treebaltimore.org/treeevents',
  treeKeepers: 'https://www.treebaltimore.org/programs',
}
const VOLUNTEER = [
  { name: 'Baltimore Tree Trust', url: 'https://www.baltimoretreetrust.org/ways-to-take-action/volunteer/' },
  { name: 'Blue Water Baltimore', url: 'https://bluewaterbaltimore.org/volunteer-opportunities-baltimore/' },
  { name: 'Parks & People', url: 'https://www.parksandpeople.org/volunteer' },
]
const DONATE = [
  { name: 'TreeBaltimore', url: 'https://www.treebaltimore.org/donate' },
  { name: 'Baltimore Tree Trust', url: 'https://www.baltimoretreetrust.org/ways-to-take-action/donate/' },
  { name: 'Blue Water Baltimore', url: 'https://bluewaterbaltimore.org/donate/' },
  { name: 'Parks & People', url: 'https://www.parksandpeople.org/donate' },
]

const FAR_M = 15_000

function ExtLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1 text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline', className)}
    >
      {children}
      <ExternalLink className="size-3 opacity-70" aria-hidden />
    </a>
  )
}

function ActionCard({ icon: Icon, title, line, children }: {
  icon: typeof Sprout; title: string; line: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-emerald-300" aria-hidden /> {title}
      </div>
      <p className="mt-0.5 text-xs text-white/60">{line}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">{children}</div>
    </div>
  )
}

export default function TakeAction({ active, vp }: { active: boolean; vp: Viewport }) {
  const data = useStore((s) => s.data)
  const openChat = useStore((s) => s.openChat)
  const help = useLearn((s) => s.help)
  const setLearn = useLearn((s) => s.set)
  const reduce = useReducedMotion()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  // Derived from the Learn store so the list survives tab switches.
  const near = useMemo<NearSite[]>(() => {
    if (!data || !help.origin) return []
    const o = help.origin
    return help.siteIds
      .map((id) => data.siteById.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((site) => ({ site, distM: haversineM(o, [site.lng, site.lat]) }))
  }, [data, help.siteIds, help.origin])
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)

  const names = useMemo(
    () => (data ? data.nbs.features.map((f) => f.properties.name).sort((a, b) => a.localeCompare(b)) : []),
    [data],
  )

  const findNear = useCallback(
    (origin: LngLat, nb: string | null, fromLocation: boolean) => {
      if (!data) return
      const res = nearestSites(data.sites, origin, 5, nb)
      setLearn({ help: { siteIds: res.map((r) => r.site.id), origin, nb } })
      if (!res.length) setStatus('No empty sites found nearby.')
      else if (fromLocation && res[0].distM > FAR_M) setStatus('You seem to be outside Baltimore; these are the closest sites we know of.')
      else setStatus(null)
    },
    [data, setLearn],
  )

  const chooseNb = useCallback(
    (nb: string) => {
      const f = data?.nbByName.get(nb)
      if (!f) return
      findNear([f.properties.labelLng, f.properties.labelLat], nb, false)
      setParams((p) => {
        const q = new URLSearchParams(p)
        q.set('nb', nb)
        return q
      }, { replace: true })
    },
    [data, findNear, setParams],
  )

  // Preselect from ?nb= (shared links) and jump to this section.
  const preselected = useRef(false)
  useEffect(() => {
    if (preselected.current || !names.length) return
    preselected.current = true
    const nb = parseNbParam(`?${params.toString()}`, names)
    if (!nb) return
    // Not cleared on re-run: chooseNb rewrites the query, which re-runs this effect.
    window.setTimeout(() => {
      chooseNb(nb)
      scrollToHelp(reduce)
    }, 400)
  }, [names, params, chooseNb, reduce])

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setStatus('Location is not available in this browser.')
      return
    }
    setLocating(true)
    setStatus(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        setParams((p) => {
          const q = new URLSearchParams(p)
          q.delete('nb')
          return q
        }, { replace: true })
        findNear([pos.coords.longitude, pos.coords.latitude], null, true)
      },
      (err) => {
        setLocating(false)
        setStatus(err.code === err.PERMISSION_DENIED ? 'Location permission was denied. Pick a neighborhood instead.' : 'Could not get your location.')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  // Camera: frame the chosen sites (or the city) while this section is active.
  const { w, h, desktop, column } = vp
  useEffect(() => {
    if (!active || !data) return
    const pts: LngLat[] = near.map((r) => [r.site.lng, r.site.lat])
    if (help.origin && !help.nb) pts.push(help.origin)
    const cityPts: LngLat[] = []
    if (!pts.length) {
      for (const f of data.city.features) {
        const g = f.geometry
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
        for (const p of polys) for (const c of p[0]) cityPts.push([c[0], c[1]])
      }
    }
    const b = boundsOf(pts.length ? pts : cityPts)
    if (!b) return
    const view = resolveCamera(
      { kind: 'fit', bounds: b, pitch: pts.length ? 45 : 30, bearing: 0, maxZoom: 17.5 },
      { w, h, desktop, column },
    )
    useStore.getState().flyTo({ ...view, duration: reduce ? 0 : 1800 })
  }, [active, data, near, help.origin, help.nb, w, h, desktop, column, reduce])

  const flyToSite = (r: NearSite) => {
    const view = resolveCamera(
      { kind: 'point', center: [r.site.lng, r.site.lat], zoom: 18, pitch: 55, bearing: 0 },
      { w, h, desktop, column },
    )
    useStore.getState().flyTo({ ...view, duration: reduce ? 0 : 1400 })
  }

  const nbProps = help.nb ? data?.nbByName.get(help.nb)?.properties : undefined
  const share = async () => {
    if (!data) return
    const url = shareUrl(window.location.origin, import.meta.env.BASE_URL, help.nb)
    const c = data.stats.city
    const text = nbProps
      ? `${nbProps.name}: ${fmtPct(nbProps.canopy)} tree canopy (city goal ${fmtPct(c.canopyGoal)}), ${fmtF(nbProps.heat)} on the 2018 heat-watch afternoon, and ${fmtInt(nbProps.sites)} empty street-tree sites. See where new trees would cool Baltimore most:`
      : `Baltimore has ${fmtPct(c.canopy)} tree canopy against a ${fmtPct(c.canopyGoal)} goal, and ${fmtInt(c.emptySites)} empty street-tree sites. See where new trees would cool the city most:`
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
    window.setTimeout(() => setCopied(null), 2500)
  }

  if (!data) return null

  return (
    <div className="glass pointer-events-auto w-full space-y-5 p-5 text-white">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-300">How to help</div>
        <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">Find a spot near you</h2>
        <p className="mt-1 text-sm text-white/70">
          Pick your neighborhood or use your location to see the closest empty street-tree sites.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="min-w-0 flex-1 justify-between">
              <span className="truncate">{help.nb ?? 'Choose a neighborhood'}</span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search neighborhoods…" />
              <CommandList>
                <CommandEmpty>No neighborhood found.</CommandEmpty>
                <CommandGroup>
                  {names.map((n) => (
                    <CommandItem
                      key={n}
                      value={n}
                      data-checked={help.nb === n}
                      onSelect={() => {
                        chooseNb(n)
                        setOpen(false)
                      }}
                    >
                      {n}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button variant="secondary" onClick={locate} disabled={locating}>
          <LocateFixed /> {locating ? 'Locating…' : 'Use my location'}
        </Button>
      </div>
      <p className="-mt-3 text-[11px] text-white/45">Your location stays in this browser; it is never sent anywhere.</p>

      {status && <p className="text-xs text-amber-200" role="status">{status}</p>}

      {near.length > 0 && (
        <ol className="space-y-1.5" aria-label="Nearest empty tree sites">
          {near.map((r, i) => {
            const sp = data.speciesByName.get(r.site.species)
            return (
              <li key={r.site.id}>
                <button
                  type="button"
                  onClick={() => flyToSite(r)}
                  className="flex w-full items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-emerald-400/50 hover:bg-white/[0.06]"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-[11px] font-bold text-emerald-950">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {r.site.species}
                      {sp && <span className="ml-1.5 text-xs font-normal italic text-white/50">{sp.latin}</span>}
                    </span>
                    <span className="block text-xs text-white/55">
                      {[r.site.space ?? 'Street site', r.site.width ? `${r.site.width} ft wide` : null, r.site.util ? 'under wires' : null, r.site.nb]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {sp?.notes && <span className="block text-[11px] text-white/40">{sp.size} tree{sp.native ? ', native' : ''} · {sp.notes}</span>}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-white/60">{fmtDist(r.distM)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild size="lg">
          <a href={LINKS.streetTree} target="_blank" rel="noopener noreferrer">
            <TreeDeciduous /> Request a free street tree
          </a>
        </Button>
        <Button size="lg" variant="outline" onClick={share}>
          {copied === 'ok' ? <Check /> : <Copy />}
          {copied === 'ok' ? 'Link copied' : copied === 'fail' ? 'Copy failed' : help.nb ? `Share ${help.nb}` : 'Share'}
        </Button>
      </div>
      {nbProps && (
        <p className="-mt-2 text-xs text-white/55">
          <MapPin className="mr-1 inline size-3" aria-hidden />
          {nbProps.name}: {fmtPct(nbProps.canopy)} canopy · {fmtF(nbProps.heat)} afternoon · {fmtInt(nbProps.sites)} empty sites
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <ActionCard icon={Shovel} title="Plant a free tree" line="Plant it yourself on your block, with free trees from TreeBaltimore.">
          <ExtLink href={LINKS.plantYourself}>Tree planting request</ExtLink>
        </ActionCard>
        <ActionCard icon={Users} title="Volunteer" line="Join a planting, pruning or watering crew.">
          {VOLUNTEER.map((o) => <ExtLink key={o.name} href={o.url}>{o.name}</ExtLink>)}
        </ActionCard>
        <ActionCard icon={HandHeart} title="Donate" line="Fund trees and their first years of care.">
          {DONATE.map((o) => <ExtLink key={o.name} href={o.url}>{o.name}</ExtLink>)}
        </ActionCard>
        <ActionCard icon={CalendarDays} title="Events" line="Plantings, workshops and giveaways near you.">
          <ExtLink href={LINKS.events}>TreeBaltimore events</ExtLink>
        </ActionCard>
        <ActionCard icon={Sprout} title="Become a TreeKeeper" line="Free training to plant and prune the city’s street trees.">
          <ExtLink href={LINKS.treeKeepers}>TreeBaltimore programs</ExtLink>
        </ActionCard>
        <ActionCard icon={MessageCircle} title="Ask the guide" line="Questions about trees, heat or this map?">
          <button
            type="button"
            className="text-emerald-300 underline-offset-2 hover:underline"
            onClick={() => openChat(help.nb ? `How can I help plant trees in ${help.nb}?` : 'How can I help plant trees in my neighborhood?', help.nb ? { nb: help.nb } : undefined)}
          >
            Open the chat
          </button>
        </ActionCard>
      </div>
    </div>
  )
}
