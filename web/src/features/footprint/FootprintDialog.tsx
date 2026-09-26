import { useId, useState } from 'react'
import { Ban, Calculator, Cpu, Scale, Sprout, TreeDeciduous, TriangleAlert } from 'lucide-react'
import { useStore } from '@/store'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatTile } from '@/components/StatTile'
import { fmtInt } from '@/lib/format'
import { getProvider } from '@/features/chat/llm'
import {
  ASSUMED_CPU_W, G_PER_LB, MIN_PER_YEAR, NETWORK_KWH_PER_GB, NETWORK_SOURCE, REFERENCE_QUERIES, TYPICAL_OPT_RUN_MS,
  fmtDuration, fmtG, fmtWh, optimizerWh,
} from './energy'
import { Bullets, DIALOG_CLASS, MockNote, Section, SourceLink, TABLE_CELL, TABLE_HEAD } from './parts'

const USFS_GUIDE = 'https://www.itreetools.org/documents/443/PSW_GTR202_Northeast_CTG.pdf'
/** Rough download size of a 2B-parameter model quantized to 4 bits (editable assumption). */
const DEFAULT_MODEL_GB = 1.5
/** Fallback per-answer energy for the calculator: middle of our ~0.01–0.05 Wh range. */
const DEFAULT_ANSWER_WH = 0.03

export default function FootprintDialog() {
  const open = useStore((s) => s.dialogs.footprint)
  const setDialog = useStore((s) => s.setDialog)
  return (
    <Dialog open={open} onOpenChange={(o) => setDialog('footprint', o)}>
      <DialogContent className={DIALOG_CLASS}>
        <DialogHeader className="border-b border-white/10 px-5 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-semibold text-white">
            <Sprout className="size-5 text-emerald-400" aria-hidden /> What this app costs the planet
          </DialogTitle>
          <DialogDescription className="text-white/55">
            Energy and carbon for building and using this app, next to other AI tools, with every assumption shown.
          </DialogDescription>
        </DialogHeader>
        {open && <Body />}
      </DialogContent>
    </Dialog>
  )
}

function Body() {
  const data = useStore((s) => s.data)
  const lastRunMs = useStore((s) => s.plan.lastRunMs)
  const lastChat = useStore((s) => s.lastChatEnergy)
  if (!data) return null
  const { footprint: fp, stats } = data
  const mockChat = getProvider().kind === 'mock'

  const runMs = lastRunMs ?? TYPICAL_OPT_RUN_MS
  const runWh = optimizerWh(runMs)

  // Offset framing: CO₂ a medium street tree absorbs per minute (USFS NE guide values in stats.json).
  const tree = stats.treeBenefits.medium
  const gPerMin = (tree.co2LbYr * G_PER_LB) / MIN_PER_YEAR

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
      <MockNote show={stats.mock} />

      <Section title="Building and running it" icon={<Cpu className="size-4 text-emerald-400" aria-hidden />}>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <StatTile
            label="Data pipeline"
            value={fp.pipelineKWh * 1000}
            format={fmtWh}
            hint={`${fmtG(fp.pipelineGCO2)} CO₂`}
            accent="#4ade80"
          />
          <StatTile
            label="Model training"
            value={fp.trainKWh * 1000}
            format={fmtWh}
            hint={`${fmtG(fp.trainGCO2)} CO₂`}
            accent="#4ade80"
          />
          <StatTile
            label="One optimizer run"
            value={runWh}
            format={fmtWh}
            hint={lastRunMs != null ? `${fmtInt(runMs)} ms in your browser` : `typical ${runMs} ms (not run yet)`}
          />
          <StatTile
            label="Last chat answer"
            value={lastChat?.wh ?? 0}
            format={(v) => (lastChat ? fmtWh(v) : '—')}
            hint={
              lastChat
                ? [lastChat.measured ? 'measured' : 'estimated', lastChat.cached && 'cached', mockChat && 'mock'].filter(Boolean).join(' · ')
                : 'ask the Canopy Guide'
            }
            accent="#a78bfa"
          />
        </div>
        <p className="text-xs text-white/50">
          Pipeline and training measured with CodeCarbon ({fp.region}, {new Date(fp.measuredAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}).
          Optimizer energy is an estimate: run time × an assumed {ASSUMED_CPU_W} W for a busy laptop CPU core.{' '}
          <b className="font-medium text-white/70">Hosting:</b> the site is static files on a CDN; the chat runs on one small droplet in Toronto
          (Ontario's grid is mostly hydro and nuclear), shut down after judging.
        </p>
      </Section>

      <Section title="Compared with other AI assistants" icon={<Scale className="size-4 text-emerald-400" aria-hidden />}>
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className={TABLE_HEAD}>Per question</TableHead>
              <TableHead className={`${TABLE_HEAD} text-right`}>Energy (Wh)</TableHead>
              <TableHead className={`${TABLE_HEAD} text-right`}>Water (mL)</TableHead>
              <TableHead className={TABLE_HEAD}>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {REFERENCE_QUERIES.map((r) => (
              <TableRow key={r.name} className="border-white/10 hover:bg-white/[0.03]">
                <TableCell className={TABLE_CELL}>{r.name}</TableCell>
                <TableCell className={`${TABLE_CELL} text-right tabular-nums`}>{r.wh}</TableCell>
                <TableCell className={`${TABLE_CELL} text-right tabular-nums`}>{r.ml}</TableCell>
                <TableCell className={`${TABLE_CELL} text-xs`}><SourceLink href={r.url}>{r.source}</SourceLink></TableCell>
              </TableRow>
            ))}
            {fp.cloudRefs.map((r) => (
              <TableRow key={`ref-${r.name}`} className="border-white/10 hover:bg-white/[0.03]">
                <TableCell className={TABLE_CELL}>{r.name}</TableCell>
                <TableCell className={`${TABLE_CELL} text-right tabular-nums`}>{r.wh}</TableCell>
                <TableCell className={`${TABLE_CELL} text-right tabular-nums`}>{r.ml ?? '—'}</TableCell>
                <TableCell className={`${TABLE_CELL} text-xs`}><SourceLink href={r.source}>{r.source}</SourceLink></TableCell>
              </TableRow>
            ))}
            {lastChat && (
              <TableRow className="border-white/10 bg-violet-400/[0.06] hover:bg-violet-400/10">
                <TableCell className={`${TABLE_CELL} text-violet-100`}>Your last Canopy Guide answer{mockChat ? ' (mock)' : ''}</TableCell>
                <TableCell className={`${TABLE_CELL} text-right tabular-nums text-violet-100`}>{lastChat.wh.toPrecision(2)}</TableCell>
                <TableCell className={`${TABLE_CELL} text-right`}>—</TableCell>
                <TableCell className={`${TABLE_CELL} text-xs text-white/55`}>
                  {lastChat.measured ? 'measured' : 'estimated'}{lastChat.cached ? ', cached' : ''}, {lastChat.tokens} tokens
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <p className="text-xs text-white/50">
          Cloud numbers are company-reported or independent estimates, measured differently, so compare orders of magnitude, not decimals.
          Per-query energy is already small everywhere; running locally mainly avoids data-center water and keeps questions private.
        </p>
      </Section>

      <BreakEven defaultAnswerWh={lastChat && lastChat.wh > 0 && !lastChat.cached ? lastChat.wh : DEFAULT_ANSWER_WH} />

      <Section title="Where we chose not to use AI" icon={<Ban className="size-4 text-emerald-400" aria-hidden />}>
        <Bullets
          items={[
            'The planting optimizer is plain math (a greedy search over precomputed cooling curves) running in your browser. No model is called.',
            'Every statistic on the map and in the story is computed once, offline, and shipped as static files.',
            'The heat model is a small gradient-boosted tree model trained once on a laptop, not a neural network.',
            'Answers to the suggested chat questions are generated once, reviewed by hand and cached.',
          ]}
        />
      </Section>

      <Section title="Honest caveats" icon={<TriangleAlert className="size-4 text-amber-300" aria-hidden />}>
        <Bullets
          items={[
            "The laptop and server draw idle power whether or not anyone asks a question; those numbers aren't counted per answer.",
            'Making the hardware (chips, servers, phones) has a carbon cost that is not included here.',
            "Some numbers are measured (CodeCarbon, the chip's energy counter) and some are estimates from token counts or run time. Each is labelled.",
            <>Building the app used cloud AI coding tools. {fp.devAiNote}</>,
          ]}
        />
      </Section>

      <Section title="In tree terms" icon={<TreeDeciduous className="size-4 text-emerald-400" aria-hidden />}>
        <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2.5 text-sm leading-relaxed text-white/85">
          One medium street tree absorbs about{' '}
          <span className="font-display font-semibold text-emerald-300">{fmtInt(tree.co2LbYr)} lb</span> of CO₂ a year. That offsets our entire model
          training run in about <span className="font-display font-semibold text-emerald-300">{fmtDuration(fp.trainGCO2 / gPerMin)}</span>, and the
          whole data pipeline in about <span className="font-display font-semibold text-emerald-300">{fmtDuration(fp.pipelineGCO2 / gPerMin)}</span>.
        </p>
        <p className="text-xs text-white/45">
          Per-tree CO₂ from the <SourceLink href={USFS_GUIDE}>USFS Northeast Community Tree Guide</SourceLink> (medium tree; small{' '}
          {fmtInt(stats.treeBenefits.small.co2LbYr)} lb, large {fmtInt(stats.treeBenefits.large.co2LbYr)} lb). A young tree absorbs much less.
        </p>
      </Section>
    </div>
  )
}

function NumField({ label, value, onChange, step, min, suffix }: { label: string; value: number; onChange: (v: number) => void; step: number; min: number; suffix: string }) {
  const id = useId()
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px] font-medium uppercase tracking-wider text-white/50">{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ''}
          step={step}
          min={min}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          className="h-8 border-white/15 bg-white/[0.04] text-sm text-white tabular-nums"
        />
        <span className="shrink-0 text-xs text-white/45">{suffix}</span>
      </div>
    </div>
  )
}

function BreakEven({ defaultAnswerWh }: { defaultAnswerWh: number }) {
  const [gb, setGb] = useState(DEFAULT_MODEL_GB)
  const [low, setLow] = useState(NETWORK_KWH_PER_GB.low)
  const [high, setHigh] = useState(NETWORK_KWH_PER_GB.high)
  const [answerWh, setAnswerWh] = useState(defaultAnswerWh)

  const ok = gb > 0 && low > 0 && high > 0 && answerWh > 0
  const [lo, hi] = [Math.min(low, high), Math.max(low, high)]
  const dlLow = gb * lo * 1000
  const dlHigh = gb * hi * 1000
  const nLow = dlLow / answerWh
  const nHigh = dlHigh / answerWh

  return (
    <Section title="Download break-even (on-device mode)" icon={<Calculator className="size-4 text-emerald-400" aria-hidden />}>
      <p className="text-sm text-white/70">
        Running the model in your browser means downloading it first. How many server answers would use the same energy as that download?
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <NumField label="Model size" value={gb} onChange={setGb} step={0.1} min={0.1} suffix="GB" />
        <NumField label="Network, low" value={low} onChange={setLow} step={0.001} min={0} suffix="kWh/GB" />
        <NumField label="Network, high" value={high} onChange={setHigh} step={0.01} min={0} suffix="kWh/GB" />
        <NumField label="Energy per answer" value={answerWh} onChange={setAnswerWh} step={0.01} min={0} suffix="Wh" />
      </div>
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white/80">
        {ok ? (
          <>
            The download uses about <b className="text-white">{fmtWh(dlLow)}–{fmtWh(dlHigh)}</b>, as much as{' '}
            <span className="font-display text-lg font-semibold text-emerald-300 tabular-nums">
              {fmtInt(nLow)}–{fmtInt(nHigh)}
            </span>{' '}
            answers. On-device mode only saves energy if you ask more questions than that (and your device isn't less efficient than the server).
          </>
        ) : (
          <span className="text-white/50">Enter positive numbers to see the break-even.</span>
        )}
      </div>
      <p className="text-xs text-white/45">
        Network range: <SourceLink href={NETWORK_SOURCE.url}>{NETWORK_SOURCE.label}</SourceLink> found 0.06 kWh/GB (2015), halving about every
        two years; the low end extrapolates that trend. Published estimates vary by more than 10×. Model size is a rough figure for a 2B model at
        4-bit; energy per answer defaults to your last answer if you've asked one, else {DEFAULT_ANSWER_WH} Wh.
      </p>
    </Section>
  )
}
