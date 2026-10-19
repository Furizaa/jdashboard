import { chromium } from '@playwright/test'
const [url, out] = process.argv.slice(2)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark' })
await p.goto(url, { waitUntil: 'networkidle' })
await p.waitForTimeout(1500)
await p.screenshot({ path: out, fullPage: true })
console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('[data-testid]')].filter(e => /gantt-(bar|arrow|child)/.test(e.dataset.testid)).slice(0,10).map(e => [e.dataset.testid, e.dataset.nodeId, e.getBoundingClientRect().width|0]))))
await b.close()
