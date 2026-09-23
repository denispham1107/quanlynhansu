"use strict";

const assert = require("node:assert/strict");
const { findAvailableScheduledEmployees } = require("./scheduled-availability");

const users = [
  { uid: "free", role: "employee", employmentStatus: "working", employeeGroupId: "group-a" },
  { uid: "busy", role: "employee", employmentStatus: "working", employeeGroupId: "group-a" },
  { uid: "lunch", role: "employee", employmentStatus: "working", employeeGroupId: "group-a" },
  { uid: "own-timeout-lunch", role: "employee", employmentStatus: "working", employeeGroupId: "group-a" },
  { uid: "off", role: "employee", employmentStatus: "off", employeeGroupId: "group-a" },
  { uid: "other-group", role: "employee", employmentStatus: "working", employeeGroupId: "group-b" },
  { uid: "supervisor", role: "supervisor", employmentStatus: "working", employeeGroupId: "group-a" }
];

const tasks = [
  { assignedToUid: "busy", status: "doing" },
  { assignedToUid: "lunch", status: "lunch_break" },
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

console.log("PASS | Chỉ nhân viên đang làm, đúng nhóm và không có Phiếu hoạt động mới được xem là trống.");
