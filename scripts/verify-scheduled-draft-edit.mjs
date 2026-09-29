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
assert.ok(ticketActions.indexOf('data-action="edit-scheduled-draft"') < ticketActions.indexOf('data-action="reschedule-scheduled-draft"'));
assert.ok(ticketActions.indexOf('data-action="reschedule-scheduled-draft"') < ticketActions.indexOf('data-action="open-scheduled-group-assignment"'));
assert.match(ticketActions, /scheduledEditDeletePolicy !== "locked"/);
assert.match(app, /if \(action === "reschedule-scheduled-draft"\) \{\s*await openScheduledWorkOrderEditorFromTicket/);
assert.match(app, /if \(state\.scheduledEditorReturnToDashboard\) \{\s*closeTaskModal\(\);/);
assert.match(app, /state\.scheduledEditorReturnToDashboard \? "← Quay lại trang quản lý"/);

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

function extractFunction(name) {
  const start = app.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`Không tìm thấy ${name}.`);
  const bodyStart = app.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    if (app[index] === "}") depth -= 1;
    if (depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`Không đọc được ${name}.`);
}

const navigation = new Function(`
  const state = {
    workOrders: [{ id: "ticket-1", scheduleId: "schedule-1", scheduledWorkOrder: true,
      status: "draft", scheduledGroupAssignmentPending: true, scheduledEditDeletePolicy: "editable" }],
    scheduledWorkOrders: []
  };
  const button = {};
  const window = { scrollY: 225 };
  const calls = [];
  const console = { error() {} };
  let returnedSchedules = [{ id: "schedule-1", status: "generated", generatedWorkOrderId: "ticket-1",
    editDeletePolicy: "editable" }];
  const isAdminProfile = () => true;
  const toast = (message) => calls.push(["toast", message]);
  const setButtonLoading = (_, loading) => calls.push(["loading", loading]);
  const listScheduledWorkOrdersCallable = async () => ({ data: { schedules: returnedSchedules } });
  const canEditScheduledWorkOrder = (schedule) => schedule.editDeletePolicy !== "locked";
  const openScheduledWorkOrderEditor = (id, options) => calls.push(["open", id, options]);
  ${extractFunction("openScheduledWorkOrderEditorFromTicket")}
  return { state, button, calls, setSchedules: (schedules) => { returnedSchedules = schedules; },
    openScheduledWorkOrderEditorFromTicket };
`)();
await navigation.openScheduledWorkOrderEditorFromTicket("ticket-1", navigation.button);
assert.deepEqual(navigation.calls.find((call) => call[0] === "open"),
  ["open", "schedule-1", { returnToDashboard: true }]);
assert.equal(navigation.state.schedulePageReturnScrollY, 225);
assert.equal(navigation.state.scheduledWorkOrders.length, 1);
assert.deepEqual(navigation.calls.filter((call) => call[0] === "loading").map((call) => call[1]), [true, false]);

navigation.calls.length = 0;
navigation.setSchedules([{ id: "schedule-1", status: "generated", generatedWorkOrderId: "ticket-other" }]);
await navigation.openScheduledWorkOrderEditorFromTicket("ticket-1", navigation.button);
assert.equal(navigation.calls.some((call) => call[0] === "open"), false);
assert.equal(navigation.calls.some((call) => call[0] === "toast"), true);

navigation.calls.length = 0;
navigation.state.workOrders[0].scheduledEditDeletePolicy = "locked";
await navigation.openScheduledWorkOrderEditorFromTicket("ticket-1", navigation.button);
assert.equal(navigation.calls.some((call) => call[0] === "loading"), false);
assert.equal(navigation.calls.some((call) => call[0] === "open"), false);

console.log("PASS | Nút Dời lịch mở đúng lịch của Phiếu chưa giao, chặn lịch khóa hoặc không khớp; luồng sửa Phiếu giữ nguyên.");
