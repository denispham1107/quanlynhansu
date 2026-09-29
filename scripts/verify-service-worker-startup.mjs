import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "sw.js"), "utf8")
  .replace("APP_SHELL_NETWORK_TIMEOUT_MS = 1800", "APP_SHELL_NETWORK_TIMEOUT_MS = 20")
  .replace("APP_SHELL_BACKGROUND_TIMEOUT_MS = 15000", "APP_SHELL_BACKGROUND_TIMEOUT_MS = 200");
const handlers = new Map();
const stored = new Map();
let installActivated = false;
const cache = {
  match(request) { return Promise.resolve(stored.get(request.url || request) || null); },
  put(request, response) { stored.set(request.url || request, response); return Promise.resolve(); },
  addAll() { return Promise.resolve(); },
  add(path) { return path.endsWith(".wav") ? Promise.reject(new Error("optional audio unavailable")) : Promise.resolve(); }
};
let networkDelay = 80;
const context = vm.createContext({
  self: {
    location: { origin: "https://example.com" },
    addEventListener(name, handler) { handlers.set(name, handler); },
    skipWaiting() { installActivated = true; return Promise.resolve(); }
  },
  caches: {
    match(request) { return cache.match(request); },
    open() { return Promise.resolve(cache); }
  },
  fetch() {
    return new Promise((resolve) => setTimeout(() => resolve(new Response("fresh")), networkDelay));
  },
  Response,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  Promise
});
vm.runInContext(source, context);
let installPromise;
handlers.get("install")({ waitUntil(promise) { installPromise = promise; } });
await installPromise;
assert.equal(installActivated, true);

async function fetchThroughWorker(url) {
  const waits = [];
  let responsePromise;
  handlers.get("fetch")({
    request: new Request(url),
    respondWith(promise) { responsePromise = promise; },
    waitUntil(promise) { waits.push(promise); }
  });
  const startedAt = Date.now();
  const response = await responsePromise;
  const elapsed = Date.now() - startedAt;
  return { response, elapsed, waits };
}

const url = "https://example.com/app.js?v=20260929-24-hour-picker-v106";
stored.set(url, new Response("cached"));
const cachedResult = await fetchThroughWorker(url);
assert.equal(await cachedResult.response.text(), "cached");
assert.ok(cachedResult.elapsed < 70, `Cache bị chờ mạng ${cachedResult.elapsed} ms`);
await Promise.all(cachedResult.waits);
assert.equal(await stored.get(url).text(), "fresh");

networkDelay = 0;
const freshResult = await fetchThroughWorker(url);
assert.equal(await freshResult.response.text(), "fresh");
await Promise.all(freshResult.waits);

stored.clear();
networkDelay = 50;
const noCacheResult = await fetchThroughWorker(url);
assert.equal(await noCacheResult.response.text(), "fresh");
await Promise.all(noCacheResult.waits);

console.log("PASS | Service worker kích hoạt khi âm thanh tùy chọn lỗi, trả cache nhanh khi mạng chậm và cập nhật ở nền.");
