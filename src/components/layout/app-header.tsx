import { Cloud, Download, FileCode2, Moon, RotateCcw, ShieldAlert, Sun, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { getLayoutedElements } from '../../features/diagram/auto-layout'
import { useDiagramStore } from '../../features/diagram/diagram-store'
import { terraformMainTfToDiagram } from '../../features/diagram/reverseMapper'
import { generateTerraformFiles } from '../../features/terraform/terraform-generator'
import { validateDiagram } from '../../features/terraform/validation'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { ToastViewport, type ToastItem } from '../ui/toast'
import { useThemeStore } from '../../features/ui/theme-store'

export function AppHeader() {
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const nodes = useDiagramStore((state) => state.nodes)
  const edges = useDiagramStore((state) => state.edges)
  const resetCanvas = useDiagramStore((state) => state.resetCanvas)
  const exportDiagram = useDiagramStore((state) => state.exportDiagram)
  const importDiagram = useDiagramStore((state) => state.importDiagram)
  const loadImportedDiagram = useDiagramStore((state) => state.loadImportedDiagram)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'main.tf' | 'variables.tf' | 'outputs.tf'>(
    'main.tf',
  )
  const [terraformFiles, setTerraformFiles] = useState<{
    'main.tf': string
    'variables.tf': string
    'outputs.tf': string
  }>({ 'main.tf': '', 'variables.tf': '', 'outputs.tf': '' })
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const tfImportInputRef = useRef<HTMLInputElement | null>(null)

  const pushToast = (
    title: string,
    description?: string,
    variant: ToastItem['variant'] = 'default',
  ) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current, { id, title, description, variant }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3200)
  }

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  const onMakeIt = () => {
    const validationErrors = validateDiagram(nodes, edges)
    if (validationErrors.length > 0) {
      validationErrors.forEach((error) => {
        pushToast('Validation error', error, 'destructive')
      })
      return
    }

    const generated = generateTerraformFiles(nodes, edges)
    setTerraformFiles({
      'main.tf': generated.mainTf,
      'variables.tf': generated.variablesTf,
      'outputs.tf': generated.outputsTf,
    })
    setActiveTab('main.tf')
    setDialogOpen(true)
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(terraformFiles[activeTab])
      pushToast('Copied!', `${activeTab} copied to clipboard.`)
    } catch {
      pushToast('Copy failed', 'Could not access clipboard in this browser.', 'destructive')
    }
  }

  const onDownloadMainTf = () => {
    const workflowYaml = [
      `name: 'Terraform Deploy'`,
      `on:`,
      `  push:`,
      `    branches: [ "main" ]`,
      `jobs:`,
      `  terraform:`,
      `    runs-on: ubuntu-latest`,
      `    steps:`,
      `      - uses: actions/checkout@v3`,
      `      - uses: hashicorp/setup-terraform@v2`,
      `      - run: terraform init`,
      `      - run: terraform plan`,
      `      - run: terraform apply -auto-approve`,
      ``,
    ].join('\n')

    const zip = new JSZip()
    zip.file('main.tf', terraformFiles['main.tf'])
    zip.file('variables.tf', terraformFiles['variables.tf'])
    zip.file('outputs.tf', terraformFiles['outputs.tf'])
    zip.file('.github/workflows/deploy.yml', workflowYaml)

    zip
      .generateAsync({ type: 'blob' })
      .then((content) => {
        saveAs(content, 'infrastructure-bundle.zip')
        pushToast('Downloaded', 'Saved infrastructure-bundle.zip locally.')
      })
      .catch(() => {
        pushToast('Download failed', 'Could not generate ZIP bundle.', 'destructive')
      })
  }

  const onSaveJson = () => {
    const snapshot = exportDiagram()
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `aws-visual-builder-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    pushToast('Saved', 'Diagram exported to JSON.')
  }

  const onLoadJsonClick = () => {
    importInputRef.current?.click()
  }

  const onImportTfClick = () => {
    tfImportInputRef.current?.click()
  }

  const onImportTf = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const { nodes, edges } = terraformMainTfToDiagram(text)
      if (nodes.length === 0) {
        throw new Error('No supported AWS resources found in this file.')
      }
      const laidOut = getLayoutedElements(nodes, edges)
      loadImportedDiagram(laidOut.nodes, laidOut.edges)
      pushToast('Imported Terraform', `Loaded ${nodes.length} resource(s) from ${file.name}.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not parse Terraform file.'
      pushToast('Import failed', message, 'destructive')
    } finally {
      event.target.value = ''
    }
  }

  const onLoadJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as { nodes?: unknown; edges?: unknown }
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        throw new Error('Invalid diagram file structure.')
      }
      importDiagram({
        nodes: parsed.nodes as ReturnType<typeof exportDiagram>['nodes'],
        edges: parsed.edges as ReturnType<typeof exportDiagram>['edges'],
      })
      pushToast('Loaded', `Imported diagram from ${file.name}.`)
    } catch {
      pushToast('Load failed', 'Selected file is not a valid diagram JSON.', 'destructive')
    } finally {
      event.target.value = ''
    }
  }

  const onReset = () => {
    resetCanvas()
    pushToast('Canvas cleared', 'You can start drawing again from scratch.')
  }

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b bg-card px-5">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">
            AWS Visual Terraform Builder
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            accept="application/json"
            className="hidden"
            type="file"
            onChange={onLoadJson}
          />
          <input
            ref={tfImportInputRef}
            accept=".tf,.txt,text/plain"
            className="hidden"
            type="file"
            onChange={onImportTf}
          />
          <Button
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            size="sm"
            variant="outline"
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={onReset}>
            <RotateCcw className="mr-1 h-4 w-4" />
            Reset
          </Button>
          <Button size="sm" variant="outline" onClick={onSaveJson}>
            <Download className="mr-1 h-4 w-4" />
            Save as JSON
          </Button>
          <Button size="sm" variant="outline" onClick={onLoadJsonClick}>
            <Upload className="mr-1 h-4 w-4" />
            Load File
          </Button>
          <Button size="sm" variant="outline" onClick={onImportTfClick}>
            <FileCode2 className="mr-1 h-4 w-4" />
            Import .tf
          </Button>
          <Button className="min-w-24" onClick={onMakeIt}>
            Make it!
          </Button>
        </div>
      </header>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generated Terraform</DialogTitle>
            <DialogDescription>
              Review the generated HCL and copy it into your Terraform project.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex gap-2">
            {(['main.tf', 'variables.tf', 'outputs.tf'] as const).map((tab) => (
              <Button
                key={tab}
                size="sm"
                variant={activeTab === tab ? 'default' : 'outline'}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </Button>
            ))}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              DevSecOps Check: Remember to scan this generated code with tfsec or checkov in
              your CI/CD pipeline before deploying to production.
            </p>
          </div>

          <textarea
            readOnly
            className="mt-3 h-[420px] w-full rounded-md border border-input bg-muted/30 p-3 font-mono text-xs leading-5 outline-none"
            value={terraformFiles[activeTab]}
          />

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onDownloadMainTf}>
              Download ZIP bundle
            </Button>
            <Button onClick={onCopy}>Copy to Clipboard</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
