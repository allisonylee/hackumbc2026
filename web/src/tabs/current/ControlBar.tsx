import { useEffect, useState } from 'react'
import { Box, Building2, Layers, Map as MapIcon, Satellite, Search, Square } from 'lucide-react'
import { useStore, type ColorBy } from '@/store'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fmtPct } from '@/lib/format'
import { useDerived } from './derived'
import { fuzzyScore } from './fuzzy'
import { focusNb, setMode3d } from './ui'
import { SITES_MIN_ZOOM, TREES_MIN_ZOOM } from './layers'

const COLOR_MODES: { id: ColorBy; label: string }[] = [
  { id: 'canopy', label: 'Canopy' },
  { id: 'heat', label: 'Heat' },
  { id: 'income', label: 'Income' },
  { id: 'asthma', label: 'Asthma' },
]

function NeighborhoodSearch() {
  const derived = useDerived()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.key === '/' && !(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!derived) return null
  const names = derived.nbList.map((p) => p).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 text-left text-sm text-white/55 hover:bg-white/10 hover:text-white/80"
          aria-label="Search neighborhoods"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Search {names.length} neighborhoods</span>
          <kbd className="ml-auto hidden rounded border border-white/15 px-1 text-[10px] text-white/40 sm:inline">/</kbd>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command filter={(value, search) => fuzzyScore(value, search)}>
          <CommandInput placeholder="Neighborhood name…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No neighborhood matches.</CommandEmpty>
            <CommandGroup>
              {names.map((p) => (
                <CommandItem
                  key={p.name}
                  value={p.name}
                  onSelect={() => {
                    setOpen(false)
                    focusNb(p.name)
                  }}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="ml-auto text-xs tabular-nums text-white/45">{fmtPct(p.canopy)} canopy</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function LayerRow({ label, hint, checked, onChange, icon }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-white/5">
      <span className="text-white/60">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-[11px] text-white/45">{hint}</span>}
      </span>
      <Switch size="sm" checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function LayersMenu() {
  const toggles = useStore((s) => s.current.layers)
  const setLayers = useStore((s) => s.setCurrentLayers)
  const { buildings, satellite } = useStore((s) => s.map)
  const setMap = useStore((s) => s.setMap)
  const dot = (c: string) => <span className="inline-block size-2.5 rounded-full" style={{ background: c }} />
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-white/80 hover:bg-white/10"
        >
          <Layers className="size-4" aria-hidden /> Layers
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-0.5 p-2">
        <div className="px-1.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-white/45">Overlays</div>
        <LayerRow label="Redlining (HOLC) map" hint="1930s grades A–D" icon={dot('#d9838d')} checked={toggles.holc} onChange={(v) => setLayers({ holc: v })} />
        <LayerRow label="Empty planting sites" hint={`Zoom in past ${SITES_MIN_ZOOM}`} icon={dot('#facc15')} checked={toggles.sites} onChange={(v) => setLayers({ sites: v })} />
        <LayerRow label="Street trees" hint={`Zoom in past ${TREES_MIN_ZOOM}`} icon={dot('#4ade80')} checked={toggles.trees} onChange={(v) => setLayers({ trees: v })} />
        <LayerRow label="Cooling centers" icon={dot('#2dd4bf')} checked={toggles.cooling} onChange={(v) => setLayers({ cooling: v })} />
        <div className="px-1.5 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-white/45">Basemap</div>
        <LayerRow label="3D buildings" hint="Zoom in past 14" icon={<Building2 className="size-4" />} checked={buildings} onChange={(v) => setMap({ buildings: v })} />
        <LayerRow label="Satellite imagery" hint="Esri World Imagery" icon={<Satellite className="size-4" />} checked={satellite} onChange={(v) => setMap({ satellite: v })} />
      </PopoverContent>
    </Popover>
  )
}

export function ControlBar() {
  const { colorBy, heightByHeat, bivariate } = useStore((s) => s.current)
  const setCurrent = useStore((s) => s.setCurrent)
  const mode3d = useStore((s) => s.map.mode3d)
  const segBtn = 'h-7 px-2 text-xs text-white/65 data-[state=on]:bg-white/15 data-[state=on]:text-white'

  return (
    <section className="glass pointer-events-auto w-full space-y-2 p-2.5 text-sm text-white" aria-label="Map controls">
      <div className="flex items-center gap-2">
        <NeighborhoodSearch />
        <LayersMenu />
      </div>

      <div className={cn('flex items-center gap-2', bivariate && 'opacity-50')}>
        <span className="w-14 shrink-0 text-[11px] font-medium uppercase tracking-wider text-white/45">Color</span>
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0}
          value={colorBy}
          onValueChange={(v) => v && setCurrent({ colorBy: v as ColorBy, bivariate: null })}
          className="flex-wrap rounded-lg bg-white/5 p-0.5"
          aria-label="Color hexes by"
        >
          {COLOR_MODES.map((m) => (
            <ToggleGroupItem key={m.id} value={m.id} className={segBtn}>{m.label}</ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ToggleGroup
          type="single" size="sm" spacing={0} value={mode3d ? '3d' : '2d'}
          onValueChange={(v) => v && setMode3d(v === '3d')}
          className="rounded-lg bg-white/5 p-0.5" aria-label="Map perspective"
        >
          <ToggleGroupItem value="2d" className={segBtn} aria-label="2D"><Square className="size-3.5" /> 2D</ToggleGroupItem>
          <ToggleGroupItem value="3d" className={segBtn} aria-label="3D"><Box className="size-3.5" /> 3D</ToggleGroupItem>
        </ToggleGroup>

        <label className={cn('flex items-center gap-1.5 text-xs text-white/75', (!mode3d || bivariate) && 'opacity-45')}>
          <Switch size="sm" checked={heightByHeat} onCheckedChange={(v) => setCurrent({ heightByHeat: v })} disabled={!mode3d || !!bivariate} />
          Height = heat
        </label>

        <Select
          value={bivariate ?? 'off'}
          onValueChange={(v) => setCurrent({ bivariate: v === 'off' ? null : (v as 'heat' | 'income') })}
        >
          <SelectTrigger size="sm" className="h-7 border-white/10 text-xs" aria-label="Bivariate map">
            <MapIcon className="size-3.5 text-white/55" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Bivariate: off</SelectItem>
            <SelectItem value="heat">Canopy × heat</SelectItem>
            <SelectItem value="income">Canopy × income</SelectItem>
          </SelectContent>
        </Select>

      </div>
    </section>
  )
}
