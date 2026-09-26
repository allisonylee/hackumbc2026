import { NavLink } from 'react-router-dom'
import { motion } from 'motion/react'
import { Sprout, TreeDeciduous } from 'lucide-react'
import { useStore, type Tab } from '@/store'
import { cn } from '@/lib/utils'

const TABS: { id: Tab; label: string }[] = [
  { id: 'current', label: 'Current State' },
  { id: 'plan', label: 'Plan' },
  { id: 'learn', label: 'Learn' },
]

export function NavBar() {
  const tab = useStore((s) => s.tab)
  const setDialog = useStore((s) => s.setDialog)
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-4 px-4 pt-3">
      <div className="glass pointer-events-auto flex items-center gap-1 px-2 py-1.5">
        <div className="flex items-center gap-2 px-2 pr-3">
          <TreeDeciduous className="size-5 text-emerald-400" aria-hidden />
          <span className="hidden font-display text-sm font-semibold tracking-tight sm:inline">Baltimore Tree Planner</span>
        </div>
        <nav className="flex items-center" aria-label="Tabs">
          {TABS.map((t) => (
            <NavLink
              key={t.id}
              to={`/${t.id}`}
              className={cn(
                'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.id ? 'text-white' : 'text-white/60 hover:text-white',
              )}
            >
              {t.label}
              {tab === t.id && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-emerald-400"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <button
        type="button"
        onClick={() => setDialog('footprint', true)}
        className="glass pointer-events-auto ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-300 hover:text-emerald-200"
      >
        <Sprout className="size-4" aria-hidden /> Footprint
      </button>
    </header>
  )
}
