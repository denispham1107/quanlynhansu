import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { subscribeProgressively, createSyncRecovery } from "../startup-sync.mjs";

function clock() {
  let id = 0;
  const timers = new Map();
  return {
    timers,
    setTimer(callback) { timers.set(++id, callback); return id; },
    clearTimer(key) { timers.delete(key); },
    tick() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); }
  };
}
const doc = (id, status = "doing") => ({ id, data: () => ({ status, approvedAt: status === "completed" ? 1 : null }) });
const snapshot = (docs, fromCache = false) => ({ docs, metadata: { fromCache, hasPendingWrites: false }, docChanges: () => [] });
const subscriptions = new Map();
const updates = [];
const timers = clock();
const stop = subscribeProgressively({
  listen(ref, options, next, error) { subscriptions.set(ref, { next, error }); return () => subscriptions.delete(ref); },
  primaryQueries: ["active", "today"], fullQuery: "history",
  next: (value) => updates.push(value), error: (error) => { throw error; }, ...timers
});
assert.deepEqual([...subscriptions.keys()], ["active", "today"]);
subscriptions.get("today").next(snapshot([doc("done", "completed")], true));
subscriptions.get("active").next(snapshot([doc("active")], true));
assert.equal(updates.at(-1).metadata.startupReady, true, "Dữ liệu lưu trên thiết bị mở được màn hình ngay");
assert.equal(timers.timers.size, 0, "Không tải lịch sử lớn khi kết nối chính chưa xong");
subscriptions.get("active").next(snapshot([doc("active")]));
subscriptions.get("today").next(snapshot([doc("done", "completed")]));
assert.equal(updates.at(-1).metadata.fromCache, false);
assert.equal(updates.at(-1).metadata.partial, true, "Chưa được dọn dữ liệu Hotel dựa vào danh sách nhỏ");
timers.tick();
assert.ok(subscriptions.has("history"));
subscriptions.get("history").next(snapshot([doc("done", "doing"), doc("older")], true));
assert.equal(updates.at(-1).docs.find((item) => item.id === "done").data().status, "completed", "Cache lịch sử không làm Phiếu đã duyệt chạy lại");
subscriptions.get("today").next(snapshot([doc("done", "completed"), doc("active", "submitted")]));
subscriptions.get("active").next(snapshot([doc("active", "doing")]));
assert.equal(updates.at(-1).docs.find((item) => item.id === "active").data().status, "submitted");
subscriptions.get("history").next(snapshot([doc("done", "completed"), doc("older")]));
assert.deepEqual([...subscriptions.keys()], ["history"]);
assert.deepEqual(updates.at(-1).docs.map((item) => item.id), ["done", "older"], "Snapshot đầy đủ xử lý cả Phiếu đã xóa");
stop();
assert.equal(subscriptions.size, 0);

const emptyTimers = clock();
const emptySubs = new Map();
const emptyUpdates = [];
const stopEmpty = subscribeProgressively({
  listen(ref, _options, next) { emptySubs.set(ref, next); return () => emptySubs.delete(ref); },
  primaryQueries: ["today"], fullQuery: "history", next: (value) => emptyUpdates.push(value), error() {}, ...emptyTimers
});
emptySubs.get("today")(snapshot([], true));
assert.equal(emptyUpdates.at(-1).metadata.startupReady, false, "Cache rỗng chưa chứng minh không có việc");
emptySubs.get("today")(snapshot([]));
assert.equal(emptyUpdates.at(-1).metadata.startupReady, true);
stopEmpty(); emptyTimers.tick();
assert.equal(emptySubs.size, 0, "Đăng xuất không được tạo listener trễ của tài khoản cũ");

const recoveryTimers = clock();
let reconnects = 0;
let online = true;
const messages = [];
const recovery = createSyncRecovery({ required: ["users", "tasks"],
  reconnect: async () => { reconnects += 1; }, notify: (value) => messages.push(value),
  online: () => online, ...recoveryTimers
});
recovery.received("users", { fromCache: false });
recovery.received("tasks", { fromCache: true });
recoveryTimers.tick(); await recovery.retry();
assert.equal(reconnects, 1, "Tự phục hồi khi chỉ có cache và stream máy chủ treo");
recovery.received("tasks", { fromCache: false });
assert.equal(recoveryTimers.timers.size, 0);
assert.equal(messages.at(-1), "ready");
online = false; recovery.resume(); recoveryTimers.tick();
assert.equal(reconnects, 1, "Không lặp kết nối khi mất mạng");
online = true; recovery.resume(); await recovery.retry();
assert.equal(reconnects, 2, "Khôi phục kết nối khi quay lại app");
recovery.stop(); recoveryTimers.tick(); await recovery.retry();
assert.equal(reconnects, 2);

const failedTimers = clock();
let failedAttempts = 0;
const failedRecovery = createSyncRecovery({ required: ["tasks"], reconnect: async () => { failedAttempts += 1; throw new Error("network"); }, notify() {}, ...failedTimers });
for (let index = 0; index < 3; index++) { failedTimers.tick(); await new Promise(setImmediate); }
assert.equal(failedAttempts, 2, "Tự phục hồi có giới hạn, không tạo vòng kết nối vô hạn");
failedRecovery.stop();

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
function functionBody(name) {
  const start = source.indexOf(`async function ${name}(`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}") depth--;
    if (!depth) return source.slice(start, index + 1);
  }
  throw new Error(`Không đọc được ${name}`);
}
const notices = [];
const deletionContext = vm.createContext({state: {adminTaskServerReady:false,adminWorkOrdersServerReady:false},
  requirePermission: () => true, isWorkOrderDeletionLocked: () => false, toast: (message) => notices.push(message)});
vm.runInContext(`${functionBody("deleteWorkOrder")}\n${functionBody("deleteAllWorkOrders")}`, deletionContext);
await deletionContext.deleteWorkOrder("ticket", {});
await deletionContext.deleteAllWorkOrders({});
assert.equal(notices.length, 2, "Không xóa Phiếu/toàn bộ bằng một danh sách mới tải một phần");
console.log("PASS | Mở nhanh từ cache/truy vấn nhỏ, lịch sử chuyển tiếp đủ dữ liệu, Phiếu duyệt giữ trạng thái; kết nối treo tự phục hồi và không rò listener sau đăng xuất.");
