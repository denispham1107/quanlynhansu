"use strict";

function reconcileExcludedEmployees(requestedUids, previousUids, employeeProfiles) {
  const previouslySaved = new Set(previousUids);
  const validUids = [];
  let removedStaleCount = 0;
  let hasInvalidNewUid = false;

  for (const uid of requestedUids) {
    if (employeeProfiles.get(uid)?.role === "employee") {
      validUids.push(uid);
    } else if (previouslySaved.has(uid)) {
      removedStaleCount += 1;
    } else {
      hasInvalidNewUid = true;
    }
  }

  return { validUids, removedStaleCount, hasInvalidNewUid };
}

module.exports = { reconcileExcludedEmployees };
