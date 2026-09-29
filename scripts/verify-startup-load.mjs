import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "app.js"), "utf8");

function sourceOf(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Không tìm thấy ${name}`);
  const opening = source.indexOf("{", start);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Hàm ${name} không đóng ngoặc.`);
}

assert.equal(source.includes("requestAutomaticLunchHistoryBackfillOnce"), false);
assert.equal(source.includes("requestInvalidTaskHistoryBackfillOnce"), false);
const authStartup = source.slice(source.indexOf("onAuthStateChanged(auth,"), source.indexOf("function showLogin()"));
assert.ok(authStartup.indexOf("setupAdminDashboard();") < authStartup.indexOf("scheduleStartupExtras(user.uid"));
assert.ok(source.includes("startStartupExtras(bootUid);"));
assert.ok(source.includes("startAdminSupplementaryListeners();"));
assert.ok(source.includes("state.adminUsersSnapshotReady = snapshot.docs.length > 0 || !snapshot.metadata.fromCache;"));
const usersListener = source.slice(source.indexOf("const unsubUsers = onSnapshot("), source.indexOf("const unsubEmployeeGroups = onSnapshot("));
assert.match(usersListener, /scheduleAdminTasksRender\(\);/);
assert.ok(source.includes("experimentalForceLongPolling: true"));

const state = {
  workOrderById: new Map([["order-1", { id: "order-1", name: "Làm hotel", scheduledWorkOrder: true, scheduledAt: new Date(2026, 8, 29) }]]),
  adminTaskServerReady: false,
  adminHotelDailyBudgetsServerReady: false,
  hotelDailyBudgets: [{ id: "2026-09-29" }]
};
const frames = [];
let renderCount = 0;
let cleanupCount = 0;
const context = vm.createContext({
  state,
  adminTasksRenderFrame: 0,
  window: { requestAnimationFrame(callback) { frames.push(callback); return frames.length; } },
  isManagementProfile: () => true,
  renderAdminTasks: () => { renderCount += 1; },
  timestampToDate: (value) => value,
  toLocalDateInputValue: (value) => `${value.getFullYear()}-09-29`,
  isAdminProfile: () => true,
  requestOrphanHotelDailyBudgetCleanup: () => { cleanupCount += 1; }
});
vm.runInContext([
  sourceOf("shouldUseIosLongPolling"),
  sourceOf("getWorkOrderMeta"),
  sourceOf("getTaskDateValue"),
  sourceOf("scheduleAdminTasksRender"),
  sourceOf("cleanupKnownOrphanHotelDailyBudgets")
].join("\n"), context);

assert.equal(vm.runInContext('shouldUseIosLongPolling("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", "iPhone", 5)', context), true);
assert.equal(vm.runInContext('shouldUseIosLongPolling("Mozilla/5.0 (Macintosh)", "MacIntel", 5)', context), true);
assert.equal(vm.runInContext('shouldUseIosLongPolling("Mozilla/5.0 (Linux; Android 14)", "Linux", 5)', context), false);
assert.equal(vm.runInContext('shouldUseIosLongPolling("Mozilla/5.0 (Windows NT 10.0)", "Win32", 0)', context), false);

const summaryElement = { innerHTML: "", classList: { remove() {} } };
const summaryState = {
  employees: [{ uid: "employee-off", name: "Ngọc", employmentStatus: "off" }],
  adminUsersSnapshotReady: true,
  adminTaskDataReady: false
};
const summaryContext = vm.createContext({
  state: summaryState,
  els: {
    adminEmployeeStatusSummary: summaryElement,
    workOrderSettingsModal: { classList: { contains: () => true } }
  },
  escapeHtml: (value) => String(value),
  getEmployeeSummaryName: (employee) => employee.name,
  isEmployeeWorking: (employee) => employee.employmentStatus !== "off",
  updateMobileEmployeeStatusOverview() {},
  applyMobileEmployeeStatusExpanded() {}
});
vm.runInContext([
  sourceOf("renderEmployeeStatusNameChips"),
  sourceOf("getEmployeeStatusGroupConfig"),
  sourceOf("renderEmployeeStatusCard"),
  sourceOf("renderAdminEmployeeStatusSummary")
].join("\n"), summaryContext);
vm.runInContext("renderAdminEmployeeStatusSummary([])", summaryContext);
assert.match(summaryElement.innerHTML, /data-employee-status-type="off"[^>]*aria-label="Nhân viên Đang Off: 1"/);
assert.match(summaryElement.innerHTML, /Ngọc/);
assert.match(summaryElement.innerHTML, /data-employee-status-type="free"[^>]*Đang tải/);
assert.doesNotMatch(summaryElement.innerHTML, /data-employee-status-type="free"[^>]*aria-label="[^"]*: 1"/);

const subscribedCollections = [];
const startupTimers = [];
const view = { classList: { add() {}, remove() {} } };
const startupContext = vm.createContext({
  state: { user: { uid: "admin" }, unsubs: [], adminAutoScrollSubmittedTaskTimer: null },
  els: { adminView: view, workTemplateView: view, employeeManagerView: view, photoReportView: view, imageGalleryView: view, employeeView: view },
  db: {},
  WORK_ORDER_CONTROL_SETTINGS_DOC_ID: "workOrderControlSettings",
  authBootGeneration: 1,
  adminSupplementaryTimer: 0,
  adminSupplementaryStarted: false,
  window: {
    setTimeout(callback, delay) { startupTimers.push({ callback, delay }); return startupTimers.length; },
    clearTimeout() {}
  },
  collection(_db, name) { return name; },
  doc(_db, name) { return name; },
  query(ref) { return ref; },
  orderBy() { return {}; },
  onSnapshot(ref) { subscribedCollections.push(ref); return () => {}; },
  handleSnapshotError() {},
  setAdminTasksSyncStatus() {},
  applyManagementPermissionUI() {},
  setupWorkSupervisionListener() { return () => {}; }
});
vm.runInContext(sourceOf("setupAdminDashboard"), startupContext);
vm.runInContext("setupAdminDashboard()", startupContext);
assert.ok(subscribedCollections.includes("users"));
assert.ok(subscribedCollections.includes("tasks"));
assert.ok(subscribedCollections.includes("workOrders"));
assert.equal(subscribedCollections.includes("workAssignmentHistory"), false);
assert.equal(startupTimers.length, 1);
assert.equal(startupTimers[0].delay, 12000);
startupTimers[0].callback();
assert.ok(subscribedCollections.includes("workAssignmentHistory"));
assert.ok(subscribedCollections.includes("hotelDailyBudgets"));
assert.equal(startupContext.state.unsubs.length, 12);

assert.equal(vm.runInContext('getWorkOrderMeta("order-1").name', context), "Làm hotel");
assert.equal(vm.runInContext('getTaskDateValue({ scheduledWorkOrder: true, workOrderId: "order-1" })', context), "2026-09-29");
vm.runInContext("scheduleAdminTasksRender(); scheduleAdminTasksRender(); scheduleAdminTasksRender();", context);
assert.equal(frames.length, 1);
frames.shift()();
assert.equal(renderCount, 1);

vm.runInContext("cleanupKnownOrphanHotelDailyBudgets()", context);
assert.equal(cleanupCount, 0);
state.adminTaskServerReady = true;
vm.runInContext("cleanupKnownOrphanHotelDailyBudgets()", context);
assert.equal(cleanupCount, 0);
state.adminHotelDailyBudgetsServerReady = true;
vm.runInContext("cleanupKnownOrphanHotelDailyBudgets()", context);
assert.equal(cleanupCount, 1);

console.log("PASS | iOS dùng long polling; nhân viên được vẽ lại độc lập, ưu tiên dữ liệu chính trước luồng phụ; chỉ dọn Hotel khi dữ liệu máy chủ đã đủ.");
