import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appSource = readFileSync(resolve(projectRoot, "app.js"), "utf8");
const pageSource = readFileSync(resolve(projectRoot, "index.html"), "utf8");

function extractFunction(name) {
  const signature = `function ${name}(`;
  const start = appSource.indexOf(signature);
  if (start < 0) throw new Error(`Không tìm thấy ${name} trong app.js.`);
  const bodyStart = appSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Không đọc được toàn bộ ${name}.`);
}

const buildHelpers = new Function(`
  const state = {
    workOrders: [],
    workOrderById: new Map(),
    scheduledWorkOrderDateFilter: "",
    scheduledWorkOrderDateFromFilter: "",
    scheduledWorkOrderDateToFilter: ""
  };
  ${extractFunction("timestampToDate")}
  ${extractFunction("toLocalDateInputValue")}
  ${extractFunction("getWorkOrderMeta")}
  ${extractFunction("getTaskDateValue")}
  ${extractFunction("todayInputValue")}
  ${extractFunction("yesterdayInputValue")}
  ${extractFunction("scheduledWorkOrderMatchesStatusFilter")}
  ${extractFunction("sortScheduledWorkOrdersForDisplay")}
  ${extractFunction("normalizeScheduledWorkOrderTimeFilter")}
  ${extractFunction("scheduledWorkOrderDateValue")}
  ${extractFunction("scheduledWorkOrderMatchesTimeFilter")}
  ${extractFunction("canEditScheduledWorkOrder")}
  ${extractFunction("canDeleteScheduledWorkOrder")}
  return { state, todayInputValue, yesterdayInputValue, getTaskDateValue, scheduledWorkOrderMatchesStatusFilter, sortScheduledWorkOrdersForDisplay, scheduledWorkOrderMatchesTimeFilter, canEditScheduledWorkOrder, canDeleteScheduledWorkOrder };
`);

const helpers = buildHelpers();

function localNoonMilliseconds(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).getTime();
}

const today = helpers.todayInputValue();
const yesterday = helpers.yesterdayInputValue();
const twoDaysAgoDate = new Date(localNoonMilliseconds(yesterday));
twoDaysAgoDate.setDate(twoDaysAgoDate.getDate() - 1);
const twoDaysAgo = [
  twoDaysAgoDate.getFullYear(),
  String(twoDaysAgoDate.getMonth() + 1).padStart(2, "0"),
  String(twoDaysAgoDate.getDate()).padStart(2, "0")
].join("-");

const schedules = [
  { id: "today-unassigned", status: "pending", scheduledForMs: localNoonMilliseconds(today) },
  { id: "today-assigned", status: "assigned", scheduledForMs: localNoonMilliseconds(today) },
  { id: "today-deleted", status: "deleted", scheduledForMs: localNoonMilliseconds(today) },
  { id: "today-replaced", status: "replaced", scheduledForMs: localNoonMilliseconds(today) },
  { id: "yesterday-assigned", status: "assigned", scheduledForMs: localNoonMilliseconds(yesterday) },
  { id: "older-unassigned", status: "generated", scheduledForMs: localNoonMilliseconds(twoDaysAgo) }
];

function filterIds(timeFilter, statusFilter) {
  return schedules
    .filter((schedule) => helpers.scheduledWorkOrderMatchesTimeFilter(schedule, timeFilter))
    .filter((schedule) => helpers.scheduledWorkOrderMatchesStatusFilter(schedule, statusFilter))
    .map((schedule) => schedule.id);
}

assert.deepEqual(filterIds("today", "unassigned"), ["today-unassigned"]);
assert.deepEqual(filterIds("today", "assigned"), ["today-assigned"]);
assert.deepEqual(filterIds("today", "deleted"), ["today-deleted"]);
assert.deepEqual(filterIds("today", "replaced"), ["today-replaced"]);
assert.deepEqual(filterIds("today", "all"), ["today-unassigned", "today-assigned", "today-deleted", "today-replaced"]);
assert.deepEqual(filterIds("yesterday", "assigned"), ["yesterday-assigned"]);

helpers.state.scheduledWorkOrderDateFilter = twoDaysAgo;
assert.deepEqual(filterIds("date", "unassigned"), ["older-unassigned"]);

helpers.state.scheduledWorkOrderDateFromFilter = today;
helpers.state.scheduledWorkOrderDateToFilter = yesterday;
assert.deepEqual(filterIds("range", "assigned"), ["today-assigned", "yesterday-assigned"]);

const mixedStatuses = [
  { id: "recent-deleted", status: "deleted" },
  { id: "recent-pending", status: "pending" },
  { id: "middle-replaced", status: "replaced" },
  { id: "older-assigned", status: "assigned" },
  { id: "older-converted", status: "converted" },
  { id: "oldest-deleted", status: "deleted" }
];
assert.deepEqual(
  helpers.sortScheduledWorkOrdersForDisplay(mixedStatuses, "all").map((schedule) => schedule.id),
  ["recent-pending", "older-assigned", "older-converted", "recent-deleted", "middle-replaced", "oldest-deleted"]
);
assert.deepEqual(helpers.sortScheduledWorkOrdersForDisplay(mixedStatuses, "deleted"), mixedStatuses);
assert.deepEqual(mixedStatuses.map((schedule) => schedule.id), [
  "recent-deleted", "recent-pending", "middle-replaced", "older-assigned", "older-converted", "oldest-deleted"
]);
assert.match(extractFunction("renderScheduledWorkOrderList"), /sortScheduledWorkOrdersForDisplay\(schedules\.filter/);

helpers.state.workOrders = [{
  id: "scheduled-work-order",
  scheduledWorkOrder: true,
  scheduledAt: new Date(2026, 8, 23, 9, 0, 0)
}];
helpers.state.workOrderById = new Map(helpers.state.workOrders.map((workOrder) => [workOrder.id, workOrder]));
assert.equal(helpers.getTaskDateValue({
  scheduledWorkOrder: true,
  workOrderId: "scheduled-work-order",
  taskDate: "2026-09-20"
}), "2026-09-23");
assert.equal(helpers.getTaskDateValue({
  scheduledWorkOrder: true,
  scheduledForDate: "2026-09-24",
  workOrderId: "scheduled-work-order",
  taskDate: "2026-09-20"
}), "2026-09-24");

assert.equal(helpers.canEditScheduledWorkOrder({ status: "pending" }), true);
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "pending" }), true);
assert.equal(helpers.canEditScheduledWorkOrder({ status: "generated", editDeletePolicy: "locked" }), false);
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "generated", editDeletePolicy: "locked" }), false);
assert.equal(helpers.canEditScheduledWorkOrder({ status: "assigned", editDeletePolicy: "editable" }), false);
assert.equal(helpers.canEditScheduledWorkOrder({ status: "deleted", editDeletePolicy: "editable" }), false);
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "deleted", editDeletePolicy: "editable" }), false);
assert.equal(helpers.canEditScheduledWorkOrder({ status: "replaced", editDeletePolicy: "editable" }), false);
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "replaced", editDeletePolicy: "editable" }), false);
assert.match(pageSource, /<option value="deleted">Đã xóa<\/option>/);
assert.match(pageSource, /<option value="replaced">Đã thay thế<\/option>/);
assert.match(pageSource, /<select id="scheduledWorkOrderEditDeletePolicy">\s*<option value="editable" selected>Cho phép Sửa-Xóa<\/option>\s*<option value="locked">Không cho Sửa-Xóa<\/option>/);
const scheduleSave = appSource.slice(
  appSource.indexOf("async function createScheduledWorkOrder(button)"),
  appSource.indexOf("els.createTaskForm.addEventListener", appSource.indexOf("async function createScheduledWorkOrder(button)"))
);
assert.ok(scheduleSave.indexOf("const savedSchedule = refreshedSchedules.find") < scheduleSave.indexOf('state.editingScheduledWorkOrderId = ""'));
assert.match(scheduleSave, /savedSchedule\.editDeletePolicy !== editDeletePolicy/);
assert.match(scheduleSave, /editDeletePolicy === "locked" && result\?\.data\?\.editDeletePolicy !== "locked"/);

console.log("PASS | Hai mức quyền lịch và kiểm tra máy chủ đã lưu quyền trước khi báo thành công.");
