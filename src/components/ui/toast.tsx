import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { cn } from '../../lib/utils'

export type ToastItem = {
  id: number
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}

type ToastViewportProps = {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'rounded-md border bg-card p-3 shadow-lg',
            toast.variant === 'destructive' &&
              'border-red-400/60 bg-red-950/40 dark:border-red-500/50 dark:bg-red-950/50',
          )}
        >
          <div className="flex items-start gap-2">
            {toast.variant === 'destructive' ? (
              <AlertCircle className="mt-0.5 h-4 w-4 text-red-600 dark:text-red-400" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {toast.description}
                </p>
              ) : null}
            </div>
            <button
              className="rounded p-1 text-muted-foreground hover:bg-accent"
              type="button"
              onClick={() => onDismiss(toast.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
