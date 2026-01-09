// Gantt chart module - loads tasks from project data.json
import './style.css'
import 'frappe-gantt/dist/frappe-gantt.css'
import Gantt, { type Task as GanttTask, type ViewMode } from 'frappe-gantt'
import type { ProjectData, Task as ProjectTask } from './types/project-data'

// Convert project task format to Frappe Gantt format
function toGanttTask(task: ProjectTask): GanttTask {
  return {
    id: task.id,
    name: task.name,
    start: task.start,
    end: task.end,
    progress: task.progress ?? 0,
    dependencies: task.dependencies?.join(', ') ?? '',
  }
}

// Load tasks from a data.json URL
async function loadTasks(dataUrl: string): Promise<GanttTask[]> {
  const response = await fetch(dataUrl)
  const data: ProjectData = await response.json()
  return data.tasks.map(toGanttTask)
}

// Store Gantt instance for view mode switching
let ganttInstance: Gantt | null = null

// Initialize Gantt chart on the specified element
// dataUrl: URL to project's data.json file
export async function initGantt(selector: string, dataUrl: string): Promise<Gantt> {
  const tasks = await loadTasks(dataUrl)

  ganttInstance = new Gantt(selector, tasks, {
    view_modes: ['Day', 'Week', 'Month'],
    view_mode: 'Week',
    date_format: 'YYYY-MM-DD',

    // Event: Task clicked
    on_click: (task: GanttTask) => {
      console.log('Task clicked:', task.name)
      // Could show a modal or navigate to task details
    },

    // Event: Task dates changed via drag
    on_date_change: (task: GanttTask, start: Date, end: Date) => {
      console.log('Date changed:', task.name)
      console.log('  New start:', start.toISOString().split('T')[0])
      console.log('  New end:', end.toISOString().split('T')[0])
      // Could persist to backend here
    },

    // Event: Progress bar dragged
    on_progress_change: (task: GanttTask, progress: number) => {
      console.log('Progress changed:', task.name, `${progress}%`)
      // Could persist to backend here
    },
  })

  return ganttInstance
}

// Change the view mode (Day, Week, Month)
export function setViewMode(mode: ViewMode): void {
  if (ganttInstance) {
    ganttInstance.change_view_mode(mode)
  }
}

// Export types for use in HTML
export type { ViewMode }
