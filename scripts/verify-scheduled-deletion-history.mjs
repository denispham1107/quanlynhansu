import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = readFileSync(resolve(root, "functions/index.js"), "utf8");
const frontend = readFileSync(resolve(root, "app.js"), "utf8");
const page = readFileSync(resolve(root, "index.html"), "utf8");

const list = backend.slice(
  backend.indexOf("exports.listScheduledWorkOrders ="),
  backend.indexOf("exports.deleteScheduledWorkOrder =")
);
const deletion = backend.slice(
  backend.indexOf("exports.deleteScheduledWorkOrder ="),
  backend.indexOf("async function materializeScheduledWorkOrderById")
);
assert.match(list, /assertAdmin\(adminUid\)/);
assert.match(list, /collection\("scheduledWorkOrders"\)/);
assert.match(list, /collection\("deletedScheduledWorkOrders"\)\s*\.where\("createdByUid", "==", adminUid\)/);
assert.match(list, /\.filter\(\(item\) => String\(item\.createdByUid \|\| ""\) === adminUid\)/);
assert.match(list, /deletedAtMs:/);
assert.match(list, /deletionReason: String\(item\.deletionReason \|\| ""\)/);

assert.match(deletion, /assertAdmin\(adminUid\)/);
assert.match(deletion, /String\(currentSchedule\.createdByUid \|\| ""\) !== adminUid/);
assert.match(deletion, /!canModifyScheduledWorkOrder\(\s*currentSchedule, settingsSnapshot\.data\(\)\?\.allowEditDeleteLockedSchedules === true\s*\)/);
assert.match(deletion, /const deletionReason = typeof request\.data\?\.reason === "string" \? request\.data\.reason\.trim\(\) : ""/);
assert.match(deletion, /!deletionReason \|\| deletionReason\.length > 500/);
assert.match(deletion, /shouldRemoveGeneratedDraft/);
assert.match(deletion, /finalBatch\.set\(deletedScheduleRef, \{/);
assert.match(deletion, /status: "deleted"/);
assert.match(deletion, /deletionReason: String\(schedule\.deletionReason \|\| ""\)\.trim\(\)\.slice\(0, 500\)/);
assert.match(deletion, /finalBatch\.delete\(scheduleRef\);\s*await finalBatch\.commit\(\)/);
assert.ok(deletion.indexOf("await batch.commit()") < deletion.indexOf("finalBatch.set(deletedScheduleRef"));
assert.doesNotMatch(deletion, /refsToDelete\.set\(scheduleRef\.path/);

assert.match(frontend, /status: "deleted", deletionReason: reason, deletedAtMs: Date\.now\(\)/);
assert.match(frontend, /deleteScheduledWorkOrderCallable\(\{ scheduleId, reason \}\)/);
assert.match(frontend, /els\.scheduledWorkOrderListModal\?\.classList\.add\("hidden"\);\s*els\.scheduledWorkOrderDeleteModal\?\.classList\.remove\("hidden"\)/);
assert.match(frontend, /els\.scheduledWorkOrderDeleteModal\?\.classList\.add\("hidden"\);\s*els\.scheduledWorkOrderListModal\?\.classList\.remove\("hidden"\)/);
assert.match(frontend, /escapeHtml\(schedule\.deletionReason\)/);
assert.match(frontend, /class="scheduled-work-order-list-item\$\{editable[\s\S]*?\$\{deleted \? " is-deleted"/);
assert.match(frontend, /deleted: "Đã xóa"/);
assert.match(page, /\.scheduled-work-order-list-item\.is-deleted\s*\{[^}]*background:linear-gradient\(135deg,#fff1f2,#fef2f2\)/);
assert.match(page, /<textarea id="scheduledWorkOrderDeleteReason"[^>]*maxlength="500" required/);
assert.match(page, /id="confirmScheduledWorkOrderDeleteBtn"[^>]*type="submit">Xác nhận xóa lịch/);

console.log("PASS | Xóa lịch hoạt động giữ dòng lịch sử màu đỏ; quyền xóa vĩnh viễn được kiểm tra riêng.");
