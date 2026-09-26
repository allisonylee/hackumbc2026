import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import { ArrowUp, Info, Leaf, MapPin, Square, Trash2, X } from 'lucide-react'
import { useStore, type ChatContext } from '@/store'
import type { ChatMessage } from '@/lib/types'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { MAX_CHARS, MAX_MESSAGES, getProvider, streamChat } from './llm'
import { MessageView, type UiMessage } from './Message'

const SUGGESTED = [
  'Why do trees cool streets?',
  'Why is my neighborhood hotter?',
  'Which tree fits a narrow sidewalk?',
  'How can I help?',
]

const SEEN_KEY = 'canopyGuide.seen'
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false } }
const writeSeen = () => { try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ } }

let nextId = 1

function contextLabel(c: ChatContext): string {
  if (c.site) return `Site ${c.site.id}${c.site.nb ? ` in ${c.site.nb}` : ''}`
  return c.nb ?? 'Selection'
}

export default function ChatDrawer() {
  const chat = useStore((s) => s.chat)
  const tab = useStore((s) => s.tab)
  const openChat = useStore((s) => s.openChat)
  const closeChat = useStore((s) => s.closeChat)
  const setLastChatEnergy = useStore((s) => s.setLastChatEnergy)
  const setDialog = useStore((s) => s.setDialog)
  const provider = getProvider()
  const reduceMotion = useReducedMotion()

  const [msgs, setMsgs] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const [context, setContext] = useState<ChatContext | null>(null)
  const [busy, setBusy] = useState(false)
  const [seen, setSeen] = useState(readSeen)
  const [summonedOn, setSummonedOn] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [consumed, setConsumed] = useState<typeof chat | null>(null)

  // Pick up prefill/context from openChat(prefill, context), e.g. Plan's "Ask the AI".
  // (State adjusted during render: each openChat() call creates a new `chat` object.)
  if (chat.open && consumed !== chat) {
    setConsumed(chat)
    if (chat.prefill) setInput(chat.prefill.slice(0, MAX_CHARS))
    if (chat.context) setContext(chat.context)
    if (tab !== 'learn') setSummonedOn(tab)
    if (!seen) setSeen(true)
  }
  useEffect(() => {
    if (seen) writeSeen()
  }, [seen])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [msgs, reduceMotion])

  useEffect(() => () => abortRef.current?.abort(), [])

  const patch = (id: number, f: (m: UiMessage) => UiMessage) => setMsgs((ms) => ms.map((m) => (m.id === id ? f(m) : m)))

  const ask = useCallback(
    async (question: string, prior: UiMessage[]) => {
      const q = question.trim()
      if (!q || q.length > MAX_CHARS || abortRef.current) return
      const user: UiMessage = { id: nextId++, role: 'user', content: q }
      const bot: UiMessage = { id: nextId++, role: 'assistant', content: '', status: 'streaming' }
      setMsgs([...prior, user, bot])
      setInput('')
      setBusy(true)

      const history: ChatMessage[] = [...prior, user]
        .filter((m) => m.role === 'user' || (m.status !== 'error' && m.content))
        .map((m) => ({ role: m.role, content: m.content }))
      const ac = new AbortController()
      abortRef.current = ac
      try {
        for await (const ev of streamChat(history, context, ac.signal)) {
          if (ev.type === 'sources') patch(bot.id, (m) => ({ ...m, sources: ev.items }))
          else if (ev.type === 'token') patch(bot.id, (m) => ({ ...m, content: m.content + ev.text }))
          else if (ev.type === 'error') throw new Error(ev.message)
          else if (ev.type === 'done') {
            const energy = { wh: ev.energyWh, measured: ev.measured, cached: ev.cached, tokens: ev.tokens }
            patch(bot.id, (m) => ({ ...m, energy, status: 'done' }))
            setLastChatEnergy(energy)
          }
        }
        patch(bot.id, (m) => (m.status === 'streaming' ? { ...m, status: 'done' } : m))
      } catch (e) {
        const aborted = ac.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')
        if (aborted) patch(bot.id, (m) => ({ ...m, status: 'stopped' }))
        else {
          const msg = e instanceof TypeError ? `Couldn't reach ${provider.label.toLowerCase()} (${provider.url ?? 'no URL'}).` : (e as Error).message
          patch(bot.id, (m) => ({ ...m, status: 'error', error: msg }))
        }
      } finally {
        abortRef.current = null
        setBusy(false)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    },
    [context, provider, setLastChatEnergy],
  )

  const send = (text = input) => ask(text, msgs)
  const stop = () => abortRef.current?.abort()
  const retry = (botId: number) => {
    const i = msgs.findIndex((m) => m.id === botId)
    const user = msgs[i - 1]
    if (user?.role === 'user') ask(user.content, msgs.slice(0, i - 1))
  }
  const clear = () => {
    stop()
    setMsgs([])
    inputRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!busy) send()
    }
  }

  const onOpenChange = (open: boolean) => {
    if (open) openChat()
    else closeChat()
  }

  const visible = tab === 'learn' || chat.open || summonedOn === tab
  const tooLong = input.length > MAX_CHARS
  const turns = msgs.filter((m) => m.status !== 'error').length
  const mock = provider.kind === 'mock'

  return (
    <Sheet open={chat.open} onOpenChange={onOpenChange}>
      {visible && (
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Ask the Canopy Guide"
            className="pointer-events-auto fixed right-4 bottom-10 z-40 flex size-14 items-center justify-center rounded-full bg-emerald-400 text-[#06120b] shadow-lg shadow-emerald-500/30 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300 motion-reduce:transition-none motion-reduce:hover:scale-100"
          >
            {!seen && (
              <span className="absolute inset-0 rounded-full bg-emerald-400/60 motion-safe:animate-ping" aria-hidden />
            )}
            <Leaf className="relative size-6" aria-hidden />
          </button>
        </SheetTrigger>
      )}

      <SheetContent
        side="right"
        className="w-full gap-0 border-white/10 bg-[#0b0f0e]/90 p-0 text-white backdrop-blur-md data-[side=right]:sm:max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-white/10 py-3 pr-12 pl-4">
          <Leaf className="size-5 text-emerald-400" aria-hidden />
          <SheetTitle className="font-display text-base font-semibold tracking-tight text-white">Canopy Guide</SheetTitle>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px] font-medium',
              mock ? 'border-violet-400/40 bg-violet-400/15 text-violet-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
            )}
          >
            {provider.label}
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="About the guide's footprint" className="text-white/60 hover:text-white">
                <Info />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 border-white/10 bg-[#121816] text-xs leading-relaxed text-white/80">
              <p className="font-display text-sm font-semibold text-white">How this guide works</p>
              <p>
                {mock
                  ? 'Mock mode: canned answers built from our source list. No model runs; energy numbers are illustrative estimates.'
                  : `A small open model (qwen3.5, 2B) runs on ${provider.kind === 'local' ? 'our laptop' : 'one small server in Toronto'}, answering only from a curated set of sources it cites like [1]. No cloud AI APIs.`}
              </p>
              <p>
                Each answer shows its energy: <b className="text-emerald-300">measured</b> when read from the chip's energy counter,{' '}
                <b className="text-emerald-300">estimated</b> when computed from the token count. The suggested questions are pre-answered
                (<i>cached</i>), so they cost almost nothing.
              </p>
              <p className="text-white/60">
                Caveats: small models can be wrong, so check the sources. The numbers leave out idle power, networking and the energy to build
                the hardware. Only the last {MAX_MESSAGES} messages are sent, up to {MAX_CHARS.toLocaleString('en-US')} characters each.
                Running the model in your own browser is coming soon.
              </p>
              <Button size="sm" variant="outline" onClick={() => setDialog('footprint', true)}>
                Full footprint breakdown
              </Button>
            </PopoverContent>
          </Popover>
          {msgs.length > 0 && (
            <Button variant="ghost" size="icon-sm" aria-label="Clear conversation" onClick={clear} className="ml-auto text-white/50 hover:text-white">
              <Trash2 />
            </Button>
          )}
        </div>
        <SheetDescription className="sr-only">
          Ask questions about Baltimore's trees, heat and how to help. Answers cite their sources.
        </SheetDescription>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite" aria-relevant="additions">
          {msgs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-400/10 ring-1 ring-emerald-400/30">
                <Leaf className="size-6 text-emerald-300" aria-hidden />
              </div>
              <div>
                <p className="font-display text-lg font-semibold">Ask about Baltimore's trees</p>
                <p className="mt-1 text-sm text-white/55">Short answers with sources, from a small local model.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/85 transition-colors hover:border-emerald-400/50 hover:bg-emerald-400/10 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {msgs.map((m) => (
                <MessageView key={m.id} m={m} mock={mock} onRetry={() => retry(m.id)} />
              ))}
              {turns > MAX_MESSAGES && (
                <p className="text-center text-[11px] text-white/35">Only the last {MAX_MESSAGES} messages are sent to the guide.</p>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <form
          className="border-t border-white/10 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy) send()
          }}
        >
          {context && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-400/10 px-2 py-1 text-xs text-violet-100">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">About: {contextLabel(context)}</span>
              <button
                type="button"
                aria-label="Remove context"
                onClick={() => setContext(null)}
                className="ml-auto rounded p-0.5 text-violet-200/70 hover:bg-white/10 hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask a question…"
              aria-label="Your question"
              aria-invalid={tooLong || undefined}
              className="max-h-32 min-h-10 resize-none border-white/15 bg-white/[0.04] text-sm text-white placeholder:text-white/35"
            />
            {busy ? (
              <Button type="button" size="icon-lg" variant="outline" aria-label="Stop" onClick={stop}>
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon-lg" aria-label="Send" disabled={!input.trim() || tooLong}>
                <ArrowUp />
              </Button>
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-white/35">
            <span>Enter to send · Shift+Enter for a new line</span>
            {input.length > MAX_CHARS * 0.8 && (
              <span className={cn('tabular-nums', tooLong && 'text-rose-300')}>
                {input.length.toLocaleString('en-US')}/{MAX_CHARS.toLocaleString('en-US')}
              </span>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
