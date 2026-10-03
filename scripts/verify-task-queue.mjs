import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "app.js"), "utf8");

function sourceOf(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Thiếu hàm ${name}`);
  const opening = app.indexOf("{", start);
  let depth = 0;
  for (let index = opening; index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    if (app[index] === "}") depth -= 1;
    if (!depth) return app.slice(start, index + 1);
  }
  throw new Error(`Hàm ${name} chưa đóng ngoặc`);
}

const now = Date.now();
const state = { tasks: [] };
const context = vm.createContext({
  state, Date,
  timestampToDate: (value) => value ? new Date(value) : null,
  isShipTask: () => false,
  formatDateTime: (value) => String(value),
  formatCountdown: () => "",
  console
});
vm.runInContext([
  "isTaskBlockingQueue", "compareTaskQueueOrder", "getBlockingQueuePredecessor",
  "getQueuePredecessorsByTaskId",
  "getTaskQueueEndMs", "getDisplayStatus", "getInitialCountdownText"
].map(sourceOf).join("\n"), context);

const first = {
  id: "CV1", assignedToUid: "AI", status: "doing", rowIndex: 0,
  queueStartAt: now - 10 * 60000, dispatchedAt: now - 10 * 60000,
  deadlineAt: now - 60000, deadlineMinutes: 9
};
const second = {
  id: "CV2", assignedToUid: "AI", status: "doing", rowIndex: 1,
  queueStartAt: now - 60000, dispatchedAt: now - 10 * 60000,
  deadlineAt: now + 4 * 60000, deadlineMinutes: 5
};
state.tasks = [first, second];
assert.equal(vm.runInContext("getDisplayStatus(state.tasks[1])", context), "queued");
assert.equal(vm.runInContext("getQueuePredecessorsByTaskId().get('CV2')?.id", context), "CV1");
assert.equal(vm.runInContext("getInitialCountdownText(state.tasks[1])", context), "Chờ công việc trước hoàn thành");
assert.equal(vm.runInContext("getTaskQueueEndMs(state.tasks[0])", context), first.deadlineAt);

first.deadlineAt = now + 5 * 60000;
first.deadlineMinutes = 15;
assert.equal(vm.runInContext("getTaskQueueEndMs(state.tasks[0])", context), first.deadlineAt,
  "Việc tiếp theo phải dựa trên hạn đã thêm giờ, không phải hạn cũ");

first.status = "submitted";
assert.notEqual(vm.runInContext("getDisplayStatus(state.tasks[1])", context), "queued");
console.log("Client task queue: predecessor blocks after planned start; extension deadline respected OK");
