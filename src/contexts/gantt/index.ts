// The Gantt context's public surface. The route composes these two — the list
// when `?chart=` is absent and the chart when it is — and nothing else leaves.
//
// In particular no presenter leaves. Explain exports `useExplain` because its
// shell owns the tab selection; a Gantt chart's whole state is the reader's own
// (collapse, bands, zoom) and belongs inside, so the shell hands down a chart id
// and gets back a rendered chart.
export { ChartList, GanttChartView } from './view'
