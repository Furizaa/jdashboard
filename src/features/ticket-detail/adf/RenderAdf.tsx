import type { ReactNode } from 'react'
import type { AdfNode } from '~/server/jira'
import { Paragraph } from './nodes/Paragraph'
import { Heading } from './nodes/Heading'
import { Text } from './nodes/Text'
import { BulletList } from './nodes/BulletList'
import { OrderedList } from './nodes/OrderedList'
import { ListItem } from './nodes/ListItem'
import { CodeBlock } from './nodes/CodeBlock'
import { Blockquote } from './nodes/Blockquote'
import { HardBreak } from './nodes/HardBreak'
import { Rule } from './nodes/Rule'
import { Mention } from './nodes/Mention'
import { Emoji } from './nodes/Emoji'
import { Status } from './nodes/Status'
import { Panel } from './nodes/Panel'
import { Media, MediaGroup, MediaSingle } from './nodes/Media'
import { Unsupported } from './nodes/Unsupported'

export function RenderAdf({ doc, jiraUrl }: { doc: AdfNode | null; jiraUrl?: string }) {
  if (doc === null) return null
  return <div className="space-y-3">{renderChildren(doc, jiraUrl)}</div>
}

function renderNode(node: AdfNode, key: number, jiraUrl: string | undefined): ReactNode {
  switch (node.type) {
    case 'doc':
      return <div key={key}>{renderChildren(node, jiraUrl)}</div>
    case 'paragraph':
      return <Paragraph key={key}>{renderChildren(node, jiraUrl)}</Paragraph>
    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
      return (
        <Heading key={key} level={level}>
          {renderChildren(node, jiraUrl)}
        </Heading>
      )
    }
    case 'text':
      return <Text key={key} text={node.text ?? ''} marks={node.marks} />
    case 'bulletList':
      return <BulletList key={key}>{renderChildren(node, jiraUrl)}</BulletList>
    case 'orderedList':
      return <OrderedList key={key}>{renderChildren(node, jiraUrl)}</OrderedList>
    case 'listItem':
      return <ListItem key={key}>{renderChildren(node, jiraUrl)}</ListItem>
    case 'codeBlock':
      return <CodeBlock key={key}>{renderChildren(node, jiraUrl)}</CodeBlock>
    case 'blockquote':
      return <Blockquote key={key}>{renderChildren(node, jiraUrl)}</Blockquote>
    case 'hardBreak':
      return <HardBreak key={key} />
    case 'rule':
      return <Rule key={key} />
    case 'mention': {
      const text = typeof node.attrs?.text === 'string' ? node.attrs.text : ''
      return <Mention key={key} text={text} />
    }
    case 'emoji': {
      const text = typeof node.attrs?.text === 'string' ? node.attrs.text : undefined
      const shortName = typeof node.attrs?.shortName === 'string' ? node.attrs.shortName : undefined
      return <Emoji key={key} text={text} shortName={shortName} />
    }
    case 'status': {
      const text = typeof node.attrs?.text === 'string' ? node.attrs.text : ''
      const color = typeof node.attrs?.color === 'string' ? node.attrs.color : 'neutral'
      return <Status key={key} text={text} color={color} />
    }
    case 'panel': {
      const panelType = typeof node.attrs?.panelType === 'string' ? node.attrs.panelType : 'info'
      return (
        <Panel key={key} panelType={panelType}>
          {renderChildren(node, jiraUrl)}
        </Panel>
      )
    }
    case 'mediaSingle':
      return <MediaSingle key={key}>{renderChildren(node, jiraUrl)}</MediaSingle>
    case 'mediaGroup':
      return <MediaGroup key={key}>{renderChildren(node, jiraUrl)}</MediaGroup>
    case 'media':
      return <Media key={key} attrs={node.attrs} jiraUrl={jiraUrl} />
    default:
      return <Unsupported key={key} type={node.type ?? 'unknown'} />
  }
}

function renderChildren(node: AdfNode, jiraUrl: string | undefined): ReactNode {
  if (!Array.isArray(node.content)) return null
  return node.content.map((child, i) => renderNode(child, i, jiraUrl))
}
