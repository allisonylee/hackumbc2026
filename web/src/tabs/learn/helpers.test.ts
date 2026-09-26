import { describe, expect, it } from 'vitest'
import type { NbProps, Site } from '@/lib/types'
import {
  boundsOf, fitView, haversineM, hottestCoolest, nearestSites, offsetCamera, parseNbParam, quantile, shareUrl,
} from './helpers'

const site = (id: string, lng: number, lat: number, nb = 'A'): Site => ({
  id, lng, lat, nb, h3: 'x', type: 'pit', cost: 1000, util: false, width: null, space: null, species: 'Red maple',
})

const nb = (name: string, heat: number, pop: number, asthma: number, poverty = 0.1): NbProps => ({
  name, heat, pop, asthma, poverty, canopy: 0.3, income: 50000, sites: 0, rankHeat: 0, rankCanopy: 0,
  bivHeat: 0, bivIncome: 0, canopyGap: 0.1, labelLng: 0, labelLat: 0,
})

describe('haversineM', () => {
  it('is ~111 km per degree of latitude', () => {
    expect(haversineM([-76.6, 39], [-76.6, 40])).toBeGreaterThan(110_000)
    expect(haversineM([-76.6, 39], [-76.6, 40])).toBeLessThan(112_000)
    expect(haversineM([-76.6, 39.3], [-76.6, 39.3])).toBe(0)
  })
})

describe('nearestSites', () => {
  const sites = [
    site('far', -76.5, 39.3), site('near', -76.6001, 39.3), site('mid', -76.61, 39.3),
    site('b1', -76.6002, 39.3, 'B'), site('b2', -76.65, 39.3, 'B'),
  ]
  it('returns the k nearest, nearest first', () => {
    const r = nearestSites(sites, [-76.6, 39.3], 3)
    expect(r.map((x) => x.site.id)).toEqual(['near', 'b1', 'mid'])
    expect(r[0].distM).toBeLessThan(r[1].distM)
  })
  it('prefers the neighborhood when it has enough sites', () => {
    expect(nearestSites(sites, [-76.6, 39.3], 2, 'B').map((x) => x.site.id)).toEqual(['b1', 'b2'])
  })
  it('falls back to all sites when the neighborhood has too few', () => {
    expect(nearestSites(sites, [-76.6, 39.3], 3, 'B').map((x) => x.site.id)).toEqual(['near', 'b1', 'mid'])
  })
  it('handles fewer sites than k', () => {
    expect(nearestSites(sites.slice(0, 2), [-76.6, 39.3], 5)).toHaveLength(2)
  })
})

describe('hottestCoolest', () => {
  const nbs = [
    nb('h1', 99, 100, 12), nb('h2', 98, 300, 10), nb('m', 95, 100, 9), nb('c1', 90, 100, 7), nb('c2', 91, 100, 8),
    nb('park', 100, 0, 0),
  ]
  it('splits hottest and coolest, pop-weighted, skipping unpopulated', () => {
    const r = hottestCoolest(nbs, 2)!
    expect(r.hot.names).toEqual(['h1', 'h2'])
    expect(r.cool.names).toEqual(['c1', 'c2'])
    expect(r.hot.asthma).toBeCloseTo((12 * 100 + 10 * 300) / 400)
    expect(r.cool.asthma).toBeCloseTo(7.5)
    expect(r.hot.pop).toBe(400)
  })
  it('never overlaps the groups when there are few neighborhoods', () => {
    const r = hottestCoolest(nbs.slice(0, 3), 10)!
    expect(r.hot.names).toHaveLength(1)
    expect(r.cool.names).toHaveLength(1)
  })
  it('returns null without enough data', () => {
    expect(hottestCoolest([nb('x', 90, 10, 1)])).toBeNull()
  })
})

describe('boundsOf / quantile', () => {
  it('computes bounds', () => {
    expect(boundsOf([[1, 5], [3, 2], [2, 9]])).toEqual([[1, 2], [3, 9]])
    expect(boundsOf([])).toBeNull()
  })
  it('interpolates quantiles and ignores NaN', () => {
    expect(quantile([1, 2, 3, 4, NaN], 0.5)).toBe(2.5)
    expect(quantile([], 0.5)).toBe(0)
  })
})

describe('offsetCamera', () => {
  it('moves the center west for a north-up map', () => {
    const v = offsetCamera({ longitude: -76.6, latitude: 39.3, zoom: 12, bearing: 0 }, 200)
    expect(v.longitude).toBeLessThan(-76.6)
    expect(v.latitude).toBeCloseTo(39.3)
  })
  it('moves the center north when the target should sit lower on screen', () => {
    const v = offsetCamera({ longitude: -76.6, latitude: 39.3, zoom: 12, bearing: 0 }, 0, 100)
    expect(v.latitude).toBeGreaterThan(39.3)
    expect(v.longitude).toBeCloseTo(-76.6)
  })
  it('is a no-op for 0 px', () => {
    const v = { longitude: 1, latitude: 2, zoom: 3 }
    expect(offsetCamera(v, 0)).toBe(v)
  })
})

describe('fitView', () => {
  it('zooms in for smaller extents and centers on the box', () => {
    const big = fitView([[-76.72, 39.19], [-76.52, 39.38]], 800, 700)
    const small = fitView([[-76.62, 39.29], [-76.60, 39.31]], 800, 700)
    expect(small.zoom).toBeGreaterThan(big.zoom)
    expect(big.longitude).toBeCloseTo(-76.62)
    expect(big.latitude).toBeCloseTo(39.285)
    expect(fitView([[0, 0], [0, 0]], 800, 700, 15).zoom).toBe(15)
  })
})

describe('share links', () => {
  it('round-trips the neighborhood', () => {
    const url = shareUrl('https://example.org', '/', 'Sandtown-Winchester')
    expect(url).toBe('https://example.org/learn?nb=Sandtown-Winchester')
    expect(parseNbParam(new URL(url).search, ['Sandtown-Winchester'])).toBe('Sandtown-Winchester')
  })
  it('encodes spaces and matches case-insensitively', () => {
    const url = shareUrl('https://example.org', '/', 'Broadway East')
    expect(parseNbParam(new URL(url).search, ['Broadway East'])).toBe('Broadway East')
    expect(parseNbParam('?nb=broadway%20east', ['Broadway East'])).toBe('Broadway East')
    expect(parseNbParam('?nb=Nowhere', ['Broadway East'])).toBeNull()
    expect(shareUrl('https://example.org', '/', null)).toBe('https://example.org/learn')
  })
})
