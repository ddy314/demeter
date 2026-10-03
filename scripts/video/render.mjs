import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, extname } from "node:path";
import { buildFilm, site } from "./build.mjs";
import { once } from "node:events";
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(process.env.PLAYWRIGHT_PATH || "playwright");
}
const fps = 24,
  duration = 166;
const out = "artifacts/video/work";
await mkdir(out, { recursive: true });
let server;
let url = process.env.FILM_URL;
if (!url) {
  await buildFilm();
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
  };
  server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const data = await readFile(join(site, pathname));
      res.writeHead(200, {
        "Content-Type": mime[extname(pathname)] || "application/octet-stream",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}/video.html`;
}
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome-stable",
  args: [
    "--no-sandbox",
    "--use-angle=gl",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (e) => console.error("PAGE_ERROR", e));
await page.goto(url);
await page.waitForFunction(() => window.filmReady && window.renderFilm, {
  timeout: 60000,
});
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => window.renderFilm(3));
console.log(
  await page.evaluate(() => {
    const gl = document.querySelector("canvas").getContext("webgl2");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "WebGL";
  }),
);
if (process.argv.includes("--preview")) {
  for (const t of [3, 13, 29, 42, 49, 58, 69, 86, 104, 117, 133, 149, 161]) {
    await page.evaluate((t) => window.renderFilm(t), t);
    await page.screenshot({
      path: out + "/frame-" + t + ".jpg",
      type: "jpeg",
      quality: 90,
    });
  }
} else {
  const start = Number(process.env.START_TIME || 0),
    end = Number(process.env.END_TIME || duration);
  const path = process.env.VIDEO_OUTPUT || out + "/visual.mp4";
  const encoder = spawn(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-framerate",
      String(fps),
      "-i",
      "pipe:0",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      path,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const started = Date.now();
  for (
    let frame = Math.round(start * fps);
    frame < Math.round(end * fps);
    frame++
  ) {
    await page.evaluate((t) => window.renderFilm(t), frame / fps);
    const bytes = await page.screenshot({ type: "jpeg", quality: 93 });
    if (!encoder.stdin.write(bytes)) await once(encoder.stdin, "drain");
    if (frame % 240 === 0)
      console.log(
        JSON.stringify({
          frame,
          time: frame / fps,
          elapsed_s: Math.round((Date.now() - started) / 1000),
        }),
      );
  }
  encoder.stdin.end();
  const [code] = await once(encoder, "exit");
  if (code !== 0) throw Error("ffmpeg failed " + code);
  console.log("Rendered " + path);
}
await browser.close();
server?.close();
