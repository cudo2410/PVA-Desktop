import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@core': resolve(__dirname, 'src/core'),
        '@adapters': resolve(__dirname, 'src/adapters')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve(__dirname, 'src/ui'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/ui/index.html')
        }
      },
      rolldownOptions: {
        input: resolve(__dirname, 'src/ui/index.html')
      }
    },
    resolve: {
      alias: {
        '@ui': resolve(__dirname, 'src/ui/src'),
        '@renderer': resolve(__dirname, 'src/ui/src'),
        '@core': resolve(__dirname, 'src/core'),
        '@adapters': resolve(__dirname, 'src/adapters')
      }
    },
    plugins: [react()]
  }
})
