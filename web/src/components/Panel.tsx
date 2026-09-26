import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  className?: string
  bodyClassName?: string
}

/** Glass card. Floating panels over the map are built from this. */
export function Panel({ title, actions, children, collapsible, defaultOpen = true, className, bodyClassName }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={cn('glass pointer-events-auto text-sm text-white', className)}>
      {title && (
        <header className="flex items-center gap-2 px-4 pt-3 pb-2">
          <h2 className="font-display text-sm font-semibold tracking-tight">{title}</h2>
          <div className="ml-auto flex items-center gap-1">
            {actions}
            {collapsible && (
              <button
                type="button"
                aria-label={open ? 'Collapse' : 'Expand'}
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <ChevronDown className={cn('size-4 transition-transform', !open && '-rotate-90')} />
              </button>
            )}
          </div>
        </header>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className={cn('px-4 pb-4', !title && 'pt-4', bodyClassName)}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
