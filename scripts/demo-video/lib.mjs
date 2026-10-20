// Helpers for recording the demo video: scenes, narration, terminal and code pages.
// Needs macOS (for the "say" voice), ffmpeg, and: npm i playwright && npx playwright install chromium
import { chromium } from 'playwright'
import { execSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'

export const REPO = new URL('../../', import.meta.url).pathname.replace(/\/$/, '')
export const OUT = new URL('./out/', import.meta.url).pathname
fs.mkdirSync(OUT + 'raw', { recursive: true })

export const W = 1280
export const H = 720
export let browser
export const scenes = []

export async function start() {
  browser = await chromium.launch()
}

export function sh(cmd, timeout = 600000) {
  try {
    return execSync(cmd, { cwd: REPO, encoding: 'utf8', shell: '/bin/bash', timeout, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '')
  }
}

function narrate(name, text) {
  const file = `${OUT}${name}.aiff`
  execFileSync('say', ['-v', 'Samantha', '-r', '182', '-o', file, text])
  const dur = Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`, { encoding: 'utf8' }))
  return { file, dur }
}

const overlay = (label) => {
  const add = () => {
    if (document.getElementById('__demo_chip')) return
    const chip = document.createElement('div')
    chip.id = '__demo_chip'
    chip.textContent = label
    chip.style.cssText =
      'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:rgba(15,23,42,.88);color:#fff;' +
      'padding:8px 18px;border-radius:999px;font:600 15px Inter,-apple-system,Segoe UI,sans-serif;z-index:2147483647;' +
      'pointer-events:none;box-shadow:0 4px 18px rgba(0,0,0,.25);white-space:nowrap'
    const cur = document.createElement('div')
    cur.id = '__demo_cursor'
    cur.style.cssText =
      'position:fixed;left:-40px;top:-40px;width:22px;height:22px;border-radius:50%;border:3px solid #4f46e5;' +
      'background:rgba(79,70,229,.25);z-index:2147483647;pointer-events:none;transition:left .06s,top .06s'
    document.documentElement.append(chip, cur)
    addEventListener(
      'mousemove',
      (e) => {
        cur.style.left = e.clientX - 11 + 'px'
        cur.style.top = e.clientY - 11 + 'px'
      },
      true,
    )
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add)
  else add()
}

// One recorded clip. The clip lasts at least as long as its narration.
export async function scene(name, label, text, opts, fn) {
  const { state } = opts || {}
  const voice = narrate(name, text)
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: `${OUT}raw/${name}`, size: { width: W, height: H } },
    storageState: state && fs.existsSync(state) ? state : undefined,
  })
  await ctx.addInitScript(overlay, label)
  const page = await ctx.newPage()
  page.on('dialog', (d) => d.accept())
  const t0 = Date.now()
  await fn(page, ctx)
  const left = voice.dur * 1000 + 900 - (Date.now() - t0)
  if (left > 0) await page.waitForTimeout(left)
  const video = page.video()
  await ctx.close()
  scenes.push({ name, video: await video.path(), audio: voice.file })
  console.log(`scene ${name}: ${((Date.now() - t0) / 1000).toFixed(1)}s (narration ${voice.dur.toFixed(1)}s)`)
}

export async function glide(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 })
    await page.waitForTimeout(250)
  }
}

export async function click(page, locator) {
  await glide(page, locator)
  await locator.click()
}

export async function type(page, locator, text, delay = 35) {
  await click(page, locator)
  await locator.pressSequentially(text, { delay })
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// A fake terminal page. Each step types a command and prints its real output.
export async function terminal(page, title, steps) {
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:#0b1020;font:15px/1.45 "SF Mono",Menlo,monospace;color:#e2e8f0}
    .bar{background:#1e293b;padding:10px 16px;color:#94a3b8;font:600 13px Inter,-apple-system,sans-serif;display:flex;gap:8px;align-items:center}
    .dot{width:12px;height:12px;border-radius:50%;display:inline-block}
    #log{padding:18px 24px 80px;height:calc(100vh - 40px);overflow-y:auto;box-sizing:border-box;white-space:pre-wrap;word-break:break-all}
    .p{color:#a5b4fc}.c{color:#fff}.o{color:#cbd5e1}.n{color:#64748b}
  </style></head><body><div class="bar"><span class="dot" style="background:#ef4444"></span><span class="dot" style="background:#f59e0b"></span><span class="dot" style="background:#22c55e"></span>&nbsp;${esc(title)}</div><div id="log"></div></body></html>`)
  for (const step of steps) {
    if (step.note) {
      await page.evaluate((t) => {
        const d = document.createElement('div')
        d.className = 'n'
        d.textContent = '# ' + t
        document.getElementById('log').append(d)
      }, step.note)
      await page.waitForTimeout(500)
      continue
    }
    await page.evaluate(() => {
      const d = document.createElement('div')
      d.innerHTML = '<span class="p">$ </span><span class="c"></span>'
      document.getElementById('log').append(d)
    })
    for (const ch of step.cmd) {
      await page.evaluate((c) => {
        const all = document.querySelectorAll('.c')
        all[all.length - 1].textContent += c
      }, ch)
      await page.waitForTimeout(18)
    }
    await page.waitForTimeout(350)
    let out = step.out !== undefined ? step.out : sh(step.run ?? step.cmd)
    if (step.filter) out = step.filter(out)
    let lines = out.replace(/\s+$/, '').split('\n')
    if (step.max && lines.length > step.max) lines = [...lines.slice(0, step.max), `... (${lines.length - step.max} more lines)`]
    for (const line of lines) {
      await page.evaluate((l) => {
        const d = document.createElement('div')
        d.className = 'o'
        d.textContent = l || ' '
        const log = document.getElementById('log')
        log.append(d)
        log.scrollTop = log.scrollHeight
      }, line)
      await page.waitForTimeout(step.lineDelay ?? 25)
    }
    await page.waitForTimeout(step.pause ?? 900)
  }
}

// Shows a slice of a source file with some lines highlighted.
export async function code(page, file, from, to, marks = []) {
  const src = fs.readFileSync(`${REPO}/${file}`, 'utf8').split('\n').slice(from - 1, to)
  const rows = src
    .map((l, i) => {
      const n = from + i
      const hl = marks.some(([a, b]) => n >= a && n <= b)
      return `<div class="r${hl ? ' hl' : ''}"><span class="ln">${n}</span>${esc(l) || ' '}</div>`
    })
    .join('')
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;background:#0f172a;font:14px/1.5 "SF Mono",Menlo,monospace;color:#e2e8f0}
    .bar{background:#1e293b;padding:10px 18px;color:#c7d2fe;font:600 14px Inter,-apple-system,sans-serif}
    .wrap{padding:14px 0 70px;white-space:pre}
    .r{padding:0 20px}.hl{background:rgba(99,102,241,.25);box-shadow:inset 3px 0 0 #818cf8}
    .ln{display:inline-block;width:42px;color:#475569;user-select:none}
    .live{display:inline-block;width:8px;height:8px;border-radius:50%;background:#818cf8;margin-right:10px;animation:b 1s infinite}
    @keyframes b{50%{opacity:.2}}
  </style></head><body><div class="bar"><span class="live"></span>${esc(file)}</div><div class="wrap">${rows}</div></body></html>`)
}

export function linesOf(file, startPattern, count) {
  const lines = fs.readFileSync(`${REPO}/${file}`, 'utf8').split('\n')
  const i = lines.findIndex((l) => l.includes(startPattern))
  if (i < 0) throw new Error(`${startPattern} not found in ${file}`)
  return [i + 1, Math.min(lines.length, i + count)]
}

export async function finish() {
  await browser.close()
  const dur = (f) => Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`, { encoding: 'utf8' }))
  const list = []
  for (const s of scenes) {
    const mp4 = `${OUT}${s.name}.mp4`
    // a static page produces few frames, so hold the last frame until the narration ends
    const v = dur(s.video)
    const t = Math.max(v, dur(s.audio) + 0.8)
    const pad = Math.max(0, t - v) + 0.5
    execSync(
      `ffmpeg -y -loglevel error -i "${s.video}" -i "${s.audio}" ` +
        `-filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=${pad},fps=25,format=yuv420p[v];[1:a]aresample=44100,apad[a]" ` +
        `-map "[v]" -map "[a]" -t ${t} -c:v libx264 -preset veryfast -crf 30 -c:a aac -b:a 96k -ar 44100 -ac 1 "${mp4}"`,
    )
    list.push(`file '${mp4}'`)
  }
  fs.writeFileSync(`${OUT}list.txt`, list.join('\n'))
  execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i "${OUT}list.txt" -c copy "${OUT}demo.mp4"`)
  console.log('done:', `${OUT}demo.mp4`)
}
