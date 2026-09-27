import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browserPath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find(existsSync);
if (!browserPath) throw new Error("Không tìm thấy Chrome hoặc Edge.");

const profiles = [
  [320, 700], [375, 812], [390, 844], [430, 932], [844, 390], [932, 430]
];
const port = 20000 + Math.floor(Math.random() * 20000);
const profileDir = mkdtempSync(join(tmpdir(), "quanlynhansu-lunch-layout-"));
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
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) { ready = true; break; }
    } catch { /* Chrome is starting. */ }
    await delay(100);
  }
  if (!ready) throw new Error("Không kết nối được Chrome DevTools.");
  const url = pathToFileURL(join(root, "index.html")).href;
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const target = await targetResponse.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    if (message.error) call.reject(new Error(message.error.message));
    else call.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((done, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve: done, reject });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*app.js*", "*firebase*", "*jszip*"] });
  await send("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    platform: "iPhone"
  });
  await send("Page.navigate", { url });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
    if (state.result.value === "complete") break;
    await delay(100);
  }
  await send("Runtime.evaluate", { expression: `(() => {
    document.getElementById("actualTimeEditModal").classList.remove("hidden");
    document.getElementById("actualTimeEditSecondsField").classList.remove("hidden");
    document.body.classList.add("completed-actual-time-edit-open");
    document.getElementById("actualTimeEditTaskTitle").textContent = "Phiếu nghỉ trưa tự động do làm Ship vượt thời gian quy định";
    document.getElementById("actualTimeEditWorkOrderName").textContent = "Phiếu: Nghỉ trưa bù do làm Ship quá giờ - Nhân viên có tên dài";
    document.getElementById("actualTimeEditPreview").textContent = "Thời gian nghỉ trưa thực tế mới: 12 phút 12 giây. Thời điểm báo hoàn thành và Admin duyệt sẽ không đổi.";
    const history = document.createElement("div");
    history.className = "extension-box lunch-break-history-box";
    history.innerHTML = '<div class="extension-box-head"><strong>Lịch sử nghỉ trưa</strong><span>27/09/2026 17:00</span><button class="btn primary small completed-actual-time-edit-btn">Sửa thời gian thực tế</button></div>';
    document.body.append(history);
  })()`, returnByValue: true });

  const failures = [];
  for (const [width, height] of profiles) {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 3, mobile: true, screenWidth: width, screenHeight: height
    });
    await delay(100);
    const response = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const modal = document.getElementById("actualTimeEditModal");
      const card = modal.querySelector(".modal-card");
      const form = document.getElementById("actualTimeEditForm");
      const box = (element) => {
        const r = element.getBoundingClientRect();
        return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
      };
      const inside = (child, parent) => child.left >= parent.left - 1 && child.right <= parent.right + 1
        && child.top >= parent.top - 1 && child.bottom <= parent.bottom + 1;
      const cardBox = box(card), formBox = box(form);
      const inputGrid = box(document.querySelector(".actual-time-edit-input-grid"));
      const inputs = [...document.querySelectorAll(".actual-time-edit-input-shell")].map(box);
      const history = document.querySelector(".lunch-break-history-box");
      const historyBox = box(history);
      const historyButton = box(history.querySelector("button"));
      return {
        cardInViewport: cardBox.left >= 0 && cardBox.right <= innerWidth + 1 && cardBox.top >= 0 && cardBox.bottom <= innerHeight + 1,
        formInCard: inside(formBox, cardBox), inputsInGrid: inputs.every((input) => inside(input, inputGrid)),
        historyButtonInCard: historyButton.left >= historyBox.left - 1 && historyButton.right <= historyBox.right + 1,
        cardOverflow: getComputedStyle(card).overflowY, formOverflow: getComputedStyle(form).overflowY,
        bodyScrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth,
        cardBox, formBox, inputGrid, inputs, historyBox, historyButton
      };
    })()` });
    const result = response.result.value;
    const pass = result.cardInViewport && result.formInCard && result.inputsInGrid
      && result.historyButtonInCard && result.cardOverflow === "hidden"
      && result.formOverflow === "auto" && result.bodyScrollWidth <= width;
    console.log(`${pass ? "PASS" : "FAIL"} | ${width}x${height} | scroll ${result.bodyScrollWidth}/${width}`);
    if (!pass) failures.push({ width, height, result });
  }
  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
} finally {
  socket?.close();
  browser.kill();
  await Promise.race([new Promise((done) => browser.once("exit", done)), delay(1500)]);
  const resolved = resolve(profileDir);
  if (resolved.startsWith(resolve(tmpdir()) + sep)) {
    try { rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
    catch { /* Browser may still be releasing cache files. */ }
  }
}
