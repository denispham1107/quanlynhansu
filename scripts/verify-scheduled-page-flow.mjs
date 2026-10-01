import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appSource = readFileSync(resolve(projectRoot, "app.js"), "utf8");

function extractFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Không tìm thấy ${name}.`);
  const bodyStart = appSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") depth -= 1;
    if (depth === 0) return appSource.slice(start, index + 1);
  }
  throw new Error(`Không đọc được ${name}.`);
}

function element() {
  const classes = new Set();
  return {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name)
    }
  };
}

const state = {
  employeeGroups: [{ id: "group-1" }],
  taskModalMode: "create",
  editingScheduledWorkOrderId: "",
  scheduledListReturnToTaskModal: false,
  schedulePageReturnScrollY: 0,
  schedulePageScrollY: 0
};
const els = {
  taskModal: element(),
  scheduledWorkOrderListModal: element(),
  adminView: element(),
  workTemplateView: element(),
  employeeManagerView: element(),
  photoReportView: element(),
  imageGalleryView: element()
};
els.taskModal.classList.add("hidden");
els.scheduledWorkOrderListModal.classList.add("hidden");
const document = { body: element() };
const window = {
  scrollY: 180,
  scrollTo: ({ top }) => { window.scrollY = top; }
};

const navigate = new Function("state", "els", "document", "window", `
  const isAdminProfile = () => true;
  const toast = () => { throw new Error("Không được báo lỗi trong luồng hợp lệ."); };
  const resetScheduledWorkOrderFormForCreate = () => { state.taskModalMode = "schedule"; };
  const setTaskModalMode = (mode) => { state.taskModalMode = mode; };
  const setMobileTaskPanelMenuOpen = () => {};
  const renderScheduledWorkOrderList = () => {};
  const closeScheduledTimePicker = () => {};
  ${extractFunction("openScheduledWorkOrderModal")}
  ${extractFunction("closeTaskModal")}
  ${extractFunction("returnToScheduledWorkOrderModal")}
  ${extractFunction("returnToScheduledWorkOrderListFromEditor")}
  return { openScheduledWorkOrderModal, closeTaskModal, returnToScheduledWorkOrderModal, returnToScheduledWorkOrderListFromEditor };
`)(state, els, document, window);

navigate.openScheduledWorkOrderModal();
assert.equal(els.adminView.classList.contains("hidden"), true);
assert.equal(els.taskModal.classList.contains("hidden"), false);
assert.equal(document.body.classList.contains("schedule-page-open"), true);
assert.equal(state.schedulePageReturnScrollY, 180);
assert.equal(window.scrollY, 0);

state.schedulePageScrollY = 320;
state.scheduledListReturnToTaskModal = true;
els.taskModal.classList.add("hidden");
els.scheduledWorkOrderListModal.classList.remove("hidden");
navigate.returnToScheduledWorkOrderModal();
assert.equal(els.scheduledWorkOrderListModal.classList.contains("hidden"), true);
assert.equal(els.taskModal.classList.contains("hidden"), false);
assert.equal(window.scrollY, 320);

navigate.closeTaskModal();
assert.equal(els.taskModal.classList.contains("hidden"), true);
assert.equal(els.adminView.classList.contains("hidden"), false);
assert.equal(document.body.classList.contains("schedule-page-open"), false);
assert.equal(window.scrollY, 180);

els.scheduledWorkOrderListModal.classList.remove("hidden");
document.body.classList.add("schedule-page-open");
window.scrollY = 40;
state.scheduledListReturnToTaskModal = false;
navigate.returnToScheduledWorkOrderModal();
assert.equal(els.scheduledWorkOrderListModal.classList.contains("hidden"), true);
assert.equal(document.body.classList.contains("schedule-page-open"), false);
assert.equal(window.scrollY, 180);

const editorState = {
  taskModalMode: "schedule",
  editingScheduledWorkOrderId: "schedule-1",
  scheduledEditorReturnToDashboard: false,
  scheduledEditorListScrollTop: 420
};
const editorContent = { scrollTop: 0, getBoundingClientRect: () => ({ top: 100, bottom: 600 }) };
const editorRow = element();
editorRow.dataset = { scheduledListItemId: "schedule-1" };
editorRow.getBoundingClientRect = () => ({ top: 260, bottom: 320 });
editorRow.hasAttribute = () => false;
editorRow.focus = () => { editorRow.focused = true; };
const editorEls = {
  taskModal: element(),
  scheduledWorkOrderListModal: element(),
  scheduledWorkOrderList: { querySelectorAll: () => [editorRow] },
  adminView: element()
};
editorEls.scheduledWorkOrderListModal.classList.add("hidden");
editorEls.scheduledWorkOrderListModal.querySelector = () => editorContent;
editorEls.adminView.classList.add("hidden");
const editorCalls = [];
const editorNavigation = new Function("state", "els", "calls", `
  const closeTaskModal = () => {
    calls.push("close-editor");
    els.taskModal.classList.add("hidden");
    els.adminView.classList.remove("hidden");
    state.editingScheduledWorkOrderId = "";
    state.taskModalMode = "create";
  };
  const openScheduledWorkOrderListModal = (options) => {
    calls.push(["open-list", options, els.taskModal.classList.contains("hidden")]);
    els.scheduledWorkOrderListModal.classList.remove("hidden");
  };
  const resetScheduledWorkOrderFormForCreate = () => {
    state.taskModalMode = "schedule";
    state.scheduledEditorReturnToDashboard = false;
    state.scheduledEditorListScrollTop = 0;
  };
  const renderScheduledWorkOrderList = () => calls.push("render-list");
  const syncScheduledWorkOrderListBackButtons = () => calls.push([
    "sync-back-label",
    els.taskModal.classList.contains("hidden"),
    els.scheduledWorkOrderListModal.classList.contains("hidden")
  ]);
  const requestAnimationFrame = (callback) => callback();
  const setTimeout = () => 1;
  const showScheduledWorkOrderInList = (scheduleId) => calls.push(["fallback-focus", scheduleId]);
  ${extractFunction("returnToScheduledWorkOrderListFromEditor")}
  return { returnToScheduledWorkOrderListFromEditor };
`)(editorState, editorEls, editorCalls);

editorNavigation.returnToScheduledWorkOrderListFromEditor();
assert.equal(editorEls.taskModal.classList.contains("hidden"), true);
assert.equal(editorEls.scheduledWorkOrderListModal.classList.contains("hidden"), false);
assert.equal(editorContent.scrollTop, 420);
assert.equal(editorRow.focused, true);
assert.equal(editorRow.classList.contains("is-jump-target"), true);
assert.deepEqual(editorCalls, [["sync-back-label", true, false], "render-list"]);

editorCalls.length = 0;
editorState.editingScheduledWorkOrderId = "schedule-2";
editorState.scheduledEditorReturnToDashboard = true;
editorEls.taskModal.classList.remove("hidden");
editorEls.scheduledWorkOrderListModal.classList.add("hidden");
editorEls.adminView.classList.add("hidden");
editorNavigation.returnToScheduledWorkOrderListFromEditor();
assert.deepEqual(editorCalls, ["close-editor", ["open-list", { focusScheduleId: "schedule-2" }, true]]);
assert.equal(editorEls.scheduledWorkOrderListModal.classList.contains("hidden"), false);
assert.equal(editorEls.adminView.classList.contains("hidden"), false);

assert.match(appSource, /if \(state\.taskModalMode === "schedule" && state\.editingScheduledWorkOrderId\) \{\s*returnToScheduledWorkOrderListFromEditor\(\);/);
assert.match(appSource, /els\.viewScheduledWorkOrdersBtn\?\.addEventListener\("click", \(\) => \{\s*if \(state\.editingScheduledWorkOrderId\) \{\s*returnToScheduledWorkOrderListFromEditor\(\);/);
assert.match(appSource, /state\.scheduledEditorListScrollTop = returnToDashboard/);
assert.match(appSource, /state\.scheduledListReturnToTaskModal \? "Quay lại Lên lịch" : "Quay lại trang quản lý"/);

const backLabelState = { scheduledListReturnToTaskModal: false };
const headerBack = { classList: { contains: (name) => name === "icon-btn" }, setAttribute(name, value) { this[name] = value; } };
const footerBack = { classList: { contains: () => false }, setAttribute(name, value) { this[name] = value; } };
const syncBackButtons = new Function("state", "els", `
  ${extractFunction("syncScheduledWorkOrderListBackButtons")}
  return syncScheduledWorkOrderListBackButtons;
`)(backLabelState, { scheduledWorkOrderListModal: { querySelectorAll: () => [headerBack, footerBack] } });
syncBackButtons();
assert.equal(headerBack["aria-label"], "Quay lại trang quản lý");
assert.equal(footerBack.textContent, "← Quay lại trang quản lý");
backLabelState.scheduledListReturnToTaskModal = true;
syncBackButtons();
assert.equal(headerBack["aria-label"], "Quay lại Lên lịch");
assert.equal(footerBack.textContent, "← Quay lại Lên lịch");

console.log("PASS | Quay lại từ cả hai lối chỉnh sửa đều mở danh sách và khôi phục đúng lịch/vị trí.");
