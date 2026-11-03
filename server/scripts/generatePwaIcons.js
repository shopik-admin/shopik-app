/**
 * Generate the default PWA icon set from the Shopik brand mark.
 * Usage: node server/scripts/generatePwaIcons.js
 *
 * Writes to both client/public/icons and admin/public/icons (Vite copies
 * publicDir verbatim into each build):
 *   icon-192.png, icon-512.png, maskable-512.png, apple-180.png
 *
 * The design is a full-bleed brand-green square with the "S" mark kept inside
 * the maskable safe zone, so the same artwork works for `any` and `maskable`.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const BRAND = '#195855'
const ACCENT = '#E6FE50'

// Left-most glyph of logo.svg (the "S" with its two accent dots), centered and
// scaled so the mark stays inside the maskable safe zone.
const BASE_SVG = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="${BRAND}"/>
  <g transform="translate(256 256) scale(11) translate(-8.045 -12.8)">
    <path d="M0 23.2231L2.02616 19.5584H10.5353C10.7865 19.5584 11.0063 19.5062 11.1947 19.4018C11.404 19.2973 11.561 19.1512 11.6657 18.9632C11.7913 18.7753 11.8541 18.5665 11.8541 18.3368C11.8541 18.0862 11.7913 17.8669 11.6657 17.679C11.561 17.4911 11.404 17.3449 11.1947 17.2405C11.0063 17.1152 10.7865 17.0525 10.5353 17.0525H7.521C6.4953 17.0525 5.56379 16.8959 4.72648 16.5827C3.91011 16.2486 3.25073 15.7266 2.74834 15.0166C2.26689 14.2857 2.02616 13.3356 2.02616 12.1662C2.02616 11.2683 2.24596 10.4539 2.68554 9.72303C3.14606 8.97129 3.75311 8.37615 4.50669 7.93764C5.2812 7.47824 6.12897 7.24854 7.05001 7.24854H14.5544V10.9133H7.4582C7.14421 10.9133 6.86162 11.0177 6.61043 11.2265C6.38017 11.4353 6.26504 11.7068 6.26504 12.0409C6.26504 12.375 6.38017 12.6569 6.61043 12.8866C6.84069 13.0954 7.12328 13.1999 7.4582 13.1999H10.4725C11.6238 13.1999 12.6181 13.3773 13.4554 13.7323C14.2927 14.0664 14.9416 14.5989 15.4022 15.3298C15.8627 16.0607 16.0929 17.0212 16.0929 18.2115C16.0929 19.1303 15.8627 19.976 15.4022 20.7486C14.9416 21.5004 14.3241 22.1059 13.5496 22.5653C12.7751 23.0039 11.9064 23.2231 10.9435 23.2231H0Z" fill="#ffffff"/>
    <circle cx="4.9537" cy="23.3165" r="2.27865" fill="${ACCENT}" stroke="${BRAND}"/>
    <circle cx="11.9603" cy="23.3165" r="2.27865" fill="${ACCENT}" stroke="${BRAND}"/>
  </g>
</svg>`

const OUTPUTS = [
    { file: 'icon-192.png', size: 192 },
    { file: 'icon-512.png', size: 512 },
    { file: 'maskable-512.png', size: 512 },
    { file: 'apple-180.png', size: 180 }
]

const TARGETS = [
    path.join(ROOT, 'client', 'public', 'icons'),
    path.join(ROOT, 'admin', 'public', 'icons')
]

export default async function generatePwaIcons() {
    const base = await sharp(Buffer.from(BASE_SVG)).png().toBuffer()

    for (const dir of TARGETS) {
        fs.mkdirSync(dir, { recursive: true })
        for (const { file, size } of OUTPUTS) {
            const data = await sharp(base)
                .resize(size, size, { fit: 'cover' })
                .png({ compressionLevel: 9 })
                .toBuffer()
            fs.writeFileSync(path.join(dir, file), data)
            console.log(`[pwaIcons] wrote ${path.relative(ROOT, path.join(dir, file))}`)
        }
    }
    console.log('[pwaIcons] Done')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await generatePwaIcons()
}
