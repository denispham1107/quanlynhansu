"use strict";

const SCHEDULED_ASSIGNMENT_BLOCKING_TASK_STATUSES = [
  "doing",
  "lunch_break",
  "hotel",
  "redo",
  "overdue"
];

function findAvailableScheduledEmployees(users = [], tasks = [], groupId = "", ignoredWorkOrderId = "") {
  const normalizedGroupId = String(groupId || "").trim();
  const normalizedIgnoredWorkOrderId = String(ignoredWorkOrderId || "").trim();
  if (!normalizedGroupId) return [];

  const busyEmployeeUids = new Set();
  tasks.forEach((task = {}) => {
    const employeeUid = String(task.assignedToUid || "").trim();
    if (
      !employeeUid
      || !SCHEDULED_ASSIGNMENT_BLOCKING_TASK_STATUSES.includes(String(task.status || ""))
    ) return;

    const isOwnTimeoutLunch = Boolean(
      normalizedIgnoredWorkOrderId
      && task.autoCreatedByScheduledGroupTimeout === true
      && String(task.sourceScheduledWorkOrderId || "") === normalizedIgnoredWorkOrderId
    );
    if (!isOwnTimeoutLunch) busyEmployeeUids.add(employeeUid);
  });

  return users.filter((employee = {}) => (
    employee.role === "employee"
    && employee.employmentStatus !== "off"
    && String(employee.employeeGroupId || "") === normalizedGroupId
    && !busyEmployeeUids.has(String(employee.uid || "").trim())
  ));
}

module.exports = {
  SCHEDULED_ASSIGNMENT_BLOCKING_TASK_STATUSES,
  findAvailableScheduledEmployees
};
