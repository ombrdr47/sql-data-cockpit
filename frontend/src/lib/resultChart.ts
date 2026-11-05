import type { TableData } from '../components/MessageBubble'

const MAX_CATEGORIES = 25
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}.*)?$/

function numberFrom(value: unknown): number | null {
  if (typeof value === 'string' && DECIMAL.test(value.trim())) value = Number(value)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// Plotly supports some HTML in axis labels and hover text. Treat database
// values as literal text so a query result cannot supply chart markup.
function plotText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function chartRequested(question: string): boolean {
  return /\b(?:chart|plot|graph|visuali[sz]e)\b/i.test(question)
}

export function chartFromResults({ columns, rows }: TableData) {
  if (rows.length < 2) return null

  const metrics = columns.filter(column => {
    const values = rows.map(row => row[column]).filter(value => value != null)
    return values.length >= 2 && values.every(value => numberFrom(value) !== null)
  })

  for (const metric of metrics) {
    for (const dimension of columns) {
      if (dimension === metric || metrics.includes(dimension)) continue
      const points = rows.flatMap(row => {
        const label = row[dimension]
        const value = numberFrom(row[metric])
        return typeof label === 'string' && label.trim() && value !== null ? [{ label, value }] : []
      })
      if (points.length < 2 || new Set(points.map(point => point.label)).size !== points.length) continue

      const isDate = points.every(({ label }) => ISO_DATE.test(label) && Number.isFinite(Date.parse(label)))
      if (isDate) points.sort((a, b) => Date.parse(a.label) - Date.parse(b.label))
      const plotted = isDate ? points : points.slice(0, MAX_CATEGORIES)
      const values = plotted.map(point => point.value)
      const labels = plotted.map(point => plotText(point.label))
      const metricLabel = plotText(metric.replaceAll('_', ' '))
      const dimensionLabel = plotText(dimension.replaceAll('_', ' '))
      const trace = isDate
        ? { type: 'scatter', mode: 'lines+markers', x: labels, y: values, hovertemplate: '%{x}<br>%{y}<extra></extra>' }
        : { type: 'bar', orientation: 'h', x: values, y: labels, hovertemplate: '%{y}<br>%{x}<extra></extra>' }

      return {
        json: JSON.stringify({
          data: [{ ...trace, marker: { color: '#82adf8' } }],
          layout: {
            xaxis: { title: { text: isDate ? dimensionLabel : metricLabel }, type: isDate ? 'date' : 'linear' },
            yaxis: isDate ? { title: { text: metricLabel } } : { type: 'category', autorange: 'reversed' },
          },
        }),
        plottedRows: plotted.length,
      }
    }
  }

  return null
}
