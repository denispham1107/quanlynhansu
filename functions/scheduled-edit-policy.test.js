"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const {
  isValidScheduledEditDeletePolicy,
  normalizeScheduledEditDeletePolicy,
  canModifyScheduledWorkOrder
} = require("./scheduled-edit-policy");

assert.equal(normalizeScheduledEditDeletePolicy(undefined), "editable");
assert.equal(normalizeScheduledEditDeletePolicy("editable"), "editable");
assert.equal(normalizeScheduledEditDeletePolicy("locked"), "locked");
assert.equal(canModifyScheduledWorkOrder({}), true);
assert.equal(canModifyScheduledWorkOrder({ editDeletePolicy: "editable" }), true);
assert.equal(canModifyScheduledWorkOrder({ editDeletePolicy: "locked" }), false);
assert.equal(isValidScheduledEditDeletePolicy("editable"), true);
assert.equal(isValidScheduledEditDeletePolicy("locked"), true);
assert.equal(isValidScheduledEditDeletePolicy("delete_only"), false);

const source = readFileSync(join(__dirname, "index.js"), "utf8");
const update = source.slice(source.indexOf("exports.updateScheduledWorkOrder ="), source.indexOf("exports.listScheduledWorkOrders ="));
const deletion = source.slice(source.indexOf("exports.deleteScheduledWorkOrder ="), source.indexOf("async function materializeScheduledWorkOrderById("));
const daily = source.slice(source.indexOf("async function ensureNextDailyScheduledOccurrence("), source.indexOf("exports.createScheduledWorkOrder ="));
assert.match(update, /if \(!canModifyScheduledWorkOrder\(currentSchedule\)\)/);
assert.match(deletion, /if \(!canModifyScheduledWorkOrder\(currentSchedule\)\)/);
assert.match(daily, /editDeletePolicy: normalizeScheduledEditDeletePolicy\(currentSchedule\.editDeletePolicy\)/);

console.log("PASS | Lịch cũ mặc định cho sửa-xóa; lịch khóa bị chặn trên máy chủ và lịch lặp kế thừa khóa.");
