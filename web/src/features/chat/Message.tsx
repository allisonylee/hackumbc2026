import { Fragment, useMemo } from 'react'
import { ExternalLink, Leaf, RotateCcw, WifiOff, Zap } from 'lucide-react'
import type { ChatSource } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fmtWhShort } from '@/features/footprint/energy'
import { parseCitations } from './citations'

export type Energy = { wh: number; measured: boolean; cached: boolean; tokens: number }
export type UiMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
  energy?: Energy
  status?: 'streaming' | 'done' | 'stopped' | 'error'
  error?: string
}

/** Answer text with [n] rendered as superscript links to the matching source. */
export function CitedText({ text, sources, idPrefix }: { text: string; sources: ChatSource[]; idPrefix: string }) {
  const segs = useMemo(() => parseCitations(text), [text])
  const byN = useMemo(() => new Map(sources.map((s) => [s.n, s])), [sources])
  return (
    <>
      {segs.map((s, i) => {
        if (s.kind === 'text') return <Fragment key={i}>{s.text}</Fragment>
        const src = byN.get(s.n)
        if (!src) return <sup key={i} className="text-white/40">[{s.n}]</sup>
        return (
          <sup key={i} className="ml-px">
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              title={src.title}
              aria-describedby={`${idPrefix}-src-${s.n}`}
              className="rounded px-0.5 font-semibold text-emerald-300 hover:text-emerald-200 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              [{s.n}]
            </a>
          </sup>
        )
      })}
    </>
  )
}

function SourceCards({ sources, idPrefix }: { sources: ChatSource[]; idPrefix: string }) {
  if (!sources.length) return null
  return (
    <ol className="mt-2 grid gap-1.5" aria-label="Sources">
      {sources.map((s) => {
        let host = ''
        try { host = new URL(s.url).hostname.replace(/^www\./, '') } catch { /* not a URL */ }
        return (
          <li key={s.n} id={`${idPrefix}-src-${s.n}`}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/5"
            >
              <span className="mt-px font-display font-semibold text-emerald-300 tabular-nums">{s.n}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-white/85">{s.title || s.url}</span>
                {host && <span className="block truncate text-white/40">{host}</span>}
              </span>
              <ExternalLink className="mt-0.5 size-3 shrink-0 text-white/30 group-hover:text-emerald-300" aria-hidden />
            </a>
          </li>
        )
      })}
    </ol>
  )
}

export function EnergyBadge({ energy, mock }: { energy: Energy; mock?: boolean }) {
  const kind = energy.measured ? 'measured' : 'estimated'
  const title = energy.cached
    ? 'Served from a cache of pre-written answers: almost no extra energy beyond generating it once.'
    : energy.measured
      ? `Measured on the machine that generated this answer (${energy.tokens} tokens).`
      : `Estimated from the token count (${energy.tokens} tokens), not measured.${mock ? ' Mock answer: no model ran.' : ''}`
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]" title={title}>
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-emerald-200 tabular-nums">
        <Zap className="size-3" aria-hidden />≈{fmtWhShort(energy.wh)} · {kind}
      </span>
      {energy.cached && <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/60">cached</span>}
      {mock && <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-violet-200">mock</span>}
    </div>
  )
}

export function MessageView({ m, mock, onRetry }: { m: UiMessage; mock: boolean; onRetry: () => void }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-violet-500/20 px-3 py-2 whitespace-pre-wrap text-white ring-1 ring-violet-400/25">
          {m.content}
        </div>
      </div>
    )
  }
  const idPrefix = `m${m.id}`
  if (m.status === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2.5">
        <div className="flex items-center gap-2 font-medium text-rose-200">
          <WifiOff className="size-4" aria-hidden /> The guide is offline.
        </div>
        {m.error && <p className="mt-1 text-xs text-white/55">{m.error}</p>}
        <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
          <RotateCcw /> Retry
        </Button>
      </div>
    )
  }
  const streaming = m.status === 'streaming'
  return (
    <div className="flex gap-2">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 ring-1 ring-emerald-400/30">
        <Leaf className="size-3.5 text-emerald-300" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn('leading-relaxed whitespace-pre-wrap text-white/90')} aria-busy={streaming}>
          {m.content ? (
            <CitedText text={m.content} sources={m.sources ?? []} idPrefix={idPrefix} />
          ) : (
            <span className="inline-flex gap-1 py-1" aria-label="Thinking">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 rounded-full bg-emerald-300/70 motion-safe:animate-bounce"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </span>
          )}
          {streaming && m.content && (
            <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 bg-emerald-300/70 motion-safe:animate-pulse" aria-hidden />
          )}
        </div>
        {m.status === 'stopped' && <div className="mt-1 text-[11px] text-white/40">Stopped.</div>}
        <SourceCards sources={m.sources ?? []} idPrefix={idPrefix} />
        {m.energy && <EnergyBadge energy={m.energy} mock={mock} />}
      </div>
    </div>
  )
}
