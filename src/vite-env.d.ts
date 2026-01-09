/// <reference types="vite/client" />

import type Alpine from 'alpinejs'

// Extend Window interface for Alpine.js global access
declare global {
  interface Window {
    Alpine: typeof Alpine
  }
}
