import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  transitionIssue,
  type GetIssueResult,
  type SearchIssuesResult,
  type TransitionIssueResult,
} from '~/server/jira'
import { boardIssuesQueryKey } from '~/features/board'
import { issueQueryKey } from '~/features/ticket-detail'

type Variables = {
  key: string
  transitionId: string
  toStatusName: string
}

type Context = {
  prevBoard: SearchIssuesResult | undefined
  prevIssue: GetIssueResult | undefined
}

export function useTransitionMutation() {
  const queryClient = useQueryClient()

  return useMutation<TransitionIssueResult, Error, Variables, Context>({
    mutationFn: ({ key, transitionId }) => transitionIssue({ data: { key, transitionId } }),

    async onMutate({ key, toStatusName }) {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: boardIssuesQueryKey }),
        queryClient.cancelQueries({ queryKey: issueQueryKey(key) }),
      ])

      const prevBoard = queryClient.getQueryData<SearchIssuesResult>(boardIssuesQueryKey)
      const prevIssue = queryClient.getQueryData<GetIssueResult>(issueQueryKey(key))

      if (prevBoard?.ok) {
        queryClient.setQueryData<SearchIssuesResult>(boardIssuesQueryKey, {
          ...prevBoard,
          issues: prevBoard.issues.map((issue) =>
            issue.key === key ? { ...issue, statusName: toStatusName } : issue,
          ),
        })
      }

      if (prevIssue?.ok) {
        queryClient.setQueryData<GetIssueResult>(issueQueryKey(key), {
          ...prevIssue,
          issue: { ...prevIssue.issue, statusName: toStatusName },
        })
      }

      return { prevBoard, prevIssue }
    },

    onError(_err, variables, context) {
      if (context?.prevBoard !== undefined) {
        queryClient.setQueryData(boardIssuesQueryKey, context.prevBoard)
      }
      if (context?.prevIssue !== undefined) {
        queryClient.setQueryData(issueQueryKey(variables.key), context.prevIssue)
      }
      toast.error(`Couldn't change status: ${_err.message}`)
    },

    onSuccess(result, variables, context) {
      if (!result.ok) {
        if (context?.prevBoard !== undefined) {
          queryClient.setQueryData(boardIssuesQueryKey, context.prevBoard)
        }
        if (context?.prevIssue !== undefined) {
          queryClient.setQueryData(issueQueryKey(variables.key), context.prevIssue)
        }
        toast.error(result.message)
        return
      }
      queryClient.invalidateQueries({ queryKey: issueQueryKey(variables.key) })
      queryClient.invalidateQueries({ queryKey: ['jira', 'transitions', variables.key] })
    },
  })
}
