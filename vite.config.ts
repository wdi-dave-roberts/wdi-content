import { defineConfig, Plugin } from 'vite'
import { resolve, dirname } from 'path'
import { globSync } from 'glob'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'

interface ProjectManifestEntry {
  slug: string
  name: string
  description?: string
  template: string
  created: string
}

/**
 * Generate projects manifest for runtime discovery
 */
function generateProjectsManifest(): void {
  const projectConfigs = globSync('projects/*/project.json', {
    ignore: ['projects/_templates/**'],
  })

  const projects: ProjectManifestEntry[] = projectConfigs
    .map((configPath) => {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        return {
          slug: config.slug,
          name: config.name,
          description: config.description,
          template: config.template,
          created: config.created,
        }
      } catch (e) {
        console.warn(`Failed to parse ${configPath}:`, e)
        return null
      }
    })
    .filter((p): p is ProjectManifestEntry => p !== null)
    .sort((a, b) => b.created.localeCompare(a.created)) // Newest first

  const manifest = { projects }

  fs.writeFileSync(
    'projects/_manifest.json',
    JSON.stringify(manifest, null, 2)
  )
}

/**
 * Vite plugin to generate projects manifest at build time and during dev
 */
function manifestPlugin(): Plugin {
  return {
    name: 'generate-projects-manifest',
    buildStart() {
      generateProjectsManifest()
    },
    configureServer(server) {
      // Generate initial manifest on server start
      generateProjectsManifest()

      // Regenerate when project.json files change, are added, or deleted
      // Exclude _templates and _schema directories
      const handleProjectChange = (filePath: string) => {
        if (
          filePath.includes('/projects/') &&
          filePath.endsWith('project.json') &&
          !filePath.includes('/_templates/') &&
          !filePath.includes('/_schema/')
        ) {
          generateProjectsManifest()
        }
      }

      server.watcher.on('change', handleProjectChange)
      server.watcher.on('add', handleProjectChange)
      server.watcher.on('unlink', handleProjectChange)
    },
  }
}

/**
 * Auto-discover projects by scanning for project.json files
 * Returns an object mapping project slugs to their index.html paths
 */
function discoverProjects(): Record<string, string> {
  const projectConfigs = globSync('projects/*/project.json', {
    ignore: ['projects/_templates/**'],
  })

  return projectConfigs.reduce(
    (acc, configPath) => {
      try {
        const dir = dirname(configPath)
        const indexPath = resolve(__dirname, dir, 'index.html')

        // Only include if index.html exists
        if (fs.existsSync(indexPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
          acc[`project-${config.slug}`] = indexPath
        }
      } catch (e) {
        console.warn(`Failed to discover project from ${configPath}:`, e)
      }

      return acc
    },
    {} as Record<string, string>
  )
}

/**
 * Auto-discover public static files
 */
function discoverPublicFiles(): Record<string, string> {
  const publicFiles = globSync('public/*.html')

  return publicFiles.reduce(
    (acc, filePath) => {
      const name = filePath.replace('public/', '').replace('.html', '')
      acc[`public-${name}`] = resolve(__dirname, filePath)
      return acc
    },
    {} as Record<string, string>
  )
}

// Vite configuration for multi-page static site
export default defineConfig({
  plugins: [tailwindcss(), manifestPlugin()],

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
    rollupOptions: {
      input: {
        // Main entry point
        main: resolve(__dirname, 'index.html'),

        // Projects listing page
        projectsIndex: resolve(__dirname, 'projects/index.html'),

        // Auto-discovered public files
        ...discoverPublicFiles(),

        // Auto-discovered projects
        ...discoverProjects(),
      },
    },
  },
})
