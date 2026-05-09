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
  ListItem,
  Media,
  MediaGroup,
  MediaSingle,
  Mention,
  OrderedList,
  Panel,
  Paragraph,
  Rule,
  Status,
  Text,
  Unsupported,
} from './nodes'

export function RenderAdf({ doc, jiraUrl }: { doc: AdfNode | null; jiraUrl?: string }) {
  if (doc === null) return null
  return <div className="space-y-3">{renderChildren(doc, jiraUrl)}</div>
}

function renderNode(node: AdfNode, key: number, jiraUrl: string | undefined): ReactNode {
  return match(node)
    .with({ type: 'doc' }, (n) => <div key={key}>{renderChildren(n, jiraUrl)}</div>)
    .with({ type: 'paragraph' }, (n) => (
      <Paragraph key={key}>{renderChildren(n, jiraUrl)}</Paragraph>
    ))
    .with({ type: 'heading' }, (n) => (
      <Heading key={key} level={typeof n.attrs?.level === 'number' ? n.attrs.level : 1}>
        {renderChildren(n, jiraUrl)}
      </Heading>
    ))
    .with({ type: 'text' }, (n) => <Text key={key} text={n.text ?? ''} marks={n.marks} />)
    .with({ type: 'bulletList' }, (n) => (
      <BulletList key={key}>{renderChildren(n, jiraUrl)}</BulletList>
    ))
    .with({ type: 'orderedList' }, (n) => (
      <OrderedList key={key}>{renderChildren(n, jiraUrl)}</OrderedList>
    ))
    .with({ type: 'listItem' }, (n) => <ListItem key={key}>{renderChildren(n, jiraUrl)}</ListItem>)
    .with({ type: 'codeBlock' }, (n) => (
      <CodeBlock key={key}>{renderChildren(n, jiraUrl)}</CodeBlock>
    ))
    .with({ type: 'blockquote' }, (n) => (
      <Blockquote key={key}>{renderChildren(n, jiraUrl)}</Blockquote>
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
        {renderChildren(n, jiraUrl)}
      </Panel>
    ))
    .with({ type: 'mediaSingle' }, (n) => (
      <MediaSingle key={key}>{renderChildren(n, jiraUrl)}</MediaSingle>
    ))
    .with({ type: 'mediaGroup' }, (n) => (
      <MediaGroup key={key}>{renderChildren(n, jiraUrl)}</MediaGroup>
    ))
    .with({ type: 'media' }, (n) => <Media key={key} attrs={n.attrs} jiraUrl={jiraUrl} />)
    .with({ type: P.string }, (n) => <Unsupported key={key} type={n.type} />)
    .otherwise(() => <Unsupported key={key} type="unknown" />)
}

function renderChildren(node: AdfNode, jiraUrl: string | undefined): ReactNode {
  if (!Array.isArray(node.content)) return null
  return node.content.map((child, i) => renderNode(child, i, jiraUrl))
}
