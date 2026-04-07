export function CanvasShell() {
  return (
    <section className="flex h-full flex-1 items-center justify-center bg-muted/30">
      <div className="rounded-lg border border-dashed border-border bg-background px-8 py-6 text-center">
        <p className="text-sm font-medium text-foreground">Canvas Placeholder</p>
        <p className="mt-1 text-sm text-muted-foreground">
          React Flow canvas will be initialized in Step 2.
        </p>
      </div>
    </section>
  )
}
