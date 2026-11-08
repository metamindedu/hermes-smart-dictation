import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
await mkdir('desktop', { recursive: true })
await build({ entryPoints: ['src/plugin.jsx'], outfile: 'desktop/plugin.js', bundle: true, format: 'esm', platform: 'browser', target: ['chrome120'], external: ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'], legalComments: 'none', sourcemap: false, minify: false })
console.log('Built desktop/plugin.js')
