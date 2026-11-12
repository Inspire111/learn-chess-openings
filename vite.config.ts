import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A relative base lets the same build run on localhost and on GitHub Pages
// (which serves the site from /<repo-name>/).
export default defineConfig({
  base: './',
  plugins: [react()],
})
