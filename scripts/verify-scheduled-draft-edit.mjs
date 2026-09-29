import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const server = readFileSync(join(root, "functions", "index.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");

const ticketActions = app.slice(app.indexOf("function renderTicketGroup("), app.indexOf("function renderTicketGroup(") + 4800);
assert.ok(ticketActions.indexOf('data-action="edit-scheduled-draft"') >= 0);
assert.ok(ticketActions.indexOf('data-action="edit-scheduled-draft"') < ticketActions.indexOf('data-action="open-scheduled-group-assignment"'));
assert.match(ticketActions, /scheduledEditDeletePolicy !== "locked"/);

assert.match(html, /id="cancelScheduledDraftEditBtn"[^>]*>Hủy<\/button>/);
assert.match(html, /id="saveScheduledDraftEditBtn"[^>]*>💾 Lưu<\/button>/);
assert.match(app, /state\.taskModalMode === "scheduled-draft-edit"[\s\S]*?await saveScheduledDraftEdit/);
assert.match(app, /scheduledWorkOrderTimePickerBtn\][\s\S]*?control\.disabled = editingScheduledDraft/);
assert.match(app, /row-assignee"\)\.forEach[\s\S]*?select\.disabled = scheduleMode/);
assert.match(app, /row-date"\)\.forEach[\s\S]*?dateInput\.disabled = scheduleMode/);

const saveStart = server.indexOf("exports.updateScheduledGeneratedWorkOrder = onCall(");
const saveEnd = server.indexOf("exports.assignScheduledWorkOrderToGroupEmployee = onCall(", saveStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart);
const save = server.slice(saveStart, saveEnd);
assert.match(save, /await assertAdmin\(adminUid\)/);
assert.match(save, /scheduledGroupAssignmentPending !== true/);
assert.match(save, /!canModifyScheduledWorkOrder\(schedule\)/);
assert.match(save, /expectedRevision/);
assert.match(save, /expectedGeneratedAtMs/);
assert.match(save, /const taskDate = String\(workOrder\.scheduledTaskDate/);
assert.match(save, /transaction\.update\(workOrderRef, \{/);
assert.doesNotMatch(save, /transaction\.delete\(workOrderRef\)/);
assert.doesNotMatch(save, /assignedToUid: String\(requestedRows/);
assert.ok(server.includes("Number(freshWorkOrder.scheduledDraftRevision || 0) !== Number(workOrder.scheduledDraftRevision || 0)"));

console.log("PASS | Chỉ Phiếu lên lịch chưa giao và lịch cho phép Sửa-Xóa mới có luồng chỉnh sửa riêng; ngày, người giao và đếm ngược được giữ nguyên.");
