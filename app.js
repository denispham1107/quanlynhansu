import { firebaseConfig } from "./firebase-config.js";
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// =========================
// Firebase init
// =========================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Secondary app dùng riêng để Admin tạo tài khoản nhân viên.
// Cách này giúp tài khoản Admin hiện tại không bị đăng xuất khi createUserWithEmailAndPassword.
let secondaryAuth = null;

function getSecondaryAuth() {
  if (secondaryAuth) return secondaryAuth;

  const name = "SecondaryAuthApp";

  const secondaryApp = getApps().some((item) => item.name === name)
    ? getApp(name)
    : initializeApp(firebaseConfig, name);

  secondaryAuth = getAuth(secondaryApp);
  return secondaryAuth;
}

// =========================
// App state
// =========================
const state = {
  user: null,
  profile: null,
  employees: [],
  tasks: [],
  workOrders: [],
  timeExtensionReasons: [],
  notifications: [],
  knownNotificationIds: new Set(),
  notificationsReady: false,
  unsubs: [],
  editingWorkOrderId: null,
  adminStatusFilter: "all",
  adminEmployeeFilter: "all",
  adminDateFilter: {
    mode: "today",
    single: "",
    from: "",
    to: ""
  },
  employeeDateFilter: {
    mode: "today",
    single: "",
    from: "",
    to: ""
  },
  extendTimeTaskId: null
};

// =========================
// DOM helpers
// =========================
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  loginView: $("#loginView"),
  appView: $("#appView"),
  adminView: $("#adminView"),
  employeeView: $("#employeeView"),
  currentUserText: $("#currentUserText"),
  loginForm: $("#loginForm"),
  logoutBtn: $("#logoutBtn"),
  createEmployeeForm: $("#createEmployeeForm"),
  employeeList: $("#employeeList"),
  openTaskModalBtn: $("#openTaskModalBtn"),
  taskModal: $("#taskModal"),
  createTaskForm: $("#createTaskForm"),
  workOrderName: $("#workOrderName"),
  addTaskRowBtn: $("#addTaskRowBtn"),
  taskRowsContainer: $("#taskRowsContainer"),
  saveDraftBtn: $("#saveDraftBtn"),
  deleteAllWorkOrdersBtn: $("#deleteAllWorkOrdersBtn"),
  adminEmployeeFilter: $("#adminEmployeeFilter"),
  adminStatusFilter: $("#adminStatusFilter"),
  adminDateMode: $("#adminDateMode"),
  adminSingleDate: $("#adminSingleDate"),
  adminDateFrom: $("#adminDateFrom"),
  adminDateTo: $("#adminDateTo"),
  adminClearDateFilter: $("#adminClearDateFilter"),
  adminDateSummary: $("#adminDateSummary"),
  adminTaskList: $("#adminTaskList"),
  employeeDateMode: $("#employeeDateMode"),
  employeeSingleDate: $("#employeeSingleDate"),
  employeeDateFrom: $("#employeeDateFrom"),
  employeeDateTo: $("#employeeDateTo"),
  employeeClearDateFilter: $("#employeeClearDateFilter"),
  employeeDateSummary: $("#employeeDateSummary"),
  employeeTaskList: $("#employeeTaskList"),
  statDoing: $("#statDoing"),
  statSubmitted: $("#statSubmitted"),
  statOverdue: $("#statOverdue"),
  statCompleted: $("#statCompleted"),
  enableNotificationsBtn: $("#enableNotificationsBtn"),
  notificationBellBtn: $("#notificationBellBtn"),
  notificationPanel: $("#notificationPanel"),
  notificationList: $("#notificationList"),
  notificationBadge: $("#notificationBadge"),
  markAllNotificationsReadBtn: $("#markAllNotificationsReadBtn"),
  extendTimeModal: $("#extendTimeModal"),
  extendTimeForm: $("#extendTimeForm"),
  extendTimeTaskTitle: $("#extendTimeTaskTitle"),
  extendMinutes: $("#extendMinutes"),
  extendReasonSelect: $("#extendReasonSelect"),
  newExtendReason: $("#newExtendReason"),
  addExtendReasonBtn: $("#addExtendReasonBtn"),
  extendReasonList: $("#extendReasonList"),
  confirmExtendTimeBtn: $("#confirmExtendTimeBtn")
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setButtonLoading(button, isLoading, textWhenLoading = "Đang xử lý...") {
  if (!button) return;

  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = textWhenLoading;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function toast(message, type = "info") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  $("#toastHost").appendChild(item);

  setTimeout(() => item.remove(), 4200);
}

function timestampToDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function formatDateTime(value) {
  const date = timestampToDate(value);
  if (!date) return "--";

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatDateOnly(value) {
  if (!value) return "--";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function toLocalDateInputValue(date) {
  if (!(date instanceof Date)) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayInputValue() {
  return toLocalDateInputValue(new Date());
}

function getTaskDateValue(task) {
  if (task.taskDate) return task.taskDate;
  return toLocalDateInputValue(timestampToDate(task.createdAt));
}

function formatMinutes(totalMinutes = 0) {
  const minutes = Number(totalMinutes) || 0;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (h && m) return `${h} giờ ${m} phút`;
  if (h) return `${h} giờ`;
  return `${m} phút`;
}

function formatCountdown(ms) {
  const abs = Math.abs(ms);
  const totalSeconds = Math.floor(abs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];

  if (days) parts.push(`${days} ngày`);
  if (hours || days) parts.push(`${hours} giờ`);

  parts.push(`${minutes} phút`);
  parts.push(`${seconds} giây`);

  return parts.join(" ");
}

function statusLabel(status) {
  const labels = {
    draft: "Chưa giao việc",
    waiting: "Chờ bắt đầu",
    doing: "Đang làm",
    near_due: "Gần hết giờ",
    overdue: "Quá hạn",
    submitted: "Chờ Admin xác nhận",
    completed: "Đã hoàn thành",
    redo: "Yêu cầu làm lại"
  };

  return labels[status] || status;
}

function isValidSequenceIndex(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0;
}

function getTaskScheduledStartDate(task) {
  return timestampToDate(task.scheduledStartAt)
    || timestampToDate(task.dispatchedAt)
    || timestampToDate(task.createdAt);
}

function getTaskDeadlineDate(task) {
  const savedDeadline = timestampToDate(task.deadlineAt);
  if (savedDeadline) return savedDeadline;

  const scheduledStart = getTaskScheduledStartDate(task);
  const deadlineMinutes = Number(task.deadlineMinutes || 0);

  if (!scheduledStart || deadlineMinutes <= 0) return null;

  return new Date(scheduledStart.getTime() + deadlineMinutes * 60 * 1000);
}

function hasTaskStarted(task, now = new Date()) {
  const scheduledStart = getTaskScheduledStartDate(task);
  return !scheduledStart || scheduledStart.getTime() <= now.getTime();
}

function compareTasksForSequentialSchedule(a, b) {
  const aSequence = isValidSequenceIndex(a.sequenceIndex) ? Number(a.sequenceIndex) : null;
  const bSequence = isValidSequenceIndex(b.sequenceIndex) ? Number(b.sequenceIndex) : null;

  if (aSequence !== null && bSequence !== null && aSequence !== bSequence) {
    return aSequence - bSequence;
  }

  if (aSequence !== null && bSequence === null) return -1;
  if (aSequence === null && bSequence !== null) return 1;

  const aCreated = timestampToDate(a.createdAt)?.getTime() || 0;
  const bCreated = timestampToDate(b.createdAt)?.getTime() || 0;

  if (aCreated !== bCreated) return aCreated - bCreated;

  return String(a.id || "").localeCompare(String(b.id || ""));
}

function compareTasksForDisplay(a, b) {
  const aStart = getTaskScheduledStartDate(a)?.getTime() || 0;
  const bStart = getTaskScheduledStartDate(b)?.getTime() || 0;

  if (aStart !== bStart) return aStart - bStart;

  const employeeCompare = String(a.assignedToName || "").localeCompare(String(b.assignedToName || ""), "vi");
  if (employeeCompare) return employeeCompare;

  return compareTasksForSequentialSchedule(a, b);
}

function getEmployeeScheduleBaseStart(tasks, fallbackStartDate = new Date()) {
  const candidates = tasks
    .map((task) => getTaskScheduledStartDate(task))
    .filter(Boolean)
    .map((date) => date.getTime());

  if (!candidates.length) return fallbackStartDate;

  return new Date(Math.min(...candidates));
}

function buildSequentialRowSchedule(rows, baseStartDate = new Date()) {
  const cursorByEmployee = new Map();
  const sequenceByEmployee = new Map();
  const plan = new Map();

  rows.forEach((row) => {
    const employeeKey = row.assignedToUid || "__unassigned__";
    const scheduledStartAt = cursorByEmployee.get(employeeKey) || baseStartDate;
    const sequenceIndex = sequenceByEmployee.get(employeeKey) || 0;
    const deadlineMinutes = Number(row.deadlineMinutes || 0);
    const deadlineAt = new Date(scheduledStartAt.getTime() + deadlineMinutes * 60 * 1000);

    plan.set(row.index, {
      scheduledStartAt,
      deadlineAt,
      sequenceIndex
    });

    cursorByEmployee.set(employeeKey, deadlineAt);
    sequenceByEmployee.set(employeeKey, sequenceIndex + 1);
  });

  return plan;
}

function buildSequentialTaskSchedule(tasks, baseStartDate = new Date(), options = {}) {
  const { forceBaseStart = false } = options;
  const plan = new Map();
  const groupsByEmployee = new Map();

  tasks.forEach((task) => {
    if (!task.assignedToUid) return;

    if (!groupsByEmployee.has(task.assignedToUid)) {
      groupsByEmployee.set(task.assignedToUid, []);
    }

    groupsByEmployee.get(task.assignedToUid).push(task);
  });

  groupsByEmployee.forEach((employeeTasks) => {
    const orderedTasks = employeeTasks.slice().sort(compareTasksForSequentialSchedule);
    let cursor = forceBaseStart
      ? baseStartDate
      : getEmployeeScheduleBaseStart(orderedTasks, baseStartDate);

    orderedTasks.forEach((task, sequenceIndex) => {
      const deadlineMinutes = Number(task.deadlineMinutes || 0);
      const scheduledStartAt = cursor;
      const deadlineAt = new Date(scheduledStartAt.getTime() + deadlineMinutes * 60 * 1000);

      plan.set(task.id, {
        scheduledStartAt,
        deadlineAt,
        sequenceIndex
      });

      cursor = deadlineAt;
    });
  });

  return plan;
}

function getFallbackSequenceIndex(task, taskList = state.tasks) {
  if (isValidSequenceIndex(task.sequenceIndex)) return Number(task.sequenceIndex);

  const relatedTasks = taskList
    .filter((item) =>
      (item.workOrderId || "legacy") === (task.workOrderId || "legacy") &&
      item.assignedToUid === task.assignedToUid &&
      item.status !== "draft"
    )
    .slice()
    .sort(compareTasksForSequentialSchedule);

  const index = relatedTasks.findIndex((item) => item.id === task.id);
  return index >= 0 ? index : 0;
}

function shouldUseWaitingStatus(task, now = new Date()) {
  if (["draft", "submitted", "completed"].includes(task.status)) return false;

  const scheduledStart = getTaskScheduledStartDate(task);
  return Boolean(scheduledStart && scheduledStart.getTime() > now.getTime());
}

function getDisplayStatus(task) {
  if (task.status === "draft") return "draft";
  if (task.status === "completed") return "completed";
  if (task.status === "submitted") return "submitted";

  const now = new Date();

  if (shouldUseWaitingStatus(task, now)) return "waiting";

  const deadline = getTaskDeadlineDate(task);
  if (!deadline) return task.status || "doing";

  const remainingMs = deadline.getTime() - now.getTime();

  if (remainingMs <= 0) return "overdue";

  if (task.status === "redo") return "redo";

  const totalMs = Math.max(1, Number(task.deadlineMinutes || 1) * 60 * 1000);
  const nearThreshold = Math.min(15 * 60 * 1000, totalMs * 0.2);

  if (remainingMs <= nearThreshold) return "near_due";

  return "doing";
}

function taskCardClass(displayStatus) {
  return {
    draft: "is-draft",
    waiting: "is-waiting",
    doing: "",
    near_due: "is-near-due",
    overdue: "is-overdue",
    submitted: "is-submitted",
    completed: "is-completed",
    redo: "is-redo"
  }[displayStatus] || "";
}

function initials(name = "NV") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "NV";
}

// =========================
// PWA + Browser notifications
// =========================
registerServiceWorker();
updateNotificationPermissionButton();

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("Không đăng ký được service worker:", error);
  });
}

function notificationSupported() {
  return "Notification" in window;
}

function updateNotificationPermissionButton() {
  const button = els.enableNotificationsBtn;
  if (!button) return;

  button.classList.remove("is-enabled", "is-blocked");

  if (!notificationSupported()) {
    button.textContent = "Trình duyệt không hỗ trợ thông báo";
    button.disabled = true;
    return;
  }

  if (Notification.permission === "granted") {
    button.textContent = "Đã bật thông báo";
    button.classList.add("is-enabled");
    button.disabled = false;
    return;
  }

  if (Notification.permission === "denied") {
    button.textContent = "Thông báo đang bị chặn";
    button.classList.add("is-blocked");
    button.disabled = false;
    return;
  }

  button.textContent = "Bật thông báo";
  button.disabled = false;
}

async function requestNotificationPermission() {
  if (!notificationSupported()) {
    toast("Trình duyệt này chưa hỗ trợ thông báo hệ thống.", "error");
    return;
  }

  const permission = await Notification.requestPermission();
  updateNotificationPermissionButton();

  if (permission === "granted") {
    toast("Đã bật thông báo trên thiết bị này.", "success");
    await showSystemNotification({
      id: "permission-test",
      title: "Shop Task đã bật thông báo",
      message: "Bạn sẽ nhận thông báo khi có việc mới hoặc khi công việc được xác nhận."
    });
  } else if (permission === "denied") {
    toast("Bạn đã chặn thông báo. Hãy mở khóa trong cài đặt trình duyệt nếu muốn bật lại.", "error");
  } else {
    toast("Bạn chưa cấp quyền thông báo.", "info");
  }
}

async function showSystemNotification(notification) {
  if (!notificationSupported() || Notification.permission !== "granted") return;

  const title = notification.title || "Shop Task";
  const options = {
    body: notification.message || "Bạn có thông báo mới.",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: notification.id || notification.taskId || `${Date.now()}`,
    data: {
      url: "./",
      taskId: notification.taskId || null
    }
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return;
    }
  } catch (error) {
    console.warn("Không hiển thị được notification qua service worker:", error);
  }

  try {
    new Notification(title, options);
  } catch (error) {
    console.warn("Không hiển thị được notification:", error);
  }
}

els.enableNotificationsBtn?.addEventListener("click", requestNotificationPermission);

els.notificationBellBtn?.addEventListener("click", () => {
  els.notificationPanel.classList.toggle("hidden");
});

document.addEventListener("click", (event) => {
  if (!els.notificationPanel || els.notificationPanel.classList.contains("hidden")) return;
  const clickedInside = event.target.closest(".notification-wrap");
  if (!clickedInside) els.notificationPanel.classList.add("hidden");
});

els.markAllNotificationsReadBtn?.addEventListener("click", markAllNotificationsRead);

function setupNotificationListener() {
  if (!state.user) return;

  state.notifications = [];
  state.knownNotificationIds = new Set();
  state.notificationsReady = false;
  renderNotifications();

  const notificationsQuery = query(
    collection(db, "notifications"),
    where("recipientUid", "==", state.user.uid)
  );

  const unsubscribe = onSnapshot(
    notificationsQuery,
    (snapshot) => {
      const docs = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => {
          const bTime = timestampToDate(b.createdAt)?.getTime() || 0;
          const aTime = timestampToDate(a.createdAt)?.getTime() || 0;
          return bTime - aTime;
        });

      state.notifications = docs;
      renderNotifications();

      if (!state.notificationsReady) {
        state.knownNotificationIds = new Set(snapshot.docs.map((item) => item.id));
        state.notificationsReady = true;
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        if (state.knownNotificationIds.has(change.doc.id)) return;

        const notification = { id: change.doc.id, ...change.doc.data() };
        state.knownNotificationIds.add(change.doc.id);

        toast(notification.message || notification.title || "Bạn có thông báo mới.", "info");
        showSystemNotification(notification);
      });
    },
    (error) => {
      console.error(error);
      toast("Không đọc được thông báo. Kiểm tra Firestore Rules cho collection notifications.", "error");
    }
  );

  state.unsubs.push(unsubscribe);
}

function renderNotifications() {
  if (!els.notificationList || !els.notificationBadge) return;

  const unreadCount = state.notifications.filter((item) => !item.readAt).length;

  els.notificationBadge.textContent = String(unreadCount);
  els.notificationBadge.classList.toggle("hidden", unreadCount === 0);

  if (!state.notifications.length) {
    els.notificationList.innerHTML = "Chưa có thông báo.";
    els.notificationList.classList.add("empty-box");
    return;
  }

  els.notificationList.classList.remove("empty-box");
  els.notificationList.innerHTML = state.notifications
    .slice(0, 30)
    .map((item) => `
      <article class="notification-item ${item.readAt ? "" : "unread"}">
        <strong>${escapeHtml(item.title || "Thông báo")}</strong>
        <p>${escapeHtml(item.message || "")}</p>
        <time>${formatDateTime(item.createdAt)}</time>
        ${item.readAt ? "" : `<button class="link-btn" data-action="mark-notification-read" data-notification-id="${escapeHtml(item.id)}" type="button">Đã đọc</button>`}
      </article>
    `)
    .join("");
}

async function markNotificationRead(notificationId) {
  if (!notificationId) return;

  try {
    await updateDoc(doc(db, "notifications", notificationId), {
      readAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
    toast("Không đánh dấu được thông báo đã đọc.", "error");
  }
}

async function markAllNotificationsRead() {
  const unread = state.notifications.filter((item) => !item.readAt);
  if (!unread.length) return;

  try {
    await Promise.all(
      unread.slice(0, 30).map((item) => updateDoc(doc(db, "notifications", item.id), {
        readAt: serverTimestamp()
      }))
    );
  } catch (error) {
    console.error(error);
    toast("Không đánh dấu được toàn bộ thông báo.", "error");
  }
}

async function createNotification({ recipientUid, type, title, message, taskId, taskTitle }) {
  if (!recipientUid || !state.user) return;

  const notificationRef = doc(collection(db, "notifications"));

  await setDoc(notificationRef, {
    id: notificationRef.id,
    recipientUid,
    type,
    title,
    message,
    taskId: taskId || null,
    taskTitle: taskTitle || null,
    actorUid: state.user.uid,
    actorName: state.profile?.name || state.user.email || "Người dùng",
    createdAt: serverTimestamp(),
    readAt: null
  });
}

async function createNotifications(items) {
  const unique = [];
  const seen = new Set();

  items.forEach((item) => {
    if (!item.recipientUid) return;
    const key = `${item.recipientUid}-${item.type}-${item.taskId || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(item);
  });

  if (!unique.length) return;

  try {
    await Promise.all(unique.map((item) => createNotification(item)));
  } catch (error) {
    console.error("Không tạo được thông báo:", error);
    toast("Thao tác chính đã xong nhưng chưa ghi được thông báo. Kiểm tra Firestore Rules notifications.", "error");
  }
}

// =========================
// Date filter helpers
// =========================
function bindDateFilterControls(scope) {
  const prefix = scope === "admin" ? "admin" : "employee";
  const modeEl = els[`${prefix}DateMode`];
  const singleEl = els[`${prefix}SingleDate`];
  const fromEl = els[`${prefix}DateFrom`];
  const toEl = els[`${prefix}DateTo`];
  const clearEl = els[`${prefix}ClearDateFilter`];

  if (!modeEl) return;

  const currentFilter = state[`${prefix}DateFilter`];
  modeEl.value = currentFilter.mode || "today";
  if ((currentFilter.mode || "today") === "today" && singleEl && !currentFilter.single) {
    singleEl.value = todayInputValue();
  } else if (singleEl) {
    singleEl.value = currentFilter.single || "";
  }
  if (fromEl) fromEl.value = currentFilter.from || "";
  if (toEl) toEl.value = currentFilter.to || "";

  const onChange = () => {
    if (modeEl.value === "today" && singleEl && !singleEl.value) {
      singleEl.value = todayInputValue();
    }

    state[`${prefix}DateFilter`] = {
      mode: modeEl.value,
      single: modeEl.value === "today" ? todayInputValue() : (singleEl?.value || ""),
      from: fromEl?.value || "",
      to: toEl?.value || ""
    };

    refreshDateFilterVisibility(scope);

    if (scope === "admin") renderAdminTasks();
    if (scope === "employee") renderEmployeeTasks();
  };

  modeEl.addEventListener("change", () => {
    if (modeEl.value === "today") {
      const today = todayInputValue();
      if (singleEl) singleEl.value = today;
    }
    onChange();
  });

  [singleEl, fromEl, toEl].forEach((input) => input?.addEventListener("change", onChange));

  clearEl?.addEventListener("click", () => {
    modeEl.value = "all";
    if (singleEl) singleEl.value = "";
    if (fromEl) fromEl.value = "";
    if (toEl) toEl.value = "";
    onChange();
  });

  refreshDateFilterVisibility(scope);
}

function refreshDateFilterVisibility(scope) {
  const prefix = scope === "admin" ? "admin" : "employee";
  const filter = state[`${prefix}DateFilter`];
  const singleEl = els[`${prefix}SingleDate`];
  const fromEl = els[`${prefix}DateFrom`];
  const toEl = els[`${prefix}DateTo`];
  const clearEl = els[`${prefix}ClearDateFilter`];
  const summaryEl = els[`${prefix}DateSummary`];

  singleEl?.classList.toggle("hidden", !["single", "today"].includes(filter.mode));
  fromEl?.classList.toggle("hidden", filter.mode !== "range");
  toEl?.classList.toggle("hidden", filter.mode !== "range");
  clearEl?.classList.toggle("hidden", filter.mode === "all");

  if (summaryEl) summaryEl.textContent = getDateFilterSummary(filter);
}

function getDateFilterSummary(filter) {
  if (filter.mode === "today") return `Đang hiển thị công việc giao hôm nay (${formatDateOnly(todayInputValue())}).`;
  if (filter.mode === "single") return filter.single
    ? `Đang hiển thị công việc giao ngày ${formatDateOnly(filter.single)}.`
    : "Chọn ngày để lọc công việc.";
  if (filter.mode === "range") {
    if (filter.from && filter.to) return `Đang hiển thị công việc từ ${formatDateOnly(filter.from)} đến ${formatDateOnly(filter.to)}.`;
    if (filter.from) return `Đang hiển thị công việc từ ${formatDateOnly(filter.from)} trở đi.`;
    if (filter.to) return `Đang hiển thị công việc đến ${formatDateOnly(filter.to)}.`;
    return "Chọn khoảng ngày để lọc công việc.";
  }
  return "Đang hiển thị tất cả ngày giao việc.";
}

function isTaskInDateFilter(task, filter) {
  const taskDate = getTaskDateValue(task);
  if (!taskDate) return filter.mode === "all";

  if (filter.mode === "all") return true;
  if (filter.mode === "today") return taskDate === todayInputValue();
  if (filter.mode === "single") return filter.single ? taskDate === filter.single : true;

  if (filter.mode === "range") {
    const fromOk = filter.from ? taskDate >= filter.from : true;
    const toOk = filter.to ? taskDate <= filter.to : true;
    return fromOk && toOk;
  }

  return true;
}

bindDateFilterControls("admin");
bindDateFilterControls("employee");

// =========================
// Auth flow
// =========================
els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = $("#loginBtn");
  setButtonLoading(button, true, "Đang đăng nhập...");

  try {
    const email = $("#loginEmail").value.trim();
    const password = $("#loginPassword").value;

    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    let message = `Lỗi đăng nhập: ${error.code || error.message}`;

    if (error.code === "auth/invalid-credential") {
      message = "Sai email hoặc mật khẩu, hoặc tài khoản chưa được tạo trong Firebase Authentication.";
    }

    if (error.code === "auth/user-not-found") {
      message = "Email này chưa có trong Firebase Authentication > Users.";
    }

    if (error.code === "auth/wrong-password") {
      message = "Sai mật khẩu.";
    }

    if (error.code === "auth/operation-not-allowed") {
      message = "Bạn chưa bật Email/Password trong Firebase Authentication.";
    }

    if (error.code === "auth/unauthorized-domain") {
      message = "Domain GitHub Pages chưa được thêm vào Firebase Authorized domains.";
    }

    toast(message, "error");
  } finally {
    setButtonLoading(button, false);
  }
});

els.logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  cleanupSubscriptions();

  state.user = user;
  state.profile = null;
  state.employees = [];
  state.tasks = [];
  state.notifications = [];
  state.knownNotificationIds = new Set();
  state.notificationsReady = false;

  if (!user) {
    showLogin();
    renderNotifications();
    return;
  }

  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));

    if (!profileSnap.exists()) {
      toast("Tài khoản này chưa có hồ sơ trong collection users. Hãy tạo users/{uid} trước.", "error");
      await signOut(auth);
      return;
    }

    state.profile = profileSnap.data();

    showApp();
    setupNotificationListener();

    if (state.profile.role === "admin") {
      setupAdminDashboard();
    } else {
      setupEmployeeDashboard();
    }
  } catch (error) {
    console.error(error);
    toast("Không tải được hồ sơ người dùng. Kiểm tra Firestore Rules.", "error");
    await signOut(auth);
  }
});

function showLogin() {
  els.loginView.classList.remove("hidden");
  els.appView.classList.add("hidden");
  els.adminView.classList.add("hidden");
  els.employeeView.classList.add("hidden");
  els.notificationPanel?.classList.add("hidden");
}

function showApp() {
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");

  const roleText = state.profile.role === "admin" ? "Admin" : "Nhân viên";

  els.currentUserText.textContent = `${state.profile.name || state.user.email} • ${roleText}`;
  updateNotificationPermissionButton();
}

function cleanupSubscriptions() {
  state.unsubs.forEach((unsubscribe) => unsubscribe());
  state.unsubs = [];
}

// =========================
// Admin dashboard
// =========================
function setupAdminDashboard() {
  els.adminView.classList.remove("hidden");
  els.employeeView.classList.add("hidden");

  const unsubUsers = onSnapshot(
    collection(db, "users"),
    (snapshot) => {
      state.employees = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((user) => user.role === "employee")
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));

      renderEmployees();
      renderEmployeeSelects();
    },
    handleSnapshotError
  );

  const tasksQuery = query(collection(db, "tasks"), orderBy("createdAt", "desc"));

  const unsubTasks = onSnapshot(
    tasksQuery,
    async (snapshot) => {
      state.tasks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAdminTasks();

      // Admin mở dashboard thì hệ thống tự đồng bộ lịch nối tiếp cho dữ liệu cũ
      // và tự đánh dấu quá hạn để trạng thái được lưu vào database.
      await syncSequentialScheduleByAdmin();
      await syncOverdueTasksByAdmin();
    },
    handleSnapshotError
  );

  // Theo dõi riêng collection workOrders để những phiếu nháp CHƯA có công việc nào
  // (0 dòng) vẫn hiển thị được trên danh sách (nếu chỉ dựa vào tasks sẽ không thấy được).
  const workOrdersQuery = query(collection(db, "workOrders"), orderBy("createdAt", "desc"));

  const unsubWorkOrders = onSnapshot(
    workOrdersQuery,
    (snapshot) => {
      state.workOrders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAdminTasks();
    },
    handleSnapshotError
  );

  const reasonsQuery = query(collection(db, "timeExtensionReasons"), orderBy("createdAt", "asc"));

  const unsubTimeExtensionReasons = onSnapshot(
    reasonsQuery,
    (snapshot) => {
      state.timeExtensionReasons = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((reason) => reason.active !== false);
      renderExtendReasonOptions();
    },
    (error) => {
      console.error(error);
      toast("Không đọc được danh sách mục đích thêm giờ. Kiểm tra Firestore Rules timeExtensionReasons.", "error");
    }
  );

  state.unsubs.push(unsubUsers, unsubTasks, unsubWorkOrders, unsubTimeExtensionReasons);
}

function handleSnapshotError(error) {
  console.error(error);
  toast("Không đọc được dữ liệu realtime. Kiểm tra Firestore Rules hoặc index.", "error");
}

function renderEmployees() {
  if (!state.employees.length) {
    els.employeeList.innerHTML = "Chưa có nhân viên.";
    els.employeeList.classList.add("empty");
    return;
  }

  els.employeeList.classList.remove("empty");

  els.employeeList.innerHTML = state.employees
    .map((employee) => `
      <div class="employee-item">
        <div class="avatar">${escapeHtml(initials(employee.name))}</div>
        <div>
          <strong>${escapeHtml(employee.name)}</strong>
          <span>${escapeHtml(employee.email)}</span>
        </div>
      </div>
    `)
    .join("");
}

function employeeOptionsHtml() {
  return state.employees
    .map((employee) => (
      `<option value="${escapeHtml(employee.uid)}">${escapeHtml(employee.name)} - ${escapeHtml(employee.email)}</option>`
    ))
    .join("");
}

function renderEmployeeSelects() {
  const employeeOptions = employeeOptionsHtml();

  els.adminEmployeeFilter.innerHTML = `<option value="all">Tất cả nhân viên</option>${employeeOptions}`;
  els.adminEmployeeFilter.value = state.adminEmployeeFilter;

  // Nếu modal tạo phiếu đang mở, cập nhật lại danh sách nhân viên trong từng dòng
  // (giữ nguyên lựa chọn cũ nếu nhân viên đó vẫn còn trong danh sách).
  $$("#taskRowsContainer .row-assignee").forEach((select) => {
    const currentValue = select.value;
    select.innerHTML = `<option value="">Chọn nhân viên</option>${employeeOptions}`;
    if (currentValue) select.value = currentValue;
  });
}

els.createEmployeeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (state.profile?.role !== "admin") return;

  const button = $("#createEmployeeBtn");
  setButtonLoading(button, true, "Đang tạo...");

  const name = $("#employeeName").value.trim();
  const email = $("#employeeEmail").value.trim().toLowerCase();
  const password = $("#employeePassword").value;

  try {
    const sAuth = getSecondaryAuth();

    const credential = await createUserWithEmailAndPassword(sAuth, email, password);

    await updateProfile(credential.user, {
      displayName: name
    });

    await setDoc(doc(db, "users", credential.user.uid), {
      uid: credential.user.uid,
      name,
      email,
      role: "employee",
      createdByUid: state.user.uid,
      createdAt: serverTimestamp()
    });

    await signOut(sAuth);

    els.createEmployeeForm.reset();

    toast(`Đã tạo nhân viên ${name}.`, "success");
  } catch (error) {
    console.error(error);
    toast(getFriendlyFirebaseError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
});

// =========================
// Quản lý các dòng công việc trong phiếu (task rows)
// =========================
let taskRowIdCounter = 0;

function createTaskRowElement(prefill = null) {
  taskRowIdCounter += 1;
  const rowId = `row-${taskRowIdCounter}`;

  const wrapper = document.createElement("div");
  wrapper.className = "task-row";
  wrapper.dataset.rowId = rowId;

  wrapper.innerHTML = `
    <div class="task-row-head">
      <strong>Công việc</strong>
      <button type="button" class="icon-btn small" data-action="remove-task-row" data-row-id="${rowId}" aria-label="Xóa công việc này">×</button>
    </div>
    <label>
      Tên công việc
      <input type="text" class="row-title" placeholder="Ví dụ: Dọn phòng khách sạn mèo" required />
    </label>
    <label>
      Mô tả công việc
      <textarea class="row-description" rows="3" placeholder="Ghi rõ yêu cầu, tiêu chuẩn hoàn thành..." required></textarea>
    </label>
    <div class="two-col">
      <label>
        Ngày giao việc
        <input type="date" class="row-date" required />
      </label>
      <label>
        Người được giao
        <select class="row-assignee" required>
          <option value="">Chọn nhân viên</option>
          ${employeeOptionsHtml()}
        </select>
      </label>
    </div>
    <div class="two-col">
      <label>
        Số giờ
        <input type="number" class="row-hours" min="0" max="168" value="0" required />
      </label>
      <label>
        Số phút
        <input type="number" class="row-minutes" min="0" max="59" value="30" required />
      </label>
    </div>
  `;

  const dateInput = wrapper.querySelector(".row-date");
  dateInput.valueAsDate = prefill?.taskDate ? new Date(`${prefill.taskDate}T00:00:00`) : new Date();

  if (prefill) {
    wrapper.querySelector(".row-title").value = prefill.title || "";
    wrapper.querySelector(".row-description").value = prefill.description || "";
    wrapper.querySelector(".row-hours").value = Number.isFinite(prefill.hours) ? prefill.hours : 0;
    wrapper.querySelector(".row-minutes").value = Number.isFinite(prefill.minutes) ? prefill.minutes : 30;

    if (prefill.assignedToUid) {
      wrapper.querySelector(".row-assignee").value = prefill.assignedToUid;
    }
  }

  return wrapper;
}

function addTaskRow() {
  els.taskRowsContainer.appendChild(createTaskRowElement());
  updateTaskRowHeadings();
}

function removeTaskRow(rowId) {
  const rows = $$("#taskRowsContainer .task-row");
  if (rows.length <= 1) {
    toast("Phiếu cần có ít nhất 1 công việc.", "error");
    return;
  }

  const row = els.taskRowsContainer.querySelector(`[data-row-id="${rowId}"]`);
  row?.remove();
  updateTaskRowHeadings();
}

function updateTaskRowHeadings() {
  const rows = $$("#taskRowsContainer .task-row");

  rows.forEach((row, index) => {
    row.querySelector(".task-row-head strong").textContent = `Công việc #${index + 1}`;
  });

  // Chỉ cho xóa khi có nhiều hơn 1 dòng.
  rows.forEach((row) => {
    const removeBtn = row.querySelector('[data-action="remove-task-row"]');
    if (removeBtn) removeBtn.classList.toggle("hidden", rows.length <= 1);
  });
}

function resetTaskRows() {
  els.taskRowsContainer.innerHTML = "";
  addTaskRow();
}

els.addTaskRowBtn.addEventListener("click", addTaskRow);

els.taskRowsContainer.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="remove-task-row"]');
  if (!button) return;
  removeTaskRow(button.dataset.rowId);
});

els.openTaskModalBtn.addEventListener("click", () => {
  if (!state.employees.length) {
    toast("Bạn cần tạo ít nhất 1 tài khoản nhân viên trước khi giao việc.", "error");
    return;
  }

  state.editingWorkOrderId = null;
  $("#taskModalTitle").textContent = "+ Tạo phiếu công việc";
  els.workOrderName.value = "";
  resetTaskRows();

  els.taskModal.classList.remove("hidden");
});

function openEditWorkOrderModal(workOrderId) {
  const tasksInGroup = state.tasks.filter((task) => (task.workOrderId || "legacy") === workOrderId);
  const workOrder = state.workOrders.find((wo) => wo.id === workOrderId);

  if (!tasksInGroup.length && !workOrder) {
    toast("Không tìm thấy phiếu này.", "error");
    return;
  }

  state.editingWorkOrderId = workOrderId;
  els.workOrderName.value = tasksInGroup[0]?.workOrderName || workOrder?.name || "";
  els.taskRowsContainer.innerHTML = "";

  if (tasksInGroup.length) {
    tasksInGroup.forEach((task) => {
      const deadlineMinutes = Number(task.deadlineMinutes || 0);

      els.taskRowsContainer.appendChild(createTaskRowElement({
        title: task.title,
        description: task.description,
        taskDate: task.taskDate,
        assignedToUid: task.assignedToUid,
        hours: Math.floor(deadlineMinutes / 60),
        minutes: deadlineMinutes % 60
      }));
    });
  } else {
    // Phiếu nháp chưa có công việc nào: bắt đầu với 1 dòng trống để admin điền thêm.
    addTaskRow();
  }

  updateTaskRowHeadings();

  $("#taskModalTitle").textContent = "Sửa phiếu công việc (đang Chưa giao việc)";
  els.taskModal.classList.remove("hidden");
}

$$("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => {
    els.taskModal.classList.add("hidden");
  });
});

function readTaskRowsData() {
  const rowElements = $$("#taskRowsContainer .task-row");

  return rowElements.map((row, index) => {
    const title = row.querySelector(".row-title").value.trim();
    const description = row.querySelector(".row-description").value.trim();
    const taskDate = row.querySelector(".row-date").value;
    const assignedToUid = row.querySelector(".row-assignee").value;
    const hours = Number(row.querySelector(".row-hours").value || 0);
    const minutes = Number(row.querySelector(".row-minutes").value || 0);
    const deadlineMinutes = hours * 60 + minutes;
    const assignedEmployee = state.employees.find((employee) => employee.uid === assignedToUid);

    return {
      index,
      title,
      description,
      taskDate,
      assignedToUid,
      assignedEmployee,
      deadlineMinutes
    };
  });
}

function validateTaskRows(rows) {
  if (!rows.length) {
    return "Phiếu cần có ít nhất 1 công việc.";
  }

  for (const row of rows) {
    const rowLabel = `Công việc #${row.index + 1}`;

    if (!row.title) return `${rowLabel}: vui lòng nhập tên công việc.`;
    if (!row.description) return `${rowLabel}: vui lòng nhập mô tả công việc.`;
    if (!row.assignedEmployee) return `${rowLabel}: vui lòng chọn nhân viên hợp lệ.`;
    if (!row.taskDate) return `${rowLabel}: vui lòng chọn ngày giao việc.`;
    if (row.deadlineMinutes <= 0) return `${rowLabel}: thời gian cần hoàn thành phải lớn hơn 0 phút.`;
  }

  return null;
}

// Lưu nháp chỉ bắt buộc có tên phiếu (kiểm tra riêng ở persistWorkOrder),
// không yêu cầu bất kỳ thông tin nào trong từng dòng công việc.
function validateTaskRowsForDraft(rows) {
  if (!rows.length) {
    return "Phiếu cần có ít nhất 1 công việc (có thể để trống thông tin, điền sau).";
  }

  return null;
}

// Dùng chung cho cả 3 luồng: Lưu nháp mới, Sửa & lưu lại nháp, Sửa & giao việc luôn,
// và Tạo phiếu & giao việc ngay (trường hợp không sửa phiếu có sẵn).
async function persistWorkOrder(dispatch, button) {
  setButtonLoading(button, true, dispatch ? "Đang giao việc..." : "Đang lưu...");

  try {
    const workOrderName = els.workOrderName.value.trim();

    if (!workOrderName) {
      throw new Error("Vui lòng nhập tên phiếu công việc.");
    }

    const rows = readTaskRowsData();
    const validationError = dispatch ? validateTaskRows(rows) : validateTaskRowsForDraft(rows);

    if (validationError) {
      throw new Error(validationError);
    }

    const now = new Date();
    const batch = writeBatch(db);
    const rowSchedulePlan = buildSequentialRowSchedule(rows, now);

    // Nếu đang sửa 1 phiếu nháp có sẵn: xoá phiếu + công việc cũ, sau đó tạo lại từ đầu.
    const previousWorkOrderId = state.editingWorkOrderId;

    if (previousWorkOrderId) {
      const oldTasks = state.tasks.filter((task) => (task.workOrderId || "legacy") === previousWorkOrderId);
      oldTasks.forEach((task) => batch.delete(doc(db, "tasks", task.id)));

      if (previousWorkOrderId !== "legacy") {
        batch.delete(doc(db, "workOrders", previousWorkOrderId));
      }
    }

    const workOrderRef = doc(collection(db, "workOrders"));
    batch.set(workOrderRef, {
      id: workOrderRef.id,
      name: workOrderName,
      createdByUid: state.user.uid,
      createdByName: state.profile.name,
      createdAt: serverTimestamp(),
      taskCount: rows.length,
      status: dispatch ? "dispatched" : "draft"
    });

    const notificationItems = [];
    const createdTaskRefs = [];

    rows.forEach((row) => {
      const taskRef = doc(collection(db, "tasks"));
      createdTaskRefs.push(taskRef);

      const assignedToUid = row.assignedToUid || "";
      const assignedToName = row.assignedEmployee?.name || "";
      const deadlineMinutes = Number(row.deadlineMinutes) || 0;
      const schedulePlan = rowSchedulePlan.get(row.index);

      const taskData = {
        id: taskRef.id,
        title: row.title,
        description: row.description,
        taskDate: row.taskDate || "",
        assignedToUid,
        assignedToName,
        assignedByUid: state.user.uid,
        assignedByName: state.profile.name,
        workOrderId: workOrderRef.id,
        workOrderName,
        // Lưu tổng số công việc của phiếu vào từng task để các màn hình có thể hiển thị thống nhất.
        workOrderTaskCount: rows.length,
        // sequenceIndex là thứ tự riêng của nhân viên trong phiếu, dùng để xếp lịch nối tiếp.
        sequenceIndex: schedulePlan?.sequenceIndex ?? row.index,
        createdAt: serverTimestamp(),
        scheduledStartAt: null,
        deadlineMinutes,
        deadlineAt: null,
        dispatchedAt: null,
        submittedAt: null,
        approvedAt: null,
        status: "draft",
        actualMinutes: null,
        resultType: null,
        differenceMinutes: null,
        differencePercent: null,
        timeExtensionCount: 0,
        timeExtensionTotalMinutes: 0,
        timeExtensions: [],
        lastTimeExtendedAt: null,
        lastTimeExtendedByUid: null,
        lastTimeExtendedByName: null
      };

      if (dispatch) {
        taskData.status = "doing";
        taskData.dispatchedAt = serverTimestamp();
        taskData.scheduledStartAt = Timestamp.fromDate(schedulePlan.scheduledStartAt);
        taskData.deadlineAt = Timestamp.fromDate(schedulePlan.deadlineAt);

        notificationItems.push({
          recipientUid: assignedToUid,
          type: "task_assigned",
          title: "Bạn có công việc mới",
          message: `${state.profile.name || "Admin"} đã giao cho bạn: ${row.title} (phiếu “${workOrderName}”). Hạn hoàn thành: ${formatMinutes(deadlineMinutes)}.`,
          taskId: taskRef.id,
          taskTitle: row.title
        });
      }

      batch.set(taskRef, taskData);
    });

    await batch.commit();

    if (dispatch) {
      notificationItems.push({
        recipientUid: state.user.uid,
        type: "task_assigned_admin",
        title: "Đã tạo phiếu công việc",
        message: `Bạn đã tạo phiếu “${workOrderName}” với ${rows.length} công việc.`,
        taskId: createdTaskRefs[0].id,
        taskTitle: workOrderName
      });

      await createNotifications(notificationItems);
    }

    state.editingWorkOrderId = null;
    els.workOrderName.value = "";
    resetTaskRows();
    $("#taskModalTitle").textContent = "+ Tạo phiếu công việc";

    els.taskModal.classList.add("hidden");

    toast(
      dispatch
        ? `Đã tạo phiếu “${workOrderName}” với ${rows.length} công việc và gửi thông báo.`
        : `Đã lưu phiếu “${workOrderName}” (${rows.length} công việc) ở trạng thái Chưa giao việc.`,
      "success"
    );
  } catch (error) {
    console.error(error);
    toast(error.message || "Không lưu được phiếu công việc.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

els.createTaskForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (state.profile?.role !== "admin") return;

  await persistWorkOrder(true, $("#createTaskBtn"));
});

els.saveDraftBtn.addEventListener("click", async () => {
  if (state.profile?.role !== "admin") return;

  await persistWorkOrder(false, els.saveDraftBtn);
});

async function dispatchWorkOrder(workOrderId, button) {
  const tasksInGroup = state.tasks.filter((task) => (task.workOrderId || "legacy") === workOrderId);

  if (!tasksInGroup.length) {
    toast("Phiếu này chưa có công việc nào. Bấm “Sửa phiếu” để thêm công việc trước khi giao.", "error");
    return;
  }

  const missingInfo = tasksInGroup.find((task) => (
    !task.title ||
    !task.assignedToUid ||
    !task.taskDate ||
    !Number(task.deadlineMinutes) ||
    Number(task.deadlineMinutes) <= 0
  ));

  if (missingInfo) {
    toast("Phiếu còn thiếu thông tin (tên công việc/nhân viên/ngày giao/thời gian). Bấm “Sửa phiếu” để hoàn thiện trước khi giao việc.", "error");
    return;
  }

  setButtonLoading(button, true, "Đang giao việc...");

  try {
    const now = new Date();
    const batch = writeBatch(db);
    const notificationItems = [];
    const schedulePlan = buildSequentialTaskSchedule(tasksInGroup, now, { forceBaseStart: true });

    tasksInGroup.forEach((task) => {
      const plan = schedulePlan.get(task.id);

      batch.update(doc(db, "tasks", task.id), {
        status: "doing",
        dispatchedAt: serverTimestamp(),
        scheduledStartAt: Timestamp.fromDate(plan.scheduledStartAt),
        deadlineAt: Timestamp.fromDate(plan.deadlineAt),
        sequenceIndex: plan.sequenceIndex
      });

      notificationItems.push({
        recipientUid: task.assignedToUid,
        type: "task_assigned",
        title: "Bạn có công việc mới",
        message: `${state.profile.name || "Admin"} đã giao cho bạn: ${task.title} (phiếu “${task.workOrderName}”). Hạn hoàn thành: ${formatMinutes(task.deadlineMinutes)}.`,
        taskId: task.id,
        taskTitle: task.title
      });
    });

    if (workOrderId !== "legacy") {
      batch.update(doc(db, "workOrders", workOrderId), { status: "dispatched" });
    }

    await batch.commit();

    notificationItems.push({
      recipientUid: state.user.uid,
      type: "task_assigned_admin",
      title: "Đã giao phiếu công việc",
      message: `Bạn đã giao phiếu “${tasksInGroup[0].workOrderName}” với ${tasksInGroup.length} công việc.`,
      taskId: tasksInGroup[0].id,
      taskTitle: tasksInGroup[0].workOrderName
    });

    await createNotifications(notificationItems);

    toast("Đã giao việc thành công và gửi thông báo.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không giao được việc.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function deleteWorkOrder(workOrderId, button) {
  const tasksInGroup = state.tasks.filter((task) => (task.workOrderId || "legacy") === workOrderId);

  if (!window.confirm(`Xoá phiếu này cùng ${tasksInGroup.length} công việc bên trong? Không thể hoàn tác.`)) {
    return;
  }

  setButtonLoading(button, true, "Đang xoá...");

  try {
    const batch = writeBatch(db);
    tasksInGroup.forEach((task) => batch.delete(doc(db, "tasks", task.id)));

    if (workOrderId !== "legacy") {
      batch.delete(doc(db, "workOrders", workOrderId));
    }

    await batch.commit();

    toast("Đã xoá phiếu.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không xoá được phiếu.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

// Firestore giới hạn tối đa 500 thao tác/batch, chia nhỏ để xoá an toàn số lượng lớn.
async function commitInChunks(operations, chunkSize = 450) {
  for (let i = 0; i < operations.length; i += chunkSize) {
    const batch = writeBatch(db);
    operations.slice(i, i + chunkSize).forEach((addToBatch) => addToBatch(batch));
    await batch.commit();
  }
}

async function deleteAllWorkOrders(button) {
  if (!state.tasks.length && !state.workOrders.length) {
    toast("Không có phiếu công việc nào để xoá.", "info");
    return;
  }

  const ticketCount = new Set([
    ...state.tasks.map((task) => task.workOrderId || "legacy"),
    ...state.workOrders.map((wo) => wo.id)
  ]).size;

  if (!window.confirm(`Xoá TOÀN BỘ ${ticketCount} phiếu công việc (mọi trạng thái: chưa giao việc, đang làm, đã hoàn thành...) cùng ${state.tasks.length} công việc bên trong? Hành động này không thể hoàn tác.`)) {
    return;
  }

  setButtonLoading(button, true, "Đang xoá toàn bộ...");

  try {
    const operations = [];

    state.tasks.forEach((task) => {
      operations.push((batch) => batch.delete(doc(db, "tasks", task.id)));
    });

    // Xoá theo state.workOrders (thay vì suy từ tasks) để không bỏ sót các phiếu
    // nháp chưa có công việc nào bên trong.
    state.workOrders.forEach((workOrder) => {
      operations.push((batch) => batch.delete(doc(db, "workOrders", workOrder.id)));
    });

    await commitInChunks(operations);

    toast("Đã xoá toàn bộ phiếu công việc.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không xoá được toàn bộ phiếu.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

els.deleteAllWorkOrdersBtn?.addEventListener("click", () => deleteAllWorkOrders(els.deleteAllWorkOrdersBtn));

els.adminStatusFilter.addEventListener("change", (event) => {
  state.adminStatusFilter = event.target.value;
  renderAdminTasks();
});

els.adminEmployeeFilter.addEventListener("change", (event) => {
  state.adminEmployeeFilter = event.target.value;
  renderAdminTasks();
});

async function syncSequentialScheduleByAdmin() {
  if (state.profile?.role !== "admin") return;

  const activeTasks = state.tasks.filter((task) => (
    task.status &&
    task.status !== "draft" &&
    (task.workOrderId || "legacy") !== "legacy" &&
    task.assignedToUid &&
    Number(task.deadlineMinutes || 0) > 0
  ));

  if (!activeTasks.length) return;

  const tasksByWorkOrder = new Map();

  activeTasks.forEach((task) => {
    const workOrderId = task.workOrderId || "legacy";

    if (!tasksByWorkOrder.has(workOrderId)) {
      tasksByWorkOrder.set(workOrderId, []);
    }

    tasksByWorkOrder.get(workOrderId).push(task);
  });

  const operations = [];
  const now = new Date();

  tasksByWorkOrder.forEach((tasksInGroup) => {
    const plan = buildSequentialTaskSchedule(tasksInGroup, now);

    tasksInGroup.forEach((task) => {
      const item = plan.get(task.id);
      if (!item) return;

      const updates = {};
      const currentStart = timestampToDate(task.scheduledStartAt);
      const currentDeadline = timestampToDate(task.deadlineAt);
      const currentSequence = isValidSequenceIndex(task.sequenceIndex) ? Number(task.sequenceIndex) : null;
      const canAdjustDeadline = ["doing", "redo", "overdue"].includes(task.status) || !currentDeadline;

      if (!currentStart || Math.abs(currentStart.getTime() - item.scheduledStartAt.getTime()) > 1000) {
        updates.scheduledStartAt = Timestamp.fromDate(item.scheduledStartAt);
      }

      if (currentSequence !== item.sequenceIndex) {
        updates.sequenceIndex = item.sequenceIndex;
      }

      if (canAdjustDeadline && (!currentDeadline || Math.abs(currentDeadline.getTime() - item.deadlineAt.getTime()) > 1000)) {
        updates.deadlineAt = Timestamp.fromDate(item.deadlineAt);
      }

      if (task.status === "overdue" && item.deadlineAt.getTime() > now.getTime()) {
        updates.status = "doing";
      }

      if (Object.keys(updates).length) {
        operations.push((batch) => batch.update(doc(db, "tasks", task.id), updates));
      }
    });
  });

  if (!operations.length) return;

  try {
    await commitInChunks(operations, 450);
  } catch (error) {
    console.warn("Không thể tự đồng bộ lịch nối tiếp:", error);
  }
}

async function syncOverdueTasksByAdmin() {
  if (state.profile?.role !== "admin") return;

  const updates = state.tasks
    .filter((task) => ["doing", "redo"].includes(task.status))
    .filter((task) => {
      const deadline = getTaskDeadlineDate(task);
      return deadline && deadline.getTime() < Date.now();
    })
    .slice(0, 10)
    .map((task) => updateDoc(doc(db, "tasks", task.id), {
      status: "overdue"
    }));

  if (updates.length) {
    try {
      await Promise.all(updates);
    } catch (error) {
      console.warn("Không thể tự đồng bộ quá hạn:", error);
    }
  }
}

// =========================
// Employee dashboard
// =========================
function setupEmployeeDashboard() {
  els.adminView.classList.add("hidden");
  els.employeeView.classList.remove("hidden");

  // Chỉ query task của chính nhân viên đang đăng nhập.
  // Sort thực hiện ở client để tránh yêu cầu tạo composite index.
  const ownTasksQuery = query(
    collection(db, "tasks"),
    where("assignedToUid", "==", state.user.uid)
  );

  const unsubTasks = onSnapshot(
    ownTasksQuery,
    (snapshot) => {
      state.tasks = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        // Nhân viên không bao giờ thấy công việc còn ở trạng thái nháp (chưa giao việc).
        .filter((task) => task.status !== "draft")
        .sort((a, b) => {
          const bDate = timestampToDate(b.createdAt)?.getTime() || 0;
          const aDate = timestampToDate(a.createdAt)?.getTime() || 0;
          return bDate - aDate;
        });

      renderEmployeeTasks();
    },
    handleSnapshotError
  );

  // Nhân viên cũng cần đọc collection workOrders để hiển thị đúng tổng số công việc trong phiếu.
  // Ví dụ Admin thấy "Spa5 - 2 công việc" thì Nhân viên cũng phải thấy đúng "Spa5 - 2 công việc",
  // dù nhân viên đó chỉ được giao 1 công việc bên trong phiếu.
  const employeeWorkOrdersQuery = query(collection(db, "workOrders"), orderBy("createdAt", "desc"));

  const unsubEmployeeWorkOrders = onSnapshot(
    employeeWorkOrdersQuery,
    (snapshot) => {
      state.workOrders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderEmployeeTasks();
    },
    (error) => {
      console.error(error);
      toast("Không đọc được thông tin phiếu công việc. Cần cập nhật Firestore Rules cho collection workOrders.", "error");
    }
  );

  state.unsubs.push(unsubTasks, unsubEmployeeWorkOrders);
}

// =========================
// Render tasks
// =========================
function getAdminBaseFilteredTasks(computedTasks) {
  return computedTasks
    .filter((task) => isTaskInDateFilter(task, state.adminDateFilter))
    .filter((task) => state.adminEmployeeFilter === "all" || task.assignedToUid === state.adminEmployeeFilter);
}

function renderAdminTasks() {
  const computed = state.tasks.map((task) => ({
    ...task,
    displayStatus: getDisplayStatus(task)
  }));

  const baseFiltered = getAdminBaseFilteredTasks(computed);

  const stats = {
    doing: baseFiltered.filter((task) => (
      task.displayStatus === "doing" ||
      task.displayStatus === "near_due" ||
      task.displayStatus === "redo"
    )).length,
    submitted: baseFiltered.filter((task) => task.displayStatus === "submitted").length,
    overdue: baseFiltered.filter((task) => task.displayStatus === "overdue").length,
    completed: baseFiltered.filter((task) => task.displayStatus === "completed").length
  };

  els.statDoing.textContent = stats.doing;
  els.statSubmitted.textContent = stats.submitted;
  els.statOverdue.textContent = stats.overdue;
  els.statCompleted.textContent = stats.completed;

  let filtered = baseFiltered;

  if (state.adminStatusFilter !== "all") {
    filtered = filtered.filter((task) => (
      task.displayStatus === state.adminStatusFilter ||
      task.status === state.adminStatusFilter
    ));
  }

  refreshDateFilterVisibility("admin");

  // Chỉ chèn thêm phiếu nháp trống (0 công việc) khi không có bộ lọc nào khác đang áp dụng,
  // vì các phiếu này chưa có nhân viên/ngày để so khớp với bộ lọc.
  const showEmptyDrafts =
    (state.adminStatusFilter === "all" || state.adminStatusFilter === "draft") &&
    state.adminEmployeeFilter === "all" &&
    state.adminDateFilter.mode === "all";

  const groups = withEmptyDraftGroups(groupTasksByWorkOrder(filtered), showEmptyDrafts);

  if (!groups.length) {
    els.adminTaskList.innerHTML = "Không có công việc phù hợp bộ lọc.";
    els.adminTaskList.classList.add("empty");
    return;
  }

  els.adminTaskList.classList.remove("empty");

  els.adminTaskList.innerHTML = groups
    .map((group) => renderTicketGroup(group))
    .join("");

  updateCountdowns();
}

function getWorkOrderMeta(workOrderId) {
  if (!workOrderId || workOrderId === "legacy") return null;
  return state.workOrders.find((workOrder) => workOrder.id === workOrderId) || null;
}

function getWorkOrderTotalTaskCount(workOrderId, tasksInGroup) {
  const workOrder = getWorkOrderMeta(workOrderId);
  const countFromWorkOrder = Number(workOrder?.taskCount || 0);

  if (countFromWorkOrder > 0) return countFromWorkOrder;

  const countFromTask = Math.max(
    0,
    ...tasksInGroup.map((task) => Number(task.workOrderTaskCount || 0))
  );

  return countFromTask > 0 ? countFromTask : tasksInGroup.length;
}

// Gom các công việc thuộc cùng 1 phiếu (workOrder) lại với nhau.
function groupTasksByWorkOrder(tasks) {
  const groups = [];
  const groupByKey = new Map();

  tasks.forEach((task) => {
    const key = task.workOrderId || "legacy";
    const workOrder = getWorkOrderMeta(key);

    if (!groupByKey.has(key)) {
      const group = {
        key,
        name: workOrder?.name || task.workOrderName || "Công việc lẻ (giao trước khi có Phiếu)",
        tasks: [],
        totalTaskCount: Number(workOrder?.taskCount || task.workOrderTaskCount || 0),
        createdAtMs: timestampToDate(workOrder?.createdAt)?.getTime() || timestampToDate(task.createdAt)?.getTime() || 0
      };
      groupByKey.set(key, group);
      groups.push(group);
    }

    const group = groupByKey.get(key);
    group.tasks.push(task);
    group.totalTaskCount = getWorkOrderTotalTaskCount(key, group.tasks);
  });

  groups.forEach((group) => group.tasks.sort(compareTasksForDisplay));

  return groups;
}

// Thêm các phiếu nháp CHƯA có công việc nào (0 dòng) vào danh sách hiển thị — nếu chỉ dựa
// vào tasks thì những phiếu này sẽ không xuất hiện ở đâu cả (vì chưa có task nào tham chiếu tới).
function withEmptyDraftGroups(groups, showEmptyDrafts) {
  if (!showEmptyDrafts) return groups.sort((a, b) => b.createdAtMs - a.createdAtMs);

  const coveredWorkOrderIds = new Set(state.tasks.map((task) => task.workOrderId).filter(Boolean));

  const emptyDraftGroups = state.workOrders
    .filter((wo) => wo.status === "draft" && !coveredWorkOrderIds.has(wo.id))
    .map((wo) => ({
      key: wo.id,
      name: wo.name,
      tasks: [],
      totalTaskCount: Number(wo.taskCount || 0),
      createdAtMs: timestampToDate(wo.createdAt)?.getTime() || 0
    }));

  return [...groups, ...emptyDraftGroups].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

function renderTicketGroup(group, mode = "admin") {
  const isDraft = !group.tasks.length || group.tasks.every((task) => task.status === "draft");
  // Admin có thể thấy toàn bộ task trong phiếu, nhưng Nhân viên chỉ đọc được task của chính mình.
  // Vì vậy tiêu đề phiếu phải dùng tổng số công việc lưu ở workOrders.taskCount, không dùng số task đang hiển thị.
  const taskCount = Number(group.totalTaskCount || group.tasks.length || 0);
  const ticketTitle = `${group.name} - ${taskCount} công việc`;
  const actionButtons = [];

  if (mode === "admin" && isDraft) {
    actionButtons.push(`<button class="btn ghost small" data-action="edit-work-order" data-work-order-id="${escapeHtml(group.key)}" type="button">✏️ Sửa phiếu</button>`);

    if (group.tasks.length) {
      actionButtons.push(`<button class="btn secondary small" data-action="dispatch-work-order" data-work-order-id="${escapeHtml(group.key)}" type="button">🚀 Giao việc</button>`);
    }
  }

  if (mode === "admin") {
    actionButtons.push(`<button class="btn danger small" data-action="delete-work-order" data-work-order-id="${escapeHtml(group.key)}" type="button">🗑 Xoá phiếu</button>`);
  }

  const headerActions = actionButtons.length ? `<div class="ticket-actions">${actionButtons.join("")}</div>` : "";

  return `
    <section class="ticket-group ${isDraft ? "is-draft-ticket" : ""}">
      <div class="ticket-group-header">
        <div>
          <span class="ticket-badge ${isDraft ? "is-draft-badge" : ""}">${isDraft ? "Chưa giao việc" : "Phiếu công việc"}</span>
          <h4>${escapeHtml(ticketTitle)}</h4>
        </div>
      </div>
      ${headerActions}
      <div class="ticket-tasks">
        ${group.tasks.map((task) => renderTaskCard(task, mode)).join("")}
      </div>
    </section>
  `;
}

function renderEmployeeTasks() {
  const filtered = state.tasks
    .filter((task) => isTaskInDateFilter(task, state.employeeDateFilter))
    .map((task) => ({
      ...task,
      displayStatus: getDisplayStatus(task)
    }));

  refreshDateFilterVisibility("employee");

  if (!filtered.length) {
    els.employeeTaskList.innerHTML = "Không có công việc phù hợp bộ lọc.";
    els.employeeTaskList.classList.add("empty");
    return;
  }

  els.employeeTaskList.classList.remove("empty");

  els.employeeTaskList.innerHTML = groupTasksByWorkOrder(filtered)
    .map((group) => renderTicketGroup(group, "employee"))
    .join("");

  updateCountdowns();
}

function renderTaskCard(task, mode) {
  const displayStatus = task.displayStatus || getDisplayStatus(task);
  const scheduledStartDate = getTaskScheduledStartDate(task);
  const deadlineDate = getTaskDeadlineDate(task);
  const scheduledStartMs = scheduledStartDate?.getTime() || 0;
  const deadlineMs = deadlineDate?.getTime() || 0;

  const canEmployeeSubmit =
    mode === "employee" &&
    ["doing", "redo", "overdue"].includes(task.status) &&
    task.status !== "completed" &&
    task.status !== "submitted" &&
    hasTaskStarted(task);

  const canAdminReview =
    mode === "admin" &&
    task.status === "submitted";

  return `
    <article class="task-card ${taskCardClass(displayStatus)}" data-task-card data-scheduled-start-ms="${scheduledStartMs}" data-deadline-ms="${deadlineMs}" data-deadline-minutes="${Number(task.deadlineMinutes || 0)}" data-raw-status="${escapeHtml(task.status)}">
      <div class="task-top">
        <div>
          <h4 class="task-title">${escapeHtml(task.title) || "(Chưa đặt tên công việc)"}</h4>
          <p class="task-desc">${escapeHtml(task.description)}</p>
        </div>
        <span class="status-pill status-${displayStatus}" data-status-pill>${statusLabel(displayStatus)}</span>
      </div>

      <div class="task-meta">
        <div class="meta-box">
          <span>Nhân viên</span>
          <strong>${escapeHtml(task.assignedToName || "--")}</strong>
        </div>
        <div class="meta-box">
          <span>Ngày giao</span>
          <strong>${escapeHtml(formatDateOnly(getTaskDateValue(task)))}</strong>
        </div>
        <div class="meta-box">
          <span>Thời gian quy định</span>
          <strong>${formatMinutes(task.deadlineMinutes)}</strong>
        </div>
        <div class="meta-box">
          <span>Đếm ngược</span>
          <strong class="countdown-text" data-countdown>${getInitialCountdownText(task)}</strong>
        </div>
      </div>

      <div class="task-meta">
        <div class="meta-box">
          <span>Giao lúc</span>
          <strong>${formatDateTime(task.scheduledStartAt || task.dispatchedAt || task.createdAt)}</strong>
        </div>
        <div class="meta-box">
          <span>Hạn lúc</span>
          <strong>${formatDateTime(deadlineDate)}</strong>
        </div>
        <div class="meta-box">
          <span>Báo hoàn thành</span>
          <strong>${formatDateTime(task.submittedAt)}</strong>
        </div>
        <div class="meta-box">
          <span>Admin duyệt</span>
          <strong>${formatDateTime(task.approvedAt)}</strong>
        </div>
      </div>

      ${renderTimeExtensionBox(task)}
      ${renderResultBox(task)}
      ${renderTaskActions(task, { canEmployeeSubmit, canAdminReview, canAdminExtendTime: canAdminExtendTaskTime(task, mode) })}
    </article>
  `;
}

function getInitialCountdownText(task) {
  if (task.status === "draft") return "Chưa giao việc";
  if (task.status === "completed") return "Đã hoàn thành";
  if (task.status === "submitted") return "Chờ Admin xác nhận";

  const now = Date.now();
  const scheduledStart = getTaskScheduledStartDate(task);
  const deadline = getTaskDeadlineDate(task);

  if (scheduledStart && scheduledStart.getTime() > now) {
    return `Bắt đầu sau ${formatCountdown(scheduledStart.getTime() - now)}`;
  }

  if (!deadline) return "--";

  const ms = deadline.getTime() - now;

  return ms >= 0
    ? `Còn ${formatCountdown(ms)}`
    : `Quá hạn ${formatCountdown(ms)}`;
}

function renderResultBox(task) {
  if (task.status !== "completed" || !task.resultType) return "";

  let summary = "Hoàn thành đúng thời gian quy định.";
  let className = "result-box";

  if (task.resultType === "faster") {
    summary = `Nhanh hơn ${task.differenceMinutes} phút (${task.differencePercent}%).`;
  } else if (task.resultType === "slower") {
    summary = `Chậm hơn ${task.differenceMinutes} phút (${task.differencePercent}%).`;
    className = "result-box slower";
  }

  return `
    <div class="${className}">
      <strong>Kết quả: ${summary}</strong>
      <span>Thời gian thực tế: ${formatMinutes(task.actualMinutes)} • Thời gian quy định: ${formatMinutes(task.deadlineMinutes)}</span>
    </div>
  `;
}

function canAdminExtendTaskTime(task, mode) {
  return mode === "admin" && ["doing", "redo", "overdue"].includes(task.status);
}

function renderTimeExtensionBox(task) {
  const extensions = Array.isArray(task.timeExtensions) ? task.timeExtensions : [];
  const count = Number(task.timeExtensionCount || extensions.length || 0);

  if (!count && !extensions.length) return "";

  const totalMinutes = Number(task.timeExtensionTotalMinutes || extensions.reduce((sum, item) => sum + Number(item.minutes || 0), 0));

  const rows = extensions
    .slice()
    .sort((a, b) => (timestampToDate(b.addedAt)?.getTime() || 0) - (timestampToDate(a.addedAt)?.getTime() || 0))
    .map((item, index) => `
      <li>
        <strong>Lần ${extensions.length - index}: +${Number(item.minutes || 0)} phút</strong>
        <span>${escapeHtml(item.reason || "Không ghi mục đích")} • ${formatDateTime(item.addedAt)} • ${escapeHtml(item.addedByName || "Admin")}</span>
      </li>
    `)
    .join("");

  return `
    <div class="extension-box">
      <div class="extension-box-head">
        <strong>Đã thêm giờ ${count} lần</strong>
        <span>Tổng cộng +${totalMinutes} phút</span>
      </div>
      ${rows ? `<ul class="extension-list">${rows}</ul>` : ""}
    </div>
  `;
}

function renderTaskActions(task, permissions) {
  const buttons = [];

  if (permissions.canAdminExtendTime) {
    buttons.push(`
      <button class="btn ghost" data-action="open-extend-time" data-task-id="${escapeHtml(task.id)}">
        + Thêm giờ
      </button>
    `);
  }

  if (permissions.canEmployeeSubmit) {
    buttons.push(`
      <button class="btn primary" data-action="submit-task" data-task-id="${escapeHtml(task.id)}">
        Hoàn thành
      </button>
    `);
  }

  if (permissions.canAdminReview) {
    buttons.push(`
      <button class="btn secondary" data-action="approve-task" data-task-id="${escapeHtml(task.id)}">
        Xác nhận hoàn thành
      </button>
    `);

    buttons.push(`
      <button class="btn warning" data-action="redo-task" data-task-id="${escapeHtml(task.id)}">
        Yêu cầu làm lại
      </button>
    `);
  }

  if (!buttons.length) return "";

  return `<div class="task-actions">${buttons.join("")}</div>`;
}

// Event delegation cho các nút trong task card, ticket-group và notification list.
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  const action = button.dataset.action;
  const taskId = button.dataset.taskId;

  if (action === "open-extend-time") {
    openExtendTimeModal(taskId);
  }

  if (action === "submit-task") {
    await submitTask(taskId, button);
  }

  if (action === "approve-task") {
    await approveTask(taskId, button);
  }

  if (action === "redo-task") {
    await requestRedo(taskId, button);
  }

  if (action === "mark-notification-read") {
    await markNotificationRead(button.dataset.notificationId);
  }

  if (action === "edit-work-order") {
    openEditWorkOrderModal(button.dataset.workOrderId);
  }

  if (action === "dispatch-work-order") {
    await dispatchWorkOrder(button.dataset.workOrderId, button);
  }

  if (action === "delete-work-order") {
    await deleteWorkOrder(button.dataset.workOrderId, button);
  }
});


// Không dùng mục đích mặc định của hệ thống.
// Danh sách mục đích thêm giờ chỉ gồm các mục do Admin tự tạo trong Firestore.
function getAllTimeExtensionReasons() {
  const customReasons = (state.timeExtensionReasons || []).map((reason) => reason.name).filter(Boolean);
  return Array.from(new Set(customReasons));
}

function renderExtendReasonOptions(selectedValue = "") {
  if (!els.extendReasonSelect) return;

  const options = getAllTimeExtensionReasons()
    .map((reason) => `<option value="${escapeHtml(reason)}" ${reason === selectedValue ? "selected" : ""}>${escapeHtml(reason)}</option>`)
    .join("");

  els.extendReasonSelect.innerHTML = `<option value="">Chọn mục đích thêm giờ</option>${options}`;
  renderCustomExtendReasonList();
}

function renderCustomExtendReasonList() {
  if (!els.extendReasonList) return;

  const customReasons = state.timeExtensionReasons || [];

  if (!customReasons.length) {
    els.extendReasonList.innerHTML = `<p class="small-note">Chưa có mục đích nào do Admin tự tạo.</p>`;
    return;
  }

  els.extendReasonList.innerHTML = customReasons
    .map((reason) => `
      <div class="reason-item">
        <span>${escapeHtml(reason.name || "Không tên")}</span>
        <button class="btn danger tiny" type="button" data-delete-extend-reason-id="${escapeHtml(reason.id)}" data-delete-extend-reason-name="${escapeHtml(reason.name || "")}">
          Xoá
        </button>
      </div>
    `)
    .join("");
}

function openExtendTimeModal(taskId) {
  if (state.profile?.role !== "admin") return;

  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    toast("Không tìm thấy công việc cần thêm giờ.", "error");
    return;
  }

  if (!canAdminExtendTaskTime(task, "admin")) {
    toast("Chỉ thêm giờ cho công việc đang làm, yêu cầu làm lại hoặc quá hạn.", "error");
    return;
  }

  state.extendTimeTaskId = taskId;
  els.extendTimeTaskTitle.textContent = task.title || "Công việc";
  els.extendMinutes.value = 15;
  els.newExtendReason.value = "";
  renderExtendReasonOptions();
  els.extendTimeModal.classList.remove("hidden");
}

function closeExtendTimeModal() {
  state.extendTimeTaskId = null;
  els.extendTimeModal?.classList.add("hidden");
}

$$("[data-close-extend-modal]").forEach((button) => {
  button.addEventListener("click", closeExtendTimeModal);
});

els.addExtendReasonBtn?.addEventListener("click", async () => {
  if (state.profile?.role !== "admin") return;

  const name = els.newExtendReason.value.trim();

  if (!name) {
    toast("Vui lòng nhập mục đích thêm giờ.", "error");
    return;
  }

  const existing = getAllTimeExtensionReasons().some((reason) => reason.toLowerCase() === name.toLowerCase());

  if (existing) {
    els.extendReasonSelect.value = getAllTimeExtensionReasons().find((reason) => reason.toLowerCase() === name.toLowerCase()) || name;
    els.newExtendReason.value = "";
    toast("Mục đích này đã có trong danh sách.", "info");
    return;
  }

  setButtonLoading(els.addExtendReasonBtn, true, "Đang thêm...");

  try {
    const reasonRef = doc(collection(db, "timeExtensionReasons"));
    await setDoc(reasonRef, {
      id: reasonRef.id,
      name,
      active: true,
      createdByUid: state.user.uid,
      createdByName: state.profile.name || state.user.email,
      createdAt: serverTimestamp()
    });

    els.newExtendReason.value = "";
    renderExtendReasonOptions(name);
    els.extendReasonSelect.value = name;
    toast("Đã thêm mục đích thêm giờ vào danh sách.", "success");
  } catch (error) {
    console.error(error);
    toast("Không thêm được mục đích. Kiểm tra Firestore Rules timeExtensionReasons.", "error");
  } finally {
    setButtonLoading(els.addExtendReasonBtn, false);
  }
});

els.extendReasonList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-extend-reason-id]");

  if (!button || state.profile?.role !== "admin") return;

  const reasonId = button.dataset.deleteExtendReasonId;
  const reasonName = button.dataset.deleteExtendReasonName || "mục đích này";

  if (!reasonId) return;

  const confirmed = confirm(`Bạn có chắc muốn xoá mục đích thêm giờ “${reasonName}” không?`);

  if (!confirmed) return;

  setButtonLoading(button, true, "Đang xoá...");

  try {
    await deleteDoc(doc(db, "timeExtensionReasons", reasonId));

    if (els.extendReasonSelect.value === reasonName) {
      els.extendReasonSelect.value = "";
    }

    toast(`Đã xoá mục đích thêm giờ “${reasonName}”.`, "success");
  } catch (error) {
    console.error(error);
    toast("Không xoá được mục đích thêm giờ. Kiểm tra Firestore Rules timeExtensionReasons.", "error");
  } finally {
    setButtonLoading(button, false);
  }
});

async function ensureCustomTimeExtensionReason(name) {
  const cleanName = String(name || "").trim();

  if (!cleanName || state.profile?.role !== "admin") return;

  const existed = (state.timeExtensionReasons || []).some((reason) =>
    String(reason.name || "").trim().toLowerCase() === cleanName.toLowerCase()
  );

  if (existed) return;

  const reasonRef = doc(collection(db, "timeExtensionReasons"));

  await setDoc(reasonRef, {
    id: reasonRef.id,
    name: cleanName,
    active: true,
    createdByUid: state.user.uid,
    createdByName: state.profile.name || state.user.email,
    createdAt: serverTimestamp()
  });
}

async function shiftFollowingTasksAfterExtension(baseTask, addedMinutes) {
  if (!baseTask?.workOrderId || !baseTask.assignedToUid || addedMinutes <= 0) return 0;

  const relatedTasks = state.tasks
    .map((task) => task.id === baseTask.id ? { ...task, ...baseTask } : task)
    .filter((task) => (
      task.id !== baseTask.id &&
      task.status !== "draft" &&
      task.workOrderId === baseTask.workOrderId &&
      task.assignedToUid === baseTask.assignedToUid
    ))
    .slice()
    .sort(compareTasksForSequentialSchedule);

  const baseSequenceIndex = getFallbackSequenceIndex(baseTask, [baseTask, ...relatedTasks]);
  const affectedTasks = relatedTasks.filter((task) => (
    getFallbackSequenceIndex(task, [baseTask, ...relatedTasks]) > baseSequenceIndex
  ));

  if (!affectedTasks.length) return 0;

  const batch = writeBatch(db);
  const shiftMs = addedMinutes * 60 * 1000;
  const now = Date.now();

  affectedTasks.forEach((task) => {
    const currentStart = getTaskScheduledStartDate(task);
    const currentDeadline = getTaskDeadlineDate(task);

    if (!currentStart || !currentDeadline) return;

    const newStart = new Date(currentStart.getTime() + shiftMs);
    const newDeadline = new Date(currentDeadline.getTime() + shiftMs);
    const updates = {
      scheduledStartAt: Timestamp.fromDate(newStart),
      deadlineAt: Timestamp.fromDate(newDeadline),
      sequenceIndex: getFallbackSequenceIndex(task, [baseTask, ...relatedTasks])
    };

    if (task.status === "overdue" && newDeadline.getTime() > now) {
      updates.status = "doing";
    }

    batch.update(doc(db, "tasks", task.id), updates);
  });

  await batch.commit();
  return affectedTasks.length;
}

els.extendTimeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (state.profile?.role !== "admin") return;

  const taskId = state.extendTimeTaskId;
  const minutes = Number(els.extendMinutes.value || 0);
  const typedReason = els.newExtendReason.value.trim();
  const selectedReason = els.extendReasonSelect.value;
  const reason = selectedReason || typedReason;

  if (!taskId) {
    toast("Không xác định được công việc cần thêm giờ.", "error");
    return;
  }

  if (!Number.isFinite(minutes) || minutes <= 0) {
    toast("Số phút thêm phải lớn hơn 0.", "error");
    return;
  }

  if (!reason) {
    toast("Vui lòng chọn hoặc nhập mục đích thêm giờ. Nếu chưa có mục đích, Admin có thể tự tạo trong ô bên trên.", "error");
    return;
  }

  setButtonLoading(els.confirmExtendTimeBtn, true, "Đang cộng giờ...");

  try {
    // Nếu Admin nhập mục đích mới rồi bấm OK, tự lưu mục đích đó vào danh sách để lần sau chọn lại được.
    await ensureCustomTimeExtensionReason(reason);
    const taskRef = doc(db, "tasks", taskId);
    let updatedTask = null;

    await runTransaction(db, async (transaction) => {
      const taskSnap = await transaction.get(taskRef);

      if (!taskSnap.exists()) {
        throw new Error("Không tìm thấy công việc.");
      }

      const task = { id: taskSnap.id, ...taskSnap.data() };

      if (!canAdminExtendTaskTime(task, "admin")) {
        throw new Error("Chỉ thêm giờ cho công việc đang làm, yêu cầu làm lại hoặc quá hạn.");
      }

      const oldDeadlineMinutes = Number(task.deadlineMinutes || 0);
      const oldScheduledStartDate = getTaskScheduledStartDate(task) || new Date();
      const oldDeadlineDate = getTaskDeadlineDate(task) || new Date(oldScheduledStartDate.getTime() + oldDeadlineMinutes * 60 * 1000);
      const newDeadlineMinutes = oldDeadlineMinutes + minutes;
      const newDeadlineDate = new Date(oldDeadlineDate.getTime() + minutes * 60 * 1000);
      const normalizedSequenceIndex = getFallbackSequenceIndex(task);
      const now = new Date();
      const oldExtensions = Array.isArray(task.timeExtensions) ? task.timeExtensions : [];
      const extensionRecord = {
        minutes,
        reason,
        addedByUid: state.user.uid,
        addedByName: state.profile.name || state.user.email || "Admin",
        addedAt: Timestamp.fromDate(now)
      };
      const newStatus = task.status === "overdue" && newDeadlineDate.getTime() > now.getTime()
        ? "doing"
        : task.status;

      transaction.update(taskRef, {
        scheduledStartAt: Timestamp.fromDate(oldScheduledStartDate),
        sequenceIndex: normalizedSequenceIndex,
        deadlineMinutes: newDeadlineMinutes,
        deadlineAt: Timestamp.fromDate(newDeadlineDate),
        status: newStatus,
        timeExtensionCount: oldExtensions.length + 1,
        timeExtensionTotalMinutes: Number(task.timeExtensionTotalMinutes || 0) + minutes,
        timeExtensions: [...oldExtensions, extensionRecord],
        lastTimeExtendedAt: Timestamp.fromDate(now),
        lastTimeExtendedByUid: state.user.uid,
        lastTimeExtendedByName: state.profile.name || state.user.email || "Admin"
      });

      updatedTask = {
        ...task,
        scheduledStartAt: Timestamp.fromDate(oldScheduledStartDate),
        sequenceIndex: normalizedSequenceIndex,
        deadlineMinutes: newDeadlineMinutes,
        deadlineAt: Timestamp.fromDate(newDeadlineDate),
        status: newStatus
      };
    });

    const shiftedCount = await shiftFollowingTasksAfterExtension(updatedTask, minutes);

    if (updatedTask?.assignedToUid) {
      await createNotifications([
        {
          recipientUid: updatedTask.assignedToUid,
          type: "task_time_extended",
          title: "Công việc được thêm giờ",
          message: `Admin đã thêm ${minutes} phút cho “${updatedTask.title}”. Mục đích: ${reason}.`,
          taskId,
          taskTitle: updatedTask.title
        },
        {
          recipientUid: state.user.uid,
          type: "task_time_extended_admin",
          title: "Đã thêm giờ công việc",
          message: `Bạn đã thêm ${minutes} phút cho “${updatedTask.title}”. Mục đích: ${reason}.`,
          taskId,
          taskTitle: updatedTask.title
        }
      ]);
    }

    closeExtendTimeModal();
    toast(
      shiftedCount
        ? `Đã cộng thêm ${minutes} phút và tự dời ${shiftedCount} công việc phía sau.`
        : `Đã cộng thêm ${minutes} phút vào công việc.`,
      "success"
    );
  } catch (error) {
    console.error(error);
    toast(error.message || "Không thêm giờ được cho công việc.", "error");
  } finally {
    setButtonLoading(els.confirmExtendTimeBtn, false);
  }
});

async function submitTask(taskId, button) {
  setButtonLoading(button, true, "Đang gửi...");

  try {
    const task = state.tasks.find((item) => item.id === taskId);

    if (!task || task.assignedToUid !== state.user.uid) {
      throw new Error("Bạn không có quyền hoàn thành công việc này.");
    }

    if (!hasTaskStarted(task)) {
      throw new Error("Công việc này chưa tới giờ bắt đầu, chưa thể báo hoàn thành.");
    }

    await updateDoc(doc(db, "tasks", taskId), {
      status: "submitted",
      submittedAt: serverTimestamp()
    });

    await createNotifications([
      {
        recipientUid: task.assignedByUid,
        type: "task_submitted",
        title: "Nhân viên báo hoàn thành",
        message: `${state.profile.name || "Nhân viên"} đã báo hoàn thành: ${task.title}. Vui lòng kiểm tra và xác nhận.`,
        taskId,
        taskTitle: task.title
      }
    ]);

    toast("Đã gửi báo hoàn thành. Vui lòng chờ Admin xác nhận.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không gửi được trạng thái hoàn thành.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function approveTask(taskId, button) {
  setButtonLoading(button, true, "Đang xác nhận...");

  try {
    const taskSnap = await getDoc(doc(db, "tasks", taskId));

    if (!taskSnap.exists()) {
      throw new Error("Không tìm thấy công việc.");
    }

    const task = {
      id: taskSnap.id,
      ...taskSnap.data()
    };

    if (task.status !== "submitted") {
      throw new Error("Công việc chưa ở trạng thái chờ xác nhận.");
    }

    const result = calculateResult(task);

    await updateDoc(doc(db, "tasks", taskId), {
      status: "completed",
      approvedAt: serverTimestamp(),
      actualMinutes: result.actualMinutes,
      resultType: result.resultType,
      differenceMinutes: result.differenceMinutes,
      differencePercent: result.differencePercent
    });

    const resultText = taskResultShortText(result);

    await createNotifications([
      {
        recipientUid: task.assignedToUid,
        type: "task_approved",
        title: "Công việc đã được Admin xác nhận",
        message: `Công việc “${task.title}” đã hoàn thành. Kết quả: ${resultText}.`,
        taskId,
        taskTitle: task.title
      },
      {
        recipientUid: state.user.uid,
        type: "task_approved_admin",
        title: "Đã xác nhận hoàn thành",
        message: `Bạn đã xác nhận “${task.title}” của ${task.assignedToName}. Kết quả: ${resultText}.`,
        taskId,
        taskTitle: task.title
      }
    ]);

    toast("Đã xác nhận hoàn thành, tính kết quả và gửi thông báo.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không xác nhận được công việc.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function taskResultShortText(result) {
  if (result.resultType === "faster") return `nhanh hơn ${result.differenceMinutes} phút (${result.differencePercent}%)`;
  if (result.resultType === "slower") return `chậm hơn ${result.differenceMinutes} phút (${result.differencePercent}%)`;
  return "đúng thời gian";
}

async function requestRedo(taskId, button) {
  setButtonLoading(button, true, "Đang cập nhật...");

  try {
    const task = state.tasks.find((item) => item.id === taskId);

    await updateDoc(doc(db, "tasks", taskId), {
      status: "redo",
      submittedAt: null
    });

    if (task) {
      await createNotifications([
        {
          recipientUid: task.assignedToUid,
          type: "task_redo",
          title: "Admin yêu cầu làm lại",
          message: `Công việc “${task.title}” cần làm lại. Vui lòng kiểm tra lại yêu cầu.`,
          taskId,
          taskTitle: task.title
        }
      ]);
    }

    toast("Đã yêu cầu nhân viên làm lại.", "success");
  } catch (error) {
    console.error(error);
    toast("Không cập nhật được yêu cầu làm lại.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function calculateResult(task) {
  const scheduledStartAt = getTaskScheduledStartDate(task);
  const submittedAt = timestampToDate(task.submittedAt);

  if (!scheduledStartAt || !submittedAt) {
    throw new Error("Thiếu thời gian bắt đầu theo lịch hoặc thời gian nhân viên báo hoàn thành.");
  }

  const actualMinutes = Math.max(
    0,
    Math.ceil((submittedAt.getTime() - scheduledStartAt.getTime()) / 60000)
  );

  const deadlineMinutes = Number(task.deadlineMinutes || 0);

  if (deadlineMinutes <= 0) {
    throw new Error("Thời gian quy định không hợp lệ.");
  }

  const differenceMinutes = Math.abs(deadlineMinutes - actualMinutes);
  const differencePercent = Number(((differenceMinutes / deadlineMinutes) * 100).toFixed(1));

  let resultType = "on_time";

  if (actualMinutes < deadlineMinutes) resultType = "faster";
  if (actualMinutes > deadlineMinutes) resultType = "slower";

  return {
    actualMinutes,
    resultType,
    differenceMinutes,
    differencePercent
  };
}

// Cập nhật đồng hồ đếm ngược mỗi giây mà không cần đọc lại database.
setInterval(updateCountdowns, 1000);

function updateCardStatusPill(card, displayStatus) {
  const pill = card.querySelector("[data-status-pill]");
  if (!pill) return;

  pill.className = `status-pill status-${displayStatus}`;
  pill.textContent = statusLabel(displayStatus);
}

function updateCountdowns() {
  $$("[data-task-card]").forEach((card) => {
    const rawStatus = card.dataset.rawStatus;
    const countdown = card.querySelector("[data-countdown]");

    if (!countdown) return;

    if (rawStatus === "draft") {
      countdown.textContent = "Chưa giao việc";
      updateCardStatusPill(card, "draft");
      return;
    }

    if (rawStatus === "completed") {
      countdown.textContent = "Đã hoàn thành";
      updateCardStatusPill(card, "completed");
      return;
    }

    if (rawStatus === "submitted") {
      countdown.textContent = "Chờ Admin xác nhận";
      updateCardStatusPill(card, "submitted");
      return;
    }

    const now = Date.now();
    const scheduledStartMs = Number(card.dataset.scheduledStartMs || 0);
    const deadlineMs = Number(card.dataset.deadlineMs || 0);

    card.classList.remove("is-waiting", "is-overdue", "is-near-due");

    if (scheduledStartMs && now < scheduledStartMs) {
      countdown.textContent = `Bắt đầu sau ${formatCountdown(scheduledStartMs - now)}`;
      card.classList.add("is-waiting");
      updateCardStatusPill(card, "waiting");
      return;
    }

    if (!deadlineMs) {
      countdown.textContent = "--";
      return;
    }

    const remainingMs = deadlineMs - now;

    countdown.textContent = remainingMs >= 0
      ? `Còn ${formatCountdown(remainingMs)}`
      : `Quá hạn ${formatCountdown(remainingMs)}`;

    const displayStatus = remainingMs <= 0
      ? "overdue"
      : rawStatus === "redo"
        ? "redo"
        : "doing";

    updateCardStatusPill(card, displayStatus);
    card.classList.toggle("is-overdue", remainingMs <= 0 && rawStatus !== "completed");

    const deadlineMinutes = Number(card.dataset.deadlineMinutes || 0);
    const nearThreshold = Math.min(
      15 * 60 * 1000,
      Math.max(1, deadlineMinutes) * 60 * 1000 * 0.2
    );

    const isNearDue = remainingMs > 0 && remainingMs <= nearThreshold;

    card.classList.toggle("is-near-due", isNearDue);

    if (isNearDue && rawStatus !== "redo") {
      updateCardStatusPill(card, "near_due");
    }
  });
}

function getFriendlyFirebaseError(error) {
  const code = error?.code || "";

  const messages = {
    "auth/email-already-in-use": "Email này đã được dùng cho tài khoản khác.",
    "auth/invalid-email": "Email không hợp lệ.",
    "auth/weak-password": "Mật khẩu quá yếu, cần ít nhất 6 ký tự.",
    "permission-denied": "Bạn không có quyền ghi dữ liệu. Kiểm tra Firestore Rules."
  };

  return messages[code] || error.message || "Có lỗi xảy ra.";
}
