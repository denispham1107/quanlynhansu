import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = readFileSync(resolve(root, "functions/index.js"), "utf8");
const frontend = readFileSync(resolve(root, "app.js"), "utf8");
const page = readFileSync(resolve(root, "index.html"), "utf8");

const update = backend.slice(
  backend.indexOf("exports.updateScheduledWorkOrder ="),
  backend.indexOf("exports.listScheduledWorkOrders =")
);
const list = backend.slice(
  backend.indexOf("exports.listScheduledWorkOrders ="),
  backend.indexOf("exports.deleteScheduledWorkOrder =")
);
assert.match(update, /assertAdmin\(adminUid\)/);
assert.match(update, /String\(currentSchedule\.createdByUid \|\| ""\) !== adminUid/);
assert.match(update, /!canModifyScheduledWorkOrder\(currentSchedule, allowEditDeleteLockedSchedules\)/);
assert.match(update, /const replacedHistoryRef = db\.collection\("replacedScheduledWorkOrders"\)\.doc\(\)/);
assert.match(update, /transaction\.set\(replacedHistoryRef, \{/);
assert.match(update, /name: String\(currentSchedule\.name \|\| "Phiếu công việc"\)/);
assert.match(update, /scheduledAt: currentSchedule\.scheduledAt \|\| null/);
assert.match(update, /status: "replaced"/);
assert.match(update, /createdByUid: adminUid/);
assert.ok(update.indexOf("transaction.set(replacedHistoryRef") < update.indexOf("transaction.update(scheduleRef"));
assert.match(update, /replacedHistoryId: replacedHistoryRef\.id/);

assert.match(list, /db\.collection\("replacedScheduledWorkOrders"\)\.where\("createdByUid", "==", adminUid\)\.get\(\)/);
assert.match(list, /\.\.\.snapshot\.docs, \.\.\.deletedSnapshot\.docs, \.\.\.replacedSnapshot\.docs/);
assert.match(list, /\.filter\(\(item\) => String\(item\.createdByUid \|\| ""\) === adminUid\)/);
assert.match(list, /sourceScheduleId: String\(item\.sourceScheduleId \|\| ""\)/);

assert.match(frontend, /savedSchedule = refreshedSchedules\.find\(\(item\) => item\.id === editingScheduleId\)/);
assert.match(frontend, /replacedHistory = refreshedSchedules\.find\(\(item\) => item\.id === replacedHistoryId && item\.status === "replaced"\)/);
assert.match(frontend, /await openScheduledWorkOrderListModal\(\{ focusScheduleId: savedSchedule\.id \}\)/);
assert.match(frontend, /\["deleted", "replaced"\]\.includes/);
assert.match(frontend, /replaced: "Đã thay thế"/);
assert.match(frontend, /replaced \? " is-replaced"/);
assert.match(frontend, /data-show-scheduled-replacement="\$\{escapeHtml\(replacementTarget\.id\)\}"/);
assert.match(frontend, /const replacementLink = event\.target\.closest\("\[data-show-scheduled-replacement\]"\)/);
assert.match(frontend, /state\.scheduledWorkOrderTimeFilter = "date";\s*state\.scheduledWorkOrderDateFilter = targetDate/);
assert.match(frontend, /content\.scrollTop \+= rowRect\.top - contentRect\.top/);
assert.match(page, /\.scheduled-work-order-list-item\.is-replaced\s*\{[^}]*background:linear-gradient\(135deg,#dbeafe,#bfdbfe\)/);
assert.match(page, /\.scheduled-work-order-replacement-link\s*\{/);

function extractFunction(name) {
  const start = frontend.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Không tìm thấy ${name}.`);
  const parametersStart = frontend.indexOf("(", start);
  let parentheses = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < frontend.length; index += 1) {
    if (frontend[index] === "(") parentheses += 1;
    if (frontend[index] === ")") parentheses -= 1;
    if (parentheses === 0) {
      bodyStart = frontend.indexOf("{", index);
      break;
    }
  }
  if (bodyStart < 0) throw new Error(`Không tìm thấy thân hàm ${name}.`);
  let depth = 0;
  for (let index = bodyStart; index < frontend.length; index += 1) {
    if (frontend[index] === "{") depth += 1;
    if (frontend[index] === "}") depth -= 1;
    if (depth === 0) return frontend.slice(start, index + 1);
  }
  throw new Error(`Không đọc được ${name}.`);
}

const { scheduledReplacementTargets, formatScheduledReplacementDateTime } = new Function(`
  ${extractFunction("scheduledReplacementTargets")}
  ${extractFunction("formatScheduledReplacementDateTime")}
  return { scheduledReplacementTargets, formatScheduledReplacementDateTime };
`)();
const versions = [
  { id: "v1", status: "replaced", sourceScheduleId: "active", replacedAtMs: 100, scheduledForMs: 1000 },
  { id: "v2", status: "replaced", sourceScheduleId: "active", replacedAtMs: 200, scheduledForMs: 2000 },
  { id: "v3", status: "replaced", sourceScheduleId: "active", replacedAtMs: 300, scheduledForMs: 3000 },
  { id: "active", status: "pending", scheduledForMs: 4000 },
  { id: "other-old", status: "replaced", sourceScheduleId: "other", replacedAtMs: 150, scheduledForMs: 5000 },
  { id: "other", status: "deleted", scheduledForMs: 6000 }
];
const targets = scheduledReplacementTargets([...versions].reverse());
assert.equal(targets.get("v1")?.id, "v2");
assert.equal(targets.get("v2")?.id, "v3");
assert.equal(targets.get("v3")?.id, "active");
assert.equal(targets.get("other-old")?.id, "other");
assert.equal(scheduledReplacementTargets(versions.filter((item) => item.id !== "active")).has("v3"), false);
assert.match(formatScheduledReplacementDateTime(new Date(2026, 8, 30, 22, 5, 6).getTime()), /^22:05:06 30\/09\/2026$/);

const navigation = new Function(`
  const state = {
    scheduledWorkOrders: [{ id: "v2", date: "2026-10-01" }],
    scheduledWorkOrderStatusFilter: "replaced",
    scheduledWorkOrderTimeFilter: "today",
    scheduledWorkOrderDateFilter: ""
  };
  const row = {
    dataset: { scheduledListItemId: "v2" },
    getBoundingClientRect() { return { top: 160, height: 40 }; },
    hasAttribute() { return false; },
    focus() { this.focused = true; },
    classList: { add(name) { row.highlighted = name; }, remove() {} }
  };
  const content = {
    scrollTop: 0,
    getBoundingClientRect() { return { top: 50, height: 200 }; }
  };
  const els = {
    scheduledWorkOrderList: { querySelectorAll() { return [row]; } },
    scheduledWorkOrderListModal: { querySelector() { return content; } }
  };
  let renderCount = 0;
  let error = "";
  const scheduledWorkOrderDateValue = (schedule) => schedule.date;
  const renderScheduledWorkOrderList = () => { renderCount += 1; };
  const requestAnimationFrame = (callback) => callback();
  const setTimeout = () => 1;
  const toast = (message) => { error = message; };
  ${extractFunction("showScheduledWorkOrderInList")}
  ${extractFunction("showScheduledReplacement")}
  showScheduledReplacement("v2");
  return { state, row, content, renderCount, error };
`)();
assert.equal(navigation.error, "");
assert.equal(navigation.state.scheduledWorkOrderStatusFilter, "all");
assert.equal(navigation.state.scheduledWorkOrderTimeFilter, "date");
assert.equal(navigation.state.scheduledWorkOrderDateFilter, "2026-10-01");
assert.equal(navigation.renderCount, 1);
assert.equal(navigation.content.scrollTop, 30);
assert.equal(navigation.row.highlighted, "is-jump-target");
assert.equal(navigation.row.focused, true);

console.log("PASS | Mỗi dòng lịch cũ liên kết đúng phiên bản kế tiếp, kể cả khi lịch được sửa nhiều lần.");
