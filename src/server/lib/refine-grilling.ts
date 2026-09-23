// Wire types for the Refine "grilling" exchange. Transcripts pasted into Refine
// are fallible — ambiguous, contradictory, or missing a fact the agent would
// otherwise invent. When that happens the agent does not guess: it returns a set
// of questions instead of a note, the UI renders an interactive tool, and the
// resolved answers ride back into the next refine call.
//
// These types are owned server-side because the server both produces them (the
// agent's JSON reply is parsed into `RefineQuestion`s here) and consumes them (the
// resolved `RefineClarification`s are folded into the next prompt). The kernel
// re-exports them so the client refers to them without importing `~/server`.

export type RefineOption = {
  readonly id: string
  readonly label: string
  // Exactly one option per question is the agent's recommended answer. The UI
  // marks it, and a skipped (unanswered) question falls back to it.
  readonly recommended?: boolean
}

export type RefineQuestion = {
  readonly id: string
  // A short one-line prompt.
  readonly title: string
  // Optional extra context (what's ambiguous, what the transcript said). Plain
  // text, rendered as-is by the UI.
  readonly body: string
  // One-click suggestions. May be empty for a pure free-text question.
  readonly options: readonly RefineOption[]
  // Whether to offer a free-text field alongside (or instead of) the options.
  readonly allowFreeText: boolean
}

// One resolved question→answer pair the UI hands back for the next round: plain
// human-readable text, all the agent needs to fold the clarification in.
export type RefineClarification = {
  readonly question: string
  readonly answer: string
}

// Validate + normalise the agent's `questions` array out of its parsed JSON
// reply. Tolerant, like the note parser: skip malformed entries, synthesise ids
// when missing, keep at most one recommended option, and force a free-text field
// when a question offers no options (otherwise it would be unanswerable). Returns
// null when nothing usable survives, so the caller fails cleanly rather than
// showing an empty question list.
export function parseQuestions(raw: unknown): RefineQuestion[] | null {
  if (!Array.isArray(raw)) return null
  const questions: RefineQuestion[] = []
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) return
    const q = item as Record<string, unknown>
    const title = typeof q.title === 'string' ? q.title.trim() : ''
    const body = typeof q.body === 'string' ? q.body.trim() : ''
    // Nothing to ask.
    if (title === '' && body === '') return
    const id = typeof q.id === 'string' && q.id.trim() !== '' ? q.id.trim() : `q${index + 1}`
    const options = parseOptions(q.options, id)
    // With no options the only way to answer is free text; never suppress it.
    const allowFreeText = options.length === 0 ? true : q.allowFreeText !== false
    questions.push({
      id,
      title: title === '' ? body : title,
      body: title === '' ? '' : body,
      options,
      allowFreeText,
    })
  })
  return questions.length === 0 ? null : questions
}

function parseOptions(raw: unknown, questionId: string): RefineOption[] {
  if (!Array.isArray(raw)) return []
  const options: RefineOption[] = []
  let recommendedTaken = false
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null) return
    const o = item as Record<string, unknown>
    const label = typeof o.label === 'string' ? o.label.trim() : ''
    if (label === '') return
    const id =
      typeof o.id === 'string' && o.id.trim() !== '' ? o.id.trim() : `${questionId}-o${index + 1}`
    // At most one recommended per question — the first the agent marks wins.
    const recommended = o.recommended === true && !recommendedTaken
    if (recommended) recommendedTaken = true
    options.push(recommended ? { id, label, recommended: true } : { id, label })
  })
  return options
}
