"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { scheduledLunchDocumentId, employeesWithoutActiveScheduledLunch } = require("./scheduled-lunch");

const firstGeneration = { seconds: 1791048000, nanoseconds: 1000000 };
const secondGeneration = { seconds: 1791048300, nanoseconds: 1000000 };
const firstId = scheduledLunchDocumentId("schedule", firstGeneration, "employee-ai");
assert.equal(firstId, scheduledLunchDocumentId("schedule", firstGeneration, "employee-ai"));
assert.notEqual(firstId, scheduledLunchDocumentId("schedule", secondGeneration, "employee-ai"));
assert.notEqual(firstId, scheduledLunchDocumentId("schedule", firstGeneration, "employee-ai-1"));
assert.match(firstId, /^scheduledGroupLunch_/);

const employees = [{ uid: "ai" }, { uid: "ai-1" }];
const oldLunch = {
  assignedToUid: "ai", status: "lunch_break", autoCreatedByScheduledGroupTimeout: true,
  sourceScheduledWorkOrderId: "scheduled_schedule"
};
assert.deepEqual(employeesWithoutActiveScheduledLunch(employees, [oldLunch], "scheduled_schedule"), [{ uid: "ai-1" }]);
assert.deepEqual(employeesWithoutActiveScheduledLunch(employees, [{ ...oldLunch, status: "overdue" }], "scheduled_schedule"), [{ uid: "ai-1" }]);
assert.deepEqual(employeesWithoutActiveScheduledLunch(employees, [{ ...oldLunch, status: "completed" }], "scheduled_schedule"), employees);
assert.deepEqual(employeesWithoutActiveScheduledLunch(employees, [oldLunch], "other_schedule"), employees);

const backend = readFileSync(join(__dirname, "index.js"), "utf8");
const update = backend.slice(backend.indexOf("exports.updateScheduledWorkOrder ="), backend.indexOf("exports.listScheduledWorkOrders ="));
const deletion = backend.slice(backend.indexOf("exports.deleteScheduledWorkOrder ="), backend.indexOf("exports.purgeScheduledWorkOrderHistory ="));
for (const source of [update, deletion]) {
  assert.match(source, /where\("workOrderId", "==", generatedWorkOrderId\)/);
  assert.doesNotMatch(source, /lunchTaskSnapshot|where\("sourceScheduledWorkOrderId"/);
}
const timeout = backend.slice(backend.indexOf("async function processScheduledGroupAssignmentTimeoutById("), backend.indexOf("exports.processScheduledGroupAssignmentTimeout ="));
assert.match(timeout, /employeesWithoutActiveScheduledLunch\(/);
assert.match(timeout, /scheduledLunchDocumentId\(scheduleId, generatedAt, employee\.uid\)/);
assert.match(timeout, /lunchEntries\.length\s*\? await transaction\.getAll/);

console.log("PASS | Xóa/sửa/dời lịch giữ Phiếu nghỉ trưa; lần tạo mới không ghi đè hoặc tạo trùng Phiếu đang chạy.");
