import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browserPath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find(existsSync);
assert.ok(browserPath, "Không tìm thấy Chrome/Edge để kiểm tra kích thước thực tế");

const profileDir = mkdtempSync(join(tmpdir(), "culao-startup-layout-"));
const port = 20000 + Math.floor(Math.random() * 20000);
const browser = spawn(browserPath, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--allow-file-access-from-files", `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`, "about:blank"
], { stdio: "ignore" });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let socket;
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) { ready = true; break; }
    } catch { /* Chrome chưa mở cổng */ }
    await delay(100);
  }
  assert.ok(ready, "Không kết nối được Chrome DevTools");
  const url = pathToFileURL(join(root, "index.html")).href;
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const target = await response.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const result = JSON.parse(event.data);
    const call = pending.get(result.id);
    if (!call) return;
    pending.delete(result.id);
    if (result.error) call.reject(new Error(result.error.message));
    else call.resolve(result.result);
  });
  const send = (method, params = {}) => new Promise((done, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve: done, reject });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*app.js*", "*firebase*"] });
  await send("Page.navigate", { url });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
    if (result.result.value === "complete") break;
    await delay(100);
  }

  for (const [width, height] of [[1440, 900], [320, 700], [375, 812], [390, 844], [430, 932], [844, 390], [932, 430]]) {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: width <= 430,
      screenWidth: width, screenHeight: height
    });
    for (const screen of ["startup", "login"]) {
      const result = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
        const startup = document.getElementById("startupView");
        const login = document.getElementById("loginView");
        startup.classList.toggle("hidden", ${screen === "login"});
        login.classList.toggle("hidden", ${screen === "startup"});
        const view = ${screen === "startup" ? "startup" : "login"};
        const card = view.querySelector(".login-card");
        const viewBox = view.getBoundingClientRect();
        const cardBox = card.getBoundingClientRect();
        const children = Array.from(card.querySelectorAll("input, button, a, h1"));
        return {
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
          cardLeft: cardBox.left,
          cardRight: cardBox.right,
          viewLeft: viewBox.left,
          viewRight: viewBox.right,
          outsideChildren: children.filter((item) => {
            if (getComputedStyle(item).display === "none") return false;
            const box = item.getBoundingClientRect();
            return box.left < cardBox.left - 1 || box.right > cardBox.right + 1;
          }).map((item) => item.outerHTML.slice(0, 70))
        };
      })()` });
      const size = result.result.value;
      assert.ok(size.document <= size.viewport, `${screen} ${width}x${height}: cuộn ngang ${JSON.stringify(size)}`);
      assert.ok(size.cardLeft >= size.viewLeft && size.cardRight <= size.viewRight, `${screen} ${width}x${height}: card tràn viewport`);
      assert.deepEqual(size.outsideChildren, [], `${screen} ${width}x${height}: control tràn card`);
      console.log(`PASS | ${screen} ${width}x${height} | card và control nằm trong viewport`);
    }
  }
} finally {
  socket?.close();
  browser.kill();
  await delay(250);
  const resolvedProfileDir = resolve(profileDir);
  if (resolvedProfileDir.startsWith(`${resolve(tmpdir())}${sep}`) && basename(resolvedProfileDir).startsWith("culao-startup-layout-")) {
    try { rmSync(resolvedProfileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
    catch (error) { console.warn(`Không dọn được profile Chrome tạm: ${error.message}`); }
  }
}
