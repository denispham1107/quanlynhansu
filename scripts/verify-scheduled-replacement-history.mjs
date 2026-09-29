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
assert.match(update, /!canModifyScheduledWorkOrder\(currentSchedule\)/);
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

assert.match(frontend, /savedSchedule = refreshedSchedules\.find\(\(item\) => item\.id === editingScheduleId\)/);
assert.match(frontend, /replacedHistory = refreshedSchedules\.find\(\(item\) => item\.id === replacedHistoryId && item\.status === "replaced"\)/);
assert.match(frontend, /state\.scheduledWorkOrderStatusFilter = "all";\s*const activeTimeFilter/);
assert.match(frontend, /!scheduledWorkOrderMatchesTimeFilter\(replacedHistory, activeTimeFilter\)[\s\S]*?!scheduledWorkOrderMatchesTimeFilter\(savedSchedule, activeTimeFilter\)/);
assert.match(frontend, /state\.scheduledWorkOrderTimeFilter = "range"/);
assert.match(frontend, /\["deleted", "replaced"\]\.includes/);
assert.match(frontend, /replaced: "Đã thay thế"/);
assert.match(frontend, /replaced \? " is-replaced"/);
assert.match(page, /\.scheduled-work-order-list-item\.is-replaced\s*\{[^}]*background:linear-gradient\(135deg,#eff6ff,#dbeafe\)/);

console.log("PASS | Lịch cũ được lưu riêng cùng giao dịch chỉnh sửa, hiện nền xanh và không còn thao tác.");
