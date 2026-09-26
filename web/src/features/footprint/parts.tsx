import type { ReactNode } from 'react'
import { ExternalLink, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Shared layout pieces for the footprint and evaluation dialogs. */

export const DIALOG_CLASS =
  'glass flex max-h-[88vh] flex-col gap-0 overflow-hidden bg-[#0b0f0e]/92 p-0 text-white ring-white/10 sm:max-w-3xl'

export function Section({ title, icon, children, className }: { title: ReactNode; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2.5', className)}>
      <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight text-white">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

export function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  if (!/^https?:\/\//.test(href)) return <span className="text-white/50">{children}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-emerald-300/90 underline-offset-2 hover:text-emerald-200 hover:underline"
    >
      {children}
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  )
}

export function MockNote({ show, what = 'data' }: { show: boolean | undefined; what?: string }) {
  if (!show) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      Mock {what}: these numbers are placeholders until the real pipeline runs.
    </div>
  )
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 text-sm text-white/75">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-emerald-400/70" aria-hidden />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

export const TABLE_HEAD = 'h-8 text-[11px] font-medium uppercase tracking-wider text-white/45'
export const TABLE_CELL = 'py-2 align-top text-white/80 whitespace-normal'
