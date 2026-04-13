/**
 * Gera os ícones PWA (192x192, 512x512, apple-touch-icon 180x180)
 * a partir do favicon.svg.
 * Executar: node scripts/generate-icons.mjs
 */
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir  = dirname(fileURLToPath(import.meta.url))
const root   = resolve(__dir, '..')
const svgBuf = readFileSync(resolve(root, 'public/favicon.svg'))

const icons = [
  { out: 'public/pwa-192x192.png',     size: 192 },
  { out: 'public/pwa-512x512.png',     size: 512 },
  { out: 'public/apple-touch-icon.png', size: 180 },
]

for (const { out, size } of icons) {
  await sharp(svgBuf)
    .resize(size, size)
    .png()
    .toFile(resolve(root, out))
  console.log(`✓ ${out} (${size}x${size})`)
}
console.log('Ícones gerados com sucesso!')
