// Screenshots of the deployed app for the Devpost gallery.
import { chromium } from "playwright";
const url = process.env.APP_URL;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: "networkidle", timeout: 180000 });
await page.click("#example");
await page.click('button[type="submit"]');
await page.waitForSelector(".session-title", { timeout: 180000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "results/gallery-1-session.png" });
await page.evaluate(() => document.querySelector(".trace")?.setAttribute("open", ""));
await page.locator(".session").screenshot({ path: "results/gallery-2-full-session.png" });
await browser.close();
