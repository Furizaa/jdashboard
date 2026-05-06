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

export function RenderAdf({ doc }: { doc: AdfNode | null }) {
  if (doc === null) return null
  return <div className="space-y-3">{renderChildren(doc)}</div>
}

function renderNode(node: AdfNode, key: number): ReactNode {
  switch (node.type) {
    case 'doc':
      return <div key={key}>{renderChildren(node)}</div>
    case 'paragraph':
      return <Paragraph key={key}>{renderChildren(node)}</Paragraph>
    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
      return (
        <Heading key={key} level={level}>
          {renderChildren(node)}
        </Heading>
      )
    }
    case 'text':
      return <Text key={key} text={node.text ?? ''} marks={node.marks} />
    case 'bulletList':
      return <BulletList key={key}>{renderChildren(node)}</BulletList>
    case 'orderedList':
      return <OrderedList key={key}>{renderChildren(node)}</OrderedList>
    case 'listItem':
      return <ListItem key={key}>{renderChildren(node)}</ListItem>
    case 'codeBlock':
      return <CodeBlock key={key}>{renderChildren(node)}</CodeBlock>
    case 'blockquote':
      return <Blockquote key={key}>{renderChildren(node)}</Blockquote>
    case 'hardBreak':
      return <HardBreak key={key} />
    case 'rule':
      return <Rule key={key} />
    default:
      return <span key={key}>{renderChildren(node)}</span>
  }
}

function renderChildren(node: AdfNode): ReactNode {
  if (!Array.isArray(node.content)) return null
  return node.content.map((child, i) => renderNode(child, i))
}
