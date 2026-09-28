import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const appSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "app.js"), "utf8");

function sourceOf(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Không tìm thấy ${name}`);
  const opening = appSource.indexOf("{", start);
  let depth = 0;
  for (let index = opening; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Hàm ${name} không đóng ngoặc.`);
}

const fixedNow = new Date(2026, 8, 29, 12, 0, 0);
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const state = {
  imageGalleryDateFilter: { mode: "today", single: "", from: "", to: "" },
  imageGalleryUploaderFilter: "uid:ngoc",
  imageGalleryWorkOrderFilter: "làm hotel"
};
const context = vm.createContext({
  state,
  todayInputValue: () => dateKey(fixedNow),
  yesterdayInputValue: () => dateKey(new Date(2026, 8, 28)),
  getMonthDateRange: (offset) => ({
    from: dateKey(new Date(2026, 8 + offset, 1)),
    to: dateKey(new Date(2026, 8 + offset + 1, 0))
  })
});
vm.runInContext([
  sourceOf("isImageGalleryEntryInDateFilter"),
  sourceOf("isImageGalleryEntryInCombinedFilter")
].join("\n"), context);
const matches = vm.runInContext("isImageGalleryEntryInCombinedFilter", context);
const photo = (date, uploader = "uid:ngoc", workOrder = "làm hotel") => ({
  dateKey: date, uploaderKey: uploader, workOrderKey: workOrder
});

assert.equal(matches(photo("2026-09-29")), true);
assert.equal(matches(photo("2026-09-28")), false);
assert.equal(matches(photo("2026-09-29", "uid:meo")), false);
assert.equal(matches(photo("2026-09-29", "uid:ngoc", "spa hotel")), false);

state.imageGalleryDateFilter.mode = "current_month";
assert.equal(matches(photo("2026-09-01")), true);
assert.equal(matches(photo("2026-10-01")), false);
state.imageGalleryDateFilter.mode = "previous_month";
assert.equal(matches(photo("2026-08-31")), true);
assert.equal(matches(photo("2026-09-01")), false);

state.imageGalleryDateFilter = { mode: "single", single: "2026-09-20", from: "", to: "" };
assert.equal(matches(photo("2026-09-20")), true);
assert.equal(matches(photo("2026-09-21")), false);
state.imageGalleryDateFilter = { mode: "range", single: "", from: "2026-09-20", to: "2026-09-25" };
assert.equal(matches(photo("2026-09-24")), true);
assert.equal(matches(photo("2026-09-26")), false);
assert.equal(matches(photo("2026-09-24", "uid:meo")), false);

console.log("PASS | Thời gian, Người đăng và Phiếu công việc lọc đồng thời; Tháng này/Tháng trước đúng biên tháng.");
