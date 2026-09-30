import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = readFileSync(resolve(root, "functions/index.js"), "utf8");
const frontend = readFileSync(resolve(root, "app.js"), "utf8");
const page = readFileSync(resolve(root, "index.html"), "utf8");

const settingsSave = backend.slice(
  backend.indexOf("exports.saveWorkOrderControlSettings ="),
  backend.indexOf("exports.updateEmployeeProfile =")
);
const purge = backend.slice(
  backend.indexOf("exports.purgeScheduledWorkOrderHistory ="),
  backend.indexOf("exports.convertScheduledGeneratedWorkOrderToDraft =")
);
const deletionUi = frontend.slice(
  frontend.indexOf("function openScheduledWorkOrderDeleteModal("),
  frontend.indexOf("els.scheduledWorkOrderDeleteForm?.addEventListener")
);

assert.match(settingsSave, /rawAllowDeleteArchivedSchedules === undefined/);
assert.match(settingsSave, /typeof allowDeleteArchivedSchedules !== "boolean"/);
assert.match(settingsSave, /allowDeleteArchivedSchedules,/);
assert.match(purge, /assertAuthenticated\(request\)/);
assert.match(purge, /await assertAdmin\(adminUid\)/);
assert.match(purge, /historyStatus !== "deleted" && historyStatus !== "replaced"/);
assert.match(purge, /historyStatus === "deleted"\s*\? "deletedScheduledWorkOrders"\s*:\s*"replacedScheduledWorkOrders"/);
assert.match(purge, /transaction\.getAll\(historyRef, settingsRef\)/);
assert.match(purge, /settingsSnapshot\.data\(\)\?\.allowDeleteArchivedSchedules !== true/);
assert.match(purge, /String\(history\.createdByUid \|\| ""\) !== adminUid/);
assert.match(purge, /String\(history\.status \|\| ""\) !== historyStatus/);
assert.match(purge, /transaction\.delete\(historyRef\)/);
assert.ok(purge.indexOf("await assertAdmin(adminUid)") < purge.indexOf("transaction.delete(historyRef)"));
assert.ok(purge.indexOf("allowDeleteArchivedSchedules !== true") < purge.indexOf("transaction.delete(historyRef)"));
assert.ok(purge.indexOf("history.createdByUid") < purge.indexOf("transaction.delete(historyRef)"));
assert.doesNotMatch(purge, /scheduledWorkOrders\/|workOrders\/|tasks\//);

assert.match(page, /<input id="allowDeleteArchivedSchedules" type="checkbox"/);
assert.match(page, /id="scheduledWorkOrderDeleteReasonField"/);
assert.match(frontend, /getWorkOrderControlSettings\(\)\.allowDeleteArchivedSchedules === true/);
assert.match(deletionUi, /els\.scheduledWorkOrderListModal\?\.classList\.add\("hidden"\);\s*els\.scheduledWorkOrderDeleteModal\?\.classList\.remove\("hidden"\)/);
assert.match(deletionUi, /scheduledWorkOrderDeleteReason\.required = !deletingHistory/);
assert.match(deletionUi, /confirmScheduledWorkOrderDeleteBtn\.textContent = deletingHistory \? "Xác nhận xóa vĩnh viễn"/);
assert.match(deletionUi, /purgeScheduledWorkOrderHistoryCallable\(\{ scheduleId, historyStatus: schedule\.status \}\)/);
assert.match(deletionUi, /if \(deletingHistory\) \{[\s\S]*?\} else \{\s*await deleteScheduledWorkOrderCallable/);

console.log("PASS | Xóa vĩnh viễn chỉ áp dụng cho lịch sử Đã xóa/Đã thay thế, cần xác nhận và được máy chủ kiểm tra quyền.");
