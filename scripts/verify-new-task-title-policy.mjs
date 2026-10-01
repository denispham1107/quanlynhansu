import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "app.js"), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Không tìm thấy ${name}.`);
  const bodyStart = source.indexOf(") {", start) + 2;
  if (bodyStart < start + 2) throw new Error(`Không tìm thấy thân hàm ${name}.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Không đọc được ${name}.`);
}

const harness = new Function(`
  const state = {
    workTemplates: [{ id: "template-1", name: "Dọn phòng", deadlineMinutes: 45 }],
    employees: [], taskModalMode: "create"
  };
  const taskRowWorkPhotos = new Map();
  let activeRow = null;
  const $$ = () => [activeRow];
  const normalizeHotelPetCount = () => 0;
  const validateLunchBreakRowsForDispatch = () => null;
  const validateLunchBreakBasicRows = () => null;
  ${extractFunction("normalizeSearchText")}
  ${extractFunction("findWorkTemplateByName")}
  ${extractFunction("taskRowHasSelectedType")}
  ${extractFunction("isLegacyUntypedTaskTitle")}
  ${extractFunction("legacyCustomShipDuration")}
  ${extractFunction("syncTaskRowTitleRestriction")}
  ${extractFunction("applyWorkTemplateToRow")}
  ${extractFunction("setTaskDurationInputsLocked")}
  ${extractFunction("syncWorkTemplateDurationLock")}
  ${extractFunction("setHotelDurationInputsLocked")}
  ${extractFunction("readTaskRowsData")}
  ${extractFunction("validateTaskRowTitlePolicies")}
  ${extractFunction("validateTaskRows")}
  ${extractFunction("validateTaskRowsForDraft")}
  return {
    setRow: (row) => { activeRow = row; },
    syncWorkTemplateDurationLock, setHotelDurationInputsLocked,
    readTaskRowsData, validateTaskRows, validateTaskRowsForDraft
  };
`)();

function makeControl(value = "") {
  const classes = new Set(["hidden"]);
  const attributes = new Map();
  return {
    value, checked: false, readOnly: false, dataset: {}, title: "",
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name); }
  };
}

function makeRow(title, { ship = false, legacyTitle = "" } = {}) {
  const controls = new Map([
    [".row-title", makeControl(title)],
    [".row-description", makeControl("")],
    [".row-date", makeControl("2026-10-01")],
    [".row-assignee", makeControl("")],
    [".row-lunch-break", makeControl()],
    [".row-hotel", makeControl()],
    [".row-ship", makeControl()],
    [".row-cleaning", makeControl()],
    [".row-hours", makeControl(2)],
    [".row-minutes", makeControl(30)],
    [".task-template-title-note", makeControl()]
  ]);
  controls.get(".row-ship").checked = ship;
  const classes = new Set();
  return {
    dataset: { rowId: "row-1", ...(legacyTitle ? { legacyUntypedTitle: legacyTitle } : {}) },
    querySelector(selector) { return controls.get(selector) || null; },
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); }
    }
  };
}

const customUntyped = makeRow("Tên nhập tay");
harness.setRow(customUntyped);
harness.syncWorkTemplateDurationLock(customUntyped);
assert.equal(customUntyped.querySelector(".row-title").getAttribute("aria-invalid"), "true");
assert.equal(customUntyped.querySelector(".task-template-title-note").classList.contains("hidden"), false);
assert.match(harness.validateTaskRows(harness.readTaskRowsData()), /chọn tên có trong Danh sách công việc/);
assert.match(harness.validateTaskRowsForDraft(harness.readTaskRowsData()), /chọn tên có trong Danh sách công việc/);

const emptyDraft = makeRow("");
harness.setRow(emptyDraft);
assert.equal(harness.validateTaskRowsForDraft(harness.readTaskRowsData()), null);

const typedCleaning = makeRow("Tên vệ sinh riêng");
typedCleaning.querySelector(".row-cleaning").checked = true;
harness.setRow(typedCleaning);
assert.equal(harness.validateTaskRows(harness.readTaskRowsData()), null);

const templateUntyped = makeRow("dọn PHÒNG");
harness.setRow(templateUntyped);
harness.syncWorkTemplateDurationLock(templateUntyped);
assert.equal(templateUntyped.querySelector(".row-title").getAttribute("aria-invalid"), "false");
assert.equal(templateUntyped.querySelector(".row-title").value, "Dọn phòng");
assert.equal(templateUntyped.querySelector(".row-hours").readOnly, true);
assert.equal(harness.readTaskRowsData()[0].deadlineMinutes, 45);
assert.equal(harness.validateTaskRows(harness.readTaskRowsData()), null);

const customShip = makeRow("Giao hàng khác", { ship: true });
harness.setRow(customShip);
harness.syncWorkTemplateDurationLock(customShip);
assert.equal(customShip.classList.contains("is-custom-ship-duration-locked"), true);
assert.equal(customShip.querySelector(".row-hours").value, 0);
assert.equal(customShip.querySelector(".row-minutes").value, 5);
assert.equal(customShip.querySelector(".row-hours").readOnly, true);
assert.equal(customShip.querySelector(".row-minutes").readOnly, true);
harness.setHotelDurationInputsLocked(customShip, false);
assert.equal(customShip.querySelector(".row-hours").readOnly, true);
assert.equal(customShip.querySelector(".row-minutes").readOnly, true);
customShip.querySelector(".row-hours").value = 2;
customShip.querySelector(".row-minutes").value = 59;
assert.equal(harness.readTaskRowsData()[0].deadlineMinutes, 5);
assert.equal(harness.validateTaskRows(harness.readTaskRowsData()), null);

const templateShip = makeRow("Dọn phòng", { ship: true });
harness.setRow(templateShip);
harness.syncWorkTemplateDurationLock(templateShip);
assert.equal(templateShip.classList.contains("is-custom-ship-duration-locked"), false);
assert.equal(templateShip.classList.contains("is-template-duration-locked"), true);
assert.equal(harness.readTaskRowsData()[0].deadlineMinutes, 45);

const legacyShip = makeRow("Ship cũ", { ship: true });
legacyShip.dataset.legacyCustomShipTitle = "Ship cũ";
legacyShip.dataset.legacyCustomShipDeadlineMinutes = "30";
harness.setRow(legacyShip);
harness.syncWorkTemplateDurationLock(legacyShip);
assert.equal(legacyShip.classList.contains("is-legacy-custom-ship-duration-locked"), true);
assert.equal(harness.readTaskRowsData()[0].deadlineMinutes, 30);
assert.equal(harness.validateTaskRows(harness.readTaskRowsData()), null);
legacyShip.querySelector(".row-title").value = "Ship mới";
harness.syncWorkTemplateDurationLock(legacyShip);
assert.equal(legacyShip.classList.contains("is-legacy-custom-ship-duration-locked"), false);
assert.equal(harness.readTaskRowsData()[0].deadlineMinutes, 5);

const legacyUntyped = makeRow("Công việc cũ", { legacyTitle: "Công việc cũ" });
harness.setRow(legacyUntyped);
assert.equal(harness.validateTaskRows(harness.readTaskRowsData()), null);
legacyUntyped.querySelector(".row-title").value = "Tên mới nhập tay";
assert.match(harness.validateTaskRows(harness.readTaskRowsData()), /chọn tên có trong Danh sách công việc/);

console.log("PASS | Tên không chọn loại phải thuộc Danh sách công việc; Ship nhập tay khóa ở 5 phút, tên cũ không bị hỏng.");
