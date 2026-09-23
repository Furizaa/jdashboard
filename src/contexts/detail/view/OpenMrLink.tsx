import { useMrRef } from '../presenter'
import { ExternalLinkButton } from './ExternalLinkButton'

export function OpenMrLink({ issueKey }: { issueKey: string }) {
  const mr = useMrRef(issueKey)
  if (mr === null) return null
  return <ExternalLinkButton href={mr.webUrl}>Open MR</ExternalLinkButton>
}
