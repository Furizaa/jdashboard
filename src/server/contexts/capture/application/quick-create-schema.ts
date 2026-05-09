import { z } from 'zod'

export const quickCreateSchema = z.object({
  type: z.enum(['Bug', 'Task', 'Improvement']),
  parentKey: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().min(1),
})

export type QuickCreateInput = z.infer<typeof quickCreateSchema>
