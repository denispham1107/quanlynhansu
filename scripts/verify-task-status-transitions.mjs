import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const rules = readFileSync(join(root, "firestore.rules"), "utf8");
assert.match(app, /isAdminProfile\(\) && !snapshot\.metadata\.fromCache && !snapshot\.metadata\.hasPendingWrites/);

function sourceOf(name) {
  const functionStart = app.indexOf(`function ${name}(`);
  assert.ok(functionStart >= 0, `Thiếu hàm ${name}`);
  const start = app.slice(functionStart - 6, functionStart) === "async " ? functionStart - 6 : functionStart;
  const opening = app.indexOf("{", start);
  let depth = 0;
  for (let index = opening; index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    if (app[index] === "}") depth -= 1;
    if (depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`${name} chưa đóng ngoặc`);
}

const liveTasks = new Map();
const updates = [];
const notifications = [];
const toasts = [];
let reflows = 0;
const context = vm.createContext({
  db: {},
  state: { user: { uid: "admin" }, profile: { name: "Admin" }, tasks: [] },
  Date,
  Promise,
  console: { error() {}, warn() {} },
  doc(_db, _collection, id) { return id; },
  isAdminProfile: () => true,
  requirePermission: () => true,
  setButtonLoading() {},
  timestampToDate: (value) => value,
  isShipTask: () => false,
  isLunchBreakTask: () => false,
  isHotelTask: () => false,
  calculateResultAt: () => ({ actualMinutes: 3, resultType: "faster", differenceMinutes: 2, differencePercent: 40 }),
  taskResultShortText: () => "nhanh hơn 2 phút",
  Timestamp: { fromDate: (value) => value, now: () => new Date() },
  arrayUnion: (value) => value,
  increment: (value) => value,
  markTaskReviewDecisionLocally() {},
  async reflowQueuedTasksForEmployee() { reflows += 1; },
  async createNotifications(items) { notifications.push(...items); },
  toast(message, type) { toasts.push({ message, type }); },
  async runTransaction(_db, callback) {
    return callback({
      async get(id) {
        const task = liveTasks.get(id);
        return { id, exists: () => Boolean(task), data: () => ({ ...task }) };
      },
      update(id, patch) {
        updates.push({ id, patch });
        liveTasks.set(id, { ...liveTasks.get(id), ...patch });
      }
    });
  }
});
vm.runInContext([
  sourceOf("markTaskOverdueIfStillActive"),
  sourceOf("syncOverdueTasksByAdmin"),
  sourceOf("approveTask"),
  sourceOf("requestRedo")
].join("\n"), context);

const past = new Date(Date.now() - 60000);
const future = new Date(Date.now() + 60000);
const base = { title: "Công việc", assignedToUid: "employee", assignedToName: "Nhân viên", deadlineAt: past };
context.state.tasks = [{ id: "task-1", ...base, status: "doing" }];
liveTasks.set("task-1", { ...base, status: "completed", approvedAt: past });
await context.syncOverdueTasksByAdmin();
assert.equal(updates.length, 0, "Snapshot Admin cũ không được biến Phiếu đã duyệt thành quá hạn");

liveTasks.set("task-1", { ...base, status: "submitted", submittedAt: past });
await context.syncOverdueTasksByAdmin();
assert.equal(updates.length, 0, "Phiếu đã gửi chờ duyệt không được chạy lại");

liveTasks.set("task-1", { ...base, status: "doing", deadlineAt: future });
await context.syncOverdueTasksByAdmin();
assert.equal(updates.length, 0, "Phiếu chưa hết hạn không được đánh dấu quá hạn");

liveTasks.set("task-1", { ...base, status: "doing" });
await context.syncOverdueTasksByAdmin();
assert.equal(liveTasks.get("task-1").status, "overdue");
assert.equal(updates.length, 1);

updates.length = 0;
liveTasks.set("task-1", { ...base, status: "completed", approvedAt: past });
await context.approveTask("task-1", {});
await context.requestRedo("task-1", {});
assert.equal(updates.length, 0, "Hai thao tác duyệt/làm lại đến trễ không được mở lại Phiếu đã hoàn thành");
assert.equal(notifications.length, 0);
assert.equal(reflows, 0);
assert.equal(toasts.at(-1).type, "error");

liveTasks.set("task-1", { ...base, status: "submitted", submittedAt: past });
await context.approveTask("task-1", {});
assert.equal(liveTasks.get("task-1").status, "completed");
assert.equal(reflows, 1);
assert.equal(notifications.length, 2);

liveTasks.set("task-1", { ...base, status: "submitted", submittedAt: past });
await context.requestRedo("task-1", {});
assert.equal(liveTasks.get("task-1").status, "redo");

const taskRules = rules.slice(rules.indexOf("match /tasks/{taskId}"), rules.indexOf("match /notifications/{notificationId}"));
for (const actor of ["isAdmin()", 'hasPermission("reassignTasks")', 'hasPermission("extendTaskTime")', 'hasPermission("reviewTasks")', 'hasPermission("importData")']) {
  const escaped = actor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = taskRules.match(new RegExp(`allow update: if ${escaped}\\s+&& preservesFinalTaskStatus`, "g")) || [];
  assert.ok(matches.length > 0, `Thiếu khóa trạng thái ở quyền ${actor}`);
}
assert.equal((taskRules.match(/allow update: if isAdmin\(\)\s+&& preservesFinalTaskStatus/g) || []).length, 3);
assert.match(rules, /beforeData\.status != "completed" \|\| afterData\.status == "completed"/);
assert.match(rules, /beforeData\.status != "submitted" \|\| afterData\.status in \["submitted", "completed", "redo"\]/);

console.log("PASS | Phiếu đã duyệt/chờ duyệt không bị đồng bộ quá hạn hoặc thao tác trễ làm chạy lại; quy tắc Firestore giữ trạng thái cuối.");
