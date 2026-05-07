import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createIssue, type CreateIssueResult } from '~/server/jira'
import { boardIssuesQueryKey } from '~/features/board'
import type { QuickCreateInput } from '~/server/jira/quick-create-schema'

const TIMEOUT_MS = 10_000

class CreateIssueTimeoutError extends Error {
  override readonly name = 'CreateIssueTimeoutError'
}

export function useCreateIssueMutation({
  closeModal,
  resetForm,
}: {
  closeModal: () => void
  resetForm: () => void
}) {
  const queryClient = useQueryClient()

  return useMutation<CreateIssueResult, Error, QuickCreateInput>({
    mutationFn: async (form) => {
      const controller = new AbortController()
      let timedOut = false
      const timeoutId = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, TIMEOUT_MS)
      try {
        return await createIssue({ data: form, signal: controller.signal })
      } catch (err) {
        if (timedOut) {
          throw new CreateIssueTimeoutError('Request timed out')
        }
        throw err
      } finally {
        clearTimeout(timeoutId)
      }
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error('Failed to create ticket')
        return
      }
      queryClient.invalidateQueries({ queryKey: boardIssuesQueryKey })
      toast.success(`Created ${result.key}`)
      resetForm()
      closeModal()
    },
    onError: (error) => {
      if (error instanceof CreateIssueTimeoutError) {
        toast.error('Request timed out — try again')
        return
      }
      toast.error('Failed to create ticket')
    },
  })
}
