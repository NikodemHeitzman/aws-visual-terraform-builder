import { create } from 'zustand'

const STORAGE_KEY = 'aws-vtf-diagram-settings'

type DiagramSettingsState = {
  hoverFocusDelayMs: number
  edgeColor: string
  edgeSelectedColor: string
  edgeStrokeWidth: number
  shortcutCopy: string
  shortcutPaste: string
  shortcutDuplicate: string
  setHoverFocusDelayMs: (ms: number) => void
  setEdgeColor: (color: string) => void
  setEdgeSelectedColor: (color: string) => void
  setEdgeStrokeWidth: (width: number) => void
  setShortcutCopy: (key: string) => void
  setShortcutPaste: (key: string) => void
  setShortcutDuplicate: (key: string) => void
}

function loadInitial() {
  if (typeof window === 'undefined') {
    return {
      hoverFocusDelayMs: 3000,
      edgeColor: '#64748b',
      edgeSelectedColor: '#2563eb',
      edgeStrokeWidth: 2.5,
      shortcutCopy: 'c',
      shortcutPaste: 'v',
      shortcutDuplicate: 'd',
    }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) throw new Error('missing')
    const parsed = JSON.parse(raw) as Partial<DiagramSettingsState>
    return {
      hoverFocusDelayMs: Number(parsed.hoverFocusDelayMs ?? 3000),
      edgeColor: parsed.edgeColor ?? '#64748b',
      edgeSelectedColor: parsed.edgeSelectedColor ?? '#2563eb',
      edgeStrokeWidth: Number(parsed.edgeStrokeWidth ?? 2.5),
      shortcutCopy: String(parsed.shortcutCopy ?? 'c').toLowerCase().slice(0, 1),
      shortcutPaste: String(parsed.shortcutPaste ?? 'v').toLowerCase().slice(0, 1),
      shortcutDuplicate: String(parsed.shortcutDuplicate ?? 'd').toLowerCase().slice(0, 1),
    }
  } catch {
    return {
      hoverFocusDelayMs: 3000,
      edgeColor: '#64748b',
      edgeSelectedColor: '#2563eb',
      edgeStrokeWidth: 2.5,
      shortcutCopy: 'c',
      shortcutPaste: 'v',
      shortcutDuplicate: 'd',
    }
  }
}

function persist(state: Pick<
  DiagramSettingsState,
  | 'hoverFocusDelayMs'
  | 'edgeColor'
  | 'edgeSelectedColor'
  | 'edgeStrokeWidth'
  | 'shortcutCopy'
  | 'shortcutPaste'
  | 'shortcutDuplicate'
>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

const initial = loadInitial()

export const useDiagramSettingsStore = create<DiagramSettingsState>((set, get) => ({
  ...initial,
  setHoverFocusDelayMs: (ms) => {
    const next = Math.max(0, Math.min(10000, Math.round(ms)))
    set({ hoverFocusDelayMs: next })
    persist({ ...get(), hoverFocusDelayMs: next })
  },
  setEdgeColor: (color) => {
    set({ edgeColor: color })
    persist({ ...get(), edgeColor: color })
  },
  setEdgeSelectedColor: (color) => {
    set({ edgeSelectedColor: color })
    persist({ ...get(), edgeSelectedColor: color })
  },
  setEdgeStrokeWidth: (width) => {
    const next = Math.max(1, Math.min(8, Number(width)))
    set({ edgeStrokeWidth: next })
    persist({ ...get(), edgeStrokeWidth: next })
  },
  setShortcutCopy: (key) => {
    const next = key.toLowerCase().slice(0, 1) || 'c'
    set({ shortcutCopy: next })
    persist({ ...get(), shortcutCopy: next })
  },
  setShortcutPaste: (key) => {
    const next = key.toLowerCase().slice(0, 1) || 'v'
    set({ shortcutPaste: next })
    persist({ ...get(), shortcutPaste: next })
  },
  setShortcutDuplicate: (key) => {
    const next = key.toLowerCase().slice(0, 1) || 'd'
    set({ shortcutDuplicate: next })
    persist({ ...get(), shortcutDuplicate: next })
  },
}))

