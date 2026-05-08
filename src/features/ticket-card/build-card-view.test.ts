import { describe, expect, it } from 'vitest'
import type { BoardIssue } from '~/server/jira'
import type { ReviewCardFake, ReviewCardReal } from '~/server/gitlab'
import { buildCardView } from './build-card-view'

const BASE_URL = 'https://j.example'

function jiraIssue(overrides: Partial<BoardIssue> = {}): BoardIssue {
  return {
    key: 'HDR-1',
    summary: 'jira summary',
    statusName: 'In Code Review',
    typeName: 'Task',
    labels: [],
    epic: null,
    ...overrides,
  }
}

function realReviewCard(overrides: Partial<ReviewCardReal> = {}): ReviewCardReal {
  return {
    kind: 'review-real',
    iid: 7,
    webUrl: 'https://gitlab/p/-/merge_requests/7',
    title: 'HDR-1: real card',
    bucket: 'needs-review',
    mrState: 'opened',
    reviewers: [],
    unresolvedCount: 0,
    ciState: 'none',
    jira: {
      key: 'HDR-1',
      summary: 'jira summary',
      typeName: 'Task',
      labels: [],
      epic: null,
    },
    ...overrides,
  }
}

function fakeReviewCard(overrides: Partial<ReviewCardFake> = {}): ReviewCardFake {
  return {
    kind: 'review-fake',
    iid: 42,
    webUrl: 'https://gitlab/p/-/merge_requests/42',
    title: 'chore: update deps',
    bucket: 'needs-review',
    mrState: 'opened',
    reviewers: [],
    unresolvedCount: 0,
    ciState: 'none',
    jiraKeyAttempted: null,
    ...overrides,
  }
}

describe('buildCardView — jira', () => {
  it('produces the slot shape for a Jira board issue', () => {
    const issue = jiraIssue({
      key: 'HDR-100',
      summary: 's',
      statusName: 'In Code Review',
      typeName: 'Bug',
      labels: ['lab'],
      epic: { key: 'HDR-99', summary: 'epic' },
    })
    const view = buildCardView({
      kind: 'jira',
      issue,
      column: 'In Code Review',
      baseUrl: BASE_URL,
    })
    expect(view.keyDisplay).toBe('HDR-100')
    expect(view.keyClick).toEqual({ kind: 'copy-jira', url: `${BASE_URL}/browse/HDR-100` })
    expect(view.keyOpenInJira).toBe(`${BASE_URL}/browse/HDR-100`)
    expect(view.typeIcon).toEqual({ kind: 'jira', type: 'Bug' })
    expect(view.summary).toBe('s')
    expect(view.labels).toEqual(['lab'])
    expect(view.epic).toEqual({ key: 'HDR-99', summary: 'epic' })
    expect(view.pill).toEqual({ text: 'In Code Review', clickable: true })
    expect(view.bodyClick).toEqual({ kind: 'open-panel', issueKey: 'HDR-100' })
    expect(view.mrSection).toEqual({
      mode: 'jira',
      column: 'In Code Review',
      issueKey: 'HDR-100',
    })
    expect(view.fixasap).toBe(false)
  })

  it('sets fixasap when the labels include FIXASAP (case-insensitive)', () => {
    const view = buildCardView({
      kind: 'jira',
      issue: jiraIssue({ labels: ['FixAsap'] }),
      column: 'In Code Review',
      baseUrl: BASE_URL,
    })
    expect(view.fixasap).toBe(true)
  })

  it('deemphasizes a non-Reviewed status in the TO DO column', () => {
    const view = buildCardView({
      kind: 'jira',
      issue: jiraIssue({ statusName: 'Blocked' }),
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    expect(view.deemphasized).toBe(true)
  })

  it('does not deemphasize a Reviewed status in TO DO', () => {
    const view = buildCardView({
      kind: 'jira',
      issue: jiraIssue({ statusName: 'Reviewed' }),
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    expect(view.deemphasized).toBe(false)
  })
})

describe('buildCardView — review-real', () => {
  it('uses the embedded Jira fields for the slot shape with a non-clickable review pill', () => {
    const card = realReviewCard({
      bucket: 'needs-review',
      jira: {
        key: 'HDR-7',
        summary: 'jira summary',
        typeName: 'Bug',
        labels: ['lab'],
        epic: { key: 'HDR-100', summary: 'epic' },
      },
    })
    const view = buildCardView({
      kind: 'review',
      card,
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    expect(view.keyDisplay).toBe('HDR-7')
    expect(view.keyClick).toEqual({ kind: 'copy-jira', url: `${BASE_URL}/browse/HDR-7` })
    expect(view.keyOpenInJira).toBe(`${BASE_URL}/browse/HDR-7`)
    expect(view.typeIcon).toEqual({ kind: 'jira', type: 'Bug' })
    expect(view.summary).toBe('jira summary')
    expect(view.labels).toEqual(['lab'])
    expect(view.epic).toEqual({ key: 'HDR-100', summary: 'epic' })
    expect(view.pill).toEqual({ text: 'Needs Review', clickable: false })
    expect(view.bodyClick).toEqual({ kind: 'open-panel', issueKey: 'HDR-7' })
    expect(view.mrSection).toEqual({
      mode: 'review',
      reviewers: [],
      ciState: 'none',
      unresolvedCount: 0,
      mrState: 'opened',
    })
  })

  it('maps the bucket to the pill text for each review state', () => {
    const needs = buildCardView({
      kind: 'review',
      card: realReviewCard({ bucket: 'needs-review' }),
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    const rejected = buildCardView({
      kind: 'review',
      card: realReviewCard({ bucket: 'rejected' }),
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    const accepted = buildCardView({
      kind: 'review',
      card: realReviewCard({ bucket: 'accepted', mrState: 'merged' }),
      column: 'Done',
      baseUrl: BASE_URL,
    })
    expect(needs.pill.text).toBe('Needs Review')
    expect(rejected.pill.text).toBe('Review Rejected')
    expect(accepted.pill.text).toBe('Review Accepted')
  })

  it('deemphasizes a Review Rejected card in TO DO', () => {
    const view = buildCardView({
      kind: 'review',
      card: realReviewCard({ bucket: 'rejected' }),
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    expect(view.deemphasized).toBe(true)
  })

  it('does not deemphasize a Needs Review card in TO DO', () => {
    const view = buildCardView({
      kind: 'review',
      card: realReviewCard({ bucket: 'needs-review' }),
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    expect(view.deemphasized).toBe(false)
  })

  it('sets fixasap when the embedded Jira labels include FIXASAP', () => {
    const view = buildCardView({
      kind: 'review',
      card: realReviewCard({
        jira: {
          key: 'HDR-7',
          summary: 's',
          typeName: 'Task',
          labels: ['fixasap'],
          epic: null,
        },
      }),
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    expect(view.fixasap).toBe(true)
  })
})

describe('buildCardView — review-fake', () => {
  it('produces a fake-card slot shape with MR !<iid> key, GitMerge icon, MR title, and open-mr clicks', () => {
    const card = fakeReviewCard({ iid: 42, title: 'chore: update deps', bucket: 'needs-review' })
    const view = buildCardView({
      kind: 'review',
      card,
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    expect(view.keyDisplay).toBe('MR !42')
    expect(view.keyClick).toEqual({ kind: 'open-mr', url: card.webUrl })
    expect(view.keyOpenInJira).toBeNull()
    expect(view.typeIcon).toEqual({ kind: 'merge-request' })
    expect(view.summary).toBe('chore: update deps')
    expect(view.labels).toEqual([])
    expect(view.epic).toBeNull()
    expect(view.pill).toEqual({ text: 'Needs Review', clickable: false })
    expect(view.bodyClick).toEqual({ kind: 'open-mr', url: card.webUrl })
    expect(view.mrSection).toEqual({
      mode: 'review',
      reviewers: [],
      ciState: 'none',
      unresolvedCount: 0,
      mrState: 'opened',
    })
    expect(view.fixasap).toBe(false)
  })

  it('never sets the fixasap flag for fake cards', () => {
    const view = buildCardView({
      kind: 'review',
      card: fakeReviewCard({ title: 'fixasap chore' }),
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    expect(view.fixasap).toBe(false)
  })

  it('deemphasizes a Review Rejected fake card in TO DO and not a Needs Review fake card', () => {
    const rejected = buildCardView({
      kind: 'review',
      card: fakeReviewCard({ bucket: 'rejected' }),
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    const needs = buildCardView({
      kind: 'review',
      card: fakeReviewCard({ bucket: 'needs-review' }),
      column: 'TO DO',
      baseUrl: BASE_URL,
    })
    expect(rejected.deemphasized).toBe(true)
    expect(needs.deemphasized).toBe(false)
  })
})
