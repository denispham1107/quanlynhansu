"use strict";

function shouldPrepareNextDailyScheduledOccurrence(schedule, scheduledDateKey, todayDateKey) {
  if (String(schedule?.repeatMode || "none") !== "daily") return false;
  if (!["pending", "generated", "assigned"].includes(String(schedule?.status || "pending"))) return false;
  if (String(schedule?.nextScheduleId || "").trim()) return false;
  return Boolean(todayDateKey) && scheduledDateKey === todayDateKey;
}

module.exports = { shouldPrepareNextDailyScheduledOccurrence };
