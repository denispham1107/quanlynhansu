import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { linkedLunchCompletionUpdate } = require("../functions/scheduled-conversion.js");

const scheduleId = String(process.argv[2] || "").trim();
const apply = process.argv.includes("--apply");
const token = process.env.SCHEDULED_LUNCH_REPAIR_TOKEN;
if (!scheduleId || scheduleId.includes("/") || scheduleId.length > 180 || !token) {
  throw new Error("Cần mã lịch hợp lệ và SCHEDULED_LUNCH_REPAIR_TOKEN.");
}

const root = "https://firestore.googleapis.com/v1/projects/quanlynhansu-6e63b/databases/(default)/documents";
async function firestore(path, method = "GET", body = null, allowMissing = false) {
  const response = await fetch(`${root}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore ${method} ${path}: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

async function query(collectionId, fieldPath, value) {
  const results = await firestore(":runQuery", "POST", {
    structuredQuery: {
      from: [{ collectionId }],
      where: { fieldFilter: { field: { fieldPath }, op: "EQUAL", value: { stringValue: value } } }
    }
  });
  return results.filter((result) => result.document).map((result) => result.document);
}

const workOrderId = `scheduled_${scheduleId}`;
const [tasks, replacements, deleted] = await Promise.all([
  query("tasks", "sourceScheduledWorkOrderId", workOrderId),
  query("replacedScheduledWorkOrders", "sourceScheduleId", scheduleId),
  firestore(`/deletedScheduledWorkOrders/${encodeURIComponent(scheduleId)}`, "GET", null, true)
]);
const changes = [
  ...replacements.map((entry) => ({ reason: "updated", at: entry.fields?.replacedAt?.timestampValue })),
  { reason: "deleted", at: deleted?.fields?.deletedAt?.timestampValue }
].filter((entry) => entry.at && Number.isFinite(Date.parse(entry.at)));

let repaired = 0;
for (const document of tasks) {
  const fields = document.fields || {};
  if (fields.autoCreatedByScheduledGroupTimeout?.booleanValue !== true
    || !["lunch_break", "overdue"].includes(fields.status?.stringValue)
    || fields.approvedAt?.timestampValue) continue;
  const startedAt = fields.queueStartAt?.timestampValue
    || fields.dispatchedAt?.timestampValue
    || fields.createdAt?.timestampValue;
  const startedAtMs = Date.parse(startedAt || "");
  if (!Number.isFinite(startedAtMs)) continue;
  const change = changes
    .filter((entry) => Date.parse(entry.at) >= startedAtMs && Date.parse(entry.at) <= Date.now())
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))[0];
  if (!change) continue;

  const taskId = document.name.split("/").at(-1);
  const endedAt = new Date(change.at);
  const completion = linkedLunchCompletionUpdate({
    queueStartAt: new Date(startedAt),
    accumulatedWorkedMs: Number(fields.accumulatedWorkedMs?.integerValue || fields.accumulatedWorkedMs?.doubleValue || 0),
    deadlineMinutes: Number(fields.deadlineMinutes?.integerValue || fields.deadlineMinutes?.doubleValue || 30)
  }, endedAt, workOrderId, change.reason);
  console.log(`${apply ? "APPLY" : "DRY RUN"} | ${taskId} | ${change.reason} | ${change.at} | ${completion.actualMinutes} phút`);
  if (!apply) continue;

  const patchFields = {
    status: { stringValue: "completed" },
    submittedAt: { timestampValue: endedAt.toISOString() },
    approvedAt: { timestampValue: endedAt.toISOString() },
    actualMinutes: { integerValue: String(completion.actualMinutes) },
    resultType: { stringValue: completion.resultType },
    differenceMinutes: { integerValue: String(completion.differenceMinutes) },
    differencePercent: { doubleValue: completion.differencePercent },
    autoCompletedAt: { timestampValue: endedAt.toISOString() },
    autoCompletedByScheduledChange: { booleanValue: true },
    scheduledChangeReason: { stringValue: change.reason },
    changedScheduledWorkOrderId: { stringValue: workOrderId }
  };
  const params = new URLSearchParams();
  Object.keys(patchFields).forEach((field) => params.append("updateMask.fieldPaths", field));
  params.set("currentDocument.updateTime", document.updateTime);
  await firestore(`/tasks/${encodeURIComponent(taskId)}?${params}`, "PATCH", { fields: patchFields });
  repaired += 1;
}

console.log(apply
  ? `Đã kết thúc ${repaired} Phiếu nghỉ trưa của lịch ${scheduleId}.`
  : `Các Phiếu nêu trên sẵn sàng được kết thúc cho lịch ${scheduleId}.`);
