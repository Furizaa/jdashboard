import type { CreateIssueResult, GetMyEpicsResult, QuickCreateInput } from '~/kernel'

export interface CaptureGateway {
  createIssue(input: QuickCreateInput, signal?: AbortSignal): Promise<CreateIssueResult>
  loadMyEpics(): Promise<GetMyEpicsResult>
}
