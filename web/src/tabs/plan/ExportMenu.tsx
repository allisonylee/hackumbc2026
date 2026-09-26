import { Download } from 'lucide-react'
import { useStore } from '@/store'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Site } from '@/lib/types'
import { sitesToCsv, sitesToGeoJson } from './logic'

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function plannedSites(): Site[] {
  const { data, plan } = useStore.getState()
  if (!data || !plan.result) return []
  return plan.result.siteIds.map((id) => data.siteById.get(id)).filter((s): s is Site => !!s)
}

export function ExportMenu() {
  const trees = useStore((s) => s.plan.result?.impact.trees ?? 0)
  const stamp = () => new Date().toISOString().slice(0, 10)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={!trees}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <Download className="size-3.5" aria-hidden /> Export
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => download(`tree-plan-${stamp()}.csv`, 'text/csv;charset=utf-8', sitesToCsv(plannedSites()))}>
          Sites as CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => download(`tree-plan-${stamp()}.geojson`, 'application/geo+json', JSON.stringify(sitesToGeoJson(plannedSites())))}
        >
          Sites as GeoJSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
