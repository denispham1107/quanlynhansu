"use strict";

const SCHEDULED_EDIT_DELETE_POLICY_EDITABLE = "editable";
const SCHEDULED_EDIT_DELETE_POLICY_LOCKED = "locked";

function isValidScheduledEditDeletePolicy(value) {
  return value === SCHEDULED_EDIT_DELETE_POLICY_EDITABLE
    || value === SCHEDULED_EDIT_DELETE_POLICY_LOCKED;
}

function normalizeScheduledEditDeletePolicy(value) {
  return value === SCHEDULED_EDIT_DELETE_POLICY_LOCKED
    ? SCHEDULED_EDIT_DELETE_POLICY_LOCKED
    : SCHEDULED_EDIT_DELETE_POLICY_EDITABLE;
}

function canModifyScheduledWorkOrder(schedule, allowLockedSchedules = false) {
  return normalizeScheduledEditDeletePolicy(schedule?.editDeletePolicy)
    !== SCHEDULED_EDIT_DELETE_POLICY_LOCKED || allowLockedSchedules === true;
}

module.exports = {
  SCHEDULED_EDIT_DELETE_POLICY_EDITABLE,
  SCHEDULED_EDIT_DELETE_POLICY_LOCKED,
  isValidScheduledEditDeletePolicy,
  normalizeScheduledEditDeletePolicy,
  canModifyScheduledWorkOrder
};
