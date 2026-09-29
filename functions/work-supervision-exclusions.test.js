"use strict";

const assert = require("node:assert/strict");
const { reconcileExcludedEmployees } = require("./work-supervision-exclusions");

const profiles = new Map([
  ["employee-1", { role: "employee" }],
  ["employee-2", { role: "employee" }],
  ["former-employee", { role: "admin" }]
]);

assert.deepEqual(
  reconcileExcludedEmployees(
    ["employee-1", "deleted-employee", "former-employee", "employee-2"],
    ["employee-1", "deleted-employee", "former-employee", "employee-2"],
    profiles
  ),
  { validUids: ["employee-1", "employee-2"], removedStaleCount: 2, hasInvalidNewUid: false }
);
assert.deepEqual(
  reconcileExcludedEmployees(["deleted-employee"], [], profiles),
  { validUids: [], removedStaleCount: 0, hasInvalidNewUid: true }
);
assert.deepEqual(
  reconcileExcludedEmployees(["employee-1"], ["employee-1"], profiles),
  { validUids: ["employee-1"], removedStaleCount: 0, hasInvalidNewUid: false }
);

console.log("PASS | Bỏ tài khoản miễn giám sát cũ đã mất quyền, từ chối tài khoản mới không hợp lệ.");
