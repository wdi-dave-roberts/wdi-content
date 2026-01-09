import { defineConfig } from 'vite'
import { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'

// Vite configuration for multi-page static site
export default defineConfig({
  plugins: [tailwindcss()],

  resolve: {
    alias: {
      // Resolve frappe-gantt CSS since package exports don't include the path
      'frappe-gantt/dist/frappe-gantt.css': resolve(
        __dirname,
        'node_modules/frappe-gantt/dist/frappe-gantt.css'
      ),
    },
  },

  build: {
    // Multi-page configuration - add new HTML files here
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        // Public - static files served as-is
        expenseForm: resolve(__dirname, 'public/expense-form.html'),
        expenseSummary: resolve(__dirname, 'public/expense-summary.html'),
        // Projects - grouped pages with custom presentation
        kitchenRemodel: resolve(__dirname, 'projects/kitchen-remodel/index.html'),
      },
    },
  },
})
