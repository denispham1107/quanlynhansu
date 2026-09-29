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

assert.match(deletion, /assertAdmin\(adminUid\)/);
assert.match(deletion, /String\(currentSchedule\.createdByUid \|\| ""\) !== adminUid/);
assert.match(deletion, /!canModifyScheduledWorkOrder\(currentSchedule\)/);
assert.match(deletion, /shouldRemoveGeneratedDraft/);
assert.match(deletion, /finalBatch\.set\(deletedScheduleRef, \{/);
assert.match(deletion, /status: "deleted"/);
assert.match(deletion, /finalBatch\.delete\(scheduleRef\);\s*await finalBatch\.commit\(\)/);
assert.ok(deletion.indexOf("await batch.commit()") < deletion.indexOf("finalBatch.set(deletedScheduleRef"));
assert.doesNotMatch(deletion, /refsToDelete\.set\(scheduleRef\.path/);

assert.match(frontend, /status: "deleted", deletedAtMs: Date\.now\(\)/);
assert.match(frontend, /class="scheduled-work-order-list-item\$\{editable[\s\S]*?\$\{deleted \? " is-deleted"/);
assert.match(frontend, /deleted: "Đã xóa"/);
assert.match(page, /\.scheduled-work-order-list-item\.is-deleted\s*\{[^}]*background:linear-gradient\(135deg,#fff1f2,#fef2f2\)/);

console.log("PASS | Xóa lịch lưu dấu vết riêng, xóa lịch hoạt động và hiển thị dòng đỏ không có thao tác.");
