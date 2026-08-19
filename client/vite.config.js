import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'

const currentDir = import.meta.dirname

const pkgPath = path.resolve(currentDir, '../package.json')
const { version } = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

const alias = {
  ...fs.readdirSync(currentDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .reduce((a, { name }) => ({ ...a, [name]: path.resolve(currentDir, name) }), {}),
  'App': path.resolve(currentDir, 'App'),
  common: path.resolve(currentDir, '..', 'common'),
}

export default defineConfig({
  root: currentDir,
  cacheDir: '../node_modules/.vite-client',

  resolve: { alias },
  plugins: [react()],
  define: { APP_VERSION: JSON.stringify(version) },

  build: {
    outDir: '../build/client',
    emptyOutDir: true
  },
  ssr: { noExternal: ['common'] },

  css: {
    modules: {
      generateScopedName: (name, fileName) => {
        const pathParts = fileName.split('/')
        const fn = pathParts.at(-2) || 'style'
        if (!fn || fn.length === 0) return name
        const lowerCaseFN = `${fn[0].toLowerCase()}${fn.substring(1)}`
        return `${fn}_${lowerCaseFN == name ? '' : name}`
      }
    },
  }
})