import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appSource = readFileSync(resolve(projectRoot, "app.js"), "utf8");

function extractFunction(name) {
  const signature = `function ${name}(`;
  const start = appSource.indexOf(signature);
  if (start < 0) throw new Error(`Không tìm thấy ${name} trong app.js.`);
  const bodyStart = appSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Không đọc được toàn bộ ${name}.`);
}

const buildHelpers = new Function(`
  const state = {
    scheduledWorkOrderDateFilter: "",
    scheduledWorkOrderDateFromFilter: "",
    scheduledWorkOrderDateToFilter: ""
  };
  ${extractFunction("toLocalDateInputValue")}
  ${extractFunction("todayInputValue")}
  ${extractFunction("yesterdayInputValue")}
  ${extractFunction("scheduledWorkOrderMatchesStatusFilter")}
  ${extractFunction("normalizeScheduledWorkOrderTimeFilter")}
  ${extractFunction("scheduledWorkOrderDateValue")}
  ${extractFunction("scheduledWorkOrderMatchesTimeFilter")}
  return { state, todayInputValue, yesterdayInputValue, scheduledWorkOrderMatchesStatusFilter, scheduledWorkOrderMatchesTimeFilter };
`);

const helpers = buildHelpers();

function localNoonMilliseconds(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).getTime();
}

const today = helpers.todayInputValue();
const yesterday = helpers.yesterdayInputValue();
const twoDaysAgoDate = new Date(localNoonMilliseconds(yesterday));
twoDaysAgoDate.setDate(twoDaysAgoDate.getDate() - 1);
const twoDaysAgo = [
  twoDaysAgoDate.getFullYear(),
  String(twoDaysAgoDate.getMonth() + 1).padStart(2, "0"),
  String(twoDaysAgoDate.getDate()).padStart(2, "0")
].join("-");

const schedules = [
  { id: "today-unassigned", status: "pending", scheduledForMs: localNoonMilliseconds(today) },
  { id: "today-assigned", status: "assigned", scheduledForMs: localNoonMilliseconds(today) },
  { id: "yesterday-assigned", status: "assigned", scheduledForMs: localNoonMilliseconds(yesterday) },
  { id: "older-unassigned", status: "generated", scheduledForMs: localNoonMilliseconds(twoDaysAgo) }
];

function filterIds(timeFilter, statusFilter) {
  return schedules
    .filter((schedule) => helpers.scheduledWorkOrderMatchesTimeFilter(schedule, timeFilter))
    .filter((schedule) => helpers.scheduledWorkOrderMatchesStatusFilter(schedule, statusFilter))
    .map((schedule) => schedule.id);
}

assert.deepEqual(filterIds("today", "unassigned"), ["today-unassigned"]);
assert.deepEqual(filterIds("today", "assigned"), ["today-assigned"]);
assert.deepEqual(filterIds("yesterday", "assigned"), ["yesterday-assigned"]);

helpers.state.scheduledWorkOrderDateFilter = twoDaysAgo;
assert.deepEqual(filterIds("date", "unassigned"), ["older-unassigned"]);

helpers.state.scheduledWorkOrderDateFromFilter = today;
helpers.state.scheduledWorkOrderDateToFilter = yesterday;
assert.deepEqual(filterIds("range", "assigned"), ["today-assigned", "yesterday-assigned"]);

console.log("PASS | Bộ lọc thời gian và trạng thái lịch được kết hợp chính xác.");
