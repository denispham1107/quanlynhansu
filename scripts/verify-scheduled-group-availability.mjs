import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const server = readFileSync(join(root, "functions", "index.js"), "utf8");

function extractFunction(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Không tìm thấy ${name}`);
  const bodyStart = app.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    if (app[index] === "}") depth -= 1;
    if (depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`Không đọc được ${name}`);
}

const harness = new Function(`
  const state = {
    employees: [
      { uid: "hao", name: "Hào", employeeGroupId: "spa" },
      { uid: "meo", name: "Mèo", employeeGroupId: "spa" },
      { uid: "ngoc", name: "Ngọc", employeeGroupId: "spa" }
    ],
    tasks: [
      { assignedToUid: "hao", status: "doing" },
      { assignedToUid: "meo", status: "hotel" }
    ],
    workOrders: [{
      id: "ticket", scheduleId: "schedule", name: "Phiếu thử", status: "draft",
      scheduledWorkOrder: true, scheduledGroupAssignmentPending: true,
      scheduledEmployeeGroupId: "spa", scheduledEmployeeGroupName: "Spa Hotel",
      scheduledCountdownEmployeeUids: ["ngoc"],
      scheduledAssignmentCountdownMinutes: 10,
      scheduledAssignmentDeadlineAt: new Date("2026-10-03T06:10:00Z")
    }],
    profile: { role: "employee", name: "Ngọc", employeeGroupId: "spa" },
    user: { uid: "ngoc" }
  };
  const isEmployeeWorking = () => true;
  const employeeHasBlockingTaskForScheduledAssignment = (uid) => state.tasks.some(
    (task) => task.assignedToUid === uid && !["completed", "draft"].includes(task.status)
  );
  const timestampToDate = (value) => value;
  const getEmployeeSummaryName = (employee) => employee.name;
  const normalizeScheduledCountdownMinutes = (value) => value;
  ${extractFunction("isEmployeeEligibleForScheduledCountdown")}
  ${extractFunction("getActiveScheduledGroupCountdownStates")}
  ${extractFunction("getCurrentEmployeeScheduledGroupCountdownState")}
  return { state, getActiveScheduledGroupCountdownStates, getCurrentEmployeeScheduledGroupCountdownState };
`)();

assert.deepEqual(harness.getActiveScheduledGroupCountdownStates().map((item) => item.employeeUid), ["ngoc"]);
assert.equal(harness.getCurrentEmployeeScheduledGroupCountdownState()?.employeeUid, "ngoc");
harness.state.tasks.push({ assignedToUid: "ngoc", status: "submitted" });
assert.deepEqual(harness.getActiveScheduledGroupCountdownStates(), []);
assert.equal(harness.getCurrentEmployeeScheduledGroupCountdownState(), null);

const timeout = server.slice(
  server.indexOf("async function processScheduledGroupAssignmentTimeoutById("),
  server.indexOf("exports.processScheduledGroupAssignmentTimeout =", server.indexOf("async function processScheduledGroupAssignmentTimeoutById("))
);
assert.match(timeout, /transaction\.get\(\s*db\.collection\("tasks"\)\.where\("status", "in", SCHEDULED_ASSIGNMENT_BLOCKING_TASK_STATUSES\)/);
assert.match(timeout, /const employees = scheduledCountdownEligibleEmployees\(/);
assert.match(timeout, /if \(!employees\.length\) \{[\s\S]*?assignmentDeadlineAt: null/);
assert.match(timeout, /const lunchEntries = employees\.map\(/);
assert.match(server, /pauseScheduledAssignmentCountdownIfNoEligibleEmployee\(item\.id\)/);

console.log("PASS | Bộ đếm chỉ hiện người rảnh; hết hạn kiểm tra lại và không tạo Nghỉ trưa cho người đang bận.");
