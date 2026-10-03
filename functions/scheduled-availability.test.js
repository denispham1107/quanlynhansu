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
  ["free", "own-timeout-lunch", "submitted"]
);

assert.deepEqual(
  findAvailableScheduledEmployees(users, tasks, "group-a", "another-schedule").map((item) => item.uid),
  ["free", "submitted"]
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
assert.deepEqual(findAvailableScheduledEmployees(groupEmployees, busyGroupTasks, "spa").map((item) => item.uid), ["ngoc"]);
assert.deepEqual(findScheduledCountdownEmployees(groupEmployees, busyGroupTasks, "spa", "ticket", ["hao", "meo", "ngoc"])
  .map((item) => item.uid), ["ngoc"]);
assert.deepEqual(findScheduledCountdownEmployees(groupEmployees, busyGroupTasks.slice(0, 2), "spa", "ticket", ["ngoc"])
  .map((employee) => employee.uid), ["ngoc"]);
assert.deepEqual(findScheduledCountdownEmployees(groupEmployees, busyGroupTasks.slice(0, 2), "spa", "ticket", ["hao"]), []);
assert.deepEqual(findScheduledCountdownEmployees(groupEmployees, busyGroupTasks.slice(0, 2), "spa", "ticket")
  .map((employee) => employee.uid), ["ngoc"]);

const botEmployees = [
  { uid: "ai", role: "employee", employmentStatus: "working", employeeGroupId: "bot-ai" },
  { uid: "ai-1", role: "employee", employmentStatus: "working", employeeGroupId: "bot-ai" }
];
const botTasks = [
  { assignedToUid: "ai", status: "overdue" },
  { assignedToUid: "ai-1", status: "overdue" }
];
assert.deepEqual(findAvailableScheduledEmployees(botEmployees, botTasks, "bot-ai"), []);
botTasks[0].status = "submitted";
assert.deepEqual(findAvailableScheduledEmployees(botEmployees, botTasks, "bot-ai").map((item) => item.uid), ["ai"]);
botTasks[1].status = "completed";
assert.deepEqual(findAvailableScheduledEmployees(botEmployees, botTasks, "bot-ai").map((item) => item.uid), ["ai", "ai-1"]);

console.log("PASS | Lịch bắt đầu đếm khi nhân viên đã báo xong/chờ duyệt; chỉ người còn thực sự đang làm bị loại.");
