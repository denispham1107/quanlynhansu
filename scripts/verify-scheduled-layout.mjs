import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const indexUrl = pathToFileURL(join(projectRoot, "index.html")).href;
const browserCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const browserPath = browserCandidates.find(existsSync);

if (!browserPath) throw new Error("Không tìm thấy Chrome hoặc Edge để kiểm tra responsive.");

const profiles = [
  { name: "iPhone 320 dọc", width: 320, height: 700 },
  { name: "iPhone 375 dọc", width: 375, height: 812 },
  { name: "iPhone 390 dọc", width: 390, height: 844 },
  { name: "iPhone 430 dọc", width: 430, height: 932 },
  { name: "iPhone 844 ngang", width: 844, height: 390 },
  { name: "iPhone 932 ngang", width: 932, height: 430 },
];

// Dùng cổng riêng cho mỗi lượt kiểm tra để không kết nối nhầm vào một Chrome
// headless còn sót lại từ lần chạy trước.
const debugPort = 20000 + Math.floor(Math.random() * 20000);
const profileDir = mkdtempSync(join(tmpdir(), "quanlynhansu-responsive-"));
const browser = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--allow-file-access-from-files",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`,
  "about:blank",
], { stdio: "ignore" });

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome chưa mở cổng debug.
    }
    await delay(100);
  }
  throw new Error("Không kết nối được Chrome DevTools.");
}

await waitForDebugger();
const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(indexUrl)}`, {
  method: "PUT",
});
const target = await targetResponse.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

let commandId = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(message.error.message));
  else handler.resolve(message.result);
});

function send(method, params = {}) {
  commandId += 1;
  const id = commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveCommand, rejectCommand) => {
    pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
  });
}

const safariUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*app.js*", "*firebase*", "*jszip*"] });
await send("Emulation.setUserAgentOverride", { userAgent: safariUserAgent, platform: "iPhone" });
await send("Page.navigate", { url: indexUrl });
for (let attempt = 0; attempt < 40; attempt += 1) {
  const readyState = await send("Runtime.evaluate", {
    expression: "document.readyState",
    returnByValue: true,
  });
  if (readyState.result.value === "complete") break;
  await delay(100);
}

const failures = [];

await send("Emulation.setDeviceMetricsOverride", {
  width: 1600,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
  screenWidth: 1600,
  screenHeight: 900,
});
const desktopScheduleButtonCheck = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const adminView = document.getElementById("adminView");
    const deleteButton = document.getElementById("deleteAllWorkOrdersBtn");
    const scheduleButton = document.getElementById("openScheduledWorkOrderBtn");
    const importButton = document.getElementById("openGoogleCalendarImportBtn");
    adminView.classList.remove("hidden");
    scheduleButton.classList.remove("hidden");
    importButton.classList.remove("hidden");
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const deleteBox = box(deleteButton);
    const scheduleBox = box(scheduleButton);
    const importBox = box(importButton);
    const icon = scheduleButton.querySelector(".schedule-calendar-icon");
    const iconBox = box(icon);
    return {
      sameRow: Math.abs(deleteBox.top - scheduleBox.top) < 1 && Math.abs(scheduleBox.top - importBox.top) < 1,
      correctOrder: deleteBox.right <= scheduleBox.left && scheduleBox.right <= importBox.left,
      iconInside: iconBox.left >= scheduleBox.left && iconBox.right <= scheduleBox.right && iconBox.top >= scheduleBox.top && iconBox.bottom <= scheduleBox.bottom,
      hasVectorIcon: Boolean(icon?.querySelector("svg rect") && icon?.querySelectorAll("svg circle").length === 6),
      scheduleParentId: scheduleButton.parentElement?.id || "",
      pageScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  })()`
});
const desktopResult = desktopScheduleButtonCheck.result.value;
const desktopPassed = desktopResult.sameRow
  && desktopResult.correctOrder
  && desktopResult.iconInside
  && desktopResult.hasVectorIcon
  && desktopResult.scheduleParentId === "mobileTaskPanelMenu"
  && desktopResult.pageScrollWidth <= desktopResult.viewportWidth;
console.log(`${desktopPassed ? "PASS" : "FAIL"} | Desktop Lên lịch giữa Xóa và Nạp lịch | scroll ${desktopResult.pageScrollWidth}/${desktopResult.viewportWidth}`);
if (!desktopPassed) failures.push({ profile: "Desktop schedule action", result: desktopResult });

const prepareExpression = `(() => {
  const modal = document.getElementById("taskModal");
  const card = modal?.querySelector(".task-create-modal-card");
  const form = document.getElementById("createTaskForm");
  const config = document.getElementById("scheduledWorkOrderConfig");
  const actions = form?.querySelector(".task-create-actions");
  if (!modal || !card || !form || !config || !actions) throw new Error("Thiếu DOM của form lên lịch.");
  modal.classList.remove("hidden");
  modal.classList.add("is-schedule-mode");
  config.classList.remove("hidden");
  form.replaceChildren(config, actions);
  document.getElementById("saveDraftBtn")?.classList.add("hidden");
  document.getElementById("createTaskBtn")?.classList.add("hidden");
  document.getElementById("viewScheduledWorkOrdersBtn")?.classList.remove("hidden");
  document.getElementById("scheduleWorkOrderBtn")?.classList.remove("hidden");
  card.replaceChildren(form);
  modal.style.cssText = "display:block!important;position:relative!important;inset:auto!important;width:100%!important;padding:8px!important;";
  card.style.cssText = "display:block!important;width:100%!important;max-width:100%!important;margin:0!important;";
  form.style.cssText = "display:block!important;width:100%!important;padding:8px!important;";
  [...document.body.children].forEach((child) => {
    if (child !== modal && child.tagName !== "STYLE" && child.tagName !== "LINK") child.style.display = "none";
  });
  document.body.style.margin = "0";
  document.getElementById("scheduledWorkOrderDate").value = "2026-09-20";
  document.getElementById("scheduledWorkOrderTime").value = "22:57:30";
  document.getElementById("scheduledWorkOrderCountdownMinutes").value = "15";
  document.getElementById("scheduledWorkOrderRepeatMode").value = "daily";
  return true;
})()`;
await send("Runtime.evaluate", { expression: prepareExpression, returnByValue: true });

for (const profile of profiles) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: 3,
    mobile: true,
    screenWidth: profile.width,
    screenHeight: profile.height,
  });
  await delay(120);
  const measurement = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const round = (value) => Math.round(value * 100) / 100;
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return { left: round(rect.left), right: round(rect.right), top: round(rect.top), bottom: round(rect.bottom), width: round(rect.width) };
      };
      const config = box(document.getElementById("scheduledWorkOrderConfig"));
      const actions = box(document.querySelector(".task-create-actions"));
      const shells = [...document.querySelectorAll(".scheduled-control-shell")].map(box);
      const controls = [...document.querySelectorAll(".scheduled-control-shell > input, .scheduled-control-shell > select")].map(box);
      const actionButtons = [...document.querySelectorAll(".task-create-actions > .btn:not(.hidden)")].map(box);
      const inside = [...shells, ...controls].every((rect) => rect.left >= config.left - 0.5 && rect.right <= config.right + 0.5);
      const shellControlMatch = shells.every((shell, index) => controls[index].left >= shell.left - 0.5 && controls[index].right <= shell.right + 0.5);
      const actionsInside = actionButtons.every((rect) => rect.left >= actions.left - 0.5 && rect.right <= actions.right + 0.5);
      const overlap = shells.some((left, leftIndex) => shells.some((right, rightIndex) => {
        if (rightIndex <= leftIndex) return false;
        const vertical = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
        const horizontal = Math.min(left.right, right.right) - Math.max(left.left, right.left);
        return vertical > 1 && horizontal > 1;
      }));
      return {
        display: getComputedStyle(document.querySelector(".scheduled-work-order-config-grid")).display,
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        columns: getComputedStyle(document.querySelector(".scheduled-work-order-config-grid")).gridTemplateColumns,
        config,
        actions,
        shells,
        controls,
        actionButtons,
        inside,
        shellControlMatch,
        actionsInside,
        overlap,
      };
    })()`,
  });
  const result = measurement.result.value;
  const passed = result.display === "grid"
    && result.shells.length === 5
    && result.controls.length === 5
    && result.actionButtons.length === 2
    && result.config.width > 0
    && result.shells.every((rect) => rect.width > 0)
    && result.controls.every((rect) => rect.width > 0)
    && result.inside
    && result.shellControlMatch
    && result.actionsInside
    && !result.overlap
    && result.scrollWidth <= profile.width;
  console.log(`${passed ? "PASS" : "FAIL"} | ${profile.name} | cột ${result.columns} | scroll ${result.scrollWidth}/${profile.width}`);
  if (!passed) failures.push({ profile: profile.name, result });
}

await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const taskModal = document.getElementById("taskModal");
    const listModal = document.getElementById("scheduledWorkOrderListModal");
    const list = document.getElementById("scheduledWorkOrderList");
    taskModal.classList.add("hidden");
    listModal.style.removeProperty("display");
    listModal.classList.remove("hidden");
    list.innerHTML = Array.from({ length: 24 }, (_, index) => \`
      <article class="scheduled-work-order-list-item">
        <div class="scheduled-work-order-list-row">
          <div class="scheduled-work-order-list-main">22/09/2026, 08:30:00, Nhóm nhân viên, “Phiếu #\${index + 1} - Công việc kiểm tra giao diện”</div>
          <button class="btn danger scheduled-work-order-delete-btn" type="button">×</button>
        </div>
        <div class="scheduled-work-order-list-meta"><span>Lặp lại hằng ngày</span><span>Đếm ngược 10 phút</span></div>
      </article>
    \`).join("");
    return true;
  })()`
});

for (const profile of profiles) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: 3,
    mobile: true,
    screenWidth: profile.width,
    screenHeight: profile.height,
  });
  await delay(120);
  const measurement = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const round = (value) => Math.round(value * 100) / 100;
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return { left: round(rect.left), right: round(rect.right), top: round(rect.top), bottom: round(rect.bottom), width: round(rect.width), height: round(rect.height) };
      };
      const modal = document.getElementById("scheduledWorkOrderListModal");
      const cardElement = modal.querySelector(".scheduled-work-order-list-card");
      const listElement = document.getElementById("scheduledWorkOrderList");
      const firstRowElement = listElement.querySelector(".scheduled-work-order-list-row");
      const firstDeleteButtonElement = listElement.querySelector(".scheduled-work-order-delete-btn");
      const card = box(cardElement);
      const list = box(listElement);
      const firstRow = box(firstRowElement);
      const firstDeleteButton = box(firstDeleteButtonElement);
      return {
        modalOverflowY: getComputedStyle(modal).overflowY,
        cardOverflowY: getComputedStyle(cardElement).overflowY,
        listOverflowY: getComputedStyle(listElement).overflowY,
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        card,
        list,
        firstRow,
        firstDeleteButton,
        listClientHeight: listElement.clientHeight,
        listScrollHeight: listElement.scrollHeight,
        listInsideCard: list.left >= card.left - 0.5 && list.right <= card.right + 0.5 && list.top >= card.top - 0.5 && list.bottom <= card.bottom + 0.5,
        deleteButtonInsideRow: firstDeleteButton.left >= firstRow.left - 0.5 && firstDeleteButton.right <= firstRow.right + 0.5 && firstDeleteButton.top >= firstRow.top - 0.5 && firstDeleteButton.bottom <= firstRow.bottom + 0.5,
        cardInsideViewport: card.left >= -0.5 && card.right <= document.documentElement.clientWidth + 0.5 && card.top >= -0.5 && card.bottom <= document.documentElement.clientHeight + 0.5,
        taskModalHidden: document.getElementById("taskModal").classList.contains("hidden"),
      };
    })()`
  });
  const result = measurement.result.value;
  const passed = result.taskModalHidden
    && result.card.width > 0
    && result.card.height > 0
    && result.list.width > 0
    && result.list.height > 0
    && result.listInsideCard
    && result.deleteButtonInsideRow
    && result.cardInsideViewport
    && result.modalOverflowY === "hidden"
    && result.cardOverflowY === "hidden"
    && ["auto", "scroll"].includes(result.listOverflowY)
    && result.listScrollHeight > result.listClientHeight
    && result.scrollWidth <= profile.width;
  console.log(`${passed ? "PASS" : "FAIL"} | Danh sách lịch ${profile.name} | list ${result.listClientHeight}/${result.listScrollHeight} | scroll ${result.scrollWidth}/${profile.width}`);
  if (!passed) failures.push({ profile: `Danh sách lịch ${profile.name}`, result });
}

socket.close();
browser.kill();
await Promise.race([
  new Promise((resolveExit) => browser.once("exit", resolveExit)),
  delay(1500),
]);
const resolvedTemp = resolve(profileDir);
if (resolvedTemp.startsWith(resolve(tmpdir()) + sep)) {
  try {
    rmSync(resolvedTemp, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    // Không làm hỏng kết quả kiểm tra chỉ vì Chrome còn giữ file cache tạm trong chốc lát.
  }
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
