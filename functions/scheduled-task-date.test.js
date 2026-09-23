"use strict";

const assert = require("node:assert/strict");
const { scheduledTaskDateKey } = require("./scheduled-task-date");

assert.equal(
  scheduledTaskDateKey(new Date("2026-09-22T16:59:59.000Z")),
  "2026-09-22"
);
assert.equal(
  scheduledTaskDateKey(new Date("2026-09-22T17:00:00.000Z")),
  "2026-09-23"
);
assert.equal(
  scheduledTaskDateKey(new Date("2026-09-23T01:45:00.000Z")),
  "2026-09-23"
);
assert.equal(scheduledTaskDateKey("không hợp lệ"), "");

console.log("PASS | Ngày giao Phiếu lịch được tính đúng theo múi giờ Việt Nam.");
