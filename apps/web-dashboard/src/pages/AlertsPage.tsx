import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { AlertQueuePanel }    from '@/components/alert/AlertQueuePanel'
import { AlertWorkflowPanel } from '@/components/alert/AlertWorkflowPanel'
import { AlertContextPanel }  from '@/components/alert/AlertContextPanel'
import { useAlert }           from '@/hooks/queries'
import { useAuthStore }       from '@/stores/auth.store'
import {
  ShieldAlert, ChevronLeft,
  PanelLeftClose, PanelLeft, PanelRightClose, PanelRight,
} from 'lucide-react'

// ─────────────────────────────────────────────
// ANALYST ALERT CENTER — 3-pane layout
//
//  LEFT (w-72):  AlertQueuePanel   — prioritized queue
//  CENTER:       AlertWorkflowPanel — investigation workspace
//  RIGHT (w-72): AlertContextPanel  — entity risk + MITRE
// ─────────────────────────────────────────────

export default function AlertsPage() {
  const { id: alertId }  = useParams<{ id?: string }>()
  const user             = useAuthStore(s => s.user)

  const [leftOpen,  setLeftOpen]  = useState(true)
  const [rightOpen, setRightOpen] = useState(true)

  const { data: alertData } = useAlert(alertId ?? '')
  const alert = alertData?.data

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === '[' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); setLeftOpen(v => !v)
      }
      if (e.key === ']' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); setRightOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950">

      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center justify-between
                         px-4 py-2.5 border-b border-gray-800 bg-gray-950/95 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <Link to="/dashboard"
            className="p-1.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <ShieldAlert className="h-4 w-4 text-red-400" />
          <span className="text-sm font-bold text-gray-100">Alert Center</span>

          {/* Panel toggles */}
          <div className="hidden lg:flex items-center gap-1 ml-3">
            <button
              onClick={() => setLeftOpen(v => !v)}
              className={clsx(
                'p-1.5 rounded transition-colors',
                leftOpen ? 'text-blue-400 bg-blue-500/10' : 'text-gray-600 hover:text-gray-400',
              )}
              title="Toggle queue (⌘[)"
            >
              {leftOpen
                ? <PanelLeftClose className="h-4 w-4" />
                : <PanelLeft      className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setRightOpen(v => !v)}
              className={clsx(
                'p-1.5 rounded transition-colors',
                rightOpen ? 'text-blue-400 bg-blue-500/10' : 'text-gray-600 hover:text-gray-400',
              )}
              title="Toggle context (⌘])"
            >
              {rightOpen
                ? <PanelRightClose className="h-4 w-4" />
                : <PanelRight      className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {alert && (
            <p className="hidden md:block text-sm text-gray-500 max-w-md truncate">
              {alert.title}
            </p>
          )}
          <span className="text-xs text-gray-700">{user?.role}</span>
        </div>
      </header>

      {/* 3-pane body */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — Alert queue */}
        <div className={clsx(
          'flex-shrink-0 border-r border-gray-800 overflow-hidden',
          'transition-all duration-200 ease-in-out',
          leftOpen ? 'w-72 xl:w-80' : 'w-0',
        )}>
          {leftOpen && <AlertQueuePanel />}
        </div>

        {/* CENTER — Workflow */}
        <div className="flex-1 overflow-hidden">
          {alertId ? (
            <AlertWorkflowPanel alertId={alertId} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="rounded-full bg-gray-800 p-6 mb-5">
                <ShieldAlert className="h-10 w-10 text-gray-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-300 mb-2">
                Select an alert to investigate
              </h3>
              <p className="text-sm text-gray-500 max-w-sm">
                Choose an alert from the queue to begin investigation.
                P1 alerts are shown first.
              </p>
              <div className="mt-6 flex items-center gap-4 text-xs text-gray-700">
                <span><kbd className="px-2 py-1 rounded bg-gray-800 border border-gray-700 font-mono">⌘[</kbd> Queue</span>
                <span><kbd className="px-2 py-1 rounded bg-gray-800 border border-gray-700 font-mono">⌘]</kbd> Context</span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Context */}
        <div className={clsx(
          'flex-shrink-0 border-l border-gray-800 overflow-hidden',
          'transition-all duration-200 ease-in-out',
          rightOpen && alertId ? 'w-72 xl:w-80' : 'w-0',
        )}>
          {rightOpen && alertId && alert && (
            <AlertContextPanel alert={alert} />
          )}
        </div>

      </div>
    </div>
  )
}
