import { useMemo, useState } from 'react'
import { ChevronsUpDown, X } from 'lucide-react'
import { useStore } from '@/store'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

/** Neighborhood multi-select combobox for `params.excludeNbs`. */
export function NbExclude() {
  const nbs = useStore((s) => s.data?.nbs)
  const excluded = useStore((s) => s.plan.params.excludeNbs)
  const setParams = useStore((s) => s.setParams)
  const [open, setOpen] = useState(false)
  const names = useMemo(() => (nbs ? nbs.features.map((f) => f.properties.name).sort((a, b) => a.localeCompare(b)) : []), [nbs])
  const set = useMemo(() => new Set(excluded), [excluded])

  const toggle = (name: string) =>
    setParams({ excludeNbs: set.has(name) ? excluded.filter((n) => n !== name) : [...excluded, name] })

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            className="flex h-8 w-full items-center justify-between rounded-md border border-white/10 bg-white/5 px-2.5 text-left text-xs text-white/80 hover:bg-white/10"
          >
            {excluded.length ? `${excluded.length} neighborhood${excluded.length === 1 ? '' : 's'} excluded` : 'Exclude neighborhoods…'}
            <ChevronsUpDown className="size-3.5 text-white/50" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search neighborhoods…" />
            <CommandList className="max-h-64">
              <CommandEmpty>No neighborhood found.</CommandEmpty>
              <CommandGroup>
                {names.map((n) => (
                  <CommandItem key={n} value={n} onSelect={() => toggle(n)} data-checked={set.has(n)}>
                    {n}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {excluded.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {excluded.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-400/10 py-0.5 pr-1 pl-2 text-[11px] text-rose-200">
              {n}
              <button type="button" aria-label={`Include ${n} again`} onClick={() => toggle(n)} className="rounded-full p-0.5 hover:bg-white/10">
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          <button type="button" onClick={() => setParams({ excludeNbs: [] })} className="text-[11px] text-white/50 underline-offset-2 hover:text-white hover:underline">
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
