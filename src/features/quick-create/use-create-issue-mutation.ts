import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createIssue, type CreateIssueResult } from '~/server/jira'
import { boardIssuesQueryKey } from '~/features/board'
import type { QuickCreateInput } from '~/server/jira/quick-create-schema'

export function useCreateIssueMutation({
  closeModal,
  resetForm,
}: {
  closeModal: () => void
  resetForm: () => void
}) {
  const queryClient = useQueryClient()

  return useMutation<CreateIssueResult, Error, QuickCreateInput>({
    mutationFn: (form) => createIssue({ data: form }),
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
    onError: () => {
      toast.error('Failed to create ticket')
    },
  })
}
