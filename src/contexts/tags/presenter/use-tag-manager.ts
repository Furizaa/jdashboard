import { useReducer } from 'react'
import { toast } from 'sonner'
import type { TagDefinition } from '~/kernel'
import { canSubmitDraft, initialState, reduce } from '../view-model/tag-manager-view-model'
import { useCreateTag, useDeleteTag, useUpdateTag } from './use-tag-mutations'
import { useTagDefinitions } from './use-tags'

export type TagManagerApi = {
  open: boolean
  setOpen: (open: boolean) => void
  openModal: () => void
  definitions: readonly TagDefinition[]
  draftName: string
  draftColorId: string
  setDraftName: (name: string) => void
  setDraftColor: (colorId: string) => void
  canSubmit: boolean
  isCreating: boolean
  submitDraft: () => Promise<void>
  renameTag: (id: string, name: string) => Promise<void>
  recolorTag: (id: string, colorId: string) => Promise<void>
  deleteTag: (id: string) => Promise<void>
}

// Thin React shell over the tag-manager reducer + the tag mutations. The reducer
// owns the create-draft state; edits to existing tags flow straight to the
// mutation hooks (the row components hold their own inline-edit state).
export function useTagManager(): TagManagerApi {
  const [state, dispatch] = useReducer(reduce, initialState)
  const definitions = useTagDefinitions()
  const { create, isPending: isCreating } = useCreateTag()
  const { update } = useUpdateTag()
  const { remove } = useDeleteTag()

  const submitDraft = async () => {
    if (!canSubmitDraft(state)) return
    const result = await create({ name: state.draftName, colorId: state.draftColorId })
    if (!result.ok) {
      toast.error(`Create tag failed: ${result.error.message}`)
      return
    }
    dispatch({ type: 'draftSubmitted' })
  }

  const renameTag = async (id: string, name: string) => {
    if (name.trim().length === 0) return
    const result = await update({ id, name })
    if (!result.ok) toast.error(`Rename tag failed: ${result.error.message}`)
  }

  const recolorTag = async (id: string, colorId: string) => {
    const result = await update({ id, colorId })
    if (!result.ok) toast.error(`Recolour tag failed: ${result.error.message}`)
  }

  const deleteTag = async (id: string) => {
    const result = await remove(id)
    if (!result.ok) toast.error(`Delete tag failed: ${result.error.message}`)
  }

  return {
    open: state.open,
    setOpen: (open) => dispatch({ type: open ? 'opened' : 'closed' }),
    openModal: () => dispatch({ type: 'opened' }),
    definitions,
    draftName: state.draftName,
    draftColorId: state.draftColorId,
    setDraftName: (name) => dispatch({ type: 'draftNameChanged', name }),
    setDraftColor: (colorId) => dispatch({ type: 'draftColorChanged', colorId }),
    canSubmit: canSubmitDraft(state),
    isCreating,
    submitDraft,
    renameTag,
    recolorTag,
    deleteTag,
  }
}
