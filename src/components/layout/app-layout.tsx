import { AppHeader } from './app-header'
import { ResourceSidebar } from './resource-sidebar'
import { ArchitectureCanvas } from '../../features/diagram/architecture-canvas'
import { NodePropertiesPanel } from '../../features/diagram/node-properties-panel'

export function AppLayout() {
  return (
    <div className="h-screen bg-background text-foreground">
      <AppHeader />
      <main className="flex h-[calc(100vh-4rem)]">
        <ResourceSidebar />
        <ArchitectureCanvas />
        <NodePropertiesPanel />
      </main>
    </div>
  )
}
