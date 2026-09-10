import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import fs from 'fs'

const currentDir = import.meta.dirname

const pkgPath = path.resolve(currentDir, '../package.json')
const { version } = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

const clientIcon = path.resolve(currentDir, '..', 'common/components/Icon/ClientIcon.jsx')

const alias = [
  // Storefront-only icon set (25 icons) instead of the full admin set (~80).
  // Must precede the generic `common` alias so it wins on prefix match.
  { find: 'common/components/Icon/index.jsx', replacement: clientIcon },
  { find: '#common/components/Icon/index.jsx', replacement: clientIcon },
  { find: 'common/components/Icon', replacement: clientIcon },
  { find: '#common/components/Icon', replacement: clientIcon },
  // Storefront-only texts subset (see scripts/client-texts.mjs).
  { find: 'common/texts/hebrew.json', replacement: path.resolve(currentDir, '..', 'common/texts/hebrew.client.json') },
  ...Object.entries({
    ...fs.readdirSync(currentDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .reduce((a, { name }) => ({ ...a, [name]: path.resolve(currentDir, name) }), {}),
    'App': path.resolve(currentDir, 'App'),
    common: path.resolve(currentDir, '..', 'common'),
  }).map(([find, replacement]) => ({ find, replacement })),
]

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, path.resolve(currentDir, '..'), '')
  const FILES_BASE_URL_VAL = process.env.FILES_BASE_URL || fileEnv.FILES_BASE_URL || 'https://files.shopik.co.il'
  return {
  root: currentDir,
  cacheDir: '../node_modules/.vite-client',

  resolve: { alias },
  plugins: [react()],
  define: {
    APP_VERSION: JSON.stringify(version),
    VITE_FILES_BASE_URL: JSON.stringify(FILES_BASE_URL_VAL)
  },

  build: {
    outDir: '../build/client',
    emptyOutDir: true
  },
  ssr: { noExternal: ['common'] },
  server: {
    allowedHosts: [
      'neat-lines-enjoy.loca.lt',
    ]
  },
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
  }
})