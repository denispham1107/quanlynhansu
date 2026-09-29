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
const end = app.indexOf("\nconst scheduledTimePickerParts", start);
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
assert.match(html, /id="scheduledWorkOrderTimePickerBtn"[^>]*aria-expanded="false"/);
assert.match(html, /id="scheduledWorkOrderTimePicker"[^>]*role="group"/);
assert.match(app, /const timeValue = normalize24HourTimeValue\(rawTimeValue\)/);
assert.match(app, /if \(els\.scheduledWorkOrderTime\) els\.scheduledWorkOrderTime\.value = scheduledInputs\.time/);
assert.match(guidance, /Mọi ô nhập thời gian mới hoặc được chỉnh sửa phải hiển thị và nhận theo khung giờ 24 giờ/);
assert.match(guidance, /phải giữ cả khả năng bấm chọn lẫn nhập thủ công/);

function fakeElement() {
  const classes = new Set();
  const listeners = new Map();
  const attributes = new Map();
  return {
    value: "", innerHTML: "", textContent: "", listeners, attributes,
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) },
    addEventListener: (name, callback) => listeners.set(name, callback),
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    setCustomValidity() {}, focus() {}, dispatchEvent() {}
  };
}
const input = fakeElement();
input.value = "10:07:53";
const picker = fakeElement();
picker.classList.add("hidden");
const toggle = fakeElement();
const parts = fakeElement();
const values = fakeElement();
const preview = fakeElement();
const apply = fakeElement();
const cancel = fakeElement();
const pickerEls = {
  scheduledWorkOrderTime: input,
  scheduledWorkOrderTimeField: { contains: () => false },
  scheduledWorkOrderTimePickerBtn: toggle,
  scheduledWorkOrderTimePicker: picker,
  scheduledWorkOrderTimePickerParts: parts,
  scheduledWorkOrderTimePickerValues: values,
  scheduledWorkOrderTimePickerPreview: preview,
  scheduledWorkOrderTimePickerApply: apply,
  scheduledWorkOrderTimePickerCancel: cancel
};
const pickerStart = app.indexOf("function localDateTimeInputValues(date = new Date()) {");
const pickerEnd = app.indexOf("\nfunction normalizeScheduledCountdownMinutes", pickerStart);
const pickerContext = vm.createContext({ els: pickerEls, document: { addEventListener() {} }, Event, Date });
vm.runInContext(app.slice(pickerStart, pickerEnd), pickerContext);
toggle.listeners.get("click")();
assert.equal(picker.classList.contains("hidden"), false);
assert.equal(toggle.attributes.get("aria-expanded"), "true");
assert.equal((values.innerHTML.match(/data-time-value=/g) || []).length, 24);
const select = (value) => values.listeners.get("click")({ target: { closest: () => ({ dataset: { timeValue: String(value) } }) } });
select(23);
assert.equal((values.innerHTML.match(/data-time-value=/g) || []).length, 60);
select(45);
select(59);
assert.equal(preview.textContent, "23:45:59");
apply.listeners.get("click")();
assert.equal(input.value, "23:45:59");
assert.equal(picker.classList.contains("hidden"), true);
toggle.listeners.get("click")();
cancel.listeners.get("click")();
assert.equal(input.value, "23:45:59", "Đóng bộ chọn không thay đổi giờ đã nhập");
input.value = "21:08:06";
input.listeners.get("blur")();
assert.equal(input.value, "21:08:06", "Vẫn nhập tay và chỉnh giờ được");

console.log("PASS | Chọn giờ/phút/giây bằng nút hoặc nhập tay, luôn lưu HH:mm:ss 24 giờ.");
