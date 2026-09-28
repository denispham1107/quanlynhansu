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
assert.ok(authStartup.indexOf("setupAdminDashboard();") < authStartup.indexOf("setupNotificationListener();"));

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
  sourceOf("getWorkOrderMeta"),
  sourceOf("getTaskDateValue"),
  sourceOf("scheduleAdminTasksRender"),
  sourceOf("cleanupKnownOrphanHotelDailyBudgets")
].join("\n"), context);

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

console.log("PASS | Khởi động ưu tiên công việc, không chạy backfill lại, dựng giao diện một lần và chỉ dọn Hotel khi dữ liệu máy chủ đã đủ.");
