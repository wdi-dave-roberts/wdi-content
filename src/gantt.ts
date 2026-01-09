// Gantt chart module for kitchen remodel project
import './style.css'
import 'frappe-gantt/dist/frappe-gantt.css'
import Gantt, { type Task, type ViewMode } from 'frappe-gantt'

// Sample construction tasks for a kitchen remodel
const tasks: Task[] = [
  {
    id: 'demolition',
    name: 'Demolition',
    start: '2025-01-06',
    end: '2025-01-10',
    progress: 100,
  },
  {
    id: 'plumbing-rough',
    name: 'Plumbing Rough-In',
    start: '2025-01-13',
    end: '2025-01-17',
    progress: 80,
    dependencies: 'demolition',
  },
  {
    id: 'electrical-rough',
    name: 'Electrical Rough-In',
    start: '2025-01-13',
    end: '2025-01-17',
    progress: 75,
    dependencies: 'demolition',
  },
  {
    id: 'drywall',
    name: 'Drywall Installation',
    start: '2025-01-20',
    end: '2025-01-24',
    progress: 50,
    dependencies: 'plumbing-rough, electrical-rough',
  },
  {
    id: 'cabinets',
    name: 'Cabinet Installation',
    start: '2025-01-27',
    end: '2025-01-31',
    progress: 20,
    dependencies: 'drywall',
  },
  {
    id: 'countertops',
    name: 'Countertop Installation',
    start: '2025-02-03',
    end: '2025-02-05',
    progress: 0,
    dependencies: 'cabinets',
  },
  {
    id: 'plumbing-finish',
    name: 'Plumbing Finish',
    start: '2025-02-06',
    end: '2025-02-07',
    progress: 0,
    dependencies: 'countertops',
  },
  {
    id: 'electrical-finish',
    name: 'Electrical Finish',
    start: '2025-02-06',
    end: '2025-02-07',
    progress: 0,
    dependencies: 'countertops',
  },
  {
    id: 'painting',
    name: 'Painting & Touch-ups',
    start: '2025-02-10',
    end: '2025-02-12',
    progress: 0,
    dependencies: 'plumbing-finish, electrical-finish',
  },
  {
    id: 'appliances',
    name: 'Appliance Installation',
    start: '2025-02-13',
    end: '2025-02-14',
    progress: 0,
    dependencies: 'painting',
  },
]

// Store Gantt instance for view mode switching
let ganttInstance: Gantt | null = null

// Initialize Gantt chart on the specified element
export function initGantt(selector: string): Gantt {
  ganttInstance = new Gantt(selector, tasks, {
    view_modes: ['Day', 'Week', 'Month'],
    view_mode: 'Week',
    date_format: 'YYYY-MM-DD',

    // Event: Task clicked
    on_click: (task: Task) => {
      console.log('Task clicked:', task.name)
      // Could show a modal or navigate to task details
    },

    // Event: Task dates changed via drag
    on_date_change: (task: Task, start: Date, end: Date) => {
      console.log('Date changed:', task.name)
      console.log('  New start:', start.toISOString().split('T')[0])
      console.log('  New end:', end.toISOString().split('T')[0])
      // Could persist to backend here
    },

    // Event: Progress bar dragged
    on_progress_change: (task: Task, progress: number) => {
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
