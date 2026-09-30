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
  { name: "Desktop 1440", width: 1440, height: 900, mobile: false },
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

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  mobile: true,
  screenWidth: 390,
  screenHeight: 844,
});
await delay(120);
const mobileScheduleButtonCheck = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    document.getElementById("appView").classList.remove("hidden");
    document.getElementById("adminView").classList.remove("hidden");
    const menu = document.getElementById("mobileTaskPanelMenu");
    const scheduleButton = document.getElementById("openScheduledWorkOrderBtn");
    menu.classList.add("is-open");
    scheduleButton.classList.remove("hidden");
    const visibleScheduleButtons = [...menu.querySelectorAll(".schedule-work-order-btn")]
      .filter((button) => {
        const style = getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return style.display !== "none" && rect.width > 0 && rect.height > 0;
      });
    const menuRect = menu.getBoundingClientRect();
    const buttonRect = scheduleButton.getBoundingClientRect();
    return {
      visibleCount: visibleScheduleButtons.length,
      visibleIds: visibleScheduleButtons.map((button) => button.id),
      buttonInsideMenu: buttonRect.left >= menuRect.left - 0.5
        && buttonRect.right <= menuRect.right + 0.5
        && buttonRect.top >= menuRect.top - 0.5
        && buttonRect.bottom <= menuRect.bottom + 0.5,
      pageScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  })()`
});
const mobileScheduleResult = mobileScheduleButtonCheck.result.value;
const mobileSchedulePassed = mobileScheduleResult.visibleCount === 1
  && mobileScheduleResult.visibleIds[0] === "openScheduledWorkOrderBtn"
  && mobileScheduleResult.buttonInsideMenu
  && mobileScheduleResult.pageScrollWidth <= mobileScheduleResult.viewportWidth;
console.log(`${mobileSchedulePassed ? "PASS" : "FAIL"} | Mobile chỉ có một nút Lên lịch | ${mobileScheduleResult.visibleCount} nút`);
if (!mobileSchedulePassed) failures.push({ profile: "Mobile single schedule action", result: mobileScheduleResult });

const prepareExpression = `(() => {
  const modal = document.getElementById("taskModal");
  const card = modal?.querySelector(".task-create-modal-card");
  const form = document.getElementById("createTaskForm");
  const config = document.getElementById("scheduledWorkOrderConfig");
  const actions = form?.querySelector(".task-create-actions");
  if (!modal || !card || !form || !config || !actions) throw new Error("Thiếu DOM của form lên lịch.");
  document.getElementById("appView").classList.remove("hidden");
  document.getElementById("adminView").classList.add("hidden");
  document.body.classList.add("schedule-page-open");
  modal.classList.remove("hidden");
  modal.classList.add("is-schedule-mode");
  modal.setAttribute("role", "main");
  modal.removeAttribute("aria-modal");
  config.classList.remove("hidden");
  document.getElementById("saveDraftBtn")?.classList.add("hidden");
  document.getElementById("createTaskBtn")?.classList.add("hidden");
  document.getElementById("viewScheduledWorkOrdersBtn")?.classList.remove("hidden");
  document.getElementById("viewScheduledWorkOrdersHeaderBtn")?.classList.remove("hidden");
  document.getElementById("scheduleWorkOrderBtn")?.classList.remove("hidden");
  document.getElementById("scheduledWorkOrderDate").value = "2026-09-20";
  document.getElementById("scheduledWorkOrderTime").value = "22:57:30";
  [...document.querySelectorAll(".scheduled-time-part")].forEach((part, index) => { part.textContent = ["22", "57", "30"][index]; });
  const picker = document.getElementById("scheduledWorkOrderTimePicker");
  document.getElementById("scheduledWorkOrderTimePickerParts").innerHTML = '<button>Giờ 22</button><button>Phút 57</button><button>Giây 30</button>';
  document.getElementById("scheduledWorkOrderTimePickerValues").innerHTML = Array.from({length:60}, (_,value) => '<button>'+String(value).padStart(2,'0')+'</button>').join('');
  picker.classList.remove("hidden");
  document.getElementById("scheduledWorkOrderCountdownMinutes").value = "15";
  document.getElementById("scheduledWorkOrderRepeatMode").value = "daily";
  return true;
})()`;
await send("Runtime.evaluate", { expression: prepareExpression, returnByValue: true });

for (const profile of profiles) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.mobile === false ? 1 : 3,
    mobile: profile.mobile !== false,
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
      const page = box(document.getElementById("taskModal"));
      const card = box(document.querySelector("#taskModal .task-create-modal-card"));
      const header = box(document.querySelector("#taskModal .task-create-modal-header"));
      const heading = box(document.querySelector("#taskModal .task-create-heading"));
      const headerCalendar = box(document.getElementById("viewScheduledWorkOrdersHeaderBtn"));
      const headerBack = box(document.querySelector("#taskModal .task-create-close-btn"));
      const shells = [...document.querySelectorAll(".scheduled-control-shell")].map(box);
      const controls = [...document.querySelectorAll(".scheduled-control-shell > input, .scheduled-control-shell > select")].map(box);
      const timeInput = document.getElementById("scheduledWorkOrderTime");
      const timeShell = document.querySelector(".scheduled-time-shell");
      const timeParts = [...timeShell.querySelectorAll(".scheduled-time-part")].map(box);
      const timeColons = [...timeShell.querySelectorAll(".scheduled-time-colon")].map(box);
      const hourPart = timeShell.querySelector('[data-scheduled-time-part="hour"]');
      const originalHour = hourPart.textContent;
      hourPart.textContent = "";
      const emptyHourHint = getComputedStyle(hourPart, "::before").content;
      const emptyHourBox = box(hourPart);
      hourPart.textContent = originalHour;
      const timeIcon = timeShell.querySelector(".scheduled-time-icon");
      const timeIconBox = box(timeIcon);
      const timeShellBox = box(timeShell);
      const picker = box(document.getElementById("scheduledWorkOrderTimePicker"));
      const pickerValues = box(document.getElementById("scheduledWorkOrderTimePickerValues"));
      const pickerFooter = box(document.querySelector(".scheduled-time-picker-footer"));
      const pickerButtons = [...document.querySelectorAll(".scheduled-time-picker button")].map(box);
      const footerChildren = [...document.querySelectorAll(".scheduled-time-picker-footer > *")].map(box);
      const actionButtons = [...document.querySelectorAll(".task-create-actions > .btn:not(.hidden)")].map(box);
      const inside = [...shells, ...controls].every((rect) => rect.left >= config.left - 0.5 && rect.right <= config.right + 0.5);
      const shellControlMatch = controls.every((control) => shells.some((shell) => control.left >= shell.left - 0.5 && control.right <= shell.right + 0.5 && control.top >= shell.top - 0.5 && control.bottom <= shell.bottom + 0.5));
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
        pagePosition: getComputedStyle(document.getElementById("taskModal")).position,
        cardMaxHeight: getComputedStyle(document.querySelector("#taskModal .task-create-modal-card")).maxHeight,
        backdropDisplay: getComputedStyle(document.querySelector("#taskModal .modal-backdrop")).display,
        dashboardHidden: document.getElementById("adminView").classList.contains("hidden"),
        page,
        card,
        headerActionsInside: heading.left >= header.left - 0.5
          && heading.right <= headerCalendar.left + 0.5
          && headerCalendar.left >= header.left - 0.5
          && headerCalendar.right <= headerBack.left + 0.5
          && headerBack.right <= header.right + 0.5
          && headerCalendar.top >= header.top - 0.5
          && headerCalendar.bottom <= header.bottom + 0.5
          && headerBack.top >= header.top - 0.5
          && headerBack.bottom <= header.bottom + 0.5,
        headerCalendarHasIcon: Boolean(document.querySelector("#viewScheduledWorkOrdersHeaderBtn svg rect")),
        config,
        actions,
        shells,
        controls,
        timeType: timeInput.type,
        timeValue: timeInput.value,
        timePartsInside: [...timeParts, ...timeColons].every((rect) => rect.left >= timeShellBox.left - 0.5 && rect.right <= timeShellBox.right + 0.5),
        timePartsCount: timeParts.length,
        timeColonsCount: timeColons.length,
        emptyHourHint,
        emptyHourInside: emptyHourBox.left >= timeShellBox.left - 0.5 && emptyHourBox.right <= timeShellBox.right + 0.5,
        timeIconInside: timeIconBox.left >= timeShellBox.left && timeIconBox.right <= timeShellBox.right,
        pickerInside: picker.left >= config.left - 0.5 && picker.right <= config.right + 0.5
          && pickerValues.left >= picker.left - 0.5 && pickerValues.right <= picker.right + 0.5
          && pickerFooter.left >= picker.left - 0.5 && pickerFooter.right <= picker.right + 0.5,
        pickerControlsInside: pickerButtons.every((rect) => rect.left >= picker.left - 0.5 && rect.right <= picker.right + 0.5)
          && footerChildren.every((rect) => rect.left >= pickerFooter.left - 0.5 && rect.right <= pickerFooter.right + 0.5),
        pickerValueScrolls: document.getElementById("scheduledWorkOrderTimePickerValues").scrollHeight
          > document.getElementById("scheduledWorkOrderTimePickerValues").clientHeight,
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
    && result.pagePosition !== "fixed"
    && result.cardMaxHeight === "none"
    && result.backdropDisplay === "none"
    && result.dashboardHidden
    && result.page.left >= -0.5
    && result.page.right <= profile.width + 0.5
    && result.card.left >= result.page.left - 0.5
    && result.card.right <= result.page.right + 0.5
    && result.headerActionsInside
    && result.headerCalendarHasIcon
    && result.shells.length === 6
    && result.controls.length === 5
    && result.timeType === "hidden"
    && result.timeValue === "22:57:30"
    && result.timePartsInside && result.timePartsCount === 3 && result.timeColonsCount === 2
    && result.emptyHourHint.includes("Giờ") && result.emptyHourInside
    && result.timeIconInside
    && result.pickerInside
    && result.pickerControlsInside
    && result.pickerValueScrolls
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
  expression: `(() => {
    const modal = document.getElementById("taskModal");
    modal.classList.add("is-scheduled-draft-edit");
    document.getElementById("viewScheduledWorkOrdersBtn").classList.add("hidden");
    document.getElementById("scheduleWorkOrderBtn").classList.add("hidden");
    document.getElementById("cancelScheduledDraftEditBtn").classList.remove("hidden");
    document.getElementById("saveScheduledDraftEditBtn").classList.remove("hidden");
    for (const control of document.querySelectorAll("#scheduledWorkOrderConfig input, #scheduledWorkOrderConfig select, #scheduledWorkOrderConfig button")) control.disabled = true;
    for (const part of document.querySelectorAll(".scheduled-time-part")) part.contentEditable = "false";
    for (const control of document.querySelectorAll("#taskRowsContainer .row-date, #taskRowsContainer .row-assignee")) control.disabled = true;
    for (const control of document.querySelectorAll("#taskRowsContainer .row-hotel, #taskRowsContainer .row-hotel-pet-count")) control.disabled = true;
    return true;
  })()`
});
for (const profile of profiles) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: profile.width, height: profile.height,
    deviceScaleFactor: profile.mobile === false ? 1 : 3,
    mobile: profile.mobile !== false,
    screenWidth: profile.width, screenHeight: profile.height
  });
  await delay(80);
  const measurement = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const modal = document.getElementById("taskModal");
      const card = modal.querySelector(".task-create-modal-card").getBoundingClientRect();
      const actions = [...modal.querySelectorAll(".task-create-actions > .btn:not(.hidden)")];
      const inside = actions.every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.left >= card.left - .5 && rect.right <= card.right + .5;
      });
      return {
        buttons: actions.map((button) => button.id),
        inside,
        scheduleLocked: [...modal.querySelectorAll("#scheduledWorkOrderConfig input, #scheduledWorkOrderConfig select, #scheduledWorkOrderConfig button")].every((control) => control.disabled),
        segmentsLocked: [...modal.querySelectorAll(".scheduled-time-part")].every((part) => part.contentEditable === "false"),
        assignmentsLocked: [...modal.querySelectorAll("#taskRowsContainer .row-date, #taskRowsContainer .row-assignee")].every((control) => control.disabled),
        hotelLocked: [...modal.querySelectorAll("#taskRowsContainer .row-hotel, #taskRowsContainer .row-hotel-pet-count")].every((control) => control.disabled),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      };
    })()`
  });
  const result = measurement.result.value;
  const passed = result.buttons.join(",") === "cancelScheduledDraftEditBtn,saveScheduledDraftEditBtn"
    && result.inside && result.scheduleLocked && result.segmentsLocked && result.assignmentsLocked && result.hotelLocked
    && result.scrollWidth <= result.viewportWidth;
  console.log(`${passed ? "PASS" : "FAIL"} | Sửa Phiếu từ lịch ${profile.name} | scroll ${result.scrollWidth}/${result.viewportWidth}`);
  if (!passed) failures.push({ profile: `Sửa Phiếu từ lịch ${profile.name}`, result });
}

await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    const taskModal = document.getElementById("taskModal");
    const listModal = document.getElementById("scheduledWorkOrderListModal");
    const list = document.getElementById("scheduledWorkOrderList");
    const dateRange = document.getElementById("scheduledWorkOrderDateRangeFilter");
    taskModal.classList.add("hidden");
    listModal.style.removeProperty("display");
    listModal.classList.remove("hidden");
    document.getElementById("scheduledWorkOrderTimeFilter").value = "range";
    document.getElementById("scheduledWorkOrderDateFilterField").classList.add("hidden");
    dateRange.classList.remove("hidden");
    document.getElementById("scheduledWorkOrderDateFromFilter").value = "2026-09-01";
    document.getElementById("scheduledWorkOrderDateToFilter").value = "2026-09-30";
    list.innerHTML = Array.from({ length: 24 }, (_, index) => \`
      <article class="scheduled-work-order-list-item\${index === 23 ? " is-deleted" : index === 22 ? " is-replaced" : index === 21 ? " is-assigned" : ""}">
        <div class="scheduled-work-order-list-row">
          <div class="scheduled-work-order-list-main">22/09/2026, 08:30:00, Nhóm nhân viên, “Phiếu #\${index + 1} - Công việc kiểm tra giao diện”</div>
          <button class="btn danger scheduled-work-order-delete-btn" data-delete-scheduled-work-order="test-\${index}" type="button">×</button>
        </div>
        <div class="scheduled-work-order-list-meta"><span>Lặp lại hằng ngày</span><span>Đếm ngược 10 phút</span><span>\${index === 23 ? "Đã xóa" : index === 22 ? "Đã thay thế" : index === 21 ? "Đã giao việc" : "Đang chờ đến giờ"}</span>\${index === 22 ? '<button class="scheduled-work-order-replacement-link" type="button">Lịch mới: 09:45:00 30/09/2026 →</button>' : ""}</div>
      </article>
    \`).join("");
    return true;
  })()`
});

for (const profile of profiles) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.mobile === false ? 1 : 3,
    mobile: profile.mobile !== false,
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
    const contentElement = modal.querySelector(".scheduled-work-order-list-content");
    const headerElement = contentElement.querySelector(".modal-header");
    const footerElement = cardElement.querySelector(".modal-footer-actions");
    const filterElement = modal.querySelector(".scheduled-work-order-list-filter");
    const filterShellElements = [...modal.querySelectorAll(".scheduled-work-order-filter-shell, .scheduled-work-order-date-shell")]
      .filter((element) => !element.closest(".hidden"));
    const filterControlElements = [...modal.querySelectorAll(".scheduled-work-order-filter-shell > select, .scheduled-work-order-date-shell > input")]
      .filter((element) => !element.closest(".hidden"));
    const listElement = document.getElementById("scheduledWorkOrderList");
      const firstRowElement = listElement.querySelector(".scheduled-work-order-list-row");
      const firstDeleteButtonElement = listElement.querySelector(".scheduled-work-order-delete-btn");
      const deletedElement = listElement.querySelector(".scheduled-work-order-list-item.is-deleted");
      const replacedElement = listElement.querySelector(".scheduled-work-order-list-item.is-replaced");
      const assignedElement = listElement.querySelector(".scheduled-work-order-list-item.is-assigned");
    const replacementLinkElement = replacedElement.querySelector(".scheduled-work-order-replacement-link");
    const card = box(cardElement);
    const content = box(contentElement);
    const header = box(headerElement);
    const footer = box(footerElement);
    const filter = box(filterElement);
    const filterShells = filterShellElements.map(box);
    const filterControls = filterControlElements.map(box);
    const list = box(listElement);
      const firstRow = box(firstRowElement);
      const firstDeleteButton = box(firstDeleteButtonElement);
      const archivedDeleteButtonsInside = [deletedElement, replacedElement].every((item) => {
        const itemRow = box(item.querySelector(".scheduled-work-order-list-row"));
        const button = box(item.querySelector("[data-delete-scheduled-work-order]"));
        return button.left >= itemRow.left - 0.5 && button.right <= itemRow.right + 0.5
          && button.top >= itemRow.top - 0.5 && button.bottom <= itemRow.bottom + 0.5;
      });
      contentElement.scrollTop = Math.min(contentElement.scrollHeight - contentElement.clientHeight, header.height + 50);
      const headerScrollDistance = header.top - box(headerElement).top;
      contentElement.scrollTop = 0;
      return {
        modalOverflowY: getComputedStyle(modal).overflowY,
        cardOverflowY: getComputedStyle(cardElement).overflowY,
        contentOverflowY: getComputedStyle(contentElement).overflowY,
        bodyOverflowY: getComputedStyle(document.body).overflowY,
        backdropDisplay: getComputedStyle(modal.querySelector(".modal-backdrop")).display,
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
      card,
      content,
      headerScrollDistance,
      headerInsideContent: header.left >= content.left - 0.5 && header.right <= content.right + 0.5
        && header.top >= content.top - 0.5 && header.bottom <= content.bottom + 0.5,
      footerInsideCard: footer.left >= card.left - 0.5 && footer.right <= card.right + 0.5
        && footer.top >= card.top - 0.5 && footer.bottom <= card.bottom + 0.5,
      filter,
      filterShells,
      filterControls,
      list,
        firstRow,
        firstDeleteButton,
        deletedInsideList: box(deletedElement).left >= list.left - 0.5 && box(deletedElement).right <= list.right + 0.5,
        deletedNoEdit: !deletedElement.hasAttribute("data-edit-scheduled-work-order"),
        deletedRedBorder: getComputedStyle(deletedElement).borderTopColor === "rgb(252, 165, 165)",
        assignedInsideList: box(assignedElement).left >= list.left - 0.5 && box(assignedElement).right <= list.right + 0.5,
        assignedGreenBorder: getComputedStyle(assignedElement).borderTopColor === "rgb(134, 239, 172)",
        assignedGreenBackground: getComputedStyle(assignedElement).backgroundImage.includes("rgb(220, 252, 231)"),
        replacedInsideList: box(replacedElement).left >= list.left - 0.5 && box(replacedElement).right <= list.right + 0.5,
        replacedNoEdit: !replacedElement.hasAttribute("data-edit-scheduled-work-order"),
        archivedDeleteButtonsInside,
        replacedBlueBorder: getComputedStyle(replacedElement).borderTopColor === "rgb(147, 197, 253)",
        replacementLinkInsideRow: box(replacementLinkElement).left >= box(replacedElement).left - 0.5 && box(replacementLinkElement).right <= box(replacedElement).right + 0.5,
        contentClientHeight: contentElement.clientHeight,
        contentScrollHeight: contentElement.scrollHeight,
      contentInsideCard: content.left >= card.left - 0.5 && content.right <= card.right + 0.5 && content.top >= card.top - 0.5 && content.bottom <= card.bottom + 0.5,
      listInsideContentWidth: list.left >= content.left - 0.5 && list.right <= content.right + 0.5,
      filterInsideContentWidth: filter.left >= content.left - 0.5 && filter.right <= content.right + 0.5,
      controlsInsideShells: filterControls.every((control, index) => {
        const shell = filterShells[index];
        return shell
          && control.left >= shell.left - 0.5
          && control.right <= shell.right + 0.5
          && control.top >= shell.top - 0.5
          && control.bottom <= shell.bottom + 0.5;
      }),
      filterControlsDoNotOverlap: filterControls.every((left, leftIndex) => filterControls.every((right, rightIndex) => {
        if (rightIndex <= leftIndex) return true;
        const vertical = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
        const horizontal = Math.min(left.right, right.right) - Math.max(left.left, right.left);
        return vertical <= 1 || horizontal <= 1;
      })),
        deleteButtonInsideRow: firstDeleteButton.left >= firstRow.left - 0.5 && firstDeleteButton.right <= firstRow.right + 0.5 && firstDeleteButton.top >= firstRow.top - 0.5 && firstDeleteButton.bottom <= firstRow.bottom + 0.5,
        cardInsideViewport: card.left >= -0.5 && card.right <= document.documentElement.clientWidth + 0.5 && card.top >= -0.5 && card.bottom <= document.documentElement.clientHeight + 0.5,
        taskModalHidden: document.getElementById("taskModal").classList.contains("hidden"),
      };
    })()`
  });
  const result = measurement.result.value;
  const mobileFullPage = profile.width <= 768 || (profile.width <= 1024 && profile.height <= 500);
  const passed = result.taskModalHidden
    && result.card.width > 0
    && result.card.height > 0
    && result.list.width > 0
    && result.content.width > 0
    && result.content.height > 0
    && result.filter.width > 0
    && result.filterShells.length === 4
    && result.filterControls.length === 4
    && result.filterShells.every((rect) => rect.width > 0)
    && result.filterControls.every((rect) => rect.width > 0)
    && result.contentInsideCard
    && result.headerInsideContent
    && result.headerScrollDistance > 20
    && result.footerInsideCard
    && result.listInsideContentWidth
    && result.filterInsideContentWidth
    && result.controlsInsideShells
    && result.filterControlsDoNotOverlap
    && result.deleteButtonInsideRow
    && result.deletedInsideList
    && result.deletedNoEdit
    && result.deletedRedBorder
    && result.assignedInsideList
    && result.assignedGreenBorder
    && result.assignedGreenBackground
    && result.replacedInsideList
    && result.replacedNoEdit
    && result.archivedDeleteButtonsInside
    && result.replacedBlueBorder
    && result.replacementLinkInsideRow
    && result.cardInsideViewport
    && result.modalOverflowY === "hidden"
    && result.cardOverflowY === "hidden"
    && ["auto", "scroll"].includes(result.contentOverflowY)
    && result.contentScrollHeight > result.contentClientHeight
    && result.bodyOverflowY === "hidden"
    && (mobileFullPage
      ? result.card.left >= -0.5 && result.card.right >= profile.width - 0.5
        && result.card.top >= -0.5 && result.card.bottom >= profile.height - 0.5
        && result.backdropDisplay === "none"
      : result.backdropDisplay !== "none")
    && result.scrollWidth <= profile.width;
  console.log(`${passed ? "PASS" : "FAIL"} | Danh sách lịch ${profile.name} | content ${result.contentClientHeight}/${result.contentScrollHeight} | scroll ${result.scrollWidth}/${profile.width}`);
  if (!passed) failures.push({ profile: `Danh sách lịch ${profile.name}`, result });
}

await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `(() => {
    document.getElementById("scheduledWorkOrderListModal").classList.add("hidden");
    document.getElementById("scheduledWorkOrderDeleteModal").classList.remove("hidden");
    document.body.classList.add("scheduled-delete-dialog-open");
    document.getElementById("scheduledWorkOrderDeleteSummary").textContent = "Phiếu công việc cần xóa • 09:00:00 30/09/2026";
    return true;
  })()`
});

for (const profile of profiles) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.mobile === false ? 1 : 3,
    mobile: profile.mobile !== false,
    screenWidth: profile.width,
    screenHeight: profile.height,
  });
  await delay(80);
  const measurement = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const modal = document.getElementById("scheduledWorkOrderDeleteModal");
      const card = modal.querySelector(".scheduled-work-order-delete-card");
      const content = modal.querySelector(".scheduled-work-order-delete-content");
      const reason = document.getElementById("scheduledWorkOrderDeleteReason");
      const actions = [...modal.querySelectorAll(".modal-footer-actions .btn")];
      const rect = (element) => element.getBoundingClientRect();
      const cardRect = rect(card);
      const contentRect = rect(content);
      const reasonRect = rect(reason);
      const reasonField = document.getElementById("scheduledWorkOrderDeleteReasonField");
      const confirmButton = document.getElementById("confirmScheduledWorkOrderDeleteBtn");
      reasonField.classList.add("hidden");
      reason.required = false;
      confirmButton.textContent = "Xác nhận xóa vĩnh viễn";
      const purgeCardRect = rect(card);
      const purgeContentRect = rect(content);
      const purgeCardInsideViewport = purgeCardRect.left >= -0.5 && purgeCardRect.right <= innerWidth + 0.5
        && purgeCardRect.top >= -0.5 && purgeCardRect.bottom <= innerHeight + 0.5;
      const purgeContentInsideCard = purgeContentRect.left >= purgeCardRect.left - 0.5
        && purgeContentRect.right <= purgeCardRect.right + 0.5
        && purgeContentRect.top >= purgeCardRect.top - 0.5
        && purgeContentRect.bottom <= purgeCardRect.bottom + 0.5;
      const purgeActionsInsideCard = actions.every((button) => {
        const buttonRect = rect(button);
        return buttonRect.left >= purgeCardRect.left - 0.5 && buttonRect.right <= purgeCardRect.right + 0.5
          && buttonRect.bottom <= purgeCardRect.bottom + 0.5;
      });
      const purgeReasonHidden = getComputedStyle(reasonField).display === "none" && !reason.required;
      reasonField.classList.remove("hidden");
      reason.required = true;
      confirmButton.textContent = "Xác nhận xóa lịch";
      return {
        listHidden: document.getElementById("scheduledWorkOrderListModal").classList.contains("hidden"),
        cardInsideViewport: cardRect.left >= -0.5 && cardRect.right <= innerWidth + 0.5 && cardRect.top >= -0.5 && cardRect.bottom <= innerHeight + 0.5,
        contentInsideCard: contentRect.left >= cardRect.left - 0.5 && contentRect.right <= cardRect.right + 0.5 && contentRect.top >= cardRect.top - 0.5 && contentRect.bottom <= cardRect.bottom + 0.5,
        reasonInsideContent: reasonRect.left >= contentRect.left - 0.5 && reasonRect.right <= contentRect.right + 0.5,
        actionsInsideCard: actions.every((button) => { const buttonRect = rect(button); return buttonRect.left >= cardRect.left - 0.5 && buttonRect.right <= cardRect.right + 0.5 && buttonRect.bottom <= cardRect.bottom + 0.5; }),
        requiredReason: reason.required && reason.maxLength === 500 && !reason.checkValidity(),
        purgeCardInsideViewport,
        purgeContentInsideCard,
        purgeActionsInsideCard,
        purgeReasonHidden,
        pageScrollLocked: getComputedStyle(document.body).overflowY === "hidden",
        cardOverflow: getComputedStyle(card).overflowY,
        contentOverflow: getComputedStyle(content).overflowY,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      };
    })()`
  });
  const result = measurement.result.value;
  const passed = result.listHidden && result.cardInsideViewport && result.contentInsideCard
    && result.reasonInsideContent && result.actionsInsideCard && result.requiredReason && result.pageScrollLocked
    && result.purgeCardInsideViewport && result.purgeContentInsideCard
    && result.purgeActionsInsideCard && result.purgeReasonHidden
    && result.cardOverflow === "hidden" && ["auto", "scroll"].includes(result.contentOverflow)
    && result.scrollWidth <= result.viewportWidth;
  console.log(`${passed ? "PASS" : "FAIL"} | Nhập lý do xóa ${profile.name} | scroll ${result.scrollWidth}/${result.viewportWidth}`);
  if (!passed) failures.push({ profile: `Nhập lý do xóa ${profile.name}`, result });
}

await send("Runtime.evaluate", {
  expression: `(() => {
    document.getElementById("scheduledWorkOrderDeleteModal").classList.add("hidden");
    document.body.classList.remove("scheduled-delete-dialog-open");
    const adminView = document.getElementById("adminView");
    adminView.classList.remove("hidden");
    const ticket = document.createElement("section");
    ticket.id = "scheduledRescheduleLayoutFixture";
    ticket.className = "ticket-group is-draft-ticket is-scheduled-group-ticket";
    ticket.style.width = "100%";
    ticket.style.maxWidth = "840px";
    ticket.style.boxSizing = "border-box";
    ticket.innerHTML = '<div class="ticket-group-toolbar">'
      + '<div class="ticket-group-header"><div><span class="ticket-badge">Chưa giao việc</span><h4>Phiếu được tạo từ lịch - 1 công việc</h4></div></div>'
      + '<div class="ticket-actions">'
      + '<button class="btn ghost small" type="button">✏️ Chỉnh sửa</button>'
      + '<button class="btn ghost small" type="button">🗓 Dời lịch</button>'
      + '<button class="btn secondary small" type="button">📦 Đã mang đến</button>'
      + '<button class="btn schedule-work-order-btn small" type="button">👤 Giao cho nhóm</button>'
      + '<button class="btn danger small" type="button">🗑 Xóa phiếu</button>'
      + '</div></div>';
    adminView.appendChild(ticket);
    return true;
  })()`
});

for (const profile of profiles) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.mobile === false ? 1 : 3,
    mobile: profile.mobile !== false,
    screenWidth: profile.width,
    screenHeight: profile.height,
  });
  await delay(80);
  const measurement = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const ticket = document.getElementById("scheduledRescheduleLayoutFixture");
      const buttons = [...ticket.querySelectorAll(".ticket-actions .btn")];
      const card = ticket.getBoundingClientRect();
      const boxes = buttons.map((button) => button.getBoundingClientRect());
      return {
        fiveButtons: buttons.length === 5,
        cardInsideViewport: card.left >= -0.5 && card.right <= innerWidth + 0.5,
        buttonsInsideCard: boxes.every((box) => box.left >= card.left - 0.5 && box.right <= card.right + 0.5),
        buttonsDoNotOverlap: boxes.every((box, index) => boxes.every((other, otherIndex) =>
          index === otherIndex || box.right <= other.left + 0.5 || other.right <= box.left + 0.5
          || box.bottom <= other.top + 0.5 || other.bottom <= box.top + 0.5)),
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      };
    })()`
  });
  const result = measurement.result.value;
  const passed = result.fiveButtons && result.cardInsideViewport && result.buttonsInsideCard
    && result.buttonsDoNotOverlap && result.scrollWidth <= result.viewportWidth;
  console.log(`${passed ? "PASS" : "FAIL"} | Nút Đã mang đến ${profile.name} | scroll ${result.scrollWidth}/${result.viewportWidth}`);
  if (!passed) failures.push({ profile: `Nút Đã mang đến ${profile.name}`, result });
}

await send("Runtime.evaluate", {
  expression: `(() => {
    document.getElementById("scheduledRescheduleLayoutFixture")?.remove();
    document.getElementById("adminView")?.classList.add("hidden");
    document.getElementById("workOrderSettingsModal")?.classList.remove("hidden");
    document.body.classList.add("work-order-settings-open");
  })()`
});

for (const profile of profiles) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.mobile === false ? 1 : 3,
    mobile: profile.mobile !== false,
    screenWidth: profile.width,
    screenHeight: profile.height,
  });
  await delay(80);
  const measurement = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const modal = document.getElementById("workOrderSettingsModal");
      const card = modal.querySelector(".work-order-settings-card");
      const scroll = modal.querySelector(".work-order-settings-scroll");
      const toggleSectionsInsideScroll = ["allowEditDeleteLockedSchedules", "allowDeleteArchivedSchedules"].every((id) => {
        const toggle = document.getElementById(id);
        toggle.scrollIntoView({ block: "center" });
        const scrollRect = scroll.getBoundingClientRect();
        const sectionBox = toggle.closest(".work-order-setting-section").getBoundingClientRect();
        return sectionBox.left >= scrollRect.left - 0.5 && sectionBox.right <= scrollRect.right + 0.5
          && sectionBox.top >= scrollRect.top - 0.5 && sectionBox.bottom <= scrollRect.bottom + 0.5;
      });
      const cardBox = card.getBoundingClientRect();
      const scrollBox = scroll.getBoundingClientRect();
      return {
        cardInsideViewport: cardBox.left >= -0.5 && cardBox.right <= innerWidth + 0.5
          && cardBox.top >= -0.5 && cardBox.bottom <= innerHeight + 0.5,
        scrollInsideCard: scrollBox.left >= cardBox.left - 0.5 && scrollBox.right <= cardBox.right + 0.5
          && scrollBox.top >= cardBox.top - 0.5 && scrollBox.bottom <= cardBox.bottom + 0.5,
        toggleSectionsInsideScroll,
        cardOverflow: getComputedStyle(card).overflow,
        scrollOverflow: getComputedStyle(scroll).overflowY,
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      };
    })()`
  });
  const result = measurement.result.value;
  const passed = result.cardInsideViewport && result.scrollInsideCard && result.toggleSectionsInsideScroll
    && result.cardOverflow === "hidden" && ["auto", "scroll"].includes(result.scrollOverflow)
    && result.scrollWidth <= result.viewportWidth;
  console.log(`${passed ? "PASS" : "FAIL"} | Cài đặt quyền lịch ${profile.name} | scroll ${result.scrollWidth}/${result.viewportWidth}`);
  if (!passed) failures.push({ profile: `Cài đặt quyền lịch ${profile.name}`, result });
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
