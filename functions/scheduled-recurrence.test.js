"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { shouldPrepareNextDailyScheduledOccurrence } = require("./scheduled-recurrence");

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 29, 9, 0, 0);
const sixDailySchedules = Array.from({ length: 6 }, (_, index) => ({
  id: `daily-${index}`,
  repeatMode: "daily",
  status: index < 4 ? "generated" : "pending",
  scheduledAtMs: now + (index + 1) * 60 * 60 * 1000,
  nextScheduleId: index < 4 ? `next-${index}` : ""
}));
const missingNext = sixDailySchedules.filter((item) => (
  shouldPrepareNextDailyScheduledOccurrence(item, "2026-09-29", "2026-09-29")
));
assert.deepEqual(missingNext.map((item) => item.id), ["daily-4", "daily-5"]);
assert.equal(4 + missingNext.length, 6);
assert.equal(shouldPrepareNextDailyScheduledOccurrence({ repeatMode: "none" }, "2026-09-29", "2026-09-29"), false);
assert.equal(shouldPrepareNextDailyScheduledOccurrence({ repeatMode: "daily", status: "cancelled" }, "2026-09-29", "2026-09-29"), false);
assert.equal(shouldPrepareNextDailyScheduledOccurrence({ repeatMode: "daily" }, "2026-09-30", "2026-09-29"), false);
assert.equal(shouldPrepareNextDailyScheduledOccurrence({ repeatMode: "daily" }, "2026-09-28", "2026-09-29"), false);

const source = readFileSync(join(__dirname, "index.js"), "utf8");
const create = source.slice(source.indexOf("exports.createScheduledWorkOrder ="), source.indexOf("exports.updateScheduledWorkOrder ="));
const update = source.slice(source.indexOf("exports.updateScheduledWorkOrder ="), source.indexOf("exports.listScheduledWorkOrders ="));
const list = source.slice(source.indexOf("exports.listScheduledWorkOrders ="), source.indexOf("exports.deleteScheduledWorkOrder ="));
const fallback = source.slice(source.indexOf("exports.processScheduledWorkOrdersFallback ="), source.indexOf("exports.", source.indexOf("exports.processScheduledWorkOrdersFallback =") + 8));
assert.match(create, /ensureNextDailyScheduledOccurrence\(scheduleRef\.id/);
assert.match(update, /seriesId = String\(currentSchedule\.seriesId \|\| scheduleId\)/);
assert.match(update, /ensureNextDailyScheduledOccurrence\(scheduleId, \{\s*scheduledAt, repeatMode, seriesId/);
assert.match(list, /shouldPrepareNextDailyScheduledOccurrence\(/);
assert.match(fallback, /shouldPrepareNextDailyScheduledOccurrence\(/);

function extractFunction(name) {
  const start = source.indexOf(`async function ${name}(`);
  const bodyStart = source.indexOf(") {", start) + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Không đọc được ${name}.`);
}

async function verifySixDailyOccurrences() {
  const documents = new Map();
  const queued = [];
  const timestamp = (ms) => ({ toMillis: () => ms });
  const db = {
    doc: (path) => ({ path }),
    runTransaction: async (callback) => callback({
      getAll: async (...refs) => refs.map((ref) => ({
        exists: documents.has(ref.path),
        data: () => documents.get(ref.path)
      })),
      set: (ref, value, options) => {
        documents.set(ref.path, options?.merge ? { ...documents.get(ref.path), ...value } : value);
      }
    })
  };
  const createNext = new Function(
    "db", "crypto", "Timestamp", "SCHEDULED_DAILY_INTERVAL_MS",
    "firestoreTimestampOrNull", "normalizeScheduledRepeatMode", "normalizeScheduledEditDeletePolicy",
    "normalizeScheduledAssignmentCountdownMinutes", "nextDailyScheduledRows", "tryEnqueueScheduledMaterialization",
    `${extractFunction("ensureNextDailyScheduledOccurrence")}; return ensureNextDailyScheduledOccurrence;`
  )(
    db, crypto, { fromMillis: timestamp, now: () => timestamp(now) }, DAY_MS,
    (value) => value?.toMillis ? value : null,
    (value) => value === "daily" ? "daily" : "none",
    (value) => value === "locked" ? "locked" : "editable",
    (value) => value,
    (rows) => rows.map((row) => ({ ...row, taskDate: "2026-09-30" })),
    async (id) => { queued.push(id); }
  );

  for (const item of sixDailySchedules) {
    const path = `scheduledWorkOrders/${item.id}`;
    documents.set(path, {
      ...item,
      scheduledAt: timestamp(item.scheduledAtMs),
      seriesId: item.id,
      createdByUid: "admin-1",
      name: item.id,
      rows: [{ title: item.id, taskDate: "2026-09-29" }]
    });
    if (item.nextScheduleId) documents.set(`scheduledWorkOrders/${item.nextScheduleId}`, {
      id: item.nextScheduleId,
      scheduledAt: timestamp(item.scheduledAtMs + DAY_MS)
    });
  }
  for (const item of missingNext) {
    await createNext(item.id, documents.get(`scheduledWorkOrders/${item.id}`));
  }
  const tomorrow = [...documents.values()].filter((item) => (
    item.scheduledAt?.toMillis() > now + DAY_MS
  ));
  assert.equal(tomorrow.length, 6);
  assert.equal(queued.length, 2);
  assert.ok(tomorrow.filter((item) => item.previousScheduleId).every((item) => (
    item.createdByUid === "admin-1" && item.rows[0].taskDate === "2026-09-30"
  )));
  for (const item of missingNext) {
    await createNext(item.id, documents.get(`scheduledWorkOrders/${item.id}`));
  }
  assert.equal(documents.size, 12);
  assert.equal(queued.length, 2);
}

verifySixDailyOccurrences().then(() => {
  console.log("PASS | Sáu lịch lặp được chuẩn bị đủ cho ngày kế tiếp, kể cả lịch hôm nay chưa đến giờ.");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
