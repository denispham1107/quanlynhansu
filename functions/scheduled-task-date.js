"use strict";

const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";

function scheduledTaskDateKey(value, timeZone = DEFAULT_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(Number(value));
  if (!Number.isFinite(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

module.exports = {
  DEFAULT_TIME_ZONE,
  scheduledTaskDateKey
};
