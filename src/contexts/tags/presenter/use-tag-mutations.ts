import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DASHBOARD_QUERY_KEYS } from '~/coordinator/adapters/tanstack-cache'
import type { TagMutationResult } from '~/kernel'
import {
  attachTagToTicket,
  createTag,
  deleteTag,
  detachTagFromTicket,
  updateTag,
} from '~/server/server-functions/tags'

// All tag mutations invalidate the single shared tags query on success; there is
// no optimistic patch/rollback (local file I/O is fast and never partially
// applies), mirroring how the watchlist mutations invalidate rather than patch.

export function useInvalidateTags(): () => void {
  const queryClient = useQueryClient()
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.tags })
  }, [queryClient])
}

export function useCreateTag(): {
  create: (input: { name: string; colorId: string }) => Promise<TagMutationResult>
  isPending: boolean
} {
  const invalidate = useInvalidateTags()
  const mutation = useMutation<TagMutationResult, Error, { name: string; colorId: string }>({
    mutationFn: (data) => createTag({ data }),
    onSuccess: () => invalidate(),
  })
  return { create: mutation.mutateAsync, isPending: mutation.isPending }
}

export function useUpdateTag(): {
  update: (input: { id: string; name?: string; colorId?: string }) => Promise<TagMutationResult>
  isPending: boolean
} {
  const invalidate = useInvalidateTags()
  const mutation = useMutation<
    TagMutationResult,
    Error,
    { id: string; name?: string; colorId?: string }
  >({
    mutationFn: (data) => updateTag({ data }),
    onSuccess: () => invalidate(),
  })
  return { update: mutation.mutateAsync, isPending: mutation.isPending }
}

export function useDeleteTag(): {
  remove: (id: string) => Promise<TagMutationResult>
  isPending: boolean
} {
  const invalidate = useInvalidateTags()
  const mutation = useMutation<TagMutationResult, Error, string>({
    mutationFn: (id) => deleteTag({ data: { id } }),
    onSuccess: () => invalidate(),
  })
  return { remove: mutation.mutateAsync, isPending: mutation.isPending }
}

export function useAttachTag(): {
  attach: (issueKey: string, tagId: string) => Promise<TagMutationResult>
  isPending: boolean
} {
  const invalidate = useInvalidateTags()
  const mutation = useMutation<TagMutationResult, Error, { issueKey: string; tagId: string }>({
    mutationFn: (data) => attachTagToTicket({ data }),
    onSuccess: () => invalidate(),
  })
  return {
    attach: (issueKey, tagId) => mutation.mutateAsync({ issueKey, tagId }),
    isPending: mutation.isPending,
  }
}

export function useDetachTag(): {
  detach: (issueKey: string, tagId: string) => Promise<TagMutationResult>
  isPending: boolean
} {
  const invalidate = useInvalidateTags()
  const mutation = useMutation<TagMutationResult, Error, { issueKey: string; tagId: string }>({
    mutationFn: (data) => detachTagFromTicket({ data }),
    onSuccess: () => invalidate(),
  })
  return {
    detach: (issueKey, tagId) => mutation.mutateAsync({ issueKey, tagId }),
    isPending: mutation.isPending,
  }
}
