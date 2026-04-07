import { ChevronLeft, ChevronRight, PanelLeftClose, PanelRightClose } from 'lucide-react'
import { useState } from 'react'
import { AppHeader } from './app-header'
import { ResourceSidebar } from './resource-sidebar'
import { ArchitectureCanvas } from '../../features/diagram/architecture-canvas'
import { NodePropertiesPanel } from '../../features/diagram/node-properties-panel'
import { Button } from '../ui/button'

export function AppLayout() {
  const [isResourcesOpen, setIsResourcesOpen] = useState(true)
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true)

  return (
    <div className="h-screen bg-background text-foreground">
      <AppHeader />
      <main className="relative flex h-[calc(100vh-4rem)]">
        {isResourcesOpen && <ResourceSidebar />}
        <ArchitectureCanvas />

        {isPropertiesOpen && <NodePropertiesPanel />}

        <div className="pointer-events-none absolute left-2 top-2 z-20 flex gap-2">
          <Button
            className="pointer-events-auto"
            size="sm"
            variant="secondary"
            title={isResourcesOpen ? 'Hide AWS Resources panel' : 'Show AWS Resources panel'}
            onClick={() => setIsResourcesOpen((v) => !v)}
          >
            {isResourcesOpen ? (
              <>
                <PanelLeftClose className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">Hide resources</span>
              </>
            ) : (
              <>
                <ChevronRight className="mr-1 h-4 w-4" />
                <span className="hidden sm:inline">Show resources</span>
              </>
            )}
          </Button>
        </div>

        <div className="pointer-events-none absolute right-2 top-2 z-20 flex gap-2">
          <Button
            className="pointer-events-auto"
            size="sm"
            variant="secondary"
            title={isPropertiesOpen ? 'Hide Properties panel' : 'Show Properties panel'}
            onClick={() => setIsPropertiesOpen((v) => !v)}
          >
            {isPropertiesOpen ? (
              <>
                <span className="hidden sm:inline">Hide properties</span>
                <PanelRightClose className="ml-1 h-4 w-4" />
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Show properties</span>
                <ChevronLeft className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </main>
    </div>
  )
}
