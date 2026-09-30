"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const {
  ordinaryDraftWorkOrderUpdate,
  ordinaryDraftTaskUpdate,
  isScheduledDraftConversionUpdate,
  convertedScheduleUpdate,
  hotelDeliveredScheduleUpdate,
  linkedLunchCompletionUpdate
} = require("./scheduled-conversion");

const deleted = Symbol("deleted");
const now = new Date("2026-09-30T08:30:00.000Z");
const workOrderPatch = ordinaryDraftWorkOrderUpdate(now, deleted);
for (const field of [
  "scheduledWorkOrder", "scheduleId", "scheduledAt", "scheduledTaskDate",
  "scheduledGroupAssignmentPending", "scheduledAssignmentDeadlineAt", "scheduledGroupTimeoutProcessed"
]) assert.equal(workOrderPatch[field], deleted);
assert.equal(workOrderPatch.updatedAt, now);
assert.deepEqual(Object.keys(workOrderPatch).filter((field) => ["name", "status", "createdAt", "taskCount"].includes(field)), []);

const taskPatch = ordinaryDraftTaskUpdate(deleted);
for (const field of ["scheduledWorkOrder", "scheduledPhotoRequirementLocked", "scheduleId", "scheduledForDate"])
  assert.equal(taskPatch[field], deleted);
assert.deepEqual(Object.keys(taskPatch).filter((field) => ["title", "status", "photos", "workPhotos", "deadlineMinutes"].includes(field)), []);
const scheduledTask = { title: "Làm hotel", status: "draft", scheduledWorkOrder: true,
  scheduleId: "schedule-1", scheduledPhotoRequirementLocked: true, photos: [] };
const ordinaryTask = { title: "Làm hotel", status: "draft", photos: [] };
assert.equal(isScheduledDraftConversionUpdate(scheduledTask, ordinaryTask), true);
assert.equal(isScheduledDraftConversionUpdate(scheduledTask, { ...ordinaryTask, title: "Việc khác" }), false);
assert.equal(isScheduledDraftConversionUpdate(scheduledTask, { ...ordinaryTask, status: "completed" }), false);

const schedulePatch = convertedScheduleUpdate(now, "admin-1", "ticket-1");
assert.equal(schedulePatch.status, "converted");
assert.equal(schedulePatch.convertedWorkOrderId, "ticket-1");
assert.equal(schedulePatch.generatedWorkOrderId, "");
assert.equal(schedulePatch.assignmentDeadlineAt, null);
assert.equal(schedulePatch.timeoutProcessedAt, now);

const hotelPatch = hotelDeliveredScheduleUpdate(now, "admin-1");
assert.equal(hotelPatch.status, "assigned");
assert.equal(hotelPatch.hotelDelivered, true);
assert.equal(hotelPatch.hotelDeliveredAt, now);
assert.equal(hotelPatch.hotelDeliveredByUid, "admin-1");
assert.equal(hotelPatch.generatedWorkOrderId, "");
assert.equal(hotelPatch.assignmentDeadlineAt, null);

const lunch = linkedLunchCompletionUpdate({
  queueStartAt: new Date("2026-09-30T08:05:00.000Z"),
  accumulatedWorkedMs: 0,
  deadlineMinutes: 30
}, now, "ticket-1");
assert.equal(lunch.status, "completed");
assert.equal(lunch.actualMinutes, 25);
assert.equal(lunch.resultType, "faster");
assert.equal(lunch.differenceMinutes, 5);
assert.equal(lunch.autoCompletedByScheduledConversion, true);
assert.equal(lunch.convertedScheduledWorkOrderId, "ticket-1");

const server = readFileSync(join(__dirname, "index.js"), "utf8");
const start = server.indexOf("async function processScheduledGeneratedWorkOrderArrival(");
const end = server.indexOf("async function materializeScheduledWorkOrderById(", start);
assert.ok(start >= 0 && end > start);
const conversion = server.slice(start, end);
assert.match(conversion, /await assertAdmin\(adminUid\)/);
assert.match(conversion, /String\(workOrder\.createdByUid \|\| ""\) !== adminUid/);
assert.match(conversion, /String\(schedule\.createdByUid \|\| ""\) !== adminUid/);
assert.match(conversion, /schedule\.status !== "generated"/);
assert.match(conversion, /schedule\.generatedWorkOrderId \|\| ""\) !== workOrderId/);
assert.match(conversion, /!canModifyScheduledWorkOrder\(schedule\)/);
assert.match(conversion, /tasks\.length !== Number\(workOrder\.taskCount \|\| 0\)/);
assert.match(conversion, /transaction\.update\(scheduleRef, convertedScheduleUpdate/);
assert.match(conversion, /transaction\.update\(workOrderRef, ordinaryDraftWorkOrderUpdate/);
assert.match(conversion, /transaction\.update\(item\.ref, ordinaryDraftTaskUpdate/);
assert.match(conversion, /arrivalType === "hotel"/);
assert.match(conversion, /transaction\.update\(scheduleRef, hotelDeliveredScheduleUpdate/);
assert.match(conversion, /transaction\.delete\(workOrderRef\)/);
assert.match(conversion, /tasks\.forEach\(\(item\) => transaction\.delete\(item\.ref\)\)/);
assert.match(conversion, /linkedLunchCompletionUpdate/);
assert.match(conversion, /await ensureNextDailyScheduledOccurrence\(conversion\.scheduleId, conversion\)/);
assert.match(conversion, /exports\.convertScheduledGeneratedWorkOrderToDraft = onCall\([\s\S]*?processScheduledGeneratedWorkOrderArrival\(request, "spa"\)/);
assert.match(conversion, /exports\.markScheduledHotelDelivered = onCall\([\s\S]*?processScheduledGeneratedWorkOrderArrival\(request, "hotel"\)/);
assert.match(server, /\["assigned", "cancelled", "converted", "deleting", "updating"\]/);
assert.match(server, /if \(isScheduledDraftConversionUpdate\(beforeTask, afterTask\)\) return;/);

console.log("PASS | Spa giữ Phiếu thường; Hotel xóa Phiếu chờ, đánh dấu lịch đã giao và lưu Hotel đã mang đến.");
