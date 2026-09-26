import type { ChatEvent, ChatMessage } from '@/lib/types'
import type { ChatContext } from '@/store'
import { readNdjson } from './ndjson'
import { mockChat } from './mock'

/** Limits the backend enforces too (plan §10.4). */
export const MAX_CHARS = 2000
export const MAX_MESSAGES = 10

export type ProviderKind = 'local' | 'server' | 'mock'
export type Provider = {
  kind: ProviderKind
  /** null when the server URL isn't configured (VITE_API_URL unset) or for mock */
  url: string | null
  /** mode badge text */
  label: string
}

/**
 * Provider switch (plan §9.3):
 * - `?llm=mock` → in-browser mock (no backend);
 * - hostname `localhost` or `?llm=local` → the laptop backend on :8000;
 * - otherwise `${VITE_API_URL}/api/chat` (the droplet).
 */
export function resolveProvider(
  loc: { hostname: string; search: string } = window.location,
  apiUrl: string | undefined = import.meta.env.VITE_API_URL,
): Provider {
  const llm = new URLSearchParams(loc.search).get('llm')
  if (llm === 'mock') return { kind: 'mock', url: null, label: 'Mock' }
  if (loc.hostname === 'localhost' || llm === 'local')
    return { kind: 'local', url: 'http://localhost:8000/api/chat', label: 'Your laptop' }
  const base = apiUrl?.trim().replace(/\/+$/, '')
  return { kind: 'server', url: base ? `${base}/api/chat` : null, label: 'Server · Toronto' }
}

let cached: Provider | null = null
export const getProvider = () => (cached ??= resolveProvider())

/**
 * Client-side validation: trims and caps each message at MAX_CHARS, keeps the
 * newest MAX_MESSAGES, and drops leading assistant turns so the history starts
 * with a user message.
 */
export function prepareMessages(history: ChatMessage[]): ChatMessage[] {
  const clean = history
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.content.length > 0)
  const recent = clean.slice(-MAX_MESSAGES)
  while (recent.length && recent[0].role !== 'user') recent.shift()
  return recent
}

export type ChatRequest = { messages: ChatMessage[]; mode: 'learn'; context?: ChatContext }

export class ChatHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Streams events for one answer. Throws on network/HTTP errors; aborts via `signal`. */
export async function* streamChat(
  messages: ChatMessage[],
  context: ChatContext | null,
  signal?: AbortSignal,
  provider: Provider = getProvider(),
): AsyncGenerator<ChatEvent> {
  const req: ChatRequest = { messages: prepareMessages(messages), mode: 'learn' }
  if (context) req.context = context

  if (provider.kind === 'mock') {
    yield* mockChat(req.messages, signal)
    return
  }
  if (!provider.url) throw new Error('Chat server is not configured (VITE_API_URL is unset).')

  const res = await fetch(provider.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })
  if (!res.ok) {
    const msg = res.status === 429 ? 'Too many questions. Wait a minute and try again.' : `Server error (HTTP ${res.status}).`
    throw new ChatHttpError(res.status, msg)
  }
  if (!res.body) throw new Error('Empty response from the chat server.')
  yield* readNdjson(res.body)
}
