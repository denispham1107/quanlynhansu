import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");
const guidance = readFileSync(join(root, "AGENTS.md"), "utf8");
const start = app.indexOf("function normalize24HourTimeValue(value) {");
const end = app.indexOf("\nfunction resetScheduledWorkOrderTimeValidity()", start);
assert.ok(start >= 0 && end > start, "Thiếu bộ chuẩn hóa giờ 24 tiếng");
const context = vm.createContext({});
vm.runInContext(app.slice(start, end), context);

for (const [input, expected] of [
  ["00:00:00", "00:00:00"],
  ["23:59:59", "23:59:59"],
  ["9:07", "09:07:00"],
  ["220730", "22:07:30"],
  ["1405", "14:05:00"],
  ["24:00:00", ""],
  ["23:60:00", ""],
  ["23:59:60", ""],
  ["10:07:53 CH", ""],
  ["", ""]
]) {
  assert.equal(context.normalize24HourTimeValue(input), expected, `Sai khi nhập ${input}`);
}

assert.match(html, /id="scheduledWorkOrderTime" type="text"[^>]*placeholder="HH:mm:ss"/);
assert.doesNotMatch(html, /id="scheduledWorkOrderTime" type="time"/);
assert.match(html, /class="scheduled-time-icon"/);
assert.match(app, /const timeValue = normalize24HourTimeValue\(rawTimeValue\)/);
assert.match(app, /if \(els\.scheduledWorkOrderTime\) els\.scheduledWorkOrderTime\.value = scheduledInputs\.time/);
assert.match(guidance, /Mọi ô nhập thời gian mới hoặc được chỉnh sửa phải hiển thị và nhận theo khung giờ 24 giờ/);

console.log("PASS | Lên lịch luôn dùng HH:mm:ss 24 giờ, chuẩn hóa lúc nhập và từ chối giờ ngoài 00–23.");
