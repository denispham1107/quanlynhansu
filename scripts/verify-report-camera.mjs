import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "app.js"), "utf8");
const cameraSettings = source.match(/const PHOTO_UPLOAD_MAX_DIMENSION = \d+;\s*const PHOTO_UPLOAD_JPEG_QUALITY = [\d.]+;/)?.[0];
const cameraCode = source.slice(source.indexOf("function isPhoneCameraDevice()"), source.indexOf("async function openPhotoUploadPicker("));
const reportCode = source.slice(source.indexOf("async function openPhotoUploadPicker("), source.indexOf("// =========================", source.indexOf("async function openPhotoUploadPicker(")));
assert.ok(cameraSettings && cameraCode.includes("getUserMedia"));
assert.ok(reportCode.includes("captureReportPhotosFromCamera()"));
assert.ok(!reportCode.includes('input.type = "file"'), "Ảnh báo cáo không được mở bộ chọn tệp");
assert.ok(reportCode.includes("index < files.length") && reportCode.includes("await optimizePhotoFileForUpload(originalFile)"), "Toàn bộ ảnh phải đi qua bước kiểm tra và nén");
assert.ok(reportCode.includes("index < optimizedResults.length") && reportCode.includes("await uploadBytes(fileRef, file"), "Toàn bộ ảnh phải được gửi lên trong cùng một lần đăng");
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
  await evaluate(`${cameraSettings}\n${cameraCode}`);
  assert.equal(await evaluate("captureReportPhotosFromCamera().then(() => 'allowed', () => 'blocked')", true), "blocked");
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
    window.__cameraPromise = captureReportPhotosFromCamera();
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
  for (let index = 0; index < 3; index += 1) {
    await evaluate("document.querySelector('.report-camera-shoot').click()");
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await evaluate("document.querySelectorAll('.report-camera-capture').length") === index + 1) break;
      await delay(100);
    }
    assert.equal(await evaluate("document.querySelectorAll('.report-camera-capture').length"), index + 1);
    assert.equal(await evaluate("document.querySelector('.report-camera-overlay') !== null"), true, "Camera phải tiếp tục mở sau mỗi ảnh");
  }
  assert.equal(await evaluate("document.querySelector('.report-camera-submit').textContent"), "Đăng 3 ảnh");
  await evaluate("document.querySelectorAll('.report-camera-capture button')[1].click()");
  assert.equal(await evaluate("document.querySelectorAll('.report-camera-capture').length"), 2);
  assert.equal(await evaluate("document.querySelector('.report-camera-submit').textContent"), "Đăng 2 ảnh");
  await evaluate("document.querySelector('.report-camera-submit').click()");
  const capture = await evaluate("window.__cameraPromise.then(files => ({ count: files.length, types: files.map(file => file.type), sizes: files.map(file => file.size), names: files.map(file => file.name), stopped: window.__cameraStream.getTracks().every(track => track.readyState === 'ended'), overlayGone: !document.querySelector('.report-camera-overlay') }))", true);
  assert.equal(capture.count, 2);
  assert.ok(capture.types.every((type) => type === "image/jpeg"));
  assert.ok(capture.sizes.every((size) => size > 0) && capture.names.every((name) => name.endsWith(".jpg")));
  assert.ok(capture.stopped && capture.overlayGone, "Đóng camera phải dừng camera và dọn giao diện");
  console.log("PASS chụp liên tiếp, bỏ ảnh, đăng cùng lô JPEG và dừng camera");

  await evaluate("window.__cameraPromise = captureReportPhotosFromCamera()");
  for (let index = 0; index < 30; index += 1) {
    await evaluate("document.querySelector('.report-camera-shoot').click()");
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await evaluate("document.querySelectorAll('.report-camera-capture').length") === index + 1) break;
      await delay(100);
    }
    assert.equal(await evaluate("document.querySelectorAll('.report-camera-capture').length"), index + 1);
  }
  assert.equal(await evaluate("document.querySelector('.report-camera-shoot').disabled"), true, "Đủ 30 ảnh phải khóa nút chụp");
  for (const [width, height] of [[320, 700], [375, 812], [390, 844], [430, 932], [844, 390], [932, 430]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true, screenWidth: width, screenHeight: height });
    const geometry = await evaluate(`(() => {
      const card = document.querySelector('.report-camera-card').getBoundingClientRect();
      const actions = document.querySelector('.report-camera-actions').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.report-camera-actions button')].map(button => button.getBoundingClientRect());
      const content = document.querySelector('.report-camera-content');
      return { cardLeft:card.left, cardRight:card.right, cardBottom:card.bottom,
        actionsBottom:actions.bottom, buttons:buttons.map(box => ({ left:box.left, right:box.right, bottom:box.bottom })),
        contentScrollWidth:content.scrollWidth, contentClientWidth:content.clientWidth,
        pageScrollWidth:document.documentElement.scrollWidth };
    })()`);
    assert.ok(geometry.cardLeft >= -1 && geometry.cardRight <= width + 1 && geometry.cardBottom <= height + 1, `${width}px: card 30 ảnh tràn màn hình`);
    assert.ok(geometry.actionsBottom <= height + 1 && geometry.buttons.every((box) => box.bottom <= height + 1), `${width}px: nút bị che`);
    assert.ok(geometry.buttons[0].right <= geometry.buttons[1].left, `${width}px: nút chồng nhau`);
    assert.ok(geometry.contentScrollWidth <= geometry.contentClientWidth + 1 && geometry.pageScrollWidth <= width + 1, `${width}px: ảnh tạo cuộn ngang`);
    console.log(`PASS 30 ảnh ${width}x${height}`);
  }
  await evaluate("document.querySelector('.report-camera-capture button').click()");
  assert.equal(await evaluate("document.querySelector('.report-camera-shoot').disabled"), false, "Bỏ ảnh phải cho chụp tiếp");
  await evaluate("document.querySelector('.report-camera-cancel').click()");
  assert.equal(await evaluate("window.__cameraPromise.then(files => files.length)", true), 0, "Hủy phải bỏ cả lô ảnh");
  console.log("PASS giới hạn 30 ảnh và hủy cả lô");

  const cancelled = await evaluate(`(async () => {
    window.__cameraPromise = captureReportPhotosFromCamera();
    document.querySelector('.report-camera-cancel').click();
    const file = await window.__cameraPromise;
    return Array.isArray(file) && file.length === 0 && !document.querySelector('.report-camera-overlay') && document.body.style.overflow === '';
  })()`, true);
  assert.ok(cancelled, "Hủy phải đóng camera và khôi phục trang");

  const denied = await evaluate(`(async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => { throw new Error('Permission denied'); }
    } });
    try { await captureReportPhotosFromCamera(); return false; }
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
