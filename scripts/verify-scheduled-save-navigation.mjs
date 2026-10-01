import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(resolve(root, "app.js"), "utf8");

function extractFunction(name) {
  const signature = `function ${name}(`;
  const start = app.indexOf(signature);
  if (start < 0) throw new Error(`Không tìm thấy ${name}.`);
  const parametersStart = app.indexOf("(", start);
  let parentheses = 0;
  let bodyStart = -1;
  for (let index = parametersStart; index < app.length; index += 1) {
    if (app[index] === "(") parentheses += 1;
    if (app[index] === ")") parentheses -= 1;
    if (parentheses === 0) {
      bodyStart = app.indexOf("{", index);
      break;
    }
  }
  if (bodyStart < 0) throw new Error(`Không tìm thấy thân hàm ${name}.`);
  let depth = 0;
  for (let index = bodyStart; index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    if (app[index] === "}") depth -= 1;
    if (depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`Không đọc được ${name}.`);
}

const save = extractFunction("createScheduledWorkOrder");
const openList = extractFunction("openScheduledWorkOrderListModal");
const focus = extractFunction("showScheduledWorkOrderInList");

assert.match(save, /await openScheduledWorkOrderListModal\(\{ focusScheduleId: savedSchedule\.id \}\)/);
assert.match(save, /const createdScheduleId = String\(result\?\.data\?\.scheduleId \|\| ""\)\.trim\(\)/);
assert.match(save, /await openScheduledWorkOrderListModal\(\{ focusScheduleId: createdScheduleId \}\)/);
assert.ok(save.indexOf("resetScheduledWorkOrderFormForCreate();") < save.indexOf("focusScheduleId: createdScheduleId"));
assert.doesNotMatch(save, /closeTaskModal\(\);[\s\S]{0,300}Đã lên lịch Phiếu/);

assert.match(openList, /function openScheduledWorkOrderListModal\(\{ focusScheduleId = "", focusMissingMessage = "" \} = \{\}\)/);
assert.match(openList, /state\.scheduledWorkOrders = Array\.isArray\(result\?\.data\?\.schedules\)/);
assert.match(openList, /if \(focusScheduleId\) \{\s*showScheduledWorkOrderInList\(focusScheduleId/);
assert.ok(openList.indexOf("state.scheduledWorkOrders =") < openList.indexOf("showScheduledWorkOrderInList(focusScheduleId"));

assert.match(focus, /state\.scheduledWorkOrderStatusFilter = target\.editDeletePolicy === "locked" \? "locked" : "all"/);
assert.match(focus, /state\.scheduledWorkOrderTimeFilter = "date"/);
assert.match(focus, /state\.scheduledWorkOrderDateFilter = targetDate/);
assert.match(focus, /row\.classList\.add\("is-jump-target"\)/);

console.log("PASS | Tạo mới và chỉnh sửa lịch đều mở danh sách, lọc đúng ngày và làm nổi bật lịch vừa lưu.");
