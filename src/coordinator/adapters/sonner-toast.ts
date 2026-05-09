import { toast } from 'sonner'
import type { Toast } from '../ports'

export function createSonnerToastAdapter(): Toast {
  return {
    success: (message, opts) => toast.success(message, opts),
    error: (message, opts) => toast.error(message, opts),
  }
}
