import type { ReactNode } from 'react'
import { match, P } from 'ts-pattern'
import type { AdfNode } from '~/kernel'
import {
  Blockquote,
  BulletList,
  CodeBlock,
  Emoji,
  HardBreak,
  Heading,
  InlineCard,
  ListItem,
  Media,
  Mention,
  OrderedList,
  Panel,
  Paragraph,
  Rule,
  Status,
  Text,
  Unsupported,
} from './nodes'

export function RenderAdf({ doc, jiraBaseUrl }: { doc: AdfNode | null; jiraBaseUrl?: string }) {
  if (doc === null) return null
  return <div className="space-y-3">{renderChildren(doc, jiraBaseUrl)}</div>
}

function renderNode(node: AdfNode, key: number, jiraBaseUrl: string | undefined): ReactNode {
  return match(node)
    .with({ type: 'doc' }, (n) => <div key={key}>{renderChildren(n, jiraBaseUrl)}</div>)
    .with({ type: 'paragraph' }, (n) => (
      <Paragraph key={key}>{renderChildren(n, jiraBaseUrl)}</Paragraph>
    ))
    .with({ type: 'heading' }, (n) => (
      <Heading key={key} level={typeof n.attrs?.level === 'number' ? n.attrs.level : 1}>
        {renderChildren(n, jiraBaseUrl)}
      </Heading>
    ))
    .with({ type: 'text' }, (n) => <Text key={key} text={n.text ?? ''} marks={n.marks} />)
    .with({ type: 'bulletList' }, (n) => (
      <BulletList key={key}>{renderChildren(n, jiraBaseUrl)}</BulletList>
    ))
    .with({ type: 'orderedList' }, (n) => (
      <OrderedList key={key}>{renderChildren(n, jiraBaseUrl)}</OrderedList>
    ))
    .with({ type: 'listItem' }, (n) => (
      <ListItem key={key}>{renderChildren(n, jiraBaseUrl)}</ListItem>
    ))
    .with({ type: 'codeBlock' }, (n) => (
      <CodeBlock key={key} node={n}>
        {renderChildren(n, jiraBaseUrl)}
      </CodeBlock>
    ))
    .with({ type: 'blockquote' }, (n) => (
      <Blockquote key={key}>{renderChildren(n, jiraBaseUrl)}</Blockquote>
    ))
    .with({ type: 'hardBreak' }, () => <HardBreak key={key} />)
    .with({ type: 'rule' }, () => <Rule key={key} />)
    .with({ type: 'mention' }, (n) => (
      <Mention key={key} text={typeof n.attrs?.text === 'string' ? n.attrs.text : ''} />
    ))
    .with({ type: 'emoji' }, (n) => (
      <Emoji
        key={key}
        text={typeof n.attrs?.text === 'string' ? n.attrs.text : undefined}
        shortName={typeof n.attrs?.shortName === 'string' ? n.attrs.shortName : undefined}
      />
    ))
    .with({ type: 'status' }, (n) => (
      <Status
        key={key}
        text={typeof n.attrs?.text === 'string' ? n.attrs.text : ''}
        color={typeof n.attrs?.color === 'string' ? n.attrs.color : 'neutral'}
      />
    ))
    .with({ type: 'panel' }, (n) => (
      <Panel
        key={key}
        panelType={typeof n.attrs?.panelType === 'string' ? n.attrs.panelType : 'info'}
      >
        {renderChildren(n, jiraBaseUrl)}
      </Panel>
    ))
    .with({ type: 'media' }, (n) => <Media key={key} attrs={n.attrs} jiraBaseUrl={jiraBaseUrl} />)
    .with({ type: 'inlineCard' }, (n) => (
      <InlineCard
        key={key}
        url={typeof n.attrs?.url === 'string' ? n.attrs.url : ''}
        jiraBaseUrl={jiraBaseUrl}
      />
    ))
    .with({ type: P.string }, (n) => <Unsupported key={key} type={n.type} />)
    .otherwise(() => <Unsupported key={key} type="unknown" />)
}

// `mediaSingle` / `mediaGroup` siblings are flattened into a single
// 3-column grid so that consecutive attachments pack into rows of three
// regardless of which wrapper Jira used for each one.
function renderChildren(node: AdfNode, jiraBaseUrl: string | undefined): ReactNode {
  if (!Array.isArray(node.content)) return null

  const out: ReactNode[] = []
  let mediaRun: AdfNode[] = []
  let runStart = 0

  const flushMediaRun = () => {
    if (mediaRun.length === 0) return
    const tiles: ReactNode[] = []
    for (const wrapper of mediaRun) {
      if (!Array.isArray(wrapper.content)) continue
      for (const child of wrapper.content) {
        if (child.type !== 'media') continue
        tiles.push(<Media key={tiles.length} attrs={child.attrs} jiraBaseUrl={jiraBaseUrl} />)
      }
    }
    out.push(
      <div key={`media-row-${runStart}`} className="my-2 grid grid-cols-3 gap-2">
        {tiles}
      </div>,
    )
    mediaRun = []
  }

  node.content.forEach((child, i) => {
    if (child.type === 'mediaSingle' || child.type === 'mediaGroup') {
      if (mediaRun.length === 0) runStart = i
      mediaRun.push(child)
      return
    }
    flushMediaRun()
    out.push(renderNode(child, i, jiraBaseUrl))
  })
  flushMediaRun()

  return out
}
