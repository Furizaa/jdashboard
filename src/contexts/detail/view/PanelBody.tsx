import type { DetailIssue } from '~/kernel'
import { extractPlainText } from '../domain'
import { Activity } from './Activity'
import { NoDescription } from './NoDescription'
import { PropertiesRail } from './PropertiesRail'
import { Relationships } from './Relationships'
import { RenderAdf } from './adf'

export function PanelBody({
  issue,
  onOpen,
  jiraBaseUrl,
}: {
  issue: DetailIssue
  onOpen: (key: string) => void
  jiraBaseUrl: string
}) {
  const hasDescription = extractPlainText(issue.description).length > 0

  return (
    <div className="grid grid-cols-[1fr_180px] gap-6 p-6">
      <div className="min-w-0">
        <h1 className="text-foreground text-xl leading-tight font-semibold">{issue.summary}</h1>
        <div className="mt-5">
          {hasDescription ? (
            <RenderAdf doc={issue.description} jiraBaseUrl={jiraBaseUrl} />
          ) : (
            <NoDescription />
          )}
        </div>
        <Relationships
          parent={issue.parent}
          subIssues={issue.subIssues}
          links={issue.links}
          onOpen={onOpen}
        />
        <Activity comments={issue.comments} jiraBaseUrl={jiraBaseUrl} />
      </div>
      <PropertiesRail issue={issue} />
    </div>
  )
}
