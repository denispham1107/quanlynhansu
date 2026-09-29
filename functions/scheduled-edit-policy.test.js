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
assert.equal(canModifyScheduledWorkOrder({ editDeletePolicy: "locked" }, true), true);
assert.equal(canModifyScheduledWorkOrder({ editDeletePolicy: "locked" }, "true"), false);
assert.equal(isValidScheduledEditDeletePolicy("editable"), true);
assert.equal(isValidScheduledEditDeletePolicy("locked"), true);
assert.equal(isValidScheduledEditDeletePolicy("delete_only"), false);

const source = readFileSync(join(__dirname, "index.js"), "utf8");
const update = source.slice(source.indexOf("exports.updateScheduledWorkOrder ="), source.indexOf("exports.listScheduledWorkOrders ="));
const deletion = source.slice(source.indexOf("exports.deleteScheduledWorkOrder ="), source.indexOf("async function materializeScheduledWorkOrderById("));
const daily = source.slice(source.indexOf("async function ensureNextDailyScheduledOccurrence("), source.indexOf("exports.createScheduledWorkOrder ="));
const settingsSave = source.slice(source.indexOf("exports.saveWorkOrderControlSettings ="), source.indexOf("exports.updateEmployeeProfile ="));
assert.match(update, /if \(!canModifyScheduledWorkOrder\(currentSchedule, allowEditDeleteLockedSchedules\)\)/);
assert.match(deletion, /settingsSnapshot\.data\(\)\?\.allowEditDeleteLockedSchedules === true/);
assert.match(update, /transaction\.getAll\(\s*scheduleRef, groupRef, settingsRef\s*\)/);
assert.match(deletion, /transaction\.getAll\(\s*scheduleRef, db\.doc\("appSettings\/workOrderControls"\)\s*\)/);
assert.match(update, /String\(currentSchedule\.createdByUid \|\| ""\) !== adminUid/);
assert.match(deletion, /String\(currentSchedule\.createdByUid \|\| ""\) !== adminUid/);
assert.match(settingsSave, /rawAllowEditDeleteLockedSchedules === undefined/);
assert.match(settingsSave, /typeof allowEditDeleteLockedSchedules !== "boolean"/);
assert.match(settingsSave, /allowEditDeleteLockedSchedules,/);
assert.match(daily, /editDeletePolicy: normalizeScheduledEditDeletePolicy\(currentSchedule\.editDeletePolicy\)/);

console.log("PASS | Lịch khóa chỉ được sửa/xóa khi cài đặt máy chủ bật; lịch lặp vẫn kế thừa quyền khóa.");
