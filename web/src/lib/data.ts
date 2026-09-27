import type { AppData, CorpusChunk, Tree } from './types'

const BASE = `${import.meta.env.BASE_URL}data/`

async function getJson<T>(name: string): Promise<T> {
  const r = await fetch(BASE + name)
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
  return r.json() as Promise<T>
}

/** Loads everything the first render needs, in parallel, then builds lookup indexes. */
export async function loadData(onProgress?: (done: number, total: number) => void): Promise<AppData> {
  const files = [
    'hexes.json', 'sites.json', 'neighborhoods.geojson', 'holc.geojson', 'city.geojson',
    'cooling_centers.geojson', 'stats.json', 'species.json', 'footprint.json',
  ] as const
  let done = 0
  const results = await Promise.all(
    files.map((f) => getJson<unknown>(f).then((x) => { onProgress?.(++done, files.length); return x })),
  )
  const [hexes, sites, nbs, holc, city, cooling, stats, species, footprint] = results as [
    AppData['hexes'], AppData['sites'], AppData['nbs'], AppData['holc'], AppData['city'],
    AppData['cooling'], AppData['stats'], AppData['species'], AppData['footprint'],
  ]

  const hexById = new Map(hexes.map((h) => [h.h3, h]))
  const sitesByHex = new Map<string, AppData['sites']>()
  for (const s of sites) {
    const list = sitesByHex.get(s.h3)
    if (list) list.push(s)
    else sitesByHex.set(s.h3, [s])
  }
  // Keep file order: the contract defines each hex's site order (crown × surv / cost, see CONTRACTS.md).

  return {
    hexes, sites, nbs, holc, city, cooling, stats, species, footprint,
    hexById,
    sitesByHex,
    siteById: new Map(sites.map((s) => [s.id, s])),
    nbByName: new Map(nbs.features.map((f) => [f.properties.name, f])),
    speciesByName: new Map(species.map((s) => [s.name, s])),
  }
}

let treesPromise: Promise<Tree[]> | null = null
/** Live trees (~110k) are fetched lazily, the first time the map zooms past 15. */
export function loadTrees(): Promise<Tree[]> {
  treesPromise ??= getJson<Tree[]>('trees.json').catch((e) => { treesPromise = null; throw e })
  return treesPromise
}

/** Optional files: resolve to null when missing (e.g. heat_model.json before the real pipeline). */
export async function loadOptional<T>(name: string): Promise<T | null> {
  try {
    return await getJson<T>(name)
  } catch {
    return null
  }
}

export const loadCorpusChunks = () => loadOptional<CorpusChunk[]>('corpus_chunks.json')

/** Model-card limitations shown in the UI (a few pipeline entries are left out on purpose). */
const HIDDEN_LIMITATIONS = ['Crown-size sensitivity']
export const shownLimitations = (limitations: string[]) =>
  limitations.filter((l) => !HIDDEN_LIMITATIONS.some((p) => l.startsWith(p)))
