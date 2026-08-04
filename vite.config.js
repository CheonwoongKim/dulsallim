import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { defineConfig } from "vite";

const STATIC_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

export function createPrecacheUrls(fileNames) {
  const emitted = fileNames
    .filter((fileName) => fileName !== "index.html" && !fileName.endsWith(".map"))
    .sort()
    .map((fileName) => `/${fileName.replace(/^\/+/, "")}`);
  return [...new Set([...STATIC_SHELL, ...emitted])];
}

export function renderServiceWorker(template, { version, precacheUrls }) {
  if (!template.includes('"__BUILD_VERSION__"') || !template.includes("// __PRECACHE_MANIFEST__")) {
    throw new Error("서비스 워커 빌드 자리표시자를 찾지 못했습니다.");
  }

  return template
    .replace('"__BUILD_VERSION__"', JSON.stringify(version))
    .replace("// __PRECACHE_MANIFEST__", precacheUrls.map((url) => JSON.stringify(url)).join(",\n  "));
}

async function fingerprintFiles(outputDir, urls) {
  const hash = createHash("sha256");
  const fileNames = [...new Set(urls.map((url) => (url === "/" ? "index.html" : url.slice(1))))];

  for (const fileName of fileNames) {
    hash.update(fileName);
    hash.update(await readFile(resolve(outputDir, fileName)));
  }

  return hash.digest("hex").slice(0, 12);
}

function versionServiceWorker() {
  return {
    name: "version-service-worker",
    apply: "build",
    async writeBundle(outputOptions, bundle) {
      const outputDir = resolve(outputOptions.dir || "dist");
      const precacheUrls = createPrecacheUrls(Object.keys(bundle));
      const version = await fingerprintFiles(outputDir, precacheUrls);
      const serviceWorkerPath = resolve(outputDir, "sw.js");
      const template = await readFile(serviceWorkerPath, "utf8");

      await writeFile(serviceWorkerPath, renderServiceWorker(template, { version, precacheUrls }));
    },
  };
}

export default defineConfig({
  plugins: [versionServiceWorker()],
});
