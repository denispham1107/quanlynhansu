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
let cacheNames = [];
const navigations = [];
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
    registration: { scope: "https://example.com/app/" },
    clients: {
      claim() { return Promise.resolve(); },
      matchAll() {
        return Promise.resolve([
          { url: "https://example.com/app/?taskId=task-1", navigate(url) { navigations.push(url); return Promise.resolve(); } },
          { url: "https://example.com/other/", navigate(url) { navigations.push(url); return Promise.resolve(); } }
        ]);
      }
    },
    addEventListener(name, handler) { handlers.set(name, handler); },
    skipWaiting() { installActivated = true; return Promise.resolve(); }
  },
  caches: {
    match(request) { return cache.match(request); },
    open() { return Promise.resolve(cache); },
    keys() { return Promise.resolve(cacheNames); },
    delete(name) { cacheNames = cacheNames.filter((key) => key !== name); return Promise.resolve(true); }
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

const currentCacheName = vm.runInContext("CACHE_NAME", context);
const activate = async () => {
  let activationPromise;
  handlers.get("activate")({ waitUntil(promise) { activationPromise = promise; } });
  await activationPromise;
};
cacheNames = [currentCacheName];
await activate();
assert.equal(navigations.length, 0, "Cài app lần đầu không được tải lại trang");
cacheNames = ["culao-task-shell-old-version", currentCacheName];
await activate();
assert.equal(navigations.length, 1, "Chỉ tab trong scope được ép nạp lại khi nâng cấp");
const reloadedUrl = new URL(navigations[0]);
assert.equal(reloadedUrl.searchParams.get("taskId"), "task-1", "Giữ tham số hiện có");
assert.equal(reloadedUrl.searchParams.get("_appVersion"), currentCacheName, "Nạp đúng phiên bản mới");
stored.set("./index.html", new Response("new shell"));
let forcedResponse;
handlers.get("fetch")({
  request: { method: "GET", mode: "navigate", url: navigations[0] },
  respondWith(promise) { forcedResponse = promise; },
  waitUntil() {}
});
assert.equal(await (await forcedResponse).text(), "new shell", "Lần nạp bắt buộc phải dùng HTML của worker mới");

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

const url = "https://example.com/app.js?v=20261002-spa-assignee-v137";
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

console.log("PASS | Service worker kích hoạt an toàn, ép tab cũ nạp lại khi nâng cấp và vẫn trả cache nhanh khi mạng chậm.");

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "index.html"), "utf8");
const bootstrap = html.match(/<script>\s*(\(\(\) => \{[\s\S]*?\}\)\(\);)\s*<\/script>/)?.[1];
assert.ok(bootstrap, "Không tìm thấy mã khởi tạo PWA");
const bootstrapEvents = new Map();
let currentTime = 100000;
let updateCalls = 0;
let registerOptions;
const registration = { update() { updateCalls += 1; return Promise.resolve(); } };
const bootstrapWindow = {
  addEventListener(name, listener) { bootstrapEvents.set(`window:${name}`, listener); },
  setInterval(listener) { bootstrapEvents.set("interval", listener); },
  setTimeout() {}
};
const bootstrapDocument = {
  hidden: false,
  addEventListener(name, listener) { bootstrapEvents.set(`document:${name}`, listener); }
};
const bootstrapNavigator = {
  onLine: true,
  serviceWorker: { register(_path, options) { registerOptions = options; return Promise.resolve(registration); } }
};
vm.runInNewContext(bootstrap, {
  window: bootstrapWindow,
  document: bootstrapDocument,
  navigator: bootstrapNavigator,
  Date: { now: () => currentTime },
  console,
  CustomEvent: class {}
});
await bootstrapWindow.__CULAO_PWA_INSTALL__.serviceWorkerPromise;
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(registerOptions.updateViaCache, "none");
assert.equal(updateCalls, 1, "Vào app phải kiểm tra cập nhật ngay");
currentTime += 61 * 1000;
bootstrapEvents.get("window:focus")();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(updateCalls, 2, "Quay lại app phải kiểm tra cập nhật");
currentTime += 5 * 60 * 1000;
bootstrapEvents.get("interval")();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(updateCalls, 3, "App đang mở phải kiểm tra cập nhật định kỳ");
bootstrapDocument.hidden = true;
currentTime += 5 * 60 * 1000;
bootstrapEvents.get("interval")();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(updateCalls, 3, "Tab ẩn không nên kiểm tra mạng định kỳ");
console.log("PASS | App kiểm tra cập nhật khi mở, trở lại và trong lúc đang chạy.");
