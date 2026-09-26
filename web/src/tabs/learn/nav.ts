// DOM helpers for moving around the story column.
export const HELP_ANCHOR_ID = 'learn-help'
export const STEP_ATTR = 'data-learn-step'

const behavior = (reduce: boolean | null): ScrollBehavior => (reduce ? 'auto' : 'smooth')

export function scrollToHelp(reduce: boolean | null) {
  document.getElementById(HELP_ANCHOR_ID)?.scrollIntoView({ behavior: behavior(reduce), block: 'start' })
}

export function scrollToStep(i: number, reduce: boolean | null) {
  document.querySelector(`[${STEP_ATTR}="${i}"]`)?.scrollIntoView({ behavior: behavior(reduce), block: 'center' })
}
