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

console.log("PASS | Trang Lên lịch ẩn dashboard, Xem lịch quay lại trang và Quay lại khôi phục vị trí dashboard.");
