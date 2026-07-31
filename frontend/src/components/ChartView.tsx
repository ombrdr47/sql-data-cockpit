/**
 * components/ChartView.tsx
 * Renders an interactive Plotly chart from the python_tool node.
 *
 * Modebar fix: displayModeBar is 'hover' (shows on mouse-over).
 * Restored zoom in/out, pan, autoscale, and reset buttons while keeping
 * non-essential 3d/lasso buttons removed.
 * Added automargin: true on axes for dynamic blank space border adjustment.
 * Uses ResizeObserver to ensure smooth resizing without label overlaps on expand/collapse.
 */
import { useState, useMemo, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

interface ChartViewProps {
  base64: string // Plotly JSON string (field named base64 for backward compat)
}

/** Minimal type for the Plotly global loaded via CDN script tag. */
interface PlotlyLib {
  newPlot: (el: HTMLElement, data: unknown[], layout: unknown, config: unknown) => void
  react:   (el: HTMLElement, data: unknown[], layout: unknown, config: unknown) => void
  purge:   (el: HTMLElement) => void
  Plots:   { resize: (el: HTMLElement) => void }
}

// Buttons we want to REMOVE from the modebar — keeping zoom in/out, pan, reset, autoscale, download PNG
const MODEBAR_REMOVE = [
  'select2d', 'lasso2d',
  'zoom3d', 'pan3d', 'orbitRotation', 'tableRotation',
  'handleDrag3d', 'resetCameraDefault3d', 'resetCameraLastSave3d',
  'hoverClosest3d', 'hoverClosestCartesian', 'hoverCompareCartesian',
  'hoverClosestGl2d', 'hoverClosestPie',
  'toggleHover', 'resetViews', 'toggleSpikelines',
]

export default function ChartView({ base64 }: ChartViewProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const plotRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const plotData = useMemo(() => {
    try {
      return JSON.parse(base64)
    } catch (e) {
      console.error('Failed to parse Plotly JSON:', e)
      return null
    }
  }, [base64])

  useEffect(() => {
    const Plotly = (window as Window & { Plotly?: PlotlyLib }).Plotly
    if (!plotData || !plotRef.current || !Plotly) return

    const layout = {
      ...plotData.layout,
      autosize: true,
      // Default margins with automargin on axes so blank space border dynamically adjusts
      margin: {
        t: plotData.layout?.margin?.t ?? 40,
        r: plotData.layout?.margin?.r ?? 20,
        l: plotData.layout?.margin?.l ?? 40,
        b: plotData.layout?.margin?.b ?? 40,
      },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'rgba(255,255,255,0.03)',
      font: { color: '#94a3b8', family: 'Inter, system-ui, sans-serif', size: 12 },
      title: {
        ...plotData.layout?.title,
        font: { color: '#e2e8f0', size: 14, family: 'Inter, system-ui, sans-serif' },
        x: 0.5,
        xanchor: 'center',
      },
      xaxis: {
        ...plotData.layout?.xaxis,
        automargin: true,
        gridcolor: 'rgba(148,163,184,0.08)',
        linecolor: 'rgba(148,163,184,0.15)',
        tickcolor: 'rgba(148,163,184,0.3)',
        tickfont: { color: '#64748b', size: 11 },
      },
      yaxis: {
        ...plotData.layout?.yaxis,
        automargin: true,
        gridcolor: 'rgba(148,163,184,0.08)',
        linecolor: 'rgba(148,163,184,0.15)',
        tickcolor: 'rgba(148,163,184,0.3)',
        tickfont: { color: '#64748b', size: 11 },
      },
    }

    const config = {
      responsive: true,
      // Only show the modebar on hover, NOT permanently floating on the chart
      displayModeBar: 'hover' as const,
      // Remove unwanted buttons, keeping zoom in/out, pan, autoscale, reset, download
      modeBarButtonsToRemove: MODEBAR_REMOVE,
      toImageButtonOptions: {
        format: 'png',
        filename: 'chart',
        scale: 2,
      },
      displaylogo: false,
    }

    Plotly.newPlot(plotRef.current, plotData.data, layout, config)

    // Apply CSS to the modebar so it sits ABOVE the plot area in the padding space
    const el = plotRef.current
    const applyModebarStyle = () => {
      const modebar = el?.querySelector('.modebar-container') as HTMLElement | null
      if (modebar) {
        modebar.style.top = '-30px'        // Pull it above the plot area into top padding
        modebar.style.right = '0'
        modebar.style.background = 'transparent'
        modebar.style.boxShadow = 'none'
        modebar.style.borderRadius = '6px'
        modebar.style.overflow = 'visible'
      }
      // Also style individual buttons
      el?.querySelectorAll('.modebar-btn').forEach((btn) => {
        const b = btn as HTMLElement
        b.style.color = '#64748b'
        b.style.background = 'transparent'
        b.style.border = 'none'
        b.style.padding = '4px'
        b.style.transition = 'color 0.15s'
        b.addEventListener('mouseenter', () => { b.style.color = '#e2e8f0' })
        b.addEventListener('mouseleave', () => { b.style.color = '#64748b' })
      })
    }

    el?.addEventListener('plotly_afterplot', applyModebarStyle, { once: true })
    setTimeout(applyModebarStyle, 200)

    // ResizeObserver ensures Plotly dynamically resizes when collapsing/expanding or window resizing
    const observer = new ResizeObserver(() => {
      if (el && Plotly.Plots?.resize) {
        try {
          Plotly.Plots.resize(el)
        } catch { /* ignore */ }
      }
    })
    observer.observe(el)

    return () => {
      observer.disconnect()
      if (el) {
        try { Plotly.purge(el) } catch { /* ignore */ }
      }
    }
  }, [plotData])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-3"
      ref={containerRef}
    >
      <div className="bg-surface-900 border border-slate-700/50 rounded-xl overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <svg className="w-3.5 h-3.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="font-medium">Generated chart</span>
            <span className="text-slate-600 text-xs">· Hover chart for zoom/controls</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Download JSON */}
            <button
              onClick={() => {
                if (!plotData) return
                const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(base64)
                const a = document.createElement('a')
                a.href = dataStr
                a.download = 'chart_data.json'
                document.body.appendChild(a)
                a.click()
                a.remove()
              }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
              title="Download chart data as JSON"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              JSON
            </button>

            {/* Expand/collapse */}
            <button
              onClick={() => setIsExpanded(v => !v)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
            >
              {isExpanded ? (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                  </svg>
                  Collapse
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
                  </svg>
                  Expand
                </>
              )}
            </button>
          </div>
        </div>

        {/* Chart container — animate height cleanly without unmounting/remounting DOM */}
        <motion.div
          animate={{ height: isExpanded ? 620 : 320 }}
          transition={{ duration: 0.25 }}
          className="px-4 pt-8 pb-4 relative"
        >
          {plotData ? (
            <div ref={plotRef} className="w-full h-full" />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
              Invalid chart data
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}

