import { describe, expect, it } from 'vitest'
import { resolveRefineAnswers } from './refine-grilling'
import type { RefineQuestion } from './refine-grilling'

const question = (over: Partial<RefineQuestion> = {}): RefineQuestion => ({
  id: 'owner',
  title: 'Who owns it?',
  body: '',
  options: [
    { id: 'ada', label: 'Ada', recommended: true },
    { id: 'grace', label: 'Grace' },
  ],
  allowFreeText: true,
  ...over,
})

describe('resolveRefineAnswers', () => {
  it('resolves a clicked option to its label', () => {
    expect(
      resolveRefineAnswers([question()], [{ questionId: 'owner', optionId: 'grace' }]),
    ).toEqual([{ question: 'Who owns it?', answer: 'Grace' }])
  })

  it('prefers free text over a clicked option', () => {
    expect(
      resolveRefineAnswers([question()], [{ questionId: 'owner', optionId: 'ada', text: 'Bala' }]),
    ).toEqual([{ question: 'Who owns it?', answer: 'Bala' }])
  })

  it('falls back to the recommended option when unanswered (the skip path)', () => {
    expect(resolveRefineAnswers([question()], [])).toEqual([
      { question: 'Who owns it?', answer: 'Ada' },
    ])
  })

  it('omits a question with neither an answer nor a recommended option', () => {
    const q = question({ options: [{ id: 'ada', label: 'Ada' }] })
    expect(resolveRefineAnswers([q], [])).toEqual([])
  })

  it('joins the body into the question text when present', () => {
    const q = question({ body: 'Both volunteered.' })
    expect(resolveRefineAnswers([q], [{ questionId: 'owner', optionId: 'ada' }])).toEqual([
      { question: 'Who owns it? — Both volunteered.', answer: 'Ada' },
    ])
  })

  it('treats blank free text as unanswered and skips to recommended', () => {
    expect(resolveRefineAnswers([question()], [{ questionId: 'owner', text: '   ' }])).toEqual([
      { question: 'Who owns it?', answer: 'Ada' },
    ])
  })
})
