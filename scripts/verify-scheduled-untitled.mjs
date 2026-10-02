import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const server = readFileSync(join(root, "functions", "index.js"), "utf8");

const normalizeStart = server.indexOf("function normalizeScheduledWorkOrderRows(");
const normalizeEnd = server.indexOf("function scheduledWorkOrderRowForClient(", normalizeStart);
assert.ok(normalizeStart >= 0 && normalizeEnd > normalizeStart);
const normalizeSource = server.slice(normalizeStart, normalizeEnd);
const normalize = new Function(`
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const normalizeScheduledWorkPhoto = (photo) => photo;
  ${normalizeSource}
  return normalizeScheduledWorkOrderRows;
`)();

const rows = normalize([{ title: "  ", taskDate: "2026-10-02", deadlineMinutes: 30 }]);
assert.equal(rows.length, 1);
assert.equal(rows[0].title, "");
assert.throws(() => normalize([{ title: "", taskDate: "", deadlineMinutes: 30 }]), /ngày giao việc/);
assert.throws(() => normalize([{ title: "", taskDate: "2026-10-02", deadlineMinutes: 0 }]), /thời gian quy định/);

assert.match(app, /validateTaskRows\(rows, \{ allowUntitled: true \}\)/);
assert.match(app, /input\.required = !scheduleMode/);
assert.match(app, /task\.title\) \|\| "Chưa cho công việc"/);
assert.match(server, /title: String\(row\.title \|\| ""\),\s*description: String\(row\.description/);
assert.match(server, /if \(!String\(freshTask\.title \|\| ""\)\.trim\(\)\)/);

console.log("PASS | Lịch chấp nhận tên công việc trống; Phiếu hiển thị đúng và không giao việc thiếu tên.");
