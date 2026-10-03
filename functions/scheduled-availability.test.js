"use strict";

const assert = require("node:assert/strict");
const { findAvailableScheduledEmployees, findScheduledCountdownEmployees } = require("./scheduled-availability");

const users = [
  { uid: "free", role: "employee", employmentStatus: "working", employeeGroupId: "group-a" },
  { uid: "busy", role: "employee", employmentStatus: "working", employeeGroupId: "group-a" },
  { uid: "lunch", role: "employee", employmentStatus: "working", employeeGroupId: "group-a" },
  { uid: "submitted", role: "employee", employmentStatus: "working", employeeGroupId: "group-a" },
  { uid: "own-timeout-lunch", role: "employee", employmentStatus: "working", employeeGroupId: "group-a" },
  { uid: "off", role: "employee", employmentStatus: "off", employeeGroupId: "group-a" },
  { uid: "other-group", role: "employee", employmentStatus: "working", employeeGroupId: "group-b" },
  { uid: "supervisor", role: "supervisor", employmentStatus: "working", employeeGroupId: "group-a" }
];

const tasks = [
  { assignedToUid: "busy", status: "doing" },
  { assignedToUid: "lunch", status: "lunch_break" },
  { assignedToUid: "submitted", status: "submitted" },
  { assignedToUid: "free", status: "completed" },
  {
    assignedToUid: "own-timeout-lunch",
    status: "lunch_break",
    autoCreatedByScheduledGroupTimeout: true,
    sourceScheduledWorkOrderId: "scheduled-1"
  }
];

assert.deepEqual(
  findAvailableScheduledEmployees(users, tasks, "group-a", "scheduled-1").map((item) => item.uid).sort(),
  ["free", "own-timeout-lunch"]
);

assert.deepEqual(
  findAvailableScheduledEmployees(users, tasks, "group-a", "another-schedule").map((item) => item.uid),
  ["free"]
);

assert.deepEqual(findAvailableScheduledEmployees(users, tasks, "", "scheduled-1"), []);

const groupEmployees = [
  { uid: "hao", role: "employee", employmentStatus: "working", employeeGroupId: "spa" },
  { uid: "meo", role: "employee", employmentStatus: "working", employeeGroupId: "spa" },
  { uid: "ngoc", role: "employee", employmentStatus: "working", employeeGroupId: "spa" }
];
const busyGroupTasks = [
  { assignedToUid: "hao", status: "doing", isShip: true },
  { assignedToUid: "meo", status: "hotel" },
  { assignedToUid: "ngoc", status: "submitted" }
];
assert.deepEqual(findAvailableScheduledEmployees(groupEmployees, busyGroupTasks, "spa"), []);
assert.deepEqual(findScheduledCountdownEmployees(groupEmployees, busyGroupTasks, "spa", "ticket", ["hao", "meo", "ngoc"]), []);
assert.deepEqual(findScheduledCountdownEmployees(groupEmployees, busyGroupTasks.slice(0, 2), "spa", "ticket", ["ngoc"])
  .map((employee) => employee.uid), ["ngoc"]);
assert.deepEqual(findScheduledCountdownEmployees(groupEmployees, busyGroupTasks.slice(0, 2), "spa", "ticket", ["hao"]), []);
assert.deepEqual(findScheduledCountdownEmployees(groupEmployees, busyGroupTasks.slice(0, 2), "spa", "ticket")
  .map((employee) => employee.uid), ["ngoc"]);

console.log("PASS | Lịch chỉ đếm và tạo Nghỉ trưa cho nhân viên rảnh từ lúc bắt đầu; người đang làm hoặc chờ duyệt bị loại.");
