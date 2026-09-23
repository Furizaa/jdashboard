// The client's view of the Refine grilling protocol (see
// `~/server/lib/refine-grilling`). The wire types are owned by the server and
// re-exported here; `RefineAnswer` and `resolveRefineAnswers` are client-only
// (the server never sees them — it receives the already-resolved
// `RefineClarification`s), so they live in the kernel as cross-context domain
// logic, shared by single-note Refine (Detail) and Bulk Refine.
import type { RefineClarification, RefineQuestion } from '~/server/lib/refine-grilling'

export type {
  RefineClarification,
  RefineOption,
  RefineQuestion,
} from '~/server/lib/refine-grilling'

// One question's answer as the interactive UI collects it: a clicked option, a
// typed free-text string, or neither (left blank).
export type RefineAnswer = {
  readonly questionId: string
  readonly optionId?: string
  readonly text?: string
}

// Turn the UI's structured answers into the human-readable pairs the next refine
// call sends. Free text wins over a clicked option; a question left unanswered
// falls back to its recommended option. That fallback is the always-available
// "skip": an unanswered question never blocks the refine, it just uses the
// agent's own best guess. A question with neither an answer nor a recommended
// option contributes nothing (there is nothing to tell the agent).
export function resolveRefineAnswers(
  questions: readonly RefineQuestion[],
  answers: readonly RefineAnswer[],
): RefineClarification[] {
  const byId = new Map(answers.map((a) => [a.questionId, a]))
  const resolved: RefineClarification[] = []
  for (const question of questions) {
    const answer = resolveOne(question, byId.get(question.id))
    if (answer !== null) resolved.push({ question: questionText(question), answer })
  }
  return resolved
}

function resolveOne(question: RefineQuestion, answer: RefineAnswer | undefined): string | null {
  const typed = answer?.text?.trim()
  if (typed !== undefined && typed !== '') return typed
  if (answer?.optionId !== undefined) {
    const chosen = question.options.find((o) => o.id === answer.optionId)
    if (chosen !== undefined) return chosen.label
  }
  return question.options.find((o) => o.recommended)?.label ?? null
}

function questionText(question: RefineQuestion): string {
  return question.body.trim() === '' ? question.title : `${question.title} — ${question.body}`
}
