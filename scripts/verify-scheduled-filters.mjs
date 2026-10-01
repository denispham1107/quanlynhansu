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
    scheduledWorkOrderDateToFilter: "",
    workOrderControlSettingsReady: true,
    workOrderControlSettings: { allowEditDeleteLockedSchedules: false, allowDeleteArchivedSchedules: false }
  };
  let admin = true;
  const isAdminProfile = () => admin;
  const getWorkOrderControlSettings = () => state.workOrderControlSettings;
  ${extractFunction("timestampToDate")}
  ${extractFunction("toLocalDateInputValue")}
  ${extractFunction("getWorkOrderMeta")}
  ${extractFunction("getTaskDateValue")}
  ${extractFunction("todayInputValue")}
  ${extractFunction("yesterdayInputValue")}
  ${extractFunction("tomorrowInputValue")}
  ${extractFunction("scheduledWorkOrderMatchesStatusFilter")}
  ${extractFunction("sortScheduledWorkOrdersForDisplay")}
  ${extractFunction("scheduledWorkOrderFilterLabel")}
  ${extractFunction("normalizeScheduledWorkOrderTimeFilter")}
  ${extractFunction("scheduledWorkOrderMonthKey")}
  ${extractFunction("scheduledWorkOrderDateValue")}
  ${extractFunction("scheduledWorkOrderMatchesTimeFilter")}
  ${extractFunction("scheduledWorkOrderTimeFilterLabel")}
  ${extractFunction("canOverrideLockedScheduledWorkOrder")}
  ${extractFunction("canEditScheduledWorkOrder")}
  ${extractFunction("canDeleteScheduledWorkOrder")}
  return { state, setAdmin: (value) => { admin = value; }, todayInputValue, yesterdayInputValue, tomorrowInputValue, getTaskDateValue, scheduledWorkOrderMatchesStatusFilter, sortScheduledWorkOrdersForDisplay, scheduledWorkOrderFilterLabel, scheduledWorkOrderMonthKey, scheduledWorkOrderMatchesTimeFilter, scheduledWorkOrderTimeFilterLabel, canEditScheduledWorkOrder, canDeleteScheduledWorkOrder };
`);

const helpers = buildHelpers();

function localNoonMilliseconds(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).getTime();
}

const today = helpers.todayInputValue();
const yesterday = helpers.yesterdayInputValue();
const tomorrow = helpers.tomorrowInputValue();
const twoDaysAgoDate = new Date(localNoonMilliseconds(yesterday));
twoDaysAgoDate.setDate(twoDaysAgoDate.getDate() - 1);
const twoDaysAgo = [
  twoDaysAgoDate.getFullYear(),
  String(twoDaysAgoDate.getMonth() + 1).padStart(2, "0"),
  String(twoDaysAgoDate.getDate()).padStart(2, "0")
].join("-");

const schedules = [
  { id: "tomorrow-unassigned", status: "pending", scheduledForMs: localNoonMilliseconds(tomorrow) },
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
assert.deepEqual(filterIds("tomorrow", "unassigned"), ["tomorrow-unassigned"]);
assert.deepEqual(filterIds("tomorrow", "assigned"), []);
assert.equal(helpers.tomorrowInputValue(new Date(2026, 11, 31, 12)), "2027-01-01");

const lockedSchedules = [
  { id: "locked-pending", status: "pending", editDeletePolicy: "locked" },
  { id: "locked-assigned", status: "assigned", editDeletePolicy: "locked" },
  { id: "locked-deleted", status: "deleted", editDeletePolicy: "locked" },
  { id: "editable-assigned", status: "assigned", editDeletePolicy: "editable" }
];
const idsForStatus = (filterValue) => lockedSchedules
  .filter((schedule) => helpers.scheduledWorkOrderMatchesStatusFilter(schedule, filterValue))
  .map((schedule) => schedule.id);
assert.deepEqual(idsForStatus("locked"), ["locked-pending", "locked-assigned", "locked-deleted"]);
assert.deepEqual(idsForStatus("all"), ["editable-assigned"]);
assert.deepEqual(idsForStatus("assigned"), ["editable-assigned"]);
for (const filterValue of ["unassigned", "deleted", "replaced", "converted"]) {
  assert.deepEqual(idsForStatus(filterValue), []);
}
assert.equal(helpers.scheduledWorkOrderFilterLabel("locked"), "Không cho Sửa-Xóa");
assert.match(pageSource, /<option value="locked">Không cho Sửa-Xóa<\/option>/);
assert.match(appSource, /state\.scheduledWorkOrderStatusFilter = target\.editDeletePolicy === "locked" \? "locked" : "all";/);

const currentMonth = helpers.scheduledWorkOrderMonthKey();
const previousMonth = helpers.scheduledWorkOrderMonthKey(-1);
const nextMonth = helpers.scheduledWorkOrderMonthKey(1);
const monthSchedules = [
  { id: "current-month", status: "pending", scheduledForMs: localNoonMilliseconds(`${currentMonth}-01`) },
  { id: "previous-month", status: "assigned", scheduledForMs: localNoonMilliseconds(`${previousMonth}-01`) },
  { id: "next-month", status: "deleted", scheduledForMs: localNoonMilliseconds(`${nextMonth}-01`) }
];
assert.deepEqual(monthSchedules.filter((schedule) => helpers.scheduledWorkOrderMatchesTimeFilter(schedule, "this-month")).map((schedule) => schedule.id), ["current-month"]);
assert.deepEqual(monthSchedules.filter((schedule) => helpers.scheduledWorkOrderMatchesTimeFilter(schedule, "last-month")).map((schedule) => schedule.id), ["previous-month"]);
assert.deepEqual(monthSchedules.filter((schedule) => helpers.scheduledWorkOrderMatchesTimeFilter(schedule, "all")).map((schedule) => schedule.id), ["current-month", "previous-month", "next-month"]);
assert.deepEqual(monthSchedules.filter((schedule) => helpers.scheduledWorkOrderMatchesTimeFilter(schedule, "all") && helpers.scheduledWorkOrderMatchesStatusFilter(schedule, "assigned")).map((schedule) => schedule.id), ["previous-month"]);
assert.equal(helpers.scheduledWorkOrderMonthKey(-1, new Date(2026, 0, 15)), "2025-12");
assert.equal(helpers.scheduledWorkOrderMonthKey(0, new Date(2026, 0, 15)), "2026-01");
assert.equal(helpers.scheduledWorkOrderTimeFilterLabel("this-month"), "Tháng này");
assert.equal(helpers.scheduledWorkOrderTimeFilterLabel("tomorrow"), "Ngày mai");
assert.equal(helpers.scheduledWorkOrderTimeFilterLabel("last-month"), "Tháng trước");
assert.equal(helpers.scheduledWorkOrderTimeFilterLabel("all"), "Tất cả");
const scheduleTimeSelect = pageSource.match(/<select id="scheduledWorkOrderTimeFilter">([\s\S]*?)<\/select>/)?.[1] || "";
assert.match(scheduleTimeSelect, /<option value="tomorrow">Ngày mai<\/option>/);
assert.match(scheduleTimeSelect, /<option value="this-month">Tháng này<\/option>/);
assert.match(scheduleTimeSelect, /<option value="last-month">Tháng trước<\/option>/);
assert.match(scheduleTimeSelect, /<option value="all">Tất cả<\/option>/);

helpers.state.scheduledWorkOrderDateFilter = twoDaysAgo;
assert.deepEqual(filterIds("date", "unassigned"), ["older-unassigned"]);

helpers.state.scheduledWorkOrderDateFromFilter = today;
helpers.state.scheduledWorkOrderDateToFilter = yesterday;
assert.deepEqual(filterIds("range", "assigned"), ["today-assigned", "yesterday-assigned"]);

const mixedStatuses = [
  { id: "recent-deleted", status: "deleted", scheduledForMs: 600 },
  { id: "recent-pending", status: "pending", scheduledForMs: 500 },
  { id: "middle-replaced", status: "replaced", scheduledForMs: 400 },
  { id: "older-assigned", status: "assigned", scheduledForMs: 300 },
  { id: "older-converted", status: "converted", scheduledForMs: 200 },
  { id: "oldest-deleted", status: "deleted", scheduledForMs: 100 }
];
assert.deepEqual(
  helpers.sortScheduledWorkOrdersForDisplay(mixedStatuses, "all").map((schedule) => schedule.id),
  ["older-converted", "older-assigned", "recent-pending", "oldest-deleted", "middle-replaced", "recent-deleted"]
);
assert.deepEqual(
  helpers.sortScheduledWorkOrdersForDisplay(mixedStatuses.filter((schedule) => schedule.status === "deleted"), "deleted")
    .map((schedule) => schedule.id),
  ["oldest-deleted", "recent-deleted"]
);
assert.deepEqual(mixedStatuses.map((schedule) => schedule.id), [
  "recent-deleted", "recent-pending", "middle-replaced", "older-assigned", "older-converted", "oldest-deleted"
]);
assert.match(extractFunction("renderScheduledWorkOrderList"), /sortScheduledWorkOrdersForDisplay\(schedules\.filter/);
assert.match(extractFunction("renderScheduledWorkOrderList"), /const assigned = schedule\.status === "assigned"/);
assert.match(extractFunction("renderScheduledWorkOrderList"), /\$\{assigned \? " is-assigned" : ""\}/);
assert.match(pageSource, /\.scheduled-work-order-list-item\.is-assigned\s*\{[^}]*background:linear-gradient\(135deg,#dcfce7,#d1fae5\)/);

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
helpers.state.workOrderControlSettings.allowEditDeleteLockedSchedules = true;
assert.equal(helpers.canEditScheduledWorkOrder({ status: "generated", editDeletePolicy: "locked" }), true);
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "generated", editDeletePolicy: "locked" }), true);
assert.equal(helpers.canEditScheduledWorkOrder({ status: "assigned", editDeletePolicy: "locked" }), false);
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "deleted", editDeletePolicy: "locked" }), false);
helpers.setAdmin(false);
assert.equal(helpers.canEditScheduledWorkOrder({ status: "pending", editDeletePolicy: "locked" }), false);
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "pending", editDeletePolicy: "locked" }), false);
helpers.setAdmin(true);
helpers.state.workOrderControlSettingsReady = false;
assert.equal(helpers.canEditScheduledWorkOrder({ status: "generated", editDeletePolicy: "locked" }), false);
helpers.state.workOrderControlSettingsReady = true;
helpers.state.workOrderControlSettings.allowEditDeleteLockedSchedules = false;
assert.equal(helpers.canEditScheduledWorkOrder({ status: "assigned", editDeletePolicy: "editable" }), false);
assert.equal(helpers.canEditScheduledWorkOrder({ status: "deleted", editDeletePolicy: "editable" }), false);
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "deleted", editDeletePolicy: "editable" }), false);
assert.equal(helpers.canEditScheduledWorkOrder({ status: "replaced", editDeletePolicy: "editable" }), false);
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "replaced", editDeletePolicy: "editable" }), false);
helpers.state.workOrderControlSettings.allowDeleteArchivedSchedules = true;
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "deleted", editDeletePolicy: "locked" }), true);
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "replaced", editDeletePolicy: "locked" }), true);
assert.equal(helpers.canEditScheduledWorkOrder({ status: "replaced", editDeletePolicy: "editable" }), false);
helpers.setAdmin(false);
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "deleted" }), false);
helpers.setAdmin(true);
helpers.state.workOrderControlSettingsReady = false;
assert.equal(helpers.canDeleteScheduledWorkOrder({ status: "replaced" }), false);
helpers.state.workOrderControlSettingsReady = true;
helpers.state.workOrderControlSettings.allowDeleteArchivedSchedules = false;
assert.match(pageSource, /<option value="deleted">Đã xóa<\/option>/);
assert.match(pageSource, /<option value="replaced">Đã thay thế<\/option>/);
assert.match(pageSource, /<strong>Cho phép xóa các lịch có Quyền không cho Sửa-Xóa<\/strong>/);
assert.match(pageSource, /<input id="allowEditDeleteLockedSchedules" type="checkbox"/);
assert.match(appSource, /allowEditDeleteLockedSchedules: input\.allowEditDeleteLockedSchedules === true/);
assert.match(appSource, /allowEditDeleteLockedSchedules: els\.allowEditDeleteLockedSchedules\?\.checked === true/);
assert.match(pageSource, /<input id="allowDeleteArchivedSchedules" type="checkbox"/);
assert.match(appSource, /allowDeleteArchivedSchedules: input\.allowDeleteArchivedSchedules === true/);
assert.match(appSource, /allowDeleteArchivedSchedules: els\.allowDeleteArchivedSchedules\?\.checked === true/);
assert.match(pageSource, /<select id="scheduledWorkOrderEditDeletePolicy">\s*<option value="editable" selected>Cho phép Sửa-Xóa<\/option>\s*<option value="locked">Không cho Sửa-Xóa<\/option>/);
const scheduleSave = appSource.slice(
  appSource.indexOf("async function createScheduledWorkOrder(button)"),
  appSource.indexOf("els.createTaskForm.addEventListener", appSource.indexOf("async function createScheduledWorkOrder(button)"))
);
assert.ok(scheduleSave.indexOf("const savedSchedule = refreshedSchedules.find") < scheduleSave.indexOf('state.editingScheduledWorkOrderId = ""'));
assert.match(scheduleSave, /savedSchedule\.editDeletePolicy !== editDeletePolicy/);
assert.match(scheduleSave, /editDeletePolicy === "locked" && result\?\.data\?\.editDeletePolicy !== "locked"/);

console.log("PASS | Quyền lịch khóa và quyền xóa vĩnh viễn lịch sử được tách riêng, chỉ Admin có quyền.");
