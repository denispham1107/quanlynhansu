"use strict";

const { isDeepStrictEqual } = require("node:util");

const SCHEDULED_WORK_ORDER_FIELDS = [
  "scheduledWorkOrder", "scheduleId", "scheduledAt", "scheduledTaskDate", "scheduledGeneratedAt",
  "scheduledEmployeeGroupId", "scheduledEmployeeGroupName", "scheduledGroupAssignmentPending",
  "scheduledDraftRevision", "scheduledAssignmentDeadlineAt", "scheduledAssignmentCountdownStartedAt",
  "scheduledAssignmentWaitingForAvailableEmployee", "scheduledAvailableEmployeeCountAtCountdownStart",
  "scheduledAssignmentCountdownMinutes", "scheduledRepeatMode", "scheduledEditDeletePolicy",
  "scheduledGroupTimeoutProcessed", "scheduledGroupTimeoutProcessedAt"
];

const SCHEDULED_TASK_FIELDS = [
  "scheduledWorkOrder", "scheduledPhotoRequirementLocked", "scheduleId",
  "scheduledEmployeeGroupId", "scheduledEmployeeGroupName", "scheduledForDate"
];

function deleteFields(fields, deletionMarker) {
  return Object.fromEntries(fields.map((field) => [field, deletionMarker]));
}

function ordinaryDraftWorkOrderUpdate(now, deletionMarker) {
  return { ...deleteFields(SCHEDULED_WORK_ORDER_FIELDS, deletionMarker), updatedAt: now };
}

function ordinaryDraftTaskUpdate(deletionMarker) {
  return deleteFields(SCHEDULED_TASK_FIELDS, deletionMarker);
}

function isScheduledDraftConversionUpdate(before, after) {
  if (!before || !after || before.status !== "draft" || after.status !== "draft"
    || before.scheduledWorkOrder !== true || after.scheduledWorkOrder === true) return false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [...keys].filter((key) => !isDeepStrictEqual(before[key], after[key]));
  return changed.length > 0 && changed.every((key) => SCHEDULED_TASK_FIELDS.includes(key));
}

function convertedScheduleUpdate(now, adminUid, workOrderId) {
  return {
    status: "converted",
    convertedAt: now,
    convertedByUid: adminUid,
    convertedWorkOrderId: workOrderId,
    generatedWorkOrderId: "",
    assignmentDeadlineAt: null,
    assignmentCountdownStartedAt: null,
    assignmentCountdownWaitingForAvailableEmployee: false,
    timeoutProcessedAt: now,
    updatedAt: now
  };
}

function collectConvertedScheduleAssignees(taskDocuments, convertedWorkOrderIds) {
  const assignees = new Map();
  for (const task of taskDocuments) {
    const workOrderId = String(task?.workOrderId || "").trim();
    const employeeUid = String(task?.assignedToUid || "").trim();
    const employeeName = String(task?.assignedToName || "").trim().slice(0, 120);
    if (!convertedWorkOrderIds.has(workOrderId) || !employeeUid || !employeeName
      || ["draft", "waiting_assignee"].includes(String(task?.status || ""))) continue;
    if (!assignees.has(workOrderId)) assignees.set(workOrderId, new Map());
    assignees.get(workOrderId).set(employeeUid, employeeName);
  }
  return new Map([...assignees].map(([workOrderId, namesByUid]) => [
    workOrderId,
    [...namesByUid.values()].sort((left, right) => left.localeCompare(right, "vi"))
  ]));
}

function hotelDeliveredScheduleUpdate(now, adminUid) {
  return {
    status: "assigned",
    assignedAt: now,
    assignedToUid: "",
    assignedToName: "Hotel",
    hotelDelivered: true,
    hotelDeliveredAt: now,
    hotelDeliveredByUid: adminUid,
    generatedWorkOrderId: "",
    assignmentDeadlineAt: null,
    assignmentCountdownStartedAt: null,
    assignmentCountdownWaitingForAvailableEmployee: false,
    timeoutProcessedAt: now,
    updatedAt: now
  };
}

function timestampMs(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function linkedLunchCompletionUpdate(task, now, workOrderId) {
  const nowMs = timestampMs(now);
  const startMs = timestampMs(task.queueStartAt)
    || timestampMs(task.dispatchedAt)
    || timestampMs(task.createdAt)
    || nowMs;
  const actualMs = Math.max(0, Number(task.accumulatedWorkedMs || 0))
    + Math.max(0, nowMs - startMs);
  const actualMinutes = Math.max(0, Math.ceil(actualMs / 60000));
  const deadlineMinutes = Math.max(1, Number(task.deadlineMinutes || 30));
  const differenceMinutes = Math.abs(deadlineMinutes - actualMinutes);
  const resultType = actualMinutes > deadlineMinutes ? "slower" : actualMinutes < deadlineMinutes ? "faster" : "on_time";
  const differencePercent = resultType === "on_time"
    ? 0
    : Number(((differenceMinutes / (resultType === "slower" ? actualMinutes : deadlineMinutes)) * 100).toFixed(1));
  return {
    status: "completed",
    submittedAt: now,
    approvedAt: now,
    actualMinutes,
    resultType,
    differenceMinutes,
    differencePercent,
    autoCompletedByScheduledConversion: true,
    autoCompletedAt: now,
    convertedScheduledWorkOrderId: workOrderId
  };
}

module.exports = {
  ordinaryDraftWorkOrderUpdate,
  ordinaryDraftTaskUpdate,
  isScheduledDraftConversionUpdate,
  convertedScheduleUpdate,
  collectConvertedScheduleAssignees,
  hotelDeliveredScheduleUpdate,
  linkedLunchCompletionUpdate
};
