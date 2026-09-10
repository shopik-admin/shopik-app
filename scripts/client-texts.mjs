// Regenerates common/texts/hebrew.client.json — the storefront subset of hebrew.json.
// Run after adding/changing storefront strings:  node scripts/client-texts.mjs
// Method: collect every quoted literal + JSX text node from client/ + common/
// (anything reachable from the storefront bundle), intersect with hebrew.json
// keys, and keep dynamic day-/month- families. Unknown keys fall back to the
// raw key at runtime (see TR.js), and dev logs a warning for misses.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const files = []
for (const r of ['client', 'common']) {
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p) }
      else if (/\.(jsx|js)$/.test(p)) files.push(p)
    }
  })(path.join(root, r))
}
const cand = new Set()
const patterns = [
  /'([^'\n]{1,60})'|"([^"\n]{1,60})"/g,
  />\s*([^<>{}\n]{1,60}?)\s*</g,
]
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  for (const re of patterns) {
    let m
    while ((m = re.exec(src))) {
      const k = (m[1] ?? m[2] ?? '').trim()
      if (k && !k.includes('${')) cand.add(k)
    }
  }
}
for (let i = 0; i < 7; i++) { cand.add(`day-${i}`); cand.add(`day-${i}-short`) }
for (let i = 0; i < 12; i++) { cand.add(`month-${i}`); cand.add(`month-${i}-short`) }

let he = { texts: {} }
try { he = JSON.parse(fs.readFileSync(path.join(root, 'common/texts/hebrew.client.json'), 'utf8')) } catch { }
const full = JSON.parse(fs.readFileSync(path.join(root, 'common/texts/hebrew.json'), 'utf8'))
const used = [...cand].filter(k => k in (full.texts || {}))
const out = { direction: full.direction, texts: {} }
for (const k of used.sort()) out.texts[k] = full.texts[k]
fs.writeFileSync(path.join(root, 'common/texts/hebrew.client.json'), JSON.stringify(out, null, 2) + '\n')
const before = new Set(Object.keys(he.texts || {}))
const after = new Set(used)
console.log(`client texts: ${after.size}/${Object.keys(full.texts).length} keys`)
console.log('dropped from client file:', [...before].filter(k => !after.has(k)).length)
console.log('added to client file:', [...after].filter(k => !before.has(k)))
