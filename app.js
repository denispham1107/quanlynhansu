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
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  writeBatch,
  runTransaction,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// =========================
// Firebase init
// =========================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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
  workTemplates: [],
  hotelDailyReports: [],
  notifications: [],
  knownNotificationIds: new Set(),
  notificationsReady: false,
  unsubs: [],
  editingWorkOrderId: null,
  editingWorkTemplateId: null,
  adminStatusFilter: "all",
  adminCompletedTypeFilter: "all",
  adminEmployeeFilter: "all",
  adminHotelReportHygiene: "pending",
  adminHotelEndPetCount: "",
  adminHotelReportDrafts: {},
  employeeStatusFilter: "all",
  employeeCompletedTypeFilter: "all",
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
  extendTimeTaskId: null,
  reassignTaskId: null,
  photoReportTaskId: null
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
  floatingCreateTaskBtn: $("#floatingCreateTaskBtn"),
  openWorkTemplatePageBtn: $("#openWorkTemplatePageBtn"),
  openEmployeeManagerPageBtn: $("#openEmployeeManagerPageBtn"),
  exportDataBtn: $("#exportDataBtn"),
  importDataBtn: $("#importDataBtn"),
  importDataInput: $("#importDataInput"),
  employeeManagerView: $("#employeeManagerView"),
  backToAdminFromEmployeesBtn: $("#backToAdminFromEmployeesBtn"),
  workTemplateView: $("#workTemplateView"),
  backToAdminBtn: $("#backToAdminBtn"),
  openWorkTemplateModalBtn: $("#openWorkTemplateModalBtn"),
  workTemplateModal: $("#workTemplateModal"),
  workTemplateForm: $("#workTemplateForm"),
  workTemplateModalTitle: $("#workTemplateModalTitle"),
  workTemplateName: $("#workTemplateName"),
  workTemplateHours: $("#workTemplateHours"),
  workTemplateMinutes: $("#workTemplateMinutes"),
  saveWorkTemplateBtn: $("#saveWorkTemplateBtn"),
  deleteWorkTemplateBtn: $("#deleteWorkTemplateBtn"),
  workTemplateSearch: $("#workTemplateSearch"),
  clearWorkTemplateSearchBtn: $("#clearWorkTemplateSearchBtn"),
  workTemplateList: $("#workTemplateList"),
  workTemplateOptions: $("#workTemplateOptions"),
  taskModal: $("#taskModal"),
  createTaskForm: $("#createTaskForm"),
  workOrderName: $("#workOrderName"),
  addTaskRowBtn: $("#addTaskRowBtn"),
  taskRowsContainer: $("#taskRowsContainer"),
  saveDraftBtn: $("#saveDraftBtn"),
  deleteAllWorkOrdersBtn: $("#deleteAllWorkOrdersBtn"),
  adminEmployeeFilter: $("#adminEmployeeFilter"),
  adminStatusFilter: $("#adminStatusFilter"),
  adminCompletedTypeFilter: $("#adminCompletedTypeFilter"),
  adminCompletedTypeReport: $("#adminCompletedTypeReport"),
  adminDateMode: $("#adminDateMode"),
  adminSingleDate: $("#adminSingleDate"),
  adminDateFrom: $("#adminDateFrom"),
  adminDateTo: $("#adminDateTo"),
  adminClearDateFilter: $("#adminClearDateFilter"),
  adminDateSummary: $("#adminDateSummary"),
  adminEmployeeStatusSummary: $("#adminEmployeeStatusSummary"),
  adminTaskList: $("#adminTaskList"),
  employeeStatusFilter: $("#employeeStatusFilter"),
  employeeCompletedTypeFilter: $("#employeeCompletedTypeFilter"),
  employeeCompletedTypeReport: $("#employeeCompletedTypeReport"),
  employeeDateMode: $("#employeeDateMode"),
  employeeSingleDate: $("#employeeSingleDate"),
  employeeDateFrom: $("#employeeDateFrom"),
  employeeDateTo: $("#employeeDateTo"),
  employeeClearDateFilter: $("#employeeClearDateFilter"),
  employeeDateSummary: $("#employeeDateSummary"),
  employeeTaskList: $("#employeeTaskList"),
  statDraft: $("#statDraft"),
  statDoing: $("#statDoing"),
  statHotel: $("#statHotel"),
  statCompleted: $("#statCompleted"),
  enableNotificationsBtn: $("#enableNotificationsBtn"),
  notificationBellBtn: $("#notificationBellBtn"),
  notificationPanel: $("#notificationPanel"),
  notificationList: $("#notificationList"),
  notificationBadge: $("#notificationBadge"),
  markAllNotificationsReadBtn: $("#markAllNotificationsReadBtn"),
  deleteAllNotificationsBtn: $("#deleteAllNotificationsBtn"),
  extendTimeModal: $("#extendTimeModal"),
  extendTimeForm: $("#extendTimeForm"),
  extendTimeTaskTitle: $("#extendTimeTaskTitle"),
  extendMinutes: $("#extendMinutes"),
  extendReasonSelect: $("#extendReasonSelect"),
  newExtendReason: $("#newExtendReason"),
  addExtendReasonBtn: $("#addExtendReasonBtn"),
  extendReasonList: $("#extendReasonList"),
  confirmExtendTimeBtn: $("#confirmExtendTimeBtn"),
  reassignEmployeeModal: $("#reassignEmployeeModal"),
  reassignEmployeeForm: $("#reassignEmployeeForm"),
  reassignTaskTitle: $("#reassignTaskTitle"),
  reassignCurrentEmployee: $("#reassignCurrentEmployee"),
  reassignEmployeeSelect: $("#reassignEmployeeSelect"),
  confirmReassignEmployeeBtn: $("#confirmReassignEmployeeBtn"),
  photoRequiredCheckbox: $("#photoRequiredCheckbox"),
  requiredPhotoCount: $("#requiredPhotoCount"),
  photoReportModal: $("#photoReportModal"),
  photoReportTaskTitle: $("#photoReportTaskTitle"),
  photoReportSummary: $("#photoReportSummary"),
  photoReportGrid: $("#photoReportGrid")
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

function formatFullDateTime(value) {
  const date = timestampToDate(value);
  if (!date) return "--";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatFileSize(bytes = 0) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function makeId(prefix = "id") {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeStorageFileName(fileName = "image") {
  const name = String(fileName)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return name || "image";
}

function getTaskPhotos(task) {
  return Array.isArray(task?.photos) ? task.photos.filter((item) => item?.url) : [];
}

function getTaskPhotoCount(task) {
  const count = Number(task?.photoCount ?? getTaskPhotos(task).length ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function taskRequiresPhotos(task) {
  return Boolean(task?.photoRequired);
}

function getTaskRequiredPhotoCount(task) {
  if (!taskRequiresPhotos(task)) return 0;
  const count = Number(task?.requiredPhotoCount || 0);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function hasEnoughRequiredPhotos(task) {
  if (!taskRequiresPhotos(task)) return true;
  return getTaskPhotoCount(task) >= getTaskRequiredPhotoCount(task);
}

const LUNCH_BREAK_MAX_MINUTES_PER_DAY = 30;

function isLunchBreakTask(task) {
  return Boolean(task?.isLunchBreak);
}

function isHotelTask(task) {
  return Boolean(task?.isHotel);
}

function isActiveLunchBreakTask(task) {
  return isLunchBreakTask(task)
    && Boolean(task?.assignedToUid)
    && !["draft", "waiting_assignee", "submitted", "completed"].includes(task.status);
}

function employeeHasActiveLunchBreak(employeeUid, ignoredTaskId = "") {
  if (!employeeUid) return false;

  return state.tasks.some((task) => (
    task.id !== ignoredTaskId
    && task.assignedToUid === employeeUid
    && isActiveLunchBreakTask(task)
  ));
}

function validateLunchBreakBasicRows(rows) {
  const invalidRow = rows.find((row) => row.isLunchBreak && Number(row.deadlineMinutes || 0) > LUNCH_BREAK_MAX_MINUTES_PER_DAY);
  if (invalidRow) {
    return `Công việc #${invalidRow.index + 1}: phiếu Nghỉ trưa không được lớn hơn ${LUNCH_BREAK_MAX_MINUTES_PER_DAY} phút.`;
  }

  const zeroRow = rows.find((row) => row.isLunchBreak && Number(row.deadlineMinutes || 0) <= 0);
  if (zeroRow) {
    return `Công việc #${zeroRow.index + 1}: thời gian Nghỉ trưa phải lớn hơn 0 phút.`;
  }

  return null;
}

function validateLunchBreakRowsForDispatch(rows) {
  const basicError = validateLunchBreakBasicRows(rows);
  if (basicError) return basicError;

  const plannedActiveKeys = new Set();

  for (const row of rows) {
    if (!row.isLunchBreak || !row.assignedToUid) continue;

    const employeeName = row.assignedEmployee?.name || row.assignedEmployee?.email || "nhân viên này";
    const activeKey = row.assignedToUid;
    const ignoredTaskId = row.taskId || "";

    if (plannedActiveKeys.has(activeKey)) {
      return `${employeeName} đã có 1 phiếu Nghỉ trưa trong chính lượt giao này. Mỗi nhân viên chỉ được có 1 phiếu Nghỉ trưa đang chạy.`;
    }

    if (employeeHasActiveLunchBreak(row.assignedToUid, ignoredTaskId)) {
      return `${employeeName} đang có phiếu Nghỉ trưa chưa báo hoàn thành. Chỉ tạo phiếu nghỉ trưa mới sau khi nhân viên đã bấm Hoàn thành.`;
    }

    plannedActiveKeys.add(activeKey);
  }

  return null;
}

function validateLunchBreakAssignment(task, employeeUid) {
  if (!isLunchBreakTask(task) || !employeeUid) return null;

  const employee = state.employees.find((item) => item.uid === employeeUid);
  const employeeName = employee?.name || employee?.email || "Nhân viên này";
  const deadlineMinutes = Number(task.deadlineMinutes || 0);

  if (deadlineMinutes <= 0 || deadlineMinutes > LUNCH_BREAK_MAX_MINUTES_PER_DAY) {
    return `Phiếu Nghỉ trưa chỉ được từ 1 đến ${LUNCH_BREAK_MAX_MINUTES_PER_DAY} phút.`;
  }

  if (employeeHasActiveLunchBreak(employeeUid, task.id)) {
    return `${employeeName} đang có phiếu Nghỉ trưa chưa báo hoàn thành. Chỉ chọn lại nhân viên sau khi phiếu Nghỉ trưa trước đã báo hoàn thành.`;
  }

  return null;
}

function getActiveTaskStatusFromFlags(value = {}) {
  if (value.isLunchBreak) return "lunch_break";
  if (value.isHotel) return "hotel";
  return "doing";
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
    waiting_assignee: "Chờ chọn người",
    queued: "Đang chờ đến lượt",
    lunch_break: "Nghỉ trưa",
    hotel: "Hotel",
    doing: "Đang làm",
    near_due: "Gần hết giờ",
    overdue: "Quá hạn",
    submitted: "Chờ Admin xác nhận",
    completed: "Đã hoàn thành",
    redo: "Yêu cầu làm lại"
  };

  return labels[status] || status;
}

function getDisplayStatus(task) {
  if (task.status === "draft") return "draft";
  if (task.status === "waiting_assignee" || !task.assignedToUid) return "waiting_assignee";
  if (task.status === "completed") return "completed";
  if (task.status === "submitted") return "submitted";
  if (task.status === "lunch_break" || (task.isLunchBreak && task.status === "doing")) return "lunch_break";
  if (task.status === "hotel" || (task.isHotel && task.status === "doing")) return "hotel";

  // Công việc đã giao nhưng nhân viên chưa tới lượt (vẫn còn đang trong thời gian
  // quy định của (các) công việc được giao trước đó cho chính người này).
  const queueStart = timestampToDate(task.queueStartAt);
  if (queueStart && Date.now() < queueStart.getTime()) return "queued";

  if (task.status === "redo") {
    const deadline = timestampToDate(task.deadlineAt);
    if (deadline && Date.now() > deadline.getTime()) return "overdue";
    return "redo";
  }

  if (task.status === "overdue") return "overdue";

  const deadline = timestampToDate(task.deadlineAt);
  if (!deadline) return task.status || "doing";

  const remainingMs = deadline.getTime() - Date.now();

  if (remainingMs <= 0) return "overdue";

  const totalMs = Math.max(1, Number(task.deadlineMinutes || 1) * 60 * 1000);
  const nearThreshold = Math.min(15 * 60 * 1000, totalMs * 0.2);

  if (remainingMs <= nearThreshold) return "near_due";

  return "doing";
}

function taskCardClass(displayStatus) {
  return {
    draft: "is-draft",
    waiting_assignee: "is-waiting-assignee",
    queued: "is-queued",
    lunch_break: "is-lunch-break",
    hotel: "is-hotel",
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
els.deleteAllNotificationsBtn?.addEventListener("click", deleteAllNotifications);

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
      <article
        class="notification-item ${item.readAt ? "" : "unread"}"
        data-action="open-notification-target"
        data-notification-id="${escapeHtml(item.id)}"
        role="button"
        tabindex="0"
        title="Bấm để mở vị trí liên quan đến thông báo này"
      >
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

async function deleteAllNotifications() {
  if (!state.notifications.length) {
    toast("Không có thông báo nào để xoá.", "info");
    return;
  }

  if (!window.confirm(`Xoá toàn bộ ${state.notifications.length} thông báo đang hiển thị trong tài khoản này?`)) {
    return;
  }

  setButtonLoading(els.deleteAllNotificationsBtn, true, "Đang xoá...");

  try {
    const ids = state.notifications.map((item) => item.id).filter(Boolean);

    for (let i = 0; i < ids.length; i += 450) {
      const batch = writeBatch(db);
      ids.slice(i, i + 450).forEach((id) => {
        batch.delete(doc(db, "notifications", id));
      });
      await batch.commit();
    }

    toast("Đã xoá toàn bộ thông báo.", "success");
  } catch (error) {
    console.error(error);
    toast("Không xoá được thông báo. Kiểm tra Firestore Rules notifications.", "error");
  } finally {
    setButtonLoading(els.deleteAllNotificationsBtn, false);
  }
}

function getSafeSelectorValue(value) {
  if (window.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function syncSelectValue(element, value) {
  if (element) element.value = value;
}

function showTaskInCurrentDashboard(task) {
  const taskDate = getTaskDateValue(task);

  if (state.profile?.role === "admin") {
    backToAdminDashboard();

    state.adminStatusFilter = "all";
    state.adminCompletedTypeFilter = "all";
    state.adminEmployeeFilter = "all";
    state.adminDateFilter = {
      mode: taskDate ? "single" : "all",
      single: taskDate || "",
      from: "",
      to: ""
    };

    syncSelectValue(els.adminStatusFilter, state.adminStatusFilter);
    syncSelectValue(els.adminCompletedTypeFilter, state.adminCompletedTypeFilter);
    syncSelectValue(els.adminEmployeeFilter, state.adminEmployeeFilter);
    syncSelectValue(els.adminDateMode, state.adminDateFilter.mode);
    syncSelectValue(els.adminSingleDate, state.adminDateFilter.single);
    syncSelectValue(els.adminDateFrom, "");
    syncSelectValue(els.adminDateTo, "");

    renderAdminTasks();
    return;
  }

  state.employeeStatusFilter = "all";
  state.employeeCompletedTypeFilter = "all";
  state.employeeDateFilter = {
    mode: taskDate ? "single" : "all",
    single: taskDate || "",
    from: "",
    to: ""
  };

  syncSelectValue(els.employeeStatusFilter, state.employeeStatusFilter);
  syncSelectValue(els.employeeCompletedTypeFilter, state.employeeCompletedTypeFilter);
  syncSelectValue(els.employeeDateMode, state.employeeDateFilter.mode);
  syncSelectValue(els.employeeSingleDate, state.employeeDateFilter.single);
  syncSelectValue(els.employeeDateFrom, "");
  syncSelectValue(els.employeeDateTo, "");

  renderEmployeeTasks();
}

function scrollToTaskCard(taskId) {
  const selector = `[data-task-card][data-task-id="${getSafeSelectorValue(taskId)}"]`;
  const target = document.querySelector(selector);

  if (!target) return false;

  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  target.classList.add("notification-jump-highlight");

  window.setTimeout(() => {
    target.classList.remove("notification-jump-highlight");
  }, 2200);

  return true;
}

async function openNotificationTarget(notificationId) {
  const notification = state.notifications.find((item) => item.id === notificationId);
  if (!notification) return;

  if (!notification.readAt) {
    markNotificationRead(notificationId);
  }

  els.notificationPanel?.classList.add("hidden");

  if (!notification.taskId) {
    toast("Thông báo này chưa có vị trí công việc để mở.", "info");
    return;
  }

  const task = state.tasks.find((item) => item.id === notification.taskId);

  if (!task) {
    toast("Không tìm thấy công việc liên quan. Công việc có thể đã bị xoá hoặc chưa tải xong.", "error");
    return;
  }

  showTaskInCurrentDashboard(task);

  window.setTimeout(() => {
    if (!scrollToTaskCard(notification.taskId)) {
      toast("Đã mở đúng bộ lọc nhưng chưa tìm thấy thẻ công việc trên màn hình.", "info");
    }
  }, 180);
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
  state.workOrders = [];
  state.timeExtensionReasons = [];
  state.workTemplates = [];
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
  els.workTemplateView?.classList.add("hidden");
  els.employeeManagerView?.classList.add("hidden");
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
  els.workTemplateView?.classList.add("hidden");
  els.employeeManagerView?.classList.add("hidden");
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
      renderAdminTasks();
    },
    handleSnapshotError
  );

  const tasksQuery = query(collection(db, "tasks"), orderBy("createdAt", "desc"));

  const unsubTasks = onSnapshot(
    tasksQuery,
    async (snapshot) => {
      state.tasks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAdminTasks();

      // Admin mở dashboard thì hệ thống tự đánh dấu quá hạn để trạng thái được lưu vào database.
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

  const templatesQuery = query(collection(db, "workTemplates"), orderBy("createdAt", "desc"));

  const unsubWorkTemplates = onSnapshot(
    templatesQuery,
    (snapshot) => {
      state.workTemplates = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderWorkTemplateList();
      renderWorkTemplateOptions();
    },
    (error) => {
      console.error(error);
      toast("Không đọc được Danh sách công việc. Cần cập nhật Firestore Rules cho collection workTemplates.", "error");
    }
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

  const unsubHotelDailyReports = onSnapshot(
    collection(db, "hotelDailyReports"),
    (snapshot) => {
      state.hotelDailyReports = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAdminTasks();
    },
    (error) => {
      console.error(error);
      toast("Không đọc được báo cáo Hotel hằng ngày. Cần cập nhật Firestore Rules hotelDailyReports.", "error");
    }
  );

  state.unsubs.push(unsubUsers, unsubTasks, unsubWorkOrders, unsubWorkTemplates, unsubTimeExtensionReasons, unsubHotelDailyReports);
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

// =========================
// Danh sách công việc mẫu
// =========================
function normalizeSearchText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a = "", b = "") {
  const first = normalizeSearchText(a);
  const second = normalizeSearchText(b);

  if (first === second) return 0;
  if (!first.length) return second.length;
  if (!second.length) return first.length;

  const dp = Array.from({ length: first.length + 1 }, () => []);

  for (let i = 0; i <= first.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= second.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= first.length; i += 1) {
    for (let j = 1; j <= second.length; j += 1) {
      const cost = first[i - 1] === second[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[first.length][second.length];
}

function isWorkTemplateMatch(template, queryText) {
  const queryValue = normalizeSearchText(queryText);
  if (!queryValue) return true;

  const nameValue = normalizeSearchText(template.name || "");
  if (!nameValue) return false;
  if (nameValue.includes(queryValue) || queryValue.includes(nameValue)) return true;

  const queryWords = queryValue.split(" ").filter(Boolean);
  const nameWords = nameValue.split(" ").filter(Boolean);

  if (queryWords.every((word) => nameValue.includes(word))) return true;

  return queryWords.some((queryWord) => (
    nameWords.some((nameWord) => {
      const limit = queryWord.length <= 4 ? 1 : 2;
      return levenshteinDistance(queryWord, nameWord) <= limit;
    })
  ));
}

function getFilteredWorkTemplates() {
  const queryText = els.workTemplateSearch?.value || "";
  return state.workTemplates.filter((template) => isWorkTemplateMatch(template, queryText));
}

function renderWorkTemplateOptions() {
  if (!els.workTemplateOptions) return;

  els.workTemplateOptions.innerHTML = state.workTemplates
    .map((template) => `<option value="${escapeHtml(template.name || "")}"></option>`)
    .join("");
}

function renderWorkTemplateList() {
  if (!els.workTemplateList) return;

  if (!state.workTemplates.length) {
    els.workTemplateList.innerHTML = "Chưa có công việc mẫu.";
    els.workTemplateList.classList.add("empty");
    return;
  }

  const filteredTemplates = getFilteredWorkTemplates();

  if (!filteredTemplates.length) {
    els.workTemplateList.innerHTML = "Không tìm thấy công việc phù hợp với nội dung đang nhập.";
    els.workTemplateList.classList.add("empty");
    return;
  }

  els.workTemplateList.classList.remove("empty");
  els.workTemplateList.innerHTML = filteredTemplates
    .map((template) => {
      const minutes = Number(template.deadlineMinutes || 0);
      const createdAt = template.createdAt ? formatFullDateTime(template.createdAt) : "--";

      return `
        <button class="work-template-item" type="button" data-edit-template-id="${escapeHtml(template.id)}" aria-label="Chỉnh sửa công việc ${escapeHtml(template.name || "Không tên")}">
          <div>
            <strong>${escapeHtml(template.name || "Không tên")}</strong>
            <span>Thời gian phải hoàn thành: ${escapeHtml(formatMinutes(minutes))}</span>
            <span>Tạo lúc: ${escapeHtml(createdAt)}${template.createdByName ? ` • ${escapeHtml(template.createdByName)}` : ""}</span>
            <span class="work-template-hint">Bấm vào dòng này để chỉnh sửa hoặc xoá</span>
          </div>
          <div class="work-template-duration">${escapeHtml(formatMinutes(minutes))}</div>
        </button>
      `;
    })
    .join("");
}

function openWorkTemplatePage() {
  if (state.profile?.role !== "admin") return;

  els.adminView.classList.add("hidden");
  els.employeeManagerView?.classList.add("hidden");
  els.workTemplateView?.classList.remove("hidden");
  renderWorkTemplateList();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openEmployeeManagerPage() {
  if (state.profile?.role !== "admin") return;

  els.adminView.classList.add("hidden");
  els.workTemplateView?.classList.add("hidden");
  els.employeeManagerView?.classList.remove("hidden");
  renderEmployees();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function backToAdminDashboard() {
  els.workTemplateView?.classList.add("hidden");
  els.employeeManagerView?.classList.add("hidden");
  els.adminView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openWorkTemplateModal(templateId = null) {
  if (state.profile?.role !== "admin") return;

  const template = templateId
    ? state.workTemplates.find((item) => item.id === templateId)
    : null;

  state.editingWorkTemplateId = template?.id || null;
  els.workTemplateForm?.reset();

  if (template) {
    const deadlineMinutes = Number(template.deadlineMinutes || 0);
    if (els.workTemplateModalTitle) els.workTemplateModalTitle.textContent = "Chỉnh sửa công việc mẫu";
    if (els.workTemplateName) els.workTemplateName.value = template.name || "";
    if (els.workTemplateHours) els.workTemplateHours.value = Math.floor(deadlineMinutes / 60);
    if (els.workTemplateMinutes) els.workTemplateMinutes.value = deadlineMinutes % 60;
    if (els.saveWorkTemplateBtn) els.saveWorkTemplateBtn.textContent = "Lưu thay đổi";
    els.deleteWorkTemplateBtn?.classList.remove("hidden");
  } else {
    if (els.workTemplateModalTitle) els.workTemplateModalTitle.textContent = "+ Tạo công việc mẫu";
    if (els.workTemplateHours) els.workTemplateHours.value = 0;
    if (els.workTemplateMinutes) els.workTemplateMinutes.value = 30;
    if (els.saveWorkTemplateBtn) els.saveWorkTemplateBtn.textContent = "Lưu công việc";
    els.deleteWorkTemplateBtn?.classList.add("hidden");
  }

  els.workTemplateModal?.classList.remove("hidden");
  setTimeout(() => els.workTemplateName?.focus(), 50);
}

function closeWorkTemplateModal() {
  els.workTemplateModal?.classList.add("hidden");
  state.editingWorkTemplateId = null;
}

function findWorkTemplateByName(name) {
  const normalizedName = normalizeSearchText(name);
  if (!normalizedName) return null;

  return state.workTemplates.find((template) => normalizeSearchText(template.name || "") === normalizedName) || null;
}

function applyWorkTemplateToRow(row, template) {
  if (!row || !template) return;

  const deadlineMinutes = Number(template.deadlineMinutes || 0);
  if (deadlineMinutes <= 0) return;

  const hoursInput = row.querySelector(".row-hours");
  const minutesInput = row.querySelector(".row-minutes");

  if (hoursInput) hoursInput.value = Math.floor(deadlineMinutes / 60);
  if (minutesInput) minutesInput.value = deadlineMinutes % 60;
}

els.openWorkTemplatePageBtn?.addEventListener("click", openWorkTemplatePage);
els.openEmployeeManagerPageBtn?.addEventListener("click", openEmployeeManagerPage);
els.backToAdminBtn?.addEventListener("click", backToAdminDashboard);
els.backToAdminFromEmployeesBtn?.addEventListener("click", backToAdminDashboard);
els.openWorkTemplateModalBtn?.addEventListener("click", openWorkTemplateModal);
els.clearWorkTemplateSearchBtn?.addEventListener("click", () => {
  if (els.workTemplateSearch) els.workTemplateSearch.value = "";
  renderWorkTemplateList();
  els.workTemplateSearch?.focus();
});
els.workTemplateSearch?.addEventListener("input", renderWorkTemplateList);


// =========================
// Backup / Restore JSON
// =========================
const BACKUP_COLLECTIONS = [
  "users",
  "workOrders",
  "tasks",
  "workTemplates",
  "timeExtensionReasons",
  "notifications",
  "hotelDailyReports"
];

function encodeBackupValue(value) {
  if (value == null) return value;

  if (value instanceof Timestamp || (typeof value.toDate === "function" && Number.isFinite(value.seconds))) {
    return {
      __backupType: "timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds || 0
    };
  }

  if (Array.isArray(value)) return value.map(encodeBackupValue);

  if (typeof value === "object") {
    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      if (typeof item !== "undefined") output[key] = encodeBackupValue(item);
    });
    return output;
  }

  return value;
}

function decodeBackupValue(value) {
  if (value == null) return value;

  if (Array.isArray(value)) return value.map(decodeBackupValue);

  if (typeof value === "object") {
    const seconds = Number(value.seconds);
    const nanoseconds = Number(value.nanoseconds || 0);

    if (
      value.__backupType === "timestamp"
      && Number.isFinite(seconds)
      && Number.isFinite(nanoseconds)
    ) {
      return new Timestamp(seconds, nanoseconds);
    }

    // Hỗ trợ thêm định dạng Timestamp JSON mặc định của Firebase SDK nếu có.
    if (
      (value.type === "firestore/timestamp" || value.__type__ === "timestamp")
      && Number.isFinite(seconds)
      && Number.isFinite(nanoseconds)
    ) {
      return new Timestamp(seconds, nanoseconds);
    }

    const output = {};
    Object.entries(value).forEach(([key, item]) => {
      output[key] = decodeBackupValue(item);
    });
    return output;
  }

  return value;
}

function backupFileName() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `quanlynhansu-backup-${yyyy}-${mm}-${dd}-${hh}${mi}.json`;
}

function normalizeBackupCollection(collectionData) {
  if (!collectionData) return {};

  if (Array.isArray(collectionData)) {
    return collectionData.reduce((acc, item) => {
      if (item && typeof item.id === "string" && item.data && typeof item.data === "object") {
        acc[item.id] = item.data;
      }
      return acc;
    }, {});
  }

  if (typeof collectionData === "object") return collectionData;
  return {};
}

function countBackupDocuments(collections = {}) {
  return BACKUP_COLLECTIONS.reduce((total, collectionName) => {
    const collectionData = normalizeBackupCollection(collections[collectionName]);
    return total + Object.keys(collectionData).length;
  }, 0);
}

async function exportAllDataToJson() {
  if (state.profile?.role !== "admin") return;

  try {
    setButtonLoading(els.exportDataBtn, true, "Đang xuất...");

    const collections = {};

    for (const collectionName of BACKUP_COLLECTIONS) {
      const snapshot = await getDocs(collection(db, collectionName));
      collections[collectionName] = {};

      snapshot.forEach((docSnapshot) => {
        collections[collectionName][docSnapshot.id] = encodeBackupValue(docSnapshot.data());
      });
    }

    const backup = {
      app: "quanlynhansu",
      backupVersion: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: {
        uid: state.user?.uid || "",
        name: state.profile?.name || "",
        email: state.user?.email || ""
      },
      collections
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = backupFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    toast(`Đã xuất ${countBackupDocuments(collections)} document ra file JSON.`, "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không xuất được dữ liệu JSON.", "error");
  } finally {
    setButtonLoading(els.exportDataBtn, false);
  }
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Không đọc được file."));
    reader.readAsText(file, "utf-8");
  });
}

async function importBackupJsonFile(file) {
  if (state.profile?.role !== "admin") return;
  if (!file) return;

  try {
    setButtonLoading(els.importDataBtn, true, "Đang đọc...");

    const rawText = await readTextFile(file);
    const backup = JSON.parse(rawText);

    if (!backup || typeof backup !== "object" || !backup.collections || typeof backup.collections !== "object") {
      throw new Error("File JSON không đúng định dạng backup của hệ thống.");
    }

    const totalDocuments = countBackupDocuments(backup.collections);
    if (totalDocuments <= 0) {
      throw new Error("File JSON không có dữ liệu để nhập.");
    }

    const confirmed = window.confirm(
      `Bạn chắc chắn muốn nhập ${totalDocuments} document từ file JSON này?\n\n` +
      "Hệ thống sẽ ghi đè/cập nhật các document có cùng ID. " +
      "Dữ liệu hiện có nhưng không nằm trong file sẽ được giữ nguyên."
    );

    if (!confirmed) return;

    setButtonLoading(els.importDataBtn, true, "Đang nhập...");

    let batch = writeBatch(db);
    let batchCount = 0;
    let importedCount = 0;

    async function commitBatchIfNeeded(force = false) {
      if (batchCount === 0) return;
      if (!force && batchCount < 450) return;
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }

    for (const collectionName of BACKUP_COLLECTIONS) {
      const collectionData = normalizeBackupCollection(backup.collections[collectionName]);
      const entries = Object.entries(collectionData);

      for (const [documentId, rawData] of entries) {
        if (!documentId || !rawData || typeof rawData !== "object" || Array.isArray(rawData)) continue;

        const decodedData = decodeBackupValue(rawData);
        batch.set(doc(db, collectionName, documentId), decodedData, { merge: false });
        batchCount += 1;
        importedCount += 1;
        await commitBatchIfNeeded(false);
      }
    }

    await commitBatchIfNeeded(true);

    toast(`Đã nhập thành công ${importedCount} document từ file JSON.`, "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không nhập được dữ liệu JSON.", "error");
  } finally {
    setButtonLoading(els.importDataBtn, false);
    if (els.importDataInput) els.importDataInput.value = "";
  }
}

els.exportDataBtn?.addEventListener("click", exportAllDataToJson);
els.importDataBtn?.addEventListener("click", () => {
  if (state.profile?.role !== "admin") return;
  els.importDataInput?.click();
});
els.importDataInput?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  importBackupJsonFile(file);
});

els.workTemplateList?.addEventListener("click", (event) => {
  const item = event.target.closest("[data-edit-template-id]");
  if (!item) return;
  openWorkTemplateModal(item.dataset.editTemplateId);
});

$$('[data-close-work-template-modal]').forEach((button) => {
  button.addEventListener("click", closeWorkTemplateModal);
});

els.workTemplateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (state.profile?.role !== "admin") return;

  const name = els.workTemplateName?.value.trim() || "";
  const hours = Number(els.workTemplateHours?.value || 0);
  const minutes = Number(els.workTemplateMinutes?.value || 0);
  const deadlineMinutes = hours * 60 + minutes;

  try {
    if (!name) throw new Error("Vui lòng nhập tên công việc.");
    if (!Number.isInteger(hours) || hours < 0 || hours > 168) {
      throw new Error("Số giờ phải nằm trong khoảng 0 đến 168.");
    }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
      throw new Error("Số phút phải nằm trong khoảng 0 đến 59.");
    }
    if (deadlineMinutes <= 0) {
      throw new Error("Thời gian hoàn thành phải lớn hơn 0 phút.");
    }
    const normalizedName = normalizeSearchText(name);
    const duplicatedTemplate = state.workTemplates.find((template) => (
      template.id !== state.editingWorkTemplateId
      && normalizeSearchText(template.name || "") === normalizedName
    ));

    if (duplicatedTemplate) {
      throw new Error("Tên công việc này đã tồn tại trong danh sách.");
    }

    const adminName = state.profile.name || state.user.email || "Admin";

    setButtonLoading(els.saveWorkTemplateBtn, true, "Đang lưu...");

    if (state.editingWorkTemplateId) {
      await updateDoc(doc(db, "workTemplates", state.editingWorkTemplateId), {
        name,
        searchText: normalizedName,
        deadlineMinutes,
        updatedByUid: state.user.uid,
        updatedByName: adminName,
        updatedAt: serverTimestamp()
      });

      closeWorkTemplateModal();
      toast(`Đã cập nhật công việc “${name}” với thời gian ${formatMinutes(deadlineMinutes)}.`, "success");
    } else {
      const templateRef = doc(collection(db, "workTemplates"));
      await setDoc(templateRef, {
        id: templateRef.id,
        name,
        searchText: normalizedName,
        deadlineMinutes,
        createdByUid: state.user.uid,
        createdByName: adminName,
        createdAt: serverTimestamp(),
        updatedAt: null
      });

      closeWorkTemplateModal();
      toast(`Đã tạo công việc “${name}” với thời gian ${formatMinutes(deadlineMinutes)}.`, "success");
    }
  } catch (error) {
    console.error(error);
    toast(error.message || "Không tạo được công việc mẫu.", "error");
  } finally {
    setButtonLoading(els.saveWorkTemplateBtn, false);
  }
});

els.deleteWorkTemplateBtn?.addEventListener("click", async () => {
  if (state.profile?.role !== "admin" || !state.editingWorkTemplateId) return;

  const template = state.workTemplates.find((item) => item.id === state.editingWorkTemplateId);
  const templateName = template?.name || "công việc này";
  const confirmed = window.confirm(`Bạn chắc chắn muốn xoá “${templateName}” khỏi Danh sách công việc?`);

  if (!confirmed) return;

  try {
    setButtonLoading(els.deleteWorkTemplateBtn, true, "Đang xoá...");
    await deleteDoc(doc(db, "workTemplates", state.editingWorkTemplateId));
    closeWorkTemplateModal();
    toast(`Đã xoá công việc “${templateName}”.`, "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không xoá được công việc mẫu.", "error");
  } finally {
    setButtonLoading(els.deleteWorkTemplateBtn, false);
  }
});

function renderEmployeeSelects() {
  const employeeOptions = employeeOptionsHtml();

  els.adminEmployeeFilter.innerHTML = `<option value="all">Tất cả nhân viên</option>${employeeOptions}`;
  els.adminEmployeeFilter.value = state.adminEmployeeFilter;

  // Nếu modal tạo phiếu đang mở, cập nhật lại danh sách nhân viên trong từng dòng
  // (giữ nguyên lựa chọn cũ nếu nhân viên đó vẫn còn trong danh sách).
  $$("#taskRowsContainer .row-assignee").forEach((select) => {
    const currentValue = select.value;
    select.innerHTML = `<option value="">Chờ chọn người</option>${employeeOptions}`;
    if (currentValue) select.value = currentValue;
  });

  if (state.reassignTaskId && els.reassignEmployeeModal && !els.reassignEmployeeModal.classList.contains("hidden")) {
    renderReassignEmployeeOptions(state.reassignTaskId);
  }
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
let photoRequirementTouched = false;

const LUNCH_BREAK_AUTO_TITLE = "Phiếu nghỉ trưa";
const HOTEL_AUTO_TITLE = "Làm hotel";
const SHIP_AUTO_TITLE = "Đi ship";
const CLEANING_AUTO_TITLE = "Dọn dẹp vệ sinh";
const LEGACY_LUNCH_BREAK_AUTO_TITLES = ["Nghỉ trưa", LUNCH_BREAK_AUTO_TITLE];
const LEGACY_HOTEL_AUTO_TITLES = ["Hotel", HOTEL_AUTO_TITLE];
const LEGACY_SHIP_AUTO_TITLES = [SHIP_AUTO_TITLE];
const LEGACY_CLEANING_AUTO_TITLES = [CLEANING_AUTO_TITLE];
const HOTEL_BASE_PET_COUNT = 10;
const HOTEL_BASE_MINUTES = 30;
const HOTEL_EXTRA_MINUTES_PER_PET = 2;

function normalizeHotelPetCount(value) {
  const count = Math.floor(Number(value || 0));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function calculateHotelAllowedMinutes(petCount) {
  const count = normalizeHotelPetCount(petCount);
  if (!count) return 0;

  return HOTEL_BASE_MINUTES + Math.max(0, count - HOTEL_BASE_PET_COUNT) * HOTEL_EXTRA_MINUTES_PER_PET;
}

function applyHotelTimeFromPetCount(row) {
  if (!row) return;

  const hotelCheckbox = row.querySelector(".row-hotel");
  if (!hotelCheckbox?.checked) return;

  const hotelPetCountInput = row.querySelector(".row-hotel-pet-count");
  const hoursInput = row.querySelector(".row-hours");
  const minutesInput = row.querySelector(".row-minutes");

  if (!hotelPetCountInput || !hoursInput || !minutesInput) return;

  if (!normalizeHotelPetCount(hotelPetCountInput.value)) {
    hotelPetCountInput.value = HOTEL_BASE_PET_COUNT;
  }

  const allowedMinutes = calculateHotelAllowedMinutes(hotelPetCountInput.value);
  hoursInput.value = Math.floor(allowedMinutes / 60);
  minutesInput.value = allowedMinutes % 60;
}

function isAutoSpecialTitle(value, titles) {
  return titles.includes(String(value || "").trim());
}

function setWorkOrderNameForSpecialTask(autoName) {
  if (!els.workOrderName) return;
  els.workOrderName.value = autoName;
}

function clearWorkOrderNameIfAutoSpecial(autoTitles) {
  if (!els.workOrderName) return;
  if (isAutoSpecialTitle(els.workOrderName.value, autoTitles)) {
    els.workOrderName.value = "";
  }
}

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
      <input type="text" class="row-title" list="workTemplateOptions" placeholder="Ví dụ: Dọn phòng khách sạn mèo" required />
    </label>
    <label>
      Mô tả công việc <span class="optional-label">(không bắt buộc)</span>
      <textarea class="row-description" rows="3" placeholder="Có thể bỏ trống hoặc ghi rõ yêu cầu, tiêu chuẩn hoàn thành..."></textarea>
    </label>
    <div class="two-col">
      <label>
        Ngày giao việc
        <input type="date" class="row-date" required />
      </label>
      <label>
        Người được giao <span class="optional-label">(có thể chọn sau)</span>
        <select class="row-assignee">
          <option value="">Chờ chọn người</option>
          ${employeeOptionsHtml()}
        </select>
      </label>
    </div>
    <div class="task-type-options">
      <label class="checkbox-line lunch-break-line">
        <input type="checkbox" class="row-lunch-break" />
        Nghỉ trưa
      </label>
      <label class="checkbox-line hotel-line">
        <input type="checkbox" class="row-hotel" />
        Hotel
      </label>
      <label class="checkbox-line ship-line">
        <input type="checkbox" class="row-ship" />
        Ship
      </label>
      <label class="checkbox-line cleaning-line">
        <input type="checkbox" class="row-cleaning" />
        Dọn dẹp vệ sinh
      </label>
    </div>
    <p class="small-note lunch-break-note hidden">Phiếu Nghỉ trưa tối đa 30 phút. Mỗi nhân viên chỉ được có 1 phiếu Nghỉ trưa đang chạy.</p>
    <p class="small-note hotel-note hidden">Phiếu Hotel sẽ áp dụng đúng cài đặt đăng hình của Admin ở bên dưới. <strong>10 bé</strong> ở hotel thì tổng thời gian cho ăn và dọn dẹp của các bạn chăm sóc trong 1 ngày sẽ là <strong>30 phút</strong>. Cứ <strong>mỗi 1 bé vào</strong> ở thêm thì sẽ cộng thêm thời gian cho <strong>2 phút</strong>.</p>
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
  // Không dùng valueAsDate vì input date đọc ngày theo UTC, dễ bị lùi 1 ngày
  // khi máy người dùng ở múi giờ Việt Nam và mở form sau nửa đêm.
  dateInput.value = prefill?.taskDate || todayInputValue();

  if (prefill) {
    wrapper.querySelector(".row-title").value = prefill.title || "";
    wrapper.querySelector(".row-description").value = prefill.description || "";
    wrapper.querySelector(".row-hours").value = Number.isFinite(prefill.hours) ? prefill.hours : 0;
    wrapper.querySelector(".row-minutes").value = Number.isFinite(prefill.minutes) ? prefill.minutes : 30;

    if (prefill.assignedToUid) {
      wrapper.querySelector(".row-assignee").value = prefill.assignedToUid;
    }

    if (prefill.isLunchBreak) {
      wrapper.querySelector(".row-lunch-break").checked = true;
    }

    if (prefill.isHotel) {
      wrapper.querySelector(".row-hotel").checked = true;
    }
  }

  syncLunchBreakRowControls(wrapper);
  return wrapper;
}

function addTaskRow() {
  els.taskRowsContainer.appendChild(createTaskRowElement());
  updateTaskRowHeadings();
  syncPhotoRequirementDefaultFromTaskTypes();
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
  syncPhotoRequirementDefaultFromTaskTypes();
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

function syncLunchBreakRowControls(row, changedInput = null) {
  if (!row) return;

  const lunchCheckbox = row.querySelector(".row-lunch-break");
  const hotelCheckbox = row.querySelector(".row-hotel");
  const shipCheckbox = row.querySelector(".row-ship");
  const cleaningCheckbox = row.querySelector(".row-cleaning");
  const hoursInput = row.querySelector(".row-hours");
  const minutesInput = row.querySelector(".row-minutes");
  const titleInput = row.querySelector(".row-title");
  const lunchNote = row.querySelector(".lunch-break-note");
  const hotelNote = row.querySelector(".hotel-note");

  const lunchChanged = Boolean(changedInput?.matches?.(".row-lunch-break"));
  const hotelChanged = Boolean(changedInput?.matches?.(".row-hotel"));
  const shipChanged = Boolean(changedInput?.matches?.(".row-ship"));
  const cleaningChanged = Boolean(changedInput?.matches?.(".row-cleaning"));

  // Các loại checkbox đặc biệt không được chọn cùng lúc để tránh tự điền nhầm tên phiếu/công việc.
  if (lunchChanged && lunchCheckbox?.checked) {
    if (hotelCheckbox) hotelCheckbox.checked = false;
    if (shipCheckbox) shipCheckbox.checked = false;
    if (cleaningCheckbox) cleaningCheckbox.checked = false;
  }

  if (hotelChanged && hotelCheckbox?.checked) {
    if (lunchCheckbox) lunchCheckbox.checked = false;
    if (shipCheckbox) shipCheckbox.checked = false;
    if (cleaningCheckbox) cleaningCheckbox.checked = false;
  }

  if (shipChanged && shipCheckbox?.checked) {
    if (lunchCheckbox) lunchCheckbox.checked = false;
    if (hotelCheckbox) hotelCheckbox.checked = false;
    if (cleaningCheckbox) cleaningCheckbox.checked = false;
  }

  if (cleaningChanged && cleaningCheckbox?.checked) {
    if (lunchCheckbox) lunchCheckbox.checked = false;
    if (hotelCheckbox) hotelCheckbox.checked = false;
    if (shipCheckbox) shipCheckbox.checked = false;
  }

  if (lunchChanged && titleInput) {
    if (lunchCheckbox?.checked) {
      titleInput.value = LUNCH_BREAK_AUTO_TITLE;
      setWorkOrderNameForSpecialTask(LUNCH_BREAK_AUTO_TITLE);
    } else if (isAutoSpecialTitle(titleInput.value, LEGACY_LUNCH_BREAK_AUTO_TITLES)) {
      titleInput.value = "";
      clearWorkOrderNameIfAutoSpecial(LEGACY_LUNCH_BREAK_AUTO_TITLES);
    }
  }

  if (hotelChanged && titleInput) {
    if (hotelCheckbox?.checked) {
      titleInput.value = HOTEL_AUTO_TITLE;
      setWorkOrderNameForSpecialTask(HOTEL_AUTO_TITLE);
    } else if (isAutoSpecialTitle(titleInput.value, LEGACY_HOTEL_AUTO_TITLES)) {
      titleInput.value = "";
      clearWorkOrderNameIfAutoSpecial(LEGACY_HOTEL_AUTO_TITLES);
    }
  }

  if (shipChanged) {
    if (shipCheckbox?.checked) {
      setWorkOrderNameForSpecialTask(SHIP_AUTO_TITLE);
    } else {
      clearWorkOrderNameIfAutoSpecial(LEGACY_SHIP_AUTO_TITLES);
    }
  }

  if (cleaningChanged && titleInput) {
    if (cleaningCheckbox?.checked) {
      titleInput.value = CLEANING_AUTO_TITLE;
      setWorkOrderNameForSpecialTask(CLEANING_AUTO_TITLE);
    } else if (isAutoSpecialTitle(titleInput.value, LEGACY_CLEANING_AUTO_TITLES)) {
      titleInput.value = "";
      clearWorkOrderNameIfAutoSpecial(LEGACY_CLEANING_AUTO_TITLES);
    }
  }

  const isLunch = Boolean(lunchCheckbox?.checked);
  const isHotel = Boolean(hotelCheckbox?.checked);

  lunchNote?.classList.toggle("hidden", !isLunch);
  hotelNote?.classList.toggle("hidden", !isHotel);
  if (!hoursInput || !minutesInput) return;

  if (isLunch) {
    if (!titleInput.value.trim()) titleInput.value = LUNCH_BREAK_AUTO_TITLE;

    const totalMinutes = (Number(hoursInput.value || 0) * 60) + Number(minutesInput.value || 0);
    const nextMinutes = Math.min(Math.max(totalMinutes || 30, 1), LUNCH_BREAK_MAX_MINUTES_PER_DAY);

    hoursInput.value = 0;
    hoursInput.max = 0;
    minutesInput.min = 1;
    minutesInput.max = LUNCH_BREAK_MAX_MINUTES_PER_DAY;
    minutesInput.value = nextMinutes;
    return;
  }

  if (isHotel) {
    if (!titleInput.value.trim()) titleInput.value = HOTEL_AUTO_TITLE;

    hoursInput.max = 168;
    minutesInput.min = 0;
    minutesInput.max = 59;
    return;
  }

  if (cleaningCheckbox?.checked && titleInput && !titleInput.value.trim()) {
    titleInput.value = CLEANING_AUTO_TITLE;
  }

  hoursInput.max = 168;
  minutesInput.min = 0;
  minutesInput.max = 59;
  if (Number(minutesInput.value || 0) < 0) minutesInput.value = 0;
}
function resetTaskRows() {
  els.taskRowsContainer.innerHTML = "";
  addTaskRow();
}

function setPhotoRequirementChecked(checked) {
  if (!els.photoRequiredCheckbox || !els.requiredPhotoCount) return;

  els.photoRequiredCheckbox.checked = Boolean(checked);
  els.requiredPhotoCount.disabled = !Boolean(checked);

  if (checked && Number(els.requiredPhotoCount.value || 0) <= 0) {
    els.requiredPhotoCount.value = 10;
  }
}

function hasSelectedHotelTaskRow() {
  return $$("#taskRowsContainer .row-hotel").some((checkbox) => checkbox.checked);
}

function syncPhotoRequirementDefaultFromTaskTypes() {
  if (photoRequirementTouched) return;
  setPhotoRequirementChecked(hasSelectedHotelTaskRow());
}

function resetPhotoRequirementControls() {
  photoRequirementTouched = false;
  if (els.requiredPhotoCount) {
    els.requiredPhotoCount.value = 10;
  }
  // Mặc định không bắt buộc đăng hình cho công việc thường.
  // Khi Admin chọn Hotel, hệ thống sẽ tự bật mặc định nhưng Admin vẫn có thể bỏ chọn lại.
  setPhotoRequirementChecked(false);
}

function setPhotoRequirementControlsFromTask(task = null) {
  if (!els.photoRequiredCheckbox || !els.requiredPhotoCount) return;

  const required = task ? Boolean(task.photoRequired) : false;
  const count = task ? getTaskRequiredPhotoCount(task) : 10;

  photoRequirementTouched = Boolean(task);
  els.requiredPhotoCount.value = required ? Math.max(1, count) : 10;
  setPhotoRequirementChecked(required);
}

function readPhotoRequirementOptions() {
  const required = Boolean(els.photoRequiredCheckbox?.checked);
  const count = required ? Number(els.requiredPhotoCount?.value || 0) : 0;

  return {
    photoRequired: required,
    requiredPhotoCount: required ? count : 0
  };
}

function validatePhotoRequirementOptions(options) {
  if (!options.photoRequired) return null;

  if (!Number.isInteger(options.requiredPhotoCount) || options.requiredPhotoCount <= 0) {
    return "Vui lòng nhập số lượng hình cần gửi lớn hơn 0.";
  }

  if (options.requiredPhotoCount > 100) {
    return "Số lượng hình cần gửi tối đa là 100 hình cho mỗi công việc.";
  }

  return null;
}

els.photoRequiredCheckbox?.addEventListener("change", () => {
  photoRequirementTouched = true;
  setPhotoRequirementChecked(Boolean(els.photoRequiredCheckbox.checked));
});

els.addTaskRowBtn.addEventListener("click", addTaskRow);

els.taskRowsContainer.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="remove-task-row"]');
  if (!button) return;
  removeTaskRow(button.dataset.rowId);
});

els.taskRowsContainer.addEventListener("change", (event) => {
  const row = event.target.closest(".task-row");
  if (!row) return;

  if (event.target.matches(".row-lunch-break, .row-hotel, .row-ship, .row-cleaning, .row-hours, .row-minutes")) {
    syncLunchBreakRowControls(row, event.target);

    if (event.target.matches(".row-lunch-break, .row-hotel, .row-ship, .row-cleaning")) {
      syncPhotoRequirementDefaultFromTaskTypes();
    }
  }

  const titleInput = event.target.closest(".row-title");
  if (!titleInput) return;

  const template = findWorkTemplateByName(titleInput.value);
  if (!template) return;

  applyWorkTemplateToRow(titleInput.closest(".task-row"), template);
  syncLunchBreakRowControls(titleInput.closest(".task-row"));
  toast(`Đã áp dụng thời gian ${formatMinutes(Number(template.deadlineMinutes || 0))} cho công việc “${template.name}”.`, "success");
});

function openCreateWorkOrderModal() {
  state.editingWorkOrderId = null;
  $("#taskModalTitle").textContent = "+ Tạo phiếu công việc";
  els.workOrderName.value = "";
  resetTaskRows();
  resetPhotoRequirementControls();

  els.taskModal.classList.remove("hidden");
}

els.openTaskModalBtn?.addEventListener("click", openCreateWorkOrderModal);
els.floatingCreateTaskBtn?.addEventListener("click", openCreateWorkOrderModal);

function openEditWorkOrderModal(workOrderId) {
  const tasksInGroup = state.tasks
    .filter((task) => (task.workOrderId || "legacy") === workOrderId)
    .sort((a, b) => Number(a.rowIndex ?? 0) - Number(b.rowIndex ?? 0));
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
        isLunchBreak: Boolean(task.isLunchBreak),
        isHotel: Boolean(task.isHotel),
        hotelPetCount: Number(task.hotelPetCount || 0),
        hours: Math.floor(deadlineMinutes / 60),
        minutes: deadlineMinutes % 60
      }));
    });
  } else {
    // Phiếu nháp chưa có công việc nào: bắt đầu với 1 dòng trống để admin điền thêm.
    addTaskRow();
  }

  updateTaskRowHeadings();
  setPhotoRequirementControlsFromTask(tasksInGroup[0] || null);

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
    const isLunchBreak = Boolean(row.querySelector(".row-lunch-break")?.checked);
    const isHotel = Boolean(row.querySelector(".row-hotel")?.checked);
    const hotelPetCount = 0;
    const hotelAllowedMinutes = 0;
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
      deadlineMinutes,
      isLunchBreak,
      isHotel,
      hotelPetCount,
      hotelAllowedMinutes
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
    if (row.assignedToUid && !row.assignedEmployee) return `${rowLabel}: nhân viên được chọn không hợp lệ.`;
    if (row.isLunchBreak && row.isHotel) return `${rowLabel}: chỉ được chọn Nghỉ trưa hoặc Hotel, không chọn cả hai.`;
    if (!row.taskDate) return `${rowLabel}: vui lòng chọn ngày giao việc.`;
    if (row.deadlineMinutes <= 0) return `${rowLabel}: thời gian cần hoàn thành phải lớn hơn 0 phút.`;
  }

  return validateLunchBreakRowsForDispatch(rows);
}

// Lưu nháp chỉ bắt buộc có tên phiếu (kiểm tra riêng ở persistWorkOrder),
// không yêu cầu bất kỳ thông tin nào trong từng dòng công việc.
function validateTaskRowsForDraft(rows) {
  if (!rows.length) {
    return "Phiếu cần có ít nhất 1 công việc (có thể để trống thông tin, điền sau).";
  }

  return validateLunchBreakBasicRows(rows);
}

// =========================
// Xếp hàng thời gian theo từng nhân viên
// =========================
// Một nhân viên chỉ "chạy" đếm ngược 1 công việc tại 1 thời điểm. Nếu được giao thêm
// công việc trong khi đang còn công việc khác (theo THỜI GIAN QUY ĐỊNH, không phải theo
// việc họ đã bấm hoàn thành hay chưa), công việc mới phải xếp hàng, chỉ thực sự bắt đầu
// đếm giờ khi công việc trước đó (của chính người này) hết thời gian quy định.
//
// Trả về map { uid: mốc thời gian (ms) mà nhân viên đó RẢNH để bắt đầu việc tiếp theo }.
// Chỉ các task nhân viên còn đang thực sự phải làm mới được tính vào hàng đợi.
// Task đã báo hoàn thành/chờ Admin duyệt hoặc đã hoàn thành sẽ không còn giữ chỗ thời gian,
// để nếu nhân viên làm xong sớm thì công việc mới được bắt đầu ngay thay vì phải chờ tới hạn cũ.
function isTaskBlockingQueue(task) {
  return Boolean(task?.assignedToUid)
    && !["draft", "waiting_assignee", "submitted", "completed"].includes(task.status);
}

function getTaskQueueEndMs(task) {
  const start = timestampToDate(task.queueStartAt) || timestampToDate(task.dispatchedAt);
  if (!start) return 0;

  return start.getTime() + Number(task.deadlineMinutes || 0) * 60 * 1000;
}

function getEmployeeQueueEndMap(assignedToUids) {
  const map = {};

  assignedToUids.forEach((uid) => {
    if (!uid || map[uid] !== undefined) return;

    let latestEnd = 0;

    state.tasks.forEach((task) => {
      if (task.assignedToUid !== uid) return;
      if (!isTaskBlockingQueue(task)) return;

      const end = getTaskQueueEndMs(task);
      if (end > latestEnd) latestEnd = end;
    });

    map[uid] = latestEnd;
  });

  return map;
}

// Khi một task hoàn thành sớm, những task đang "Đang chờ đến lượt" của cùng nhân viên
// cần được kéo lên sớm hơn. Nếu không, task mới/đang chờ vẫn bị kẹt tới mốc hạn cũ.
async function reflowQueuedTasksForEmployee(employeeUid, completedTaskId = "", now = new Date()) {
  if (!employeeUid) return 0;

  const nowMs = now.getTime();
  let latestActiveEndMs = 0;
  const queuedTasks = [];

  state.tasks.forEach((task) => {
    if (task.id === completedTaskId) return;
    if (task.assignedToUid !== employeeUid) return;
    if (!isTaskBlockingQueue(task)) return;

    const queueStart = timestampToDate(task.queueStartAt) || timestampToDate(task.dispatchedAt);
    const deadlineMinutes = Number(task.deadlineMinutes || 0);
    if (!queueStart || deadlineMinutes <= 0) return;

    if (queueStart.getTime() > nowMs) {
      queuedTasks.push(task);
      return;
    }

    latestActiveEndMs = Math.max(latestActiveEndMs, getTaskQueueEndMs(task));
  });

  if (!queuedTasks.length) return 0;

  queuedTasks.sort((a, b) => {
    const aStart = timestampToDate(a.queueStartAt)?.getTime() || 0;
    const bStart = timestampToDate(b.queueStartAt)?.getTime() || 0;
    if (aStart !== bStart) return aStart - bStart;
    return Number(a.rowIndex || 0) - Number(b.rowIndex || 0);
  });

  let cursorMs = Math.max(nowMs, latestActiveEndMs);
  const batch = writeBatch(db);
  let changedCount = 0;

  queuedTasks.forEach((task) => {
    const deadlineMinutes = Number(task.deadlineMinutes || 0);
    const newStartMs = cursorMs;
    const newEndMs = newStartMs + deadlineMinutes * 60 * 1000;
    cursorMs = newEndMs;

    const oldStartMs = timestampToDate(task.queueStartAt)?.getTime() || 0;
    const oldEndMs = timestampToDate(task.deadlineAt)?.getTime() || 0;

    if (Math.abs(oldStartMs - newStartMs) < 1000 && Math.abs(oldEndMs - newEndMs) < 1000) {
      return;
    }

    batch.update(doc(db, "tasks", task.id), {
      queueStartAt: Timestamp.fromDate(new Date(newStartMs)),
      deadlineAt: Timestamp.fromDate(new Date(newEndMs))
    });
    changedCount += 1;
  });

  if (!changedCount) return 0;

  await batch.commit();
  return changedCount;
}

// Tính mốc bắt đầu đếm giờ thực sự cho 1 công việc mới của 1 nhân viên, đồng thời
// cập nhật luôn map hàng đợi để công việc TIẾP THEO của cùng người này (nếu có,
// trong cùng 1 lượt giao việc) được xếp nối tiếp theo đúng thứ tự.
function reserveQueueSlot(employeeQueueEnd, uid, deadlineMinutes, now) {
  const prevEnd = employeeQueueEnd[uid] || 0;
  const queueStartMs = Math.max(now.getTime(), prevEnd);
  const queueEndMs = queueStartMs + Number(deadlineMinutes || 0) * 60 * 1000;

  employeeQueueEnd[uid] = queueEndMs;

  return {
    queueStartDate: new Date(queueStartMs),
    deadlineDate: new Date(queueEndMs)
  };
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

    const photoOptions = readPhotoRequirementOptions();
    const photoValidationError = validatePhotoRequirementOptions(photoOptions);

    if (photoValidationError) {
      throw new Error(photoValidationError);
    }

    const now = new Date();
    const batch = writeBatch(db);

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

    // Chuẩn bị hàng đợi thời gian cho từng nhân viên xuất hiện trong phiếu này,
    // dựa trên các công việc HỌ đã được giao trước đó (ở bất kỳ phiếu nào khác).
    const employeeQueueEnd = dispatch
      ? getEmployeeQueueEndMap(rows.map((row) => row.assignedToUid))
      : {};

    rows.forEach((row) => {
      const taskRef = doc(collection(db, "tasks"));
      createdTaskRefs.push(taskRef);

      const assignedToUid = row.assignedToUid || "";
      const assignedToName = row.assignedEmployee?.name || "";
      const deadlineMinutes = Number(row.deadlineMinutes) || 0;

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
        rowIndex: row.index,
        createdAt: serverTimestamp(),
        deadlineMinutes,
        isLunchBreak: Boolean(row.isLunchBreak),
        isHotel: Boolean(row.isHotel),
        hotelPetCount: row.isHotel ? Number(row.hotelPetCount || 0) : 0,
        hotelAllowedMinutes: row.isHotel ? Number(row.hotelAllowedMinutes || 0) : 0,
        deadlineAt: null,
        dispatchedAt: null,
        queueStartAt: null,
        pauseStartedAt: null,
        remainingMsAtPause: null,
        accumulatedWorkedMs: 0,
        submittedAt: null,
        approvedAt: null,
        status: "draft",
        actualMinutes: null,
        resultType: null,
        differenceMinutes: null,
        differencePercent: null,
        // Phiếu Nghỉ trưa là thời gian nghỉ nên không bắt buộc đăng hình.
        // Phiếu Hotel vẫn áp dụng đúng cài đặt bắt buộc đăng hình của Admin.
        photoRequired: row.isLunchBreak ? false : photoOptions.photoRequired,
        requiredPhotoCount: row.isLunchBreak ? 0 : photoOptions.requiredPhotoCount,
        photos: [],
        photoCount: 0,
        lastPhotoUploadedAt: null
      };

      if (dispatch) {
        if (assignedToUid) {
          const { queueStartDate, deadlineDate } = reserveQueueSlot(employeeQueueEnd, assignedToUid, deadlineMinutes, now);

          taskData.status = getActiveTaskStatusFromFlags(row);
          taskData.dispatchedAt = serverTimestamp();
          taskData.queueStartAt = Timestamp.fromDate(queueStartDate);
          taskData.deadlineAt = Timestamp.fromDate(deadlineDate);

          const isQueued = queueStartDate.getTime() > now.getTime();
          const startNote = isQueued
            ? ` Do bạn còn công việc khác chưa hết thời gian quy định, công việc này sẽ tự bắt đầu tính giờ lúc ${formatDateTime(taskData.queueStartAt)}.`
            : "";

          notificationItems.push({
            recipientUid: assignedToUid,
            type: "task_assigned",
            title: "Bạn có công việc mới",
            message: `${state.profile.name || "Admin"} đã giao cho bạn: ${row.title} (phiếu “${workOrderName}”). Hạn hoàn thành: ${formatMinutes(deadlineMinutes)}.${startNote}`,
            taskId: taskRef.id,
            taskTitle: row.title
          });
        } else {
          taskData.status = "waiting_assignee";
          taskData.pauseStartedAt = serverTimestamp();
        }
      }

      batch.set(taskRef, taskData);
    });

    await batch.commit();

    const adminWorkOrderNotification = {
      recipientUid: state.user.uid,
      type: dispatch ? "task_assigned_admin" : "work_order_draft_saved",
      title: dispatch ? "Đã tạo phiếu công việc" : "Đã lưu phiếu chưa giao việc",
      message: dispatch
        ? `Bạn đã tạo phiếu “${workOrderName}” với ${rows.length} công việc.`
        : `Bạn đã lưu phiếu “${workOrderName}” với ${rows.length} công việc ở trạng thái Chưa giao việc.`,
      taskId: createdTaskRefs[0]?.id || null,
      taskTitle: workOrderName
    };

    notificationItems.push(adminWorkOrderNotification);
    await createNotifications(notificationItems);

    state.editingWorkOrderId = null;
    els.workOrderName.value = "";
    resetTaskRows();
    resetPhotoRequirementControls();
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
  const tasksInGroup = state.tasks
    .filter((task) => (task.workOrderId || "legacy") === workOrderId)
    // Sắp theo đúng thứ tự công việc trong phiếu (rowIndex) để hàng đợi theo nhân viên
    // được tính đúng thứ tự đã nhập, vì createdAt của các task tạo cùng lúc có thể trùng nhau.
    .sort((a, b) => Number(a.rowIndex ?? 0) - Number(b.rowIndex ?? 0));

  if (!tasksInGroup.length) {
    toast("Phiếu này chưa có công việc nào. Bấm “Sửa phiếu” để thêm công việc trước khi giao.", "error");
    return;
  }

  const missingInfo = tasksInGroup.find((task) => (
    !task.title ||
    !task.taskDate ||
    !Number(task.deadlineMinutes) ||
    Number(task.deadlineMinutes) <= 0
  ));

  if (missingInfo) {
    toast("Phiếu còn thiếu thông tin (tên công việc/ngày giao/thời gian). Bấm “Sửa phiếu” để hoàn thiện trước khi giao việc.", "error");
    return;
  }

  const lunchValidationError = validateLunchBreakRowsForDispatch(tasksInGroup.map((task, index) => ({
    index,
    taskId: task.id,
    title: task.title,
    taskDate: getTaskDateValue(task),
    assignedToUid: task.assignedToUid,
    assignedEmployee: state.employees.find((employee) => employee.uid === task.assignedToUid),
    deadlineMinutes: Number(task.deadlineMinutes || 0),
    isLunchBreak: Boolean(task.isLunchBreak),
    isHotel: Boolean(task.isHotel),
    hotelPetCount: Number(task.hotelPetCount || 0),
    hotelAllowedMinutes: Number(task.hotelAllowedMinutes || 0)
  })));

  if (lunchValidationError) {
    toast(lunchValidationError, "error");
    return;
  }

  setButtonLoading(button, true, "Đang giao việc...");

  try {
    const now = new Date();
    const batch = writeBatch(db);
    const notificationItems = [];

    // Hàng đợi seed từ các công việc ĐÃ GIAO khác (ngoài chính phiếu này, vì các task
    // trong tasksInGroup hiện vẫn đang ở trạng thái "draft" nên tự động bị loại khỏi map).
    const employeeQueueEnd = getEmployeeQueueEndMap(tasksInGroup.map((task) => task.assignedToUid));

    tasksInGroup.forEach((task) => {
      if (!task.assignedToUid) {
        batch.update(doc(db, "tasks", task.id), {
          status: "waiting_assignee",
          pauseStartedAt: serverTimestamp(),
          remainingMsAtPause: null,
          accumulatedWorkedMs: Number(task.accumulatedWorkedMs || 0),
          dispatchedAt: null,
          queueStartAt: null,
          deadlineAt: null
        });
        return;
      }

      const { queueStartDate, deadlineDate } = reserveQueueSlot(
        employeeQueueEnd,
        task.assignedToUid,
        Number(task.deadlineMinutes),
        now
      );

      batch.update(doc(db, "tasks", task.id), {
        status: getActiveTaskStatusFromFlags(task),
        dispatchedAt: serverTimestamp(),
        queueStartAt: Timestamp.fromDate(queueStartDate),
        deadlineAt: Timestamp.fromDate(deadlineDate),
        pauseStartedAt: null,
        remainingMsAtPause: null,
        accumulatedWorkedMs: Number(task.accumulatedWorkedMs || 0)
      });

      const isQueued = queueStartDate.getTime() > now.getTime();
      const startNote = isQueued
        ? ` Do bạn còn công việc khác chưa hết thời gian quy định, công việc này sẽ tự bắt đầu tính giờ lúc ${formatDateTime(Timestamp.fromDate(queueStartDate))}.`
        : "";

      notificationItems.push({
        recipientUid: task.assignedToUid,
        type: "task_assigned",
        title: "Bạn có công việc mới",
        message: `${state.profile.name || "Admin"} đã giao cho bạn: ${task.title} (phiếu “${task.workOrderName}”). Hạn hoàn thành: ${formatMinutes(task.deadlineMinutes)}.${startNote}`,
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

function getStoragePathFromPhoto(photo) {
  if (!photo) return "";

  if (photo.storagePath) return String(photo.storagePath);
  if (photo.fullPath) return String(photo.fullPath);
  if (photo.path) return String(photo.path);

  const url = String(photo.url || "");
  if (!url.includes("/o/")) return "";

  try {
    const encodedPath = url.split("/o/")[1]?.split("?")[0] || "";
    return decodeURIComponent(encodedPath);
  } catch (error) {
    console.warn("Không đọc được đường dẫn ảnh từ URL", error);
    return "";
  }
}

function getTaskPhotoStoragePaths(tasks = []) {
  const paths = new Set();

  tasks.forEach((task) => {
    getTaskPhotos(task).forEach((photo) => {
      const path = getStoragePathFromPhoto(photo);
      if (path) paths.add(path);
    });
  });

  return Array.from(paths);
}

function isStorageObjectNotFound(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code.includes("object-not-found") || message.includes("object does not exist");
}

async function deleteTaskPhotosFromStorage(tasks = []) {
  const paths = getTaskPhotoStoragePaths(tasks);
  const failed = [];
  let deleted = 0;

  for (const path of paths) {
    try {
      await deleteObject(storageRef(storage, path));
      deleted += 1;
    } catch (error) {
      if (isStorageObjectNotFound(error)) {
        continue;
      }

      console.error(`Không xoá được ảnh Storage: ${path}`, error);
      failed.push({ path, error });
    }
  }

  if (failed.length) {
    throw new Error(`Không xoá được ${failed.length} hình trong Firebase Storage. Hãy kiểm tra đã deploy storage.rules mới nhất rồi thử lại.`);
  }

  return { deleted, total: paths.length };
}

async function getCollectionDeleteOperations(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((item) => (batch) => batch.delete(doc(db, collectionName, item.id)));
}

async function deleteWorkOrder(workOrderId, button) {
  const tasksInGroup = state.tasks.filter((task) => (task.workOrderId || "legacy") === workOrderId);

  if (!window.confirm(`Xoá phiếu này cùng ${tasksInGroup.length} công việc bên trong? Hình ảnh báo cáo trong phiếu cũng sẽ bị xoá. Không thể hoàn tác.`)) {
    return;
  }

  setButtonLoading(button, true, "Đang xoá...");

  try {
    await deleteTaskPhotosFromStorage(tasksInGroup);

    const batch = writeBatch(db);
    tasksInGroup.forEach((task) => batch.delete(doc(db, "tasks", task.id)));

    if (workOrderId !== "legacy") {
      batch.delete(doc(db, "workOrders", workOrderId));
    }

    await batch.commit();

    toast("Đã xoá phiếu và hình ảnh báo cáo trong phiếu.", "success");
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
  const hasAnyWorkData = Boolean(
    state.tasks.length
    || state.workOrders.length
    || state.hotelDailyReports.length
    || state.notifications.length
  );

  if (!hasAnyWorkData) {
    toast("Không có dữ liệu phiếu công việc nào để xoá.", "info");
    return;
  }

  const ticketCount = new Set([
    ...state.tasks.map((task) => task.workOrderId || "legacy"),
    ...state.workOrders.map((wo) => wo.id)
  ]).size;
  const photoCount = getTaskPhotoStoragePaths(state.tasks).length;

  if (!window.confirm(`Xoá TOÀN BỘ ${ticketCount} phiếu công việc (mọi trạng thái) cùng ${state.tasks.length} công việc bên trong? Hệ thống cũng sẽ xoá toàn bộ báo cáo Hotel hằng ngày, thiết lập/thống kê liên quan, thông báo cũ và ${photoCount} hình ảnh báo cáo. Hành động này không thể hoàn tác.`)) {
    return;
  }

  setButtonLoading(button, true, "Đang xoá toàn bộ...");

  try {
    await deleteTaskPhotosFromStorage(state.tasks);

    const operations = [];

    state.tasks.forEach((task) => {
      operations.push((batch) => batch.delete(doc(db, "tasks", task.id)));
    });

    // Xoá theo state.workOrders (thay vì suy từ tasks) để không bỏ sót các phiếu
    // nháp chưa có công việc nào bên trong.
    state.workOrders.forEach((workOrder) => {
      operations.push((batch) => batch.delete(doc(db, "workOrders", workOrder.id)));
    });

    operations.push(...await getCollectionDeleteOperations("hotelDailyReports"));
    operations.push(...await getCollectionDeleteOperations("notifications"));

    await commitInChunks(operations);

    state.adminHotelReportDrafts = {};
    state.adminHotelReportHygiene = "pending";
    state.adminHotelEndPetCount = "";

    toast("Đã xoá toàn bộ phiếu, báo cáo, thống kê, thông báo và hình ảnh liên quan.", "success");
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

  if (state.adminStatusFilter !== "completed") {
    state.adminCompletedTypeFilter = "all";
  }

  renderAdminTasks();
});

els.adminCompletedTypeFilter?.addEventListener("change", (event) => {
  state.adminCompletedTypeFilter = event.target.value;
  renderAdminTasks();
});

els.adminCompletedTypeReport?.addEventListener("change", (event) => {
  const target = event.target;

  // Chỉ lưu tạm lựa chọn trên form. Báo cáo Hotel chỉ được chốt/lưu khi Admin bấm nút OK.
  if (target?.matches?.("[data-admin-hotel-hygiene]")) {
    updateAdminHotelReportDraft({ hygiene: target.value || "pending" });
  }

  if (target?.matches?.("[data-admin-hotel-end-pet-count]")) {
    updateAdminHotelReportDraft({ endPetCount: target.value });
  }
});

els.adminCompletedTypeReport?.addEventListener("input", (event) => {
  const target = event.target;

  // Chỉ lưu tạm số lượng bé trên form. Không tự hiển thị thông báo và không tự lưu báo cáo.
  if (target?.matches?.("[data-admin-hotel-end-pet-count]")) {
    updateAdminHotelReportDraft({ endPetCount: target.value });
  }
});

els.adminCompletedTypeReport?.addEventListener("click", async (event) => {
  const target = event.target;

  if (!target?.matches?.("[data-admin-hotel-report-ok]")) return;

  const dateKey = getAdminHotelReportDateKey();

  if (!dateKey) {
    toast("Vui lòng chọn Hôm nay hoặc Chọn 1 ngày trước khi lưu tổng kết Hotel.", "error");
    return;
  }

  const reportBox = els.adminCompletedTypeReport;
  const hygieneEl = reportBox?.querySelector?.("[data-admin-hotel-hygiene]");
  const petCountEl = reportBox?.querySelector?.("[data-admin-hotel-end-pet-count]");
  const endPetCountValue = petCountEl?.value || "";

  if (!normalizeHotelPetCount(endPetCountValue)) {
    toast("Vui lòng nhập số lượng bé ở hotel cuối ngày trước khi bấm OK.", "error");
    petCountEl?.focus?.();
    return;
  }

  updateAdminHotelReportDraft({
    hygiene: hygieneEl?.value || "pending",
    endPetCount: endPetCountValue
  });

  const button = target;
  setButtonLoading(button, true, "Đang lưu...");

  try {
    await saveAdminHotelDailyReport();
    renderAdminTasks();
    toast("Đã lưu tổng kết Hotel trong ngày.", "success");
  } catch (error) {
    console.error(error);
    toast("Không lưu được tổng kết Hotel trong ngày. Kiểm tra Firestore Rules hotelDailyReports.", "error");
  } finally {
    setButtonLoading(button, false);
  }
});

els.employeeStatusFilter?.addEventListener("change", (event) => {
  state.employeeStatusFilter = event.target.value;

  if (state.employeeStatusFilter !== "completed") {
    state.employeeCompletedTypeFilter = "all";
  }

  renderEmployeeTasks();
});

els.employeeCompletedTypeFilter?.addEventListener("change", (event) => {
  state.employeeCompletedTypeFilter = event.target.value;
  renderEmployeeTasks();
});

els.adminEmployeeFilter.addEventListener("change", (event) => {
  state.adminEmployeeFilter = event.target.value;
  renderAdminTasks();
});

async function syncOverdueTasksByAdmin() {
  if (state.profile?.role !== "admin") return;

  const updates = state.tasks
    .filter((task) => ["doing", "hotel", "redo"].includes(task.status))
    .filter((task) => {
      const deadline = timestampToDate(task.deadlineAt);
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
  els.workTemplateView?.classList.add("hidden");
  els.employeeManagerView?.classList.add("hidden");
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

function getCompletedTaskGroup(task) {
  if (isLunchBreakTask(task)) return "lunch_break";
  if (isHotelTask(task)) return "hotel";
  return "normal";
}

function getCompletedTaskActualMinutes(task) {
  const storedMinutes = Number(task.actualMinutes || 0);

  if (storedMinutes > 0) return storedMinutes;

  const completedAt = timestampToDate(task.approvedAt) || timestampToDate(task.submittedAt);

  if (!completedAt) return 0;

  try {
    return calculateResultAt(task, completedAt).actualMinutes;
  } catch (error) {
    return 0;
  }
}

function getCompletedTypeFilterLabel(value) {
  const labels = {
    normal: "Công việc bình thường",
    lunch_break: "Đã nghỉ trưa",
    hotel: "Hotel đã làm"
  };

  return labels[value] || "";
}

function getCompletedReportTitle(filterValue) {
  if (filterValue === "normal") {
    return "Báo cáo tổng kết các task Công việc bình thường đã hoàn thành";
  }

  return filterValue === "lunch_break"
    ? "Báo cáo tổng thời gian các task Nghỉ trưa đã hoàn thành"
    : "Báo cáo tổng thời gian các task Hotel đã hoàn thành";
}

function getCompletedNormalTaskStats(task) {
  const deadlineMinutes = Number(task.deadlineMinutes || 0);
  const actualMinutes = Number(task.actualMinutes || 0) > 0
    ? Number(task.actualMinutes || 0)
    : getCompletedTaskActualMinutes(task);

  return {
    deadlineMinutes: Math.max(0, deadlineMinutes),
    actualMinutes: Math.max(0, actualMinutes)
  };
}

function formatNormalCompletedSummary(name, stats) {
  const actualMinutes = Number(stats.actualMinutes || 0);
  const deadlineMinutes = Number(stats.deadlineMinutes || 0);

  if (deadlineMinutes <= 0) {
    return `${name}: chưa đủ dữ liệu để tính năng lực làm so với quy định`;
  }

  const differencePercent = Number(((Math.abs(deadlineMinutes - actualMinutes) / deadlineMinutes) * 100).toFixed(1));
  let capacityPercent = 100;

  if (actualMinutes < deadlineMinutes) {
    capacityPercent = 100 + differencePercent;
  } else if (actualMinutes > deadlineMinutes) {
    capacityPercent = 100 - differencePercent;
  }

  capacityPercent = Math.max(0, Number(capacityPercent.toFixed(1)));

  return `${name}: năng lực làm đạt ${capacityPercent}% so với năng lực quy định`;
}

function getHotelHygieneStatusText(value) {
  if (value === "pass") return "Vệ sinh đạt";
  if (value === "fail") return "Vệ sinh không đạt";
  return "Chưa đánh giá";
}

function getAdminHotelReportDateKey() {
  const filter = state.adminDateFilter || {};

  if (filter.mode === "today") return todayInputValue();
  if (filter.mode === "single") return filter.single || "";

  return "";
}

function getSavedHotelDailyReport(dateKey) {
  if (!dateKey) return null;
  return state.hotelDailyReports.find((report) => report.id === dateKey || report.date === dateKey) || null;
}

function getAdminHotelReportDraft(dateKey = getAdminHotelReportDateKey()) {
  const saved = getSavedHotelDailyReport(dateKey);
  const draft = dateKey ? state.adminHotelReportDrafts[dateKey] : null;

  return {
    hygiene: draft?.hygiene ?? saved?.hygiene ?? state.adminHotelReportHygiene ?? "pending",
    endPetCount: draft?.endPetCount ?? (
      saved?.endPetCount ? String(saved.endPetCount) : (state.adminHotelEndPetCount ?? "")
    )
  };
}

function updateAdminHotelReportDraft(partial) {
  const dateKey = getAdminHotelReportDateKey();
  if (!dateKey) return;

  const current = getAdminHotelReportDraft(dateKey);
  state.adminHotelReportDrafts[dateKey] = {
    ...current,
    ...partial
  };
}

function getAdminCompletedHotelTasksForCurrentDate() {
  return state.tasks
    .map((task) => ({
      ...task,
      displayStatus: getDisplayStatus(task)
    }))
    .filter((task) => isTaskInDateFilter(task, state.adminDateFilter))
    .filter((task) => task.displayStatus === "completed")
    .filter((task) => getCompletedTaskGroup(task) === "hotel");
}

function buildAdminHotelDailyReportPayload() {
  const dateKey = getAdminHotelReportDateKey();
  const draft = getAdminHotelReportDraft(dateKey);
  const hygieneValue = draft.hygiene || "pending";
  const endPetCountRaw = draft.endPetCount ?? "";
  const endPetCount = normalizeHotelPetCount(endPetCountRaw);
  const allowedMinutes = endPetCount ? calculateHotelAllowedMinutes(endPetCount) : 0;
  const allCompletedHotelTasks = getAdminCompletedHotelTasksForCurrentDate();
  const totalsByEmployee = new Map();

  allCompletedHotelTasks.forEach((task) => {
    const employeeName = getEmployeeDisplayNameByUid(task.assignedToUid, task.assignedToName);
    const key = task.assignedToUid || employeeName;
    const current = totalsByEmployee.get(key) || {
      uid: task.assignedToUid || "",
      name: employeeName,
      minutes: 0
    };

    current.minutes += getCompletedTaskActualMinutes(task);
    totalsByEmployee.set(key, current);
  });

  const employeeTotals = Array.from(totalsByEmployee.values())
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));

  const totalActualMinutes = employeeTotals.reduce((sum, item) => sum + Number(item.minutes || 0), 0);

  let timeStatusText = "Chưa nhập số lượng bé hotel cuối ngày";
  if (endPetCount) {
    timeStatusText = totalActualMinutes <= allowedMinutes
      ? "Các bạn hôm nay làm đúng thời gian"
      : "Các bạn hôm nay làm không đúng thời gian";
  }

  return {
    dateKey,
    hygiene: hygieneValue,
    hygieneText: getHotelHygieneStatusText(hygieneValue),
    endPetCountRaw,
    endPetCount,
    allowedMinutes,
    totalActualMinutes,
    timeStatusText,
    employeeTotals
  };
}

let saveAdminHotelDailyReportTimer = null;

function scheduleSaveAdminHotelDailyReport() {
  clearTimeout(saveAdminHotelDailyReportTimer);
  saveAdminHotelDailyReportTimer = setTimeout(() => {
    saveAdminHotelDailyReport().catch((error) => {
      console.error(error);
      toast("Không lưu được tổng kết Hotel trong ngày. Kiểm tra Firestore Rules hotelDailyReports.", "error");
    });
  }, 500);
}

async function saveAdminHotelDailyReport() {
  if (state.profile?.role !== "admin") return;

  const payload = buildAdminHotelDailyReportPayload();
  if (!payload.dateKey) return;

  const reportData = {
    id: payload.dateKey,
    date: payload.dateKey,
    hygiene: payload.hygiene,
    hygieneText: payload.hygieneText,
    endPetCount: Number(payload.endPetCount || 0),
    allowedMinutes: Number(payload.allowedMinutes || 0),
    totalActualMinutes: Number(payload.totalActualMinutes || 0),
    timeStatusText: payload.timeStatusText,
    employeeTotals: payload.employeeTotals.map((item) => ({
      uid: item.uid || "",
      name: item.name || "",
      minutes: Number(item.minutes || 0)
    })),
    updatedByUid: state.user?.uid || "",
    updatedByName: state.profile?.name || state.user?.email || "Admin"
  };

  await setDoc(doc(db, "hotelDailyReports", payload.dateKey), {
    ...reportData,
    updatedAt: serverTimestamp()
  }, { merge: true });

  state.hotelDailyReports = [
    ...state.hotelDailyReports.filter((report) => report.id !== payload.dateKey && report.date !== payload.dateKey),
    {
      ...reportData,
      updatedAt: new Date()
    }
  ];

  return reportData;
}

function renderAdminHotelReportControls() {
  const dateKey = getAdminHotelReportDateKey();
  const saved = getSavedHotelDailyReport(dateKey);
  const draft = getAdminHotelReportDraft(dateKey);
  const hygieneValue = draft.hygiene || "pending";
  const endPetCountRaw = draft.endPetCount ?? "";
  const savedEndPetCount = normalizeHotelPetCount(saved?.endPetCount);
  const savedAllowedMinutes = Number(saved?.allowedMinutes || 0);
  const savedTimeStatusText = saved?.timeStatusText || "Chưa lưu kết quả Hotel";
  const savedHygieneText = saved?.hygieneText || getHotelHygieneStatusText(saved?.hygiene || "pending");

  return `
    <label class="hotel-report-control">
      <span>Vệ sinh</span>
      <select data-admin-hotel-hygiene>
        <option value="pending" ${hygieneValue === "pending" ? "selected" : ""}>Chưa đánh giá</option>
        <option value="pass" ${hygieneValue === "pass" ? "selected" : ""}>Đạt</option>
        <option value="fail" ${hygieneValue === "fail" ? "selected" : ""}>Không đạt</option>
      </select>
    </label>
    <label class="hotel-report-control hotel-report-pet-control">
      <span>Số lượng bé ở hotel khi cho ăn và vệ sinh</span>
      <input data-admin-hotel-end-pet-count type="number" min="1" max="500" step="1" value="${escapeHtml(endPetCountRaw)}" placeholder="Nhập số bé" />
    </label>
    <button type="button" class="hotel-report-ok-btn" data-admin-hotel-report-ok>OK</button>
    <span class="hotel-report-hygiene-status">${escapeHtml(savedHygieneText)}</span>
    <span class="hotel-report-end-time">Thời gian làm hotel: ${savedEndPetCount ? escapeHtml(formatMinutes(savedAllowedMinutes)) : "--"}</span>
    <span class="hotel-report-time-status">${escapeHtml(savedTimeStatusText)}</span>
  `;
}

function renderCompletedTypeReport(tasks, scope = "admin") {
  const statusFilter = state[`${scope}StatusFilter`];
  const completedTypeFilter = state[`${scope}CompletedTypeFilter`];
  const reportEl = els[`${scope}CompletedTypeReport`];

  if (!reportEl) return;

  const shouldShowReport =
    statusFilter === "completed" &&
    ["normal", "lunch_break", "hotel"].includes(completedTypeFilter);

  if (!shouldShowReport) {
    reportEl.classList.add("hidden");
    reportEl.innerHTML = "";
    return;
  }

  if (completedTypeFilter === "normal") {
    const totalsByEmployee = new Map();

    tasks.forEach((task) => {
      const employeeName = getEmployeeDisplayNameByUid(task.assignedToUid, task.assignedToName);
      const current = totalsByEmployee.get(employeeName) || { actualMinutes: 0, deadlineMinutes: 0 };
      const taskStats = getCompletedNormalTaskStats(task);

      totalsByEmployee.set(employeeName, {
        actualMinutes: current.actualMinutes + taskStats.actualMinutes,
        deadlineMinutes: current.deadlineMinutes + taskStats.deadlineMinutes
      });
    });

    const rows = Array.from(totalsByEmployee.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "vi"))
      .map(([name, stats]) => `<span>${escapeHtml(formatNormalCompletedSummary(name, stats))}</span>`)
      .join("");

    reportEl.classList.remove("hidden");
    reportEl.innerHTML = `
      <strong>${escapeHtml(getCompletedReportTitle(completedTypeFilter))}</strong>
      ${rows || "<span>Chưa có dữ liệu phù hợp</span>"}
    `;
    return;
  }

  const totalsByEmployee = new Map();

  tasks.forEach((task) => {
    const employeeName = getEmployeeDisplayNameByUid(task.assignedToUid, task.assignedToName);
    const current = totalsByEmployee.get(employeeName) || 0;
    totalsByEmployee.set(employeeName, current + getCompletedTaskActualMinutes(task));
  });

  const rows = Array.from(totalsByEmployee.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "vi"))
    .map(([name, minutes]) => `<span>${escapeHtml(name)}: ${escapeHtml(formatMinutes(minutes))}</span>`)
    .join("");

  const adminHotelControls = scope === "admin" && completedTypeFilter === "hotel"
    ? renderAdminHotelReportControls()
    : "";

  reportEl.classList.remove("hidden");
  reportEl.innerHTML = `
    <strong>${escapeHtml(getCompletedReportTitle(completedTypeFilter))}</strong>
    ${adminHotelControls}
    ${rows || "<span>Chưa có dữ liệu phù hợp</span>"}
  `;
}

function updateCompletedTypeFilterVisibility(scope = "admin") {
  const statusFilter = state[`${scope}StatusFilter`];
  const completedTypeFilterEl = els[`${scope}CompletedTypeFilter`];

  if (!completedTypeFilterEl) return;

  const show = statusFilter === "completed";
  completedTypeFilterEl.classList.toggle("hidden", !show);

  if (show) {
    completedTypeFilterEl.value = state[`${scope}CompletedTypeFilter`];
  } else {
    completedTypeFilterEl.value = "all";
    state[`${scope}CompletedTypeFilter`] = "all";
  }
}

function taskMatchesStatusFilter(task, statusFilter) {
  if (statusFilter === "all") return true;

  if (statusFilter === "completed") {
    return task.displayStatus === "completed";
  }

  if (statusFilter === "hotel") {
    return isActiveHotelTaskForEmployeeSummary(task);
  }

  return task.displayStatus === statusFilter || task.status === statusFilter;
}


function getEmployeeSummaryName(employee) {
  return employee?.name || employee?.email || "Chưa đặt tên";
}

function isActiveHotelTaskForEmployeeSummary(task) {
  if (!task?.assignedToUid || !isHotelTask(task)) return false;

  const displayStatus = task.displayStatus || getDisplayStatus(task);

  // Task Hotel vẫn phải được tính là “đang làm hotel” kể cả khi đã gần hết giờ
  // hoặc quá hạn. Chỉ loại những trạng thái chưa bắt đầu/đã xong/đang chờ duyệt.
  return ![
    "draft",
    "waiting_assignee",
    "queued",
    "submitted",
    "completed"
  ].includes(displayStatus);
}

function isTaskBlockingEmployeeForSummary(task) {
  if (!task?.assignedToUid) return false;

  const displayStatus = task.displayStatus || getDisplayStatus(task);

  // Nhân viên đang “Chờ đến lượt” vẫn được xem là chưa được giao việc
  // trong phần tổng kết nhân viên, vì task đó chưa bắt đầu chiếm thời gian làm thực tế.
  if (isActiveHotelTaskForEmployeeSummary(task)) return true;

  return [
    "doing",
    "near_due",
    "overdue",
    "redo",
    "lunch_break"
  ].includes(displayStatus);
}

function renderEmployeeStatusNameChips(employees) {
  if (!employees.length) {
    return '<span class="employee-status-empty">Không có</span>';
  }

  return employees
    .map((employee) => `<span class="employee-status-chip">${escapeHtml(getEmployeeSummaryName(employee))}</span>`)
    .join("");
}

function renderAdminEmployeeStatusSummary(computedTasks = []) {
  const summaryEl = els.adminEmployeeStatusSummary;
  if (!summaryEl) return;

  const employees = [...state.employees].sort((a, b) => getEmployeeSummaryName(a).localeCompare(getEmployeeSummaryName(b), "vi"));

  if (!employees.length) {
    summaryEl.classList.remove("hidden");
    summaryEl.innerHTML = `
      <div class="employee-status-card is-free">
        <strong>Tổng số bạn nhân viên đang chưa được giao việc: 0</strong>
        <div class="employee-status-names"><span class="employee-status-empty">Chưa có nhân viên</span></div>
      </div>
      <div class="employee-status-card is-assigned">
        <strong>Tổng số bạn nhân viên đã được giao việc: 0</strong>
        <div class="employee-status-names"><span class="employee-status-empty">Không có</span></div>
      </div>
      <div class="employee-status-card is-hotel">
        <strong>Tổng số bạn nhân viên đang làm hotel: 0</strong>
        <div class="employee-status-names"><span class="employee-status-empty">Không có</span></div>
      </div>
      <div class="employee-status-card is-lunch">
        <strong>Tổng số bạn nhân viên đang nghỉ trưa: 0</strong>
        <div class="employee-status-names"><span class="employee-status-empty">Không có</span></div>
      </div>
    `;
    return;
  }

  const busyEmployeeUids = new Set();
  const hotelEmployeeUids = new Set();
  const lunchEmployeeUids = new Set();

  computedTasks.forEach((task) => {
    if (!task?.assignedToUid) return;

    const displayStatus = task.displayStatus || getDisplayStatus(task);

    if (isTaskBlockingEmployeeForSummary(task)) {
      busyEmployeeUids.add(task.assignedToUid);
    }

    if (isActiveHotelTaskForEmployeeSummary(task)) {
      hotelEmployeeUids.add(task.assignedToUid);
    }

    if (displayStatus === "lunch_break") {
      lunchEmployeeUids.add(task.assignedToUid);
    }
  });

  const freeEmployees = employees.filter((employee) => !busyEmployeeUids.has(employee.uid));
  const assignedEmployees = employees.filter((employee) => busyEmployeeUids.has(employee.uid));
  const hotelEmployees = employees.filter((employee) => hotelEmployeeUids.has(employee.uid));
  const lunchEmployees = employees.filter((employee) => lunchEmployeeUids.has(employee.uid));

  summaryEl.classList.remove("hidden");
  summaryEl.innerHTML = `
    <div class="employee-status-card is-free">
      <strong>Tổng số bạn nhân viên đang chưa được giao việc: ${freeEmployees.length}</strong>
      <div class="employee-status-names">${renderEmployeeStatusNameChips(freeEmployees)}</div>
    </div>
    <div class="employee-status-card is-assigned">
      <strong>Tổng số bạn nhân viên đã được giao việc: ${assignedEmployees.length}</strong>
      <div class="employee-status-names">${renderEmployeeStatusNameChips(assignedEmployees)}</div>
    </div>
    <div class="employee-status-card is-hotel">
      <strong>Tổng số bạn nhân viên đang làm hotel: ${hotelEmployees.length}</strong>
      <div class="employee-status-names">${renderEmployeeStatusNameChips(hotelEmployees)}</div>
    </div>
    <div class="employee-status-card is-lunch">
      <strong>Tổng số bạn nhân viên đang nghỉ trưa: ${lunchEmployees.length}</strong>
      <div class="employee-status-names">${renderEmployeeStatusNameChips(lunchEmployees)}</div>
    </div>
  `;
}

function renderAdminTasks() {
  const computed = state.tasks.map((task) => ({
    ...task,
    displayStatus: getDisplayStatus(task)
  }));

  renderAdminEmployeeStatusSummary(computed);

  const baseFiltered = getAdminBaseFilteredTasks(computed);

  const stats = {
    draft: baseFiltered.filter((task) => task.displayStatus === "draft").length,
    doing: baseFiltered.filter((task) => (
      task.displayStatus === "doing" ||
      task.displayStatus === "lunch_break" ||
      task.displayStatus === "near_due" ||
      task.displayStatus === "redo"
    )).length,
    hotel: baseFiltered.filter((task) => isActiveHotelTaskForEmployeeSummary(task)).length,
    completed: baseFiltered.filter((task) => task.displayStatus === "completed").length
  };

  if (els.statDraft) els.statDraft.textContent = stats.draft;
  if (els.statDoing) els.statDoing.textContent = stats.doing;
  if (els.statHotel) els.statHotel.textContent = stats.hotel;
  if (els.statCompleted) els.statCompleted.textContent = stats.completed;

  let filtered = baseFiltered;

  if (state.adminStatusFilter !== "all") {
    filtered = filtered.filter((task) => taskMatchesStatusFilter(task, state.adminStatusFilter));
  }

  updateCompletedTypeFilterVisibility("admin");

  if (state.adminStatusFilter === "completed" && state.adminCompletedTypeFilter !== "all") {
    filtered = filtered.filter((task) => getCompletedTaskGroup(task) === state.adminCompletedTypeFilter);
  }

  renderCompletedTypeReport(filtered);
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

  groups.forEach((group) => {
    group.tasks.sort((a, b) => Number(a.rowIndex ?? 0) - Number(b.rowIndex ?? 0));
  });

  return groups;
}

// Thêm các phiếu nháp CHƯA có công việc nào (0 dòng) vào danh sách hiển thị — nếu chỉ dựa
// vào tasks thì những phiếu này sẽ không xuất hiện ở đâu cả (vì chưa có task nào tham chiếu tới).
function isDraftTicketGroup(group) {
  return !group.tasks.length || group.tasks.every((task) => task.status === "draft");
}

function sortTicketGroupsForDisplay(groups) {
  return groups.sort((a, b) => {
    const aIsDraft = isDraftTicketGroup(a);
    const bIsDraft = isDraftTicketGroup(b);

    // Luôn ưu tiên hiển thị toàn bộ phiếu Chưa giao việc ở trên cùng,
    // sau đó mới tới các phiếu có trạng thái khác.
    if (aIsDraft !== bIsDraft) return aIsDraft ? -1 : 1;

    return b.createdAtMs - a.createdAtMs;
  });
}

function withEmptyDraftGroups(groups, showEmptyDrafts) {
  if (!showEmptyDrafts) return sortTicketGroupsForDisplay(groups);

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

  return sortTicketGroupsForDisplay([...groups, ...emptyDraftGroups]);
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
    <section class="ticket-group ${isDraft ? "is-draft-ticket" : ""}" data-work-order-id="${escapeHtml(group.key)}">
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
  let filtered = state.tasks
    .filter((task) => isTaskInDateFilter(task, state.employeeDateFilter))
    .map((task) => ({
      ...task,
      displayStatus: getDisplayStatus(task)
    }));

  if (state.employeeStatusFilter !== "all") {
    filtered = filtered.filter((task) => taskMatchesStatusFilter(task, state.employeeStatusFilter));
  }

  updateCompletedTypeFilterVisibility("employee");

  if (state.employeeStatusFilter === "completed" && state.employeeCompletedTypeFilter !== "all") {
    filtered = filtered.filter((task) => getCompletedTaskGroup(task) === state.employeeCompletedTypeFilter);
  }

  renderCompletedTypeReport(filtered, "employee");
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

function canAdminReassignTask(task, mode, displayStatus = null) {
  if (mode !== "admin" || state.profile?.role !== "admin") return false;
  if (!task?.id) return false;

  const visibleStatus = displayStatus || getDisplayStatus(task);

  return (
    ["waiting_assignee", "doing", "lunch_break", "hotel", "near_due", "queued", "overdue", "redo"].includes(visibleStatus)
    && ["waiting_assignee", "doing", "lunch_break", "hotel", "redo", "overdue"].includes(task.status)
  );
}

function getEmployeeDisplayNameByUid(uid, fallbackName = "") {
  if (!uid) return fallbackName || "Chờ chọn người";
  const employee = state.employees.find((item) => item.uid === uid);
  return fallbackName || employee?.name || employee?.email || "--";
}

function getHotelPetCount(task) {
  const count = normalizeHotelPetCount(task?.hotelPetCount);
  return count || (isHotelTask(task) ? HOTEL_BASE_PET_COUNT : 0);
}

function getTaskHotelAllowedMinutes(task) {
  const storedMinutes = Number(task?.hotelAllowedMinutes || 0);
  if (Number.isFinite(storedMinutes) && storedMinutes > 0) return storedMinutes;

  const fromPetCount = calculateHotelAllowedMinutes(getHotelPetCount(task));
  return fromPetCount || Number(task?.deadlineMinutes || 0);
}

function renderHotelInfoBox(task) {
  if (!isHotelTask(task)) return "";

  return `
    <div class="hotel-info-box">
      <strong>
        <span class="hotel-highlight">10 bé</span> ở hotel thì tổng thời gian cho ăn và dọn dẹp của các bạn chăm sóc trong 1 ngày sẽ là <span class="hotel-highlight">30 phút</span>.
        Cứ <span class="hotel-highlight">mỗi 1 bé vào</span> ở thêm thì sẽ cộng thêm thời gian cho <span class="hotel-highlight">2 phút</span>.
      </strong>
    </div>
  `;
}

function renderAssignedEmployeeMetaBox(task, mode, displayStatus) {
  const employeeName = getEmployeeDisplayNameByUid(task.assignedToUid, task.assignedToName);

  if (!canAdminReassignTask(task, mode, displayStatus)) {
    return `
      <div class="meta-box">
        <span>Nhân viên</span>
        <strong>${escapeHtml(employeeName)}</strong>
      </div>
    `;
  }

  return `
    <div
      class="meta-box assignee-change-box"
      data-action="open-reassign-employee"
      data-task-id="${escapeHtml(task.id)}"
      role="button"
      tabindex="0"
      title="Bấm vào ô này để đổi nhân viên phụ trách"
    >
      <span>Nhân viên</span>
      <strong>${escapeHtml(employeeName)}</strong>
    </div>
  `;
}

function isUnfinishedAssignedTask(task) {
  return Boolean(task?.assignedToUid) && !["draft", "waiting_assignee", "completed"].includes(task.status);
}

function employeeHasUnfinishedTask(employeeUid, ignoredTaskId = "") {
  return state.tasks.some((task) => (
    task.id !== ignoredTaskId
    && task.assignedToUid === employeeUid
    && isUnfinishedAssignedTask(task)
  ));
}

function getAvailableReplacementEmployees(task) {
  return state.employees.filter((employee) => (
    employee.uid
    && employee.uid !== task.assignedToUid
    && !employeeHasUnfinishedTask(employee.uid, task.id)
  ));
}

function renderTaskCard(task, mode) {
  const displayStatus = task.displayStatus || getDisplayStatus(task);
  const deadlineDate = timestampToDate(task.deadlineAt);
  const deadlineMs = deadlineDate?.getTime() || 0;
  const queueStartDate = timestampToDate(task.queueStartAt);
  const queueStartMs = queueStartDate?.getTime() || 0;
  const remainingPauseMs = Number(task.remainingMsAtPause || 0);
  const dispatchedText = task.status === "waiting_assignee" && !task.dispatchedAt
    ? "--"
    : formatDateTime(task.dispatchedAt || task.createdAt);

  const canEmployeeSubmit =
    mode === "employee" &&
    ["doing", "lunch_break", "hotel", "redo", "overdue"].includes(task.status) &&
    task.status !== "completed" &&
    task.status !== "submitted" &&
    displayStatus !== "queued";

  const canAdminReview =
    mode === "admin" &&
    task.status === "submitted";

  return `
    <article class="task-card ${taskCardClass(displayStatus)}" data-task-card data-task-id="${escapeHtml(task.id)}" data-work-order-id="${escapeHtml(task.workOrderId || "legacy")}" data-deadline-ms="${deadlineMs}" data-deadline-minutes="${Number(task.deadlineMinutes || 0)}" data-queue-start-ms="${queueStartMs}" data-remaining-pause-ms="${remainingPauseMs}" data-raw-status="${escapeHtml(task.status)}" data-display-status="${escapeHtml(displayStatus)}">
      <div class="task-top">
        <div>
          <h4 class="task-title">${escapeHtml(task.title) || "(Chưa đặt tên công việc)"}</h4>
          <p class="task-desc">${escapeHtml(task.description)}</p>
        </div>
        <span class="status-pill status-${displayStatus}">${statusLabel(displayStatus)}</span>
      </div>

      <div class="task-meta">
        ${renderAssignedEmployeeMetaBox(task, mode, displayStatus)}
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
          <strong>${dispatchedText}</strong>
        </div>
        <div class="meta-box">
          <span>Hạn lúc</span>
          <strong>${formatDateTime(task.deadlineAt)}</strong>
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

      ${renderPhotoReportBox(task, mode)}
      ${renderHotelInfoBox(task)}
      ${renderTimeExtensionBox(task)}
      ${renderAssigneeHistoryBox(task)}
      ${renderLunchBreakHistoryBox(task)}
      ${renderResultBox(task)}
      ${renderTaskActions(task, {
        canEmployeeSubmit,
        canAdminReview,
        canAdminEndLunchBreak: canAdminEndLunchBreak(task, mode),
        canAdminExtendTime: canAdminExtendTaskTime(task, mode),
        canEmployeeUploadPhotos: canEmployeeUploadTaskPhotos(task, mode, displayStatus),
        submitPhotoReady: hasEnoughRequiredPhotos(task)
      })}
    </article>
  `;
}

function getInitialCountdownText(task) {
  if (task.status === "draft") return "Chưa giao việc";
  if (task.status === "waiting_assignee") {
    const remainingMs = Number(task.remainingMsAtPause || 0);
    return remainingMs > 0
      ? `Tạm dừng - còn ${formatCountdown(remainingMs)}`
      : `Chờ chọn người - chưa bắt đầu`;
  }
  if (task.status === "completed") return "Đã hoàn thành";
  if (task.status === "submitted") return "Chờ Admin duyệt";

  const queueStart = timestampToDate(task.queueStartAt);
  if (queueStart && Date.now() < queueStart.getTime()) {
    return `Chờ đến lượt (bắt đầu ${formatDateTime(task.queueStartAt)})`;
  }

  const deadline = timestampToDate(task.deadlineAt);

  if (!deadline) return "--";

  const ms = deadline.getTime() - Date.now();

  return ms >= 0
    ? `Còn ${formatCountdown(ms)}`
    : `Quá hạn ${formatCountdown(ms)}`;
}

function renderAssigneeHistoryBox(task) {
  const history = Array.isArray(task.assigneeChangeHistory)
    ? task.assigneeChangeHistory
    : [];

  if (!history.length) return "";

  const rows = history
    .slice()
    .sort((a, b) => (timestampToDate(b.changedAt)?.getTime() || 0) - (timestampToDate(a.changedAt)?.getTime() || 0))
    .map((item, index) => {
      const fromName = item.fromName || "Nhân viên cũ";
      const toName = item.toName || "Nhân viên mới";
      const changedBy = item.changedByName || "Admin";
      const changedAt = formatFullDateTime(item.changedAt);
      let modeText = item.restartedFromQueue
        ? "Bắt đầu lại thời gian như công việc mới"
        : "Giữ nguyên thời gian đang chạy";

      if (item.action === "wait_assignee") {
        modeText = item.remainingMsAtPause
          ? `Tạm dừng thời gian, còn ${formatCountdown(Number(item.remainingMsAtPause || 0))}`
          : "Chuyển về Chờ chọn người";
      }

      if (item.action === "assign_from_waiting") {
        modeText = item.remainingMsAtPause
          ? `Tiếp tục tính giờ từ ${formatCountdown(Number(item.remainingMsAtPause || 0))}`
          : "Bắt đầu tính giờ đủ thời gian quy định";
      }

      return `
        <li>
          <strong>Lần ${history.length - index}: ${escapeHtml(fromName)} → ${escapeHtml(toName)}</strong>
          <span>${escapeHtml(changedAt)} • ${escapeHtml(changedBy)} • ${escapeHtml(modeText)}</span>
        </li>
      `;
    })
    .join("");

  return `
    <div class="extension-box assignee-history-box">
      <div class="extension-box-head">
        <strong>Lịch sử thay đổi nhân viên</strong>
        <span>${history.length} lần thay đổi</span>
      </div>
      <ul class="extension-list">${rows}</ul>
    </div>
  `;
}

function getLunchBreakActualMinutes(task) {
  const storedMinutes = Number(task.actualMinutes || 0);

  if (storedMinutes > 0) return storedMinutes;

  const completedAt = timestampToDate(task.approvedAt) || timestampToDate(task.submittedAt);

  if (!completedAt) return 0;

  try {
    return calculateResultAt(task, completedAt).actualMinutes;
  } catch (error) {
    return 0;
  }
}

function renderLunchBreakHistoryBox(task) {
  if (!isLunchBreakTask(task) || task.status !== "completed") return "";

  const employeeName = getEmployeeDisplayNameByUid(task.assignedToUid, task.assignedToName);
  const actualMinutes = getLunchBreakActualMinutes(task);
  const finishedAt = formatFullDateTime(task.approvedAt || task.submittedAt);

  return `
    <div class="extension-box lunch-break-history-box">
      <div class="extension-box-head">
        <strong>Lịch sử nghỉ trưa</strong>
        <span>${escapeHtml(finishedAt)}</span>
      </div>
      <ul class="extension-list">
        <li>
          <strong>${escapeHtml(employeeName)} đã nghỉ trưa được ${actualMinutes} phút</strong>
          <span>Thời gian tính từ lúc bắt đầu nghỉ trưa đến khi hoàn thành.</span>
        </li>
      </ul>
    </div>
  `;
}

function renderPhotoReportBox(task, mode) {
  const photoCount = getTaskPhotoCount(task);
  const required = taskRequiresPhotos(task);
  const requiredCount = getTaskRequiredPhotoCount(task);
  const enough = hasEnoughRequiredPhotos(task);
  const summary = required
    ? `Bắt buộc ${requiredCount} hình • đã đăng ${photoCount}/${requiredCount}`
    : `Không bắt buộc đăng hình • đã đăng ${photoCount} hình`;

  const statusText = required
    ? (enough ? "Đã đủ hình báo cáo" : `Còn thiếu ${Math.max(0, requiredCount - photoCount)} hình`)
    : "Nhân viên có thể hoàn thành mà không cần đăng hình";

  const canView = photoCount > 0 && (mode === "admin" || mode === "employee");
  const editableByAdmin = mode === "admin" && !["completed"].includes(task.status);
  const titleText = editableByAdmin
    ? "Admin bấm để chỉnh số lượng ảnh báo cáo bắt buộc"
    : "";

  return `
    <div
      class="photo-report-box ${required && !enough ? "is-missing" : ""} ${editableByAdmin ? "is-admin-editable" : ""}"
      ${editableByAdmin ? `data-action="edit-photo-requirement" data-task-id="${escapeHtml(task.id)}" role="button" tabindex="0" title="${escapeHtml(titleText)}"` : ""}
    >
      <div>
        <strong>Ảnh báo cáo</strong>
        <span>${escapeHtml(summary)} • ${escapeHtml(statusText)}</span>
        ${editableByAdmin ? `<small class="photo-report-hint">Admin có thể bấm vào ô này để chỉnh số lượng ảnh bắt buộc.</small>` : ""}
      </div>
      ${canView ? `
        <button class="btn ghost small" data-action="view-task-photos" data-task-id="${escapeHtml(task.id)}" type="button">
          Xem hình (${photoCount})
        </button>
      ` : ""}
    </div>
  `;
}

function closePhotoRequirementEditor(editorEl, resolveValue, value = null) {
  if (!editorEl) return;
  editorEl.remove();
  if (typeof resolveValue === "function") resolveValue(value);
}

function openPhotoRequirementEditor({ task, currentRequired, currentCount, photoCount }) {
  return new Promise((resolve) => {
    document.querySelector(".photo-requirement-editor-backdrop")?.remove();

    const editorEl = document.createElement("div");
    editorEl.className = "photo-requirement-editor-backdrop";
    editorEl.innerHTML = `
      <div class="photo-requirement-editor-card" role="dialog" aria-modal="true" aria-label="Chỉnh số lượng ảnh báo cáo">
        <button class="photo-requirement-editor-close" type="button" data-photo-requirement-close aria-label="Đóng">×</button>
        <span class="photo-requirement-editor-eyebrow">Ảnh báo cáo</span>
        <h2>Chỉnh số lượng ảnh bắt buộc</h2>
        <p class="photo-requirement-editor-desc">
          Task: <strong>${escapeHtml(task.title || "Công việc")}</strong><br>
          Hiện tại: <strong>${escapeHtml(currentRequired ? `${currentCount} hình` : "không bắt buộc đăng hình")}</strong> • Nhân viên đã đăng: <strong>${photoCount} hình</strong>
        </p>
        <label class="photo-requirement-editor-label">
          Số lượng ảnh bắt buộc mới
          <input id="photoRequirementEditInput" type="number" min="0" max="100" step="1" value="${escapeHtml(String(currentRequired ? currentCount : 0))}" inputmode="numeric" />
        </label>
        <small class="photo-requirement-editor-note">Nhập <strong>0</strong> nếu muốn tắt bắt buộc đăng hình. Số lượng hợp lệ từ 0 đến 100.</small>
        <div class="photo-requirement-editor-actions">
          <button class="btn ghost" type="button" data-photo-requirement-close>Hủy</button>
          <button class="btn primary" type="button" data-photo-requirement-save>Lưu cập nhật</button>
        </div>
      </div>
    `;

    document.body.appendChild(editorEl);

    const inputEl = editorEl.querySelector("#photoRequirementEditInput");
    const saveBtn = editorEl.querySelector("[data-photo-requirement-save]");

    const close = (value = null) => closePhotoRequirementEditor(editorEl, resolve, value);

    editorEl.querySelectorAll("[data-photo-requirement-close]").forEach((button) => {
      button.addEventListener("click", () => close(null));
    });

    editorEl.addEventListener("click", (event) => {
      if (event.target === editorEl) close(null);
    });

    editorEl.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        saveBtn?.click();
      }
    });

    saveBtn?.addEventListener("click", () => {
      const nextCount = Number(String(inputEl?.value || "").trim());

      if (!Number.isInteger(nextCount) || nextCount < 0 || nextCount > 100) {
        showToast("Số lượng ảnh phải là số nguyên từ 0 đến 100.");
        inputEl?.focus();
        return;
      }

      close(nextCount);
    });

    setTimeout(() => {
      inputEl?.focus();
      inputEl?.select();
    }, 30);
  });
}

async function editTaskPhotoRequirement(taskId) {
  if (!isAdminProfile()) return;

  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    showToast("Không tìm thấy task công việc cần chỉnh ảnh báo cáo.");
    return;
  }

  if (task.status === "completed") {
    showToast("Task đã hoàn thành, không cần chỉnh số lượng ảnh báo cáo nữa.");
    return;
  }

  const currentRequired = taskRequiresPhotos(task);
  const currentCount = getTaskRequiredPhotoCount(task);
  const photoCount = getTaskPhotoCount(task);
  const nextCount = await openPhotoRequirementEditor({
    task,
    currentRequired,
    currentCount,
    photoCount
  });

  if (nextCount === null || nextCount === undefined) return;

  const nextRequired = nextCount > 0;

  await updateDoc(doc(db, "tasks", task.id), {
    photoRequired: nextRequired,
    requiredPhotoCount: nextRequired ? nextCount : 0
  });

  showToast(
    nextRequired
      ? `Đã cập nhật yêu cầu ảnh báo cáo thành ${nextCount} hình.`
      : "Đã tắt bắt buộc đăng hình cho task này."
  );
}

function renderResultBox(task) {
  if (isLunchBreakTask(task)) return "";
  if (task.status !== "completed" || !task.resultType) return "";

  if (isHotelTask(task)) {
    const employeeName = getEmployeeDisplayNameByUid(task.assignedToUid, task.assignedToName);
    return `
      <div class="result-box hotel-result-box">
        <strong>${escapeHtml(employeeName)} làm hotel được ${formatMinutes(task.actualMinutes)}</strong>
      </div>
    `;
  }

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

function canAdminEndLunchBreak(task, mode) {
  return mode === "admin"
    && state.profile?.role === "admin"
    && isLunchBreakTask(task)
    && task.status === "lunch_break";
}

function canAdminExtendTaskTime(task, mode) {
  return mode === "admin" && ["doing", "hotel", "redo", "overdue"].includes(task.status);
}

function canEmployeeUploadTaskPhotos(task, mode, displayStatus = null) {
  if (mode !== "employee") return false;
  if (!task?.id || task.assignedToUid !== state.user?.uid) return false;
  const visibleStatus = displayStatus || getDisplayStatus(task);
  return ["doing", "lunch_break", "hotel", "redo", "overdue", "near_due"].includes(visibleStatus)
    && ["doing", "lunch_break", "hotel", "redo", "overdue"].includes(task.status);
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

  if (permissions.canEmployeeUploadPhotos) {
    buttons.push(`
      <button class="btn secondary" data-action="upload-task-photos" data-task-id="${escapeHtml(task.id)}">
        Đăng hình
      </button>
    `);
  }

  if (permissions.canEmployeeSubmit) {
    const disabled = permissions.submitPhotoReady ? "" : " disabled";
    const title = permissions.submitPhotoReady ? "" : " title=\"Cần đăng đủ số lượng hình theo quy định trước khi hoàn thành\"";

    buttons.push(`
      <button class="btn primary" data-action="submit-task" data-task-id="${escapeHtml(task.id)}"${disabled}${title}>
        Hoàn thành
      </button>
    `);
  }

  if (permissions.canAdminEndLunchBreak) {
    buttons.push(`
      <button class="btn primary" data-action="end-lunch-break" data-task-id="${escapeHtml(task.id)}">
        Kết thúc
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

// Bắt riêng thao tác bấm vào toàn bộ ô “Ảnh báo cáo” của Admin.
// Dùng capture để tránh bị các listener khác nuốt sự kiện trên desktop/mobile.
document.addEventListener("click", async (event) => {
  const photoRequirementTarget = event.target.closest?.('[data-action="edit-photo-requirement"]');

  if (!photoRequirementTarget) return;
  if (event.target.closest?.('[data-action="view-task-photos"]')) return;

  event.preventDefault();
  event.stopPropagation();
  await editTaskPhotoRequirement(photoRequirementTarget.dataset.taskId);
}, true);

// Event delegation cho các nút trong task card, ticket-group và notification list.
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  const action = button.dataset.action;
  const taskId = button.dataset.taskId;

  if (action === "open-extend-time") {
    openExtendTimeModal(taskId);
  }

  if (action === "open-reassign-employee") {
    openReassignEmployeeModal(taskId);
  }

  if (action === "upload-task-photos") {
    await openPhotoUploadPicker(taskId, button);
  }

  if (action === "view-task-photos") {
    openPhotoReportModal(taskId);
  }

  if (action === "edit-photo-requirement") {
    await editTaskPhotoRequirement(taskId);
  }

  if (action === "submit-task") {
    await submitTask(taskId, button);
  }

  if (action === "approve-task") {
    await approveTask(taskId, button);
  }

  if (action === "end-lunch-break") {
    await endLunchBreakTask(taskId, button);
  }

  if (action === "redo-task") {
    await requestRedo(taskId, button);
  }

  if (action === "mark-notification-read") {
    await markNotificationRead(button.dataset.notificationId);
  }

  if (action === "open-notification-target") {
    await openNotificationTarget(button.dataset.notificationId);
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

document.addEventListener("keydown", async (event) => {
  if (!["Enter", " "].includes(event.key)) return;

  const reassignTarget = event.target.closest('[data-action="open-reassign-employee"]');
  if (reassignTarget) {
    event.preventDefault();
    openReassignEmployeeModal(reassignTarget.dataset.taskId);
    return;
  }

  const notificationTarget = event.target.closest('[data-action="open-notification-target"]');
  if (notificationTarget) {
    event.preventDefault();
    await openNotificationTarget(notificationTarget.dataset.notificationId);
    return;
  }

  const photoRequirementTarget = event.target.closest('[data-action="edit-photo-requirement"]');
  if (photoRequirementTarget) {
    event.preventDefault();
    await editTaskPhotoRequirement(photoRequirementTarget.dataset.taskId);
  }
});


// =========================
// Ảnh báo cáo công việc
// =========================
function closePhotoReportModal() {
  state.photoReportTaskId = null;
  if (els.photoReportGrid) els.photoReportGrid.innerHTML = "";
  els.photoReportModal?.classList.add("hidden");
}

$$('[data-close-photo-modal]').forEach((button) => {
  button.addEventListener("click", closePhotoReportModal);
});

function openPhotoReportModal(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    toast("Không tìm thấy công việc cần xem hình.", "error");
    return;
  }

  const photos = getTaskPhotos(task)
    .slice()
    .sort((a, b) => (timestampToDate(b.uploadedAt)?.getTime() || 0) - (timestampToDate(a.uploadedAt)?.getTime() || 0));

  state.photoReportTaskId = taskId;

  if (els.photoReportTaskTitle) {
    els.photoReportTaskTitle.textContent = task.title || "Công việc";
  }

  if (els.photoReportSummary) {
    const required = taskRequiresPhotos(task)
      ? `Bắt buộc ${getTaskRequiredPhotoCount(task)} hình`
      : "Không bắt buộc đăng hình";
    els.photoReportSummary.textContent = `${required} • Đã đăng ${photos.length} hình`;
  }

  if (els.photoReportGrid) {
    els.photoReportGrid.innerHTML = photos.length
      ? photos.map((photo, index) => `
        <a class="photo-report-item" href="${escapeHtml(photo.url)}" target="_blank" rel="noopener">
          <img src="${escapeHtml(photo.url)}" alt="Ảnh báo cáo ${index + 1}" loading="lazy" />
          <div>
            <strong>${escapeHtml(photo.name || `Ảnh ${index + 1}`)}</strong>
            <span>${escapeHtml(photo.uploadedByName || "Nhân viên")} • ${formatFullDateTime(photo.uploadedAt)} • ${formatFileSize(photo.size)}</span>
          </div>
        </a>
      `).join("")
      : `<div class="empty-box">Chưa có hình báo cáo.</div>`;
  }

  els.photoReportModal?.classList.remove("hidden");
}

function validateSelectedPhotoFiles(files) {
  if (!files.length) return "Vui lòng chọn ít nhất 1 hình.";
  if (files.length > 30) return "Mỗi lần chỉ nên đăng tối đa 30 hình để tránh lỗi mạng.";

  const maxSize = 10 * 1024 * 1024;
  const invalidType = files.find((file) => !String(file.type || "").startsWith("image/"));
  if (invalidType) return `File “${invalidType.name}” không phải là hình ảnh.`;

  const tooLarge = files.find((file) => Number(file.size || 0) > maxSize);
  if (tooLarge) return `File “${tooLarge.name}” lớn hơn 10MB. Vui lòng chọn hình nhẹ hơn.`;

  return null;
}

async function openPhotoUploadPicker(taskId, button) {
  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    toast("Không tìm thấy công việc cần đăng hình.", "error");
    return;
  }

  if (!canEmployeeUploadTaskPhotos(task, "employee", getDisplayStatus(task))) {
    toast("Chỉ nhân viên đang phụ trách mới được đăng hình cho công việc đang làm.", "error");
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.style.display = "none";
  document.body.appendChild(input);

  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    input.remove();

    const validationError = validateSelectedPhotoFiles(files);
    if (validationError) {
      toast(validationError, "error");
      return;
    }

    setButtonLoading(button, true, "Đang đăng hình...");

    try {
      const now = new Date();
      const uploadedPhotos = [];

      for (const file of files) {
        const photoId = makeId("photo");
        const safeName = sanitizeStorageFileName(file.name);
        const path = `task-photos/${task.id}/${Date.now()}-${photoId}-${safeName}`;
        const fileRef = storageRef(storage, path);

        await uploadBytes(fileRef, file, {
          contentType: file.type || "image/jpeg",
          customMetadata: {
            taskId: task.id,
            uploadedByUid: state.user.uid
          }
        });

        const url = await getDownloadURL(fileRef);

        uploadedPhotos.push({
          id: photoId,
          name: file.name || safeName,
          url,
          storagePath: path,
          contentType: file.type || "image/jpeg",
          size: Number(file.size || 0),
          uploadedAt: Timestamp.fromDate(now),
          uploadedByUid: state.user.uid,
          uploadedByName: state.profile?.name || state.profile?.email || "Nhân viên"
        });
      }

      if (!uploadedPhotos.length) return;

      await updateDoc(doc(db, "tasks", task.id), {
        photos: arrayUnion(...uploadedPhotos),
        photoCount: increment(uploadedPhotos.length),
        lastPhotoUploadedAt: serverTimestamp()
      });

      toast(`Đã đăng thành công ${uploadedPhotos.length} hình.`, "success");
    } catch (error) {
      console.error(error);
      toast(error.message || "Không đăng được hình. Kiểm tra Firebase Storage Rules hoặc kết nối mạng.", "error");
    } finally {
      setButtonLoading(button, false);
    }
  }, { once: true });

  input.click();
}

// =========================
// Đổi nhân viên phụ trách task
// =========================
function renderReassignEmployeeOptions(taskId) {
  if (!els.reassignEmployeeSelect || !els.confirmReassignEmployeeBtn) return;

  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    els.reassignEmployeeSelect.innerHTML = `<option value="">Không tìm thấy công việc</option>`;
    els.confirmReassignEmployeeBtn.disabled = true;
    return;
  }

  const candidates = getAvailableReplacementEmployees(task);
  const releaseOption = task.assignedToUid
    ? `<option value="__WAITING_ASSIGNEE__">Chờ chọn người (cho nhân viên hiện tại nghỉ)</option>`
    : "";

  if (!candidates.length && !releaseOption) {
    els.reassignEmployeeSelect.innerHTML = `<option value="">Không có nhân viên chưa được giao việc</option>`;
    els.confirmReassignEmployeeBtn.disabled = true;
    return;
  }

  els.reassignEmployeeSelect.innerHTML = `
    <option value="">Chọn thao tác</option>
    ${releaseOption}
    ${candidates.map((employee) => `
      <option value="${escapeHtml(employee.uid)}">${escapeHtml(employee.name)} - ${escapeHtml(employee.email || "")}</option>
    `).join("")}
  `;
  els.confirmReassignEmployeeBtn.disabled = false;
}

function openReassignEmployeeModal(taskId) {
  if (state.profile?.role !== "admin") return;

  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    toast("Không tìm thấy công việc cần đổi nhân viên.", "error");
    return;
  }

  const displayStatus = getDisplayStatus(task);

  if (!canAdminReassignTask(task, "admin", displayStatus)) {
    toast("Chỉ đổi nhân viên cho công việc đang làm, đang chờ đến lượt, quá hạn, yêu cầu làm lại hoặc đang chờ chọn người.", "error");
    return;
  }

  state.reassignTaskId = taskId;
  els.reassignTaskTitle.textContent = task.title || "Công việc";

  if (els.reassignCurrentEmployee) {
    els.reassignCurrentEmployee.value = getEmployeeDisplayNameByUid(task.assignedToUid, task.assignedToName);
  }

  renderReassignEmployeeOptions(taskId);
  els.reassignEmployeeModal?.classList.remove("hidden");
}

function closeReassignEmployeeModal() {
  state.reassignTaskId = null;
  els.reassignEmployeeForm?.reset();
  els.reassignEmployeeModal?.classList.add("hidden");
}

$$('[data-close-reassign-modal]').forEach((button) => {
  button.addEventListener("click", closeReassignEmployeeModal);
});

els.reassignEmployeeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (state.profile?.role !== "admin") return;

  const taskId = state.reassignTaskId;
  const task = state.tasks.find((item) => item.id === taskId);
  const selectedValue = els.reassignEmployeeSelect?.value || "";
  const releaseToWaiting = selectedValue === "__WAITING_ASSIGNEE__";
  const newEmployee = releaseToWaiting
    ? null
    : state.employees.find((employee) => employee.uid === selectedValue);

  try {
    if (!task) throw new Error("Không tìm thấy công việc cần cập nhật nhân viên.");
    if (!selectedValue) throw new Error("Vui lòng chọn nhân viên thay thế hoặc chọn Chờ chọn người.");

    const displayStatus = getDisplayStatus(task);
    const isWaitingAssignee = task.status === "waiting_assignee" || displayStatus === "waiting_assignee";

    if (releaseToWaiting) {
      if (!task.assignedToUid) {
        throw new Error("Công việc này đang ở trạng thái Chờ chọn người.");
      }
    } else {
      if (!newEmployee) throw new Error("Vui lòng chọn nhân viên thay thế hợp lệ.");
      if (employeeHasUnfinishedTask(newEmployee.uid, task.id)) {
        throw new Error("Nhân viên này đang có công việc chưa hoàn thành. Vui lòng chọn nhân viên chưa được giao việc.");
      }

      const lunchAssignmentError = validateLunchBreakAssignment(task, newEmployee.uid);
      if (lunchAssignmentError) throw new Error(lunchAssignmentError);
    }

    setButtonLoading(els.confirmReassignEmployeeBtn, true, releaseToWaiting ? "Đang tạm dừng..." : "Đang đổi...");

    const now = new Date();
    const oldEmployeeUid = task.assignedToUid || "";
    const oldEmployeeName = getEmployeeDisplayNameByUid(oldEmployeeUid, task.assignedToName);
    const accumulatedWorkedMs = Number(task.accumulatedWorkedMs || 0);
    const queueStartDate = timestampToDate(task.queueStartAt);
    const deadlineDate = timestampToDate(task.deadlineAt);
    const deadlineMs = Math.max(0, Number(task.deadlineMinutes || 0) * 60 * 1000);

    if (releaseToWaiting) {
      const hasStarted = queueStartDate && now.getTime() >= queueStartDate.getTime();
      const workedThisRunMs = hasStarted
        ? Math.max(0, now.getTime() - queueStartDate.getTime())
        : 0;
      const nextAccumulatedWorkedMs = accumulatedWorkedMs + workedThisRunMs;
      const remainingMsAtPause = hasStarted && deadlineDate
        ? Math.max(0, deadlineDate.getTime() - now.getTime())
        : Math.max(0, deadlineMs - nextAccumulatedWorkedMs);

      await updateDoc(doc(db, "tasks", task.id), {
        assignedToUid: "",
        assignedToName: "",
        status: "waiting_assignee",
        pauseStartedAt: serverTimestamp(),
        remainingMsAtPause,
        accumulatedWorkedMs: nextAccumulatedWorkedMs,
        queueStartAt: null,
        deadlineAt: null,
        assigneeChangeHistory: arrayUnion({
          action: "wait_assignee",
          fromUid: oldEmployeeUid,
          fromName: oldEmployeeName,
          toUid: "",
          toName: "Chờ chọn người",
          changedAt: Timestamp.fromDate(now),
          changedByUid: state.user.uid,
          changedByName: state.profile.name || state.profile.email || "Admin",
          remainingMsAtPause,
          accumulatedWorkedMs: nextAccumulatedWorkedMs
        })
      });

      await createNotifications([
        {
          recipientUid: oldEmployeeUid,
          type: "task_reassigned_removed",
          title: "Công việc đã tạm chuyển về Chờ chọn người",
          message: `Công việc “${task.title}” đã được Admin cho tạm dừng để chờ chọn nhân viên. Thời gian còn lại được giữ nguyên.`,
          taskId: task.id,
          taskTitle: task.title
        },
        {
          recipientUid: state.user.uid,
          type: "task_reassigned_admin",
          title: "Đã cho nhân viên nghỉ khỏi công việc",
          message: `Bạn đã chuyển công việc “${task.title}” từ ${oldEmployeeName} về trạng thái Chờ chọn người.`,
          taskId: task.id,
          taskTitle: task.title
        }
      ]);

      closeReassignEmployeeModal();
      toast(`Đã chuyển công việc về trạng thái Chờ chọn người. ${oldEmployeeName} có thể nhận việc khác.`, "success");
      return;
    }

    const newEmployeeName = newEmployee.name || newEmployee.email || "Nhân viên mới";
    const wasQueued = displayStatus === "queued";
    const hasPausedRemainingValue = task.remainingMsAtPause !== null && task.remainingMsAtPause !== undefined;
    const remainingFromPauseMs = Number(task.remainingMsAtPause || 0);
    const resumeMs = isWaitingAssignee
      ? (hasPausedRemainingValue ? remainingFromPauseMs : deadlineMs)
      : deadlineMs;

    const updateData = {
      assignedToUid: newEmployee.uid,
      assignedToName: newEmployeeName,
      assigneeChangeHistory: arrayUnion({
        action: isWaitingAssignee ? "assign_from_waiting" : "reassign",
        fromUid: oldEmployeeUid,
        fromName: oldEmployeeName,
        toUid: newEmployee.uid,
        toName: newEmployeeName,
        changedAt: Timestamp.fromDate(now),
        changedByUid: state.user.uid,
        changedByName: state.profile.name || state.profile.email || "Admin",
        restartedFromQueue: wasQueued,
        remainingMsAtPause: isWaitingAssignee ? resumeMs : null,
        accumulatedWorkedMs
      })
    };

    if (isWaitingAssignee || wasQueued) {
      updateData.status = getActiveTaskStatusFromFlags(task);
      updateData.dispatchedAt = serverTimestamp();
      updateData.queueStartAt = Timestamp.fromDate(now);
      updateData.deadlineAt = Timestamp.fromDate(new Date(now.getTime() + resumeMs));
      updateData.pauseStartedAt = null;
      updateData.remainingMsAtPause = null;
      updateData.accumulatedWorkedMs = accumulatedWorkedMs;
    }

    await updateDoc(doc(db, "tasks", task.id), updateData);

    const startMessage = isWaitingAssignee
      ? `Công việc bắt đầu tính giờ từ bây giờ với thời gian còn lại ${formatMinutes(Math.ceil(resumeMs / 60000))}.`
      : wasQueued
        ? "Công việc này đã được bắt đầu lại thời gian như một công việc mới."
        : "Thời gian đếm ngược, hạn hoàn thành và các lần thêm giờ trước đó được giữ nguyên.";

    const notifications = [
      {
        recipientUid: newEmployee.uid,
        type: "task_reassigned",
        title: "Bạn được chuyển giao công việc",
        message: `${state.profile.name || "Admin"} đã giao công việc “${task.title}” cho bạn. ${startMessage}`,
        taskId: task.id,
        taskTitle: task.title
      },
      {
        recipientUid: state.user.uid,
        type: "task_reassigned_admin",
        title: "Đã cập nhật nhân viên phụ trách",
        message: `Bạn đã cập nhật công việc “${task.title}” từ ${oldEmployeeName} sang ${newEmployeeName}.`,
        taskId: task.id,
        taskTitle: task.title
      }
    ];

    if (oldEmployeeUid) {
      notifications.splice(1, 0, {
        recipientUid: oldEmployeeUid,
        type: "task_reassigned_removed",
        title: "Công việc đã được chuyển sang nhân viên khác",
        message: `Công việc “${task.title}” đã được Admin chuyển sang ${newEmployeeName}.`,
        taskId: task.id,
        taskTitle: task.title
      });
    }

    await createNotifications(notifications);

    closeReassignEmployeeModal();
    toast(`Đã cập nhật nhân viên phụ trách sang ${newEmployeeName}.`, "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không cập nhật được nhân viên phụ trách.", "error");
  } finally {
    setButtonLoading(els.confirmReassignEmployeeBtn, false);
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
      const oldDeadlineDate = timestampToDate(task.deadlineAt) || new Date();
      const newDeadlineMinutes = oldDeadlineMinutes + minutes;
      const newDeadlineDate = new Date(oldDeadlineDate.getTime() + minutes * 60 * 1000);
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
        deadlineMinutes: newDeadlineMinutes,
        deadlineAt: Timestamp.fromDate(newDeadlineDate),
        status: newStatus
      };
    });

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
    toast(`Đã cộng thêm ${minutes} phút vào công việc.`, "success");
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

    await reflowQueuedTasksForEmployee(task.assignedToUid, taskId);

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

async function endLunchBreakTask(taskId, button) {
  setButtonLoading(button, true, "Đang kết thúc...");

  try {
    const taskSnap = await getDoc(doc(db, "tasks", taskId));

    if (!taskSnap.exists()) {
      throw new Error("Không tìm thấy phiếu Nghỉ trưa.");
    }

    const task = {
      id: taskSnap.id,
      ...taskSnap.data()
    };

    if (!isLunchBreakTask(task) || task.status !== "lunch_break") {
      throw new Error("Chỉ có thể kết thúc trực tiếp task đang ở trạng thái Nghỉ trưa.");
    }

    const result = calculateResultAt(task, new Date());

    await updateDoc(doc(db, "tasks", taskId), {
      status: "completed",
      submittedAt: serverTimestamp(),
      approvedAt: serverTimestamp(),
      actualMinutes: result.actualMinutes,
      resultType: result.resultType,
      differenceMinutes: result.differenceMinutes,
      differencePercent: result.differencePercent
    });

    await reflowQueuedTasksForEmployee(task.assignedToUid, taskId);

    const notifications = [
      {
        recipientUid: state.user.uid,
        type: "task_approved_admin",
        title: "Đã kết thúc nghỉ trưa",
        message: `Bạn đã kết thúc phiếu Nghỉ trưa “${task.title}” của ${task.assignedToName || "nhân viên"}.`,
        taskId,
        taskTitle: task.title
      }
    ];

    if (task.assignedToUid) {
      notifications.unshift({
        recipientUid: task.assignedToUid,
        type: "task_approved",
        title: "Phiếu Nghỉ trưa đã kết thúc",
        message: `Admin đã kết thúc phiếu Nghỉ trưa “${task.title}”.`,
        taskId,
        taskTitle: task.title
      });
    }

    await createNotifications(notifications);
    toast("Đã kết thúc phiếu Nghỉ trưa và chuyển sang trạng thái Đã hoàn thành.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không kết thúc được phiếu Nghỉ trưa.", "error");
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
  const submittedAt = timestampToDate(task.submittedAt);

  if (!submittedAt) {
    throw new Error("Thiếu thời gian nhân viên báo hoàn thành.");
  }

  return calculateResultAt(task, submittedAt);
}

function calculateResultAt(task, completedAt) {
  const activeStartAt = timestampToDate(task.queueStartAt) || timestampToDate(task.dispatchedAt) || timestampToDate(task.createdAt);

  if (!activeStartAt || !(completedAt instanceof Date)) {
    throw new Error("Thiếu thời gian bắt đầu hoặc thời gian hoàn thành.");
  }

  const accumulatedWorkedMs = Number(task.accumulatedWorkedMs || 0);
  const actualMs = accumulatedWorkedMs + Math.max(0, completedAt.getTime() - activeStartAt.getTime());
  const actualMinutes = Math.max(0, Math.ceil(actualMs / 60000));

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

function updateCountdowns() {
  $$("[data-task-card]").forEach((card) => {
    const rawStatus = card.dataset.rawStatus;
    const countdown = card.querySelector("[data-countdown]");

    if (!countdown) return;

    if (rawStatus === "draft") {
      countdown.textContent = "Chưa giao việc";
      return;
    }

    if (rawStatus === "waiting_assignee") {
      const remainingPauseMs = Number(card.dataset.remainingPauseMs || 0);
      countdown.textContent = remainingPauseMs > 0
        ? `Tạm dừng - còn ${formatCountdown(remainingPauseMs)}`
        : "Chờ chọn người - chưa bắt đầu";
      card.classList.remove("is-overdue", "is-near-due", "is-queued");
      return;
    }

    if (rawStatus === "completed") {
      countdown.textContent = "Đã hoàn thành";
      return;
    }

    if (rawStatus === "submitted") {
      countdown.textContent = "Chờ Admin duyệt";
      return;
    }

    const queueStartMs = Number(card.dataset.queueStartMs || 0);

    if (queueStartMs && Date.now() < queueStartMs) {
      countdown.textContent = `Chờ đến lượt (bắt đầu ${formatDateTime(new Date(queueStartMs))})`;
      card.classList.add("is-queued");
      card.classList.remove("is-overdue", "is-near-due");
      return;
    }

    card.classList.remove("is-queued");

    const deadlineMs = Number(card.dataset.deadlineMs || 0);

    if (!deadlineMs) {
      countdown.textContent = "--";
      return;
    }

    const remainingMs = deadlineMs - Date.now();

    countdown.textContent = remainingMs >= 0
      ? `Còn ${formatCountdown(remainingMs)}`
      : `Quá hạn ${formatCountdown(remainingMs)}`;

    card.classList.toggle("is-overdue", remainingMs <= 0 && rawStatus !== "completed");

    const deadlineMinutes = Number(card.dataset.deadlineMinutes || 0);
    const nearThreshold = Math.min(
      15 * 60 * 1000,
      Math.max(1, deadlineMinutes) * 60 * 1000 * 0.2
    );

    card.classList.toggle(
      "is-near-due",
      remainingMs > 0 && remainingMs <= nearThreshold
    );
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
