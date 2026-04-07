import { useMemo, useState } from 'react'
import {
  AWS_RESOURCES,
  RESOURCE_DND_MIME,
} from '../../features/diagram/aws-resources'
import { AWS_ICON_PATHS } from '../../features/icons/aws-icon-registry'
import { cn } from '../../lib/utils'

export function ResourceSidebar() {
  const [query, setQuery] = useState('')
  const filteredResources = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return AWS_RESOURCES
    return AWS_RESOURCES.filter(({ label, type }) => {
      return label.toLowerCase().includes(q) || type.toLowerCase().includes(q)
    })
  }, [query])

  return (
    <aside className="w-72 border-r bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        AWS Resources
      </h2>

      <input
        className="mb-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        type="text"
        placeholder="Szukaj zasobów..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <div className="space-y-2">
        {filteredResources.map(({ type, label, accentClassName, Icon }) => (
          <button
            key={type}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-accent"
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(RESOURCE_DND_MIME, type)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            <span
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded border',
                accentClassName,
              )}
            >
              {AWS_ICON_PATHS[type] ? (
                <img
                  alt={`${label} icon`}
                  className="h-4 w-4 object-contain"
                  src={AWS_ICON_PATHS[type]}
                />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </span>
            <span>{label}</span>
          </button>
        ))}
        {filteredResources.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            Brak wyników dla "{query}".
          </p>
        )}
      </div>
    </aside>
  )
}
