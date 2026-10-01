import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "app.js"), "utf8");
const cameraCode = source.slice(source.indexOf("function isPhoneCameraDevice()"), source.indexOf("async function openPhotoUploadPicker("));
const reportCode = source.slice(source.indexOf("async function openPhotoUploadPicker("), source.indexOf("// =========================", source.indexOf("async function openPhotoUploadPicker(")));
assert.ok(cameraCode.includes("getUserMedia"));
assert.ok(reportCode.includes("captureReportPhotoFromCamera()"));
assert.ok(!reportCode.includes('input.type = "file"'), "Ảnh báo cáo không được mở bộ chọn tệp");
assert.ok(source.includes('input.type="file"; input.accept="image/*"; input.multiple=true'), "Ảnh công việc phải giữ bộ chọn tệp");

const browserPath = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);
if (!browserPath) throw new Error("Không tìm thấy Chrome hoặc Edge.");
const port = 20000 + Math.floor(Math.random() * 20000);
const profileDir = mkdtempSync(join(tmpdir(), "quanlynhansu-report-camera-"));
const browser = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "about:blank"], { stdio: "ignore" });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let socket;
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) { ready = true; break; } }
    catch { /* Browser is starting. */ }
    await delay(100);
  }
  if (!ready) throw new Error("Không kết nối được Chrome DevTools.");
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
  const evaluate = async (expression, awaitPromise = false) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*app.js*", "*firebase*", "*jszip*"] });
  await send("Page.navigate", { url });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await evaluate("document.readyState") === "complete") break;
    await delay(100);
  }
  await evaluate(cameraCode);
  assert.equal(await evaluate("captureReportPhotoFromCamera().then(() => 'allowed', () => 'blocked')", true), "blocked");
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1", platform: "iPhone" });
  await evaluate(`(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    canvas.getContext('2d').fillRect(0, 0, 640, 480);
    const cameraStream = canvas.captureStream(15);
    window.__cameraStream = cameraStream;
    HTMLMediaElement.prototype.play = async () => {};
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
    CanvasRenderingContext2D.prototype.drawImage = () => {};
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => cameraStream } });
    window.__cameraPromise = captureReportPhotoFromCamera();
  })()`);
  for (const [width, height] of [[320, 700], [375, 812], [390, 844], [430, 932], [844, 390], [932, 430]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height });
    const geometry = await evaluate(`(() => {
      const card = document.querySelector('.report-camera-card');
      const content = document.querySelector('.report-camera-content');
      const actions = document.querySelector('.report-camera-actions');
      const box = card.getBoundingClientRect();
      return { left:box.left, right:box.right, top:box.top, bottom:box.bottom,
        actionBottom:actions.getBoundingClientRect().bottom,
        scrollWidth:document.documentElement.scrollWidth, viewportWidth:innerWidth,
        contentScrollWidth:content.scrollWidth, contentClientWidth:content.clientWidth };
    })()`);
    assert.ok(geometry.left >= -1 && geometry.right <= width + 1, `${width}px: card tràn ngang`);
    assert.ok(geometry.top >= -1 && geometry.bottom <= height + 1, `${width}px: card tràn dọc`);
    assert.ok(geometry.actionBottom <= height + 1, `${width}px: nút chụp ngoài màn hình`);
    assert.ok(geometry.scrollWidth <= width + 1, `${width}px: trang cuộn ngang`);
    assert.ok(geometry.contentScrollWidth <= geometry.contentClientWidth + 1, `${width}px: nội dung tràn ngang`);
    console.log(`PASS camera ${width}x${height}`);
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await evaluate("!document.querySelector('.report-camera-shoot').disabled")) break;
    await delay(100);
  }
  assert.equal(await evaluate("document.querySelector('.report-camera-shoot').disabled"), false);
  await evaluate("document.querySelector('.report-camera-shoot').click()");
  const capture = await evaluate("window.__cameraPromise.then(file => ({ type: file.type, size: file.size, name: file.name, stopped: window.__cameraStream.getTracks().every(track => track.readyState === 'ended'), overlayGone: !document.querySelector('.report-camera-overlay') }))", true);
  assert.equal(capture.type, "image/jpeg");
  assert.ok(capture.size > 0 && capture.name.endsWith(".jpg"));
  assert.ok(capture.stopped && capture.overlayGone, "Đóng camera phải dừng camera và dọn giao diện");
  console.log("PASS chụp JPEG, dừng camera và giữ nguyên ảnh công việc");

  const cancelled = await evaluate(`(async () => {
    window.__cameraPromise = captureReportPhotoFromCamera();
    document.querySelector('.report-camera-cancel').click();
    const file = await window.__cameraPromise;
    return file === null && !document.querySelector('.report-camera-overlay') && document.body.style.overflow === '';
  })()`, true);
  assert.ok(cancelled, "Hủy phải đóng camera và khôi phục trang");

  const denied = await evaluate(`(async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => { throw new Error('Permission denied'); }
    } });
    try { await captureReportPhotoFromCamera(); return false; }
    catch { return !document.querySelector('.report-camera-overlay') && document.body.style.overflow === ''; }
  })()`, true);
  assert.ok(denied, "Từ chối quyền camera phải đóng giao diện, không mở thư viện");
  console.log("PASS hủy và từ chối quyền camera");
} finally {
  socket?.close();
  browser.kill();
  await delay(300);
  try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
  catch (error) { console.warn("Không dọn được profile Chrome tạm:", error.message); }
}
