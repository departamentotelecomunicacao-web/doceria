import { chromium } from "@playwright/test";
const [path, name, w, h] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(w||390), height: Number(h||844) }, isMobile: Number(w||390) < 600 });
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:4173" + path, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: `/tmp/claude-0/shots/${name}.png` });
await browser.close();
