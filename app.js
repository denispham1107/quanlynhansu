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
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  user: null,
  profile: null,
  employees: [],
  tasks: [],
  workOrders: [],
  reasons: [],
  notifications: [],
  knownNotificationIds: new Set(),
  notificationsReady: false,
  unsubs: [],
  activeExtensionTaskId: null,
  adminStatusFilter: "all",
  adminEmployeeFilter: "all",
  adminDateFilter: { mode: "today", single: todayInputValue(), from: todayInputValue(), to: todayInputValue() },
  employeeDateFilter: { mode: "today", single: todayInputValue(), from: todayInputValue(), to: todayInputValue() }
};

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
  deleteAllWorkOrdersBtn: $("#deleteAllWorkOrdersBtn"),
  adminStatusFilter: $("#adminStatusFilter"),
  adminEmployeeFilter: $("#adminEmployeeFilter"),
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
  timeExtensionModal: $("#timeExtensionModal"),
  timeExtensionForm: $("#timeExtensionForm"),
  timeExtensionTaskName: $("#timeExtensionTaskName"),
  timeExtensionMinutes: $("#timeExtensionMinutes"),
  timeExtensionReasonSelect: $("#timeExtensionReasonSelect"),
  newTimeExtensionReason: $("#newTimeExtensionReason"),
  addTimeExtensionReasonBtn: $("#addTimeExtensionReasonBtn"),
  timeExtensionReasonList: $("#timeExtensionReasonList"),
  confirmTimeExtensionBtn: $("#confirmTimeExtensionBtn")
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message, type = "info") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  $("#toastHost").appendChild(item);
  setTimeout(() => item.remove(), 4200);
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

function timestampToDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function toTimestamp(date) {
  return Timestamp.fromDate(date instanceof Date ? date : new Date(date));
}

function formatDateTime(value) {
  const date = timestampToDate(value);
  if (!date) return "--";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
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
  return toLocalDateInputValue(timestampToDate(task.createdAt) || timestampToDate(task.dispatchedAt) || new Date());
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

function initials(name = "NV") {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "NV";
}

function getFriendlyFirebaseError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/email-already-in-use": "Email này đã được dùng cho tài khoản khác.",
    "auth/invalid-email": "Email không hợp lệ.",
    "auth/weak-password": "Mật khẩu quá yếu, cần ít nhất 6 ký tự.",
    "auth/invalid-credential": "Sai email hoặc mật khẩu, hoặc tài khoản chưa tồn tại trong Firebase Authentication.",
    "auth/operation-not-allowed": "Bạn chưa bật Email/Password trong Firebase Authentication.",
    "auth/unauthorized-domain": "Domain GitHub Pages chưa được thêm vào Authorized domains.",
    "permission-denied": "Bạn không có quyền đọc/ghi dữ liệu. Kiểm tra Firestore Rules."
  };
  return messages[code] || error.message || "Có lỗi xảy ra.";
}

function statusLabel(status) {
  return {
    scheduled: "Chưa bắt đầu",
    doing: "Đang làm",
    near_due: "Gần hết giờ",
    overdue: "Quá hạn",
    submitted: "Chờ Admin xác nhận",
    completed: "Đã hoàn thành",
    redo: "Yêu cầu làm lại"
  }[status] || status;
}

function getDisplayStatus(task) {
  if (task.status === "completed") return "completed";
  if (task.status === "submitted") return "submitted";
  if (task.status === "redo") return "redo";
  const now = Date.now();
  const start = timestampToDate(task.dispatchedAt || task.createdAt);
  const deadline = timestampToDate(task.deadlineAt);
  if (start && now < start.getTime()) return "scheduled";
  if (deadline && now > deadline.getTime()) return "overdue";
  if (deadline) {
    const remainingMs = deadline.getTime() - now;
    const totalMs = Math.max(1, Number(task.deadlineMinutes || 1) * 60 * 1000);
    const nearThreshold = Math.min(15 * 60 * 1000, totalMs * 0.2);
    if (remainingMs <= nearThreshold) return "near_due";
  }
  return "doing";
}

function taskCardClass(displayStatus) {
  return {
    scheduled: "is-scheduled",
    doing: "",
    near_due: "is-near-due",
    overdue: "is-overdue",
    submitted: "is-submitted",
    completed: "is-completed",
    redo: "is-redo"
  }[displayStatus] || "";
}

function compareTaskOrder(a, b) {
  const ao = a.workOrderCreatedAtMs || timestampToDate(a.createdAt)?.getTime() || 0;
  const bo = b.workOrderCreatedAtMs || timestampToDate(b.createdAt)?.getTime() || 0;
  if (bo !== ao) return bo - ao;
  const ai = Number(a.sequenceIndex || 0);
  const bi = Number(b.sequenceIndex || 0);
  return ai - bi;
}

function groupTasksByWorkOrder(tasks) {
  const groups = new Map();
  tasks.forEach((task) => {
    const key = task.workOrderId || task.id;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        name: task.workOrderName || "Phiếu công việc",
        totalTasks: Number(task.workOrderTotalTasks || 1),
        createdAtMs: task.workOrderCreatedAtMs || timestampToDate(task.createdAt)?.getTime() || 0,
        tasks: []
      });
    }
    const group = groups.get(key);
    group.totalTasks = Math.max(group.totalTasks, Number(task.workOrderTotalTasks || 1));
    group.tasks.push(task);
  });
  return Array.from(groups.values()).sort((a, b) => b.createdAtMs - a.createdAtMs).map((group) => {
    group.tasks.sort((a, b) => Number(a.sequenceIndex || 0) - Number(b.sequenceIndex || 0));
    return group;
  });
}

function applyDateFilter(tasks, filter) {
  if (!filter || filter.mode === "all") return tasks;
  if (filter.mode === "today") {
    const today = todayInputValue();
    return tasks.filter((task) => getTaskDateValue(task) === today);
  }
  if (filter.mode === "single") {
    return tasks.filter((task) => getTaskDateValue(task) === filter.single);
  }
  if (filter.mode === "range") {
    return tasks.filter((task) => {
      const date = getTaskDateValue(task);
      if (filter.from && date < filter.from) return false;
      if (filter.to && date > filter.to) return false;
      return true;
    });
  }
  return tasks;
}

function updateDateFilterControls(prefix) {
  const filter = prefix === "admin" ? state.adminDateFilter : state.employeeDateFilter;
  const modeEl = prefix === "admin" ? els.adminDateMode : els.employeeDateMode;
  const singleEl = prefix === "admin" ? els.adminSingleDate : els.employeeSingleDate;
  const fromEl = prefix === "admin" ? els.adminDateFrom : els.employeeDateFrom;
  const toEl = prefix === "admin" ? els.adminDateTo : els.employeeDateTo;
  if (modeEl) modeEl.value = filter.mode;
  if (singleEl) singleEl.value = filter.single || todayInputValue();
  if (fromEl) fromEl.value = filter.from || todayInputValue();
  if (toEl) toEl.value = filter.to || todayInputValue();
  singleEl?.classList.toggle("hidden", filter.mode !== "single");
  fromEl?.classList.toggle("hidden", filter.mode !== "range");
  toEl?.classList.toggle("hidden", filter.mode !== "range");
}

function dateSummary(filter) {
  if (filter.mode === "all") return "Đang hiển thị tất cả ngày giao việc.";
  if (filter.mode === "today") return `Đang hiển thị công việc giao hôm nay (${formatDateOnly(todayInputValue())}).`;
  if (filter.mode === "single") return `Đang hiển thị công việc ngày ${formatDateOnly(filter.single)}.`;
  return `Đang hiển thị công việc từ ${formatDateOnly(filter.from)} đến ${formatDateOnly(filter.to)}.`;
}

// =========================
// Auth
// =========================
els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#loginBtn");
  setButtonLoading(button, true, "Đang đăng nhập...");
  try {
    await signInWithEmailAndPassword(auth, $("#loginEmail").value.trim(), $("#loginPassword").value);
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    toast(getFriendlyFirebaseError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
});

els.logoutBtn.addEventListener("click", async () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  cleanupSubscriptions();
  state.user = user;
  state.profile = null;
  state.tasks = [];
  state.employees = [];
  state.workOrders = [];
  state.reasons = [];
  state.notifications = [];
  state.knownNotificationIds = new Set();
  state.notificationsReady = false;
  if (!user) {
    showLogin();
    return;
  }
  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    if (!profileSnap.exists()) {
      toast("Tài khoản này chưa có hồ sơ trong collection users.", "error");
      await signOut(auth);
      return;
    }
    state.profile = profileSnap.data();
    showApp();
    setupNotifications();
    if (state.profile.role === "admin") setupAdminDashboard();
    else setupEmployeeDashboard();
  } catch (error) {
    console.error(error);
    toast("Không tải được hồ sơ người dùng. Kiểm tra Firestore Rules.", "error");
    await signOut(auth);
  }
});

function cleanupSubscriptions() {
  state.unsubs.forEach((unsubscribe) => unsubscribe());
  state.unsubs = [];
}

function showLogin() {
  els.loginView.classList.remove("hidden");
  els.appView.classList.add("hidden");
  els.adminView.classList.add("hidden");
  els.employeeView.classList.add("hidden");
}

function showApp() {
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");
  const roleText = state.profile.role === "admin" ? "Admin" : "Nhân viên";
  els.currentUserText.textContent = `${state.profile.name || state.user.email} • ${roleText}`;
  updateNotificationPermissionUI();
}

// =========================
// Notifications
// =========================
async function createNotification(payload) {
  try {
    const ref = doc(collection(db, "notifications"));
    await setDoc(ref, {
      id: ref.id,
      recipientUid: payload.recipientUid,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      taskId: payload.taskId || null,
      workOrderId: payload.workOrderId || null,
      actorUid: state.user?.uid || null,
      actorName: state.profile?.name || state.user?.email || "Hệ thống",
      createdAt: serverTimestamp(),
      readAt: null
    });
  } catch (error) {
    console.warn("Không tạo được thông báo:", error);
  }
}

function setupNotifications() {
  const q = query(collection(db, "notifications"), where("recipientUid", "==", state.user.uid));
  const unsub = onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (timestampToDate(b.createdAt)?.getTime() || 0) - (timestampToDate(a.createdAt)?.getTime() || 0));
    const newItems = items.filter((item) => !state.knownNotificationIds.has(item.id));
    state.notifications = items;
    items.forEach((item) => state.knownNotificationIds.add(item.id));
    renderNotifications();
    if (state.notificationsReady) {
      newItems.forEach((item) => showSystemNotification(item));
    }
    state.notificationsReady = true;
  }, (error) => {
    console.error(error);
    toast("Không đọc được thông báo. Kiểm tra Firestore Rules cho collection notifications.", "error");
  });
  state.unsubs.push(unsub);
}

function renderNotifications() {
  const unread = state.notifications.filter((item) => !item.readAt).length;
  els.notificationBadge.textContent = unread;
  els.notificationBadge.classList.toggle("hidden", unread === 0);
  if (!state.notifications.length) {
    els.notificationList.innerHTML = "Chưa có thông báo.";
    els.notificationList.classList.add("empty-box");
    return;
  }
  els.notificationList.classList.remove("empty-box");
  els.notificationList.innerHTML = state.notifications.slice(0, 30).map((item) => `
    <div class="notification-item ${item.readAt ? "" : "unread"}" data-notification-id="${escapeHtml(item.id)}">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.message)}</p>
      <small>${formatDateTime(item.createdAt)}</small>
    </div>
  `).join("");
}

function showSystemNotification(item) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    navigator.serviceWorker?.ready?.then((registration) => {
      registration.showNotification(item.title, { body: item.message, icon: "icon-192.png", badge: "icon-192.png" });
    }).catch(() => new Notification(item.title, { body: item.message, icon: "icon-192.png" }));
  } catch (error) {
    console.warn(error);
  }
}

function updateNotificationPermissionUI() {
  if (!els.enableNotificationsBtn) return;
  if (!("Notification" in window)) {
    els.enableNotificationsBtn.textContent = "Trình duyệt không hỗ trợ thông báo";
    els.enableNotificationsBtn.disabled = true;
    return;
  }
  if (Notification.permission === "granted") {
    els.enableNotificationsBtn.textContent = "Đã bật thông báo";
    els.enableNotificationsBtn.classList.remove("notify-blocked");
  } else if (Notification.permission === "denied") {
    els.enableNotificationsBtn.textContent = "Thông báo đang bị chặn";
    els.enableNotificationsBtn.classList.add("notify-blocked");
  } else {
    els.enableNotificationsBtn.textContent = "Bật thông báo";
  }
}

els.enableNotificationsBtn.addEventListener("click", async () => {
  if (!("Notification" in window)) return;
  const permission = await Notification.requestPermission();
  updateNotificationPermissionUI();
  if (permission === "granted") toast("Đã bật thông báo trên thiết bị này.", "success");
  if (permission === "denied") toast("Thông báo đang bị chặn trong trình duyệt.", "error");
});

els.notificationBellBtn.addEventListener("click", () => {
  els.notificationPanel.classList.toggle("hidden");
});

els.markAllNotificationsReadBtn.addEventListener("click", async () => {
  const unread = state.notifications.filter((item) => !item.readAt);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((item) => batch.update(doc(db, "notifications", item.id), { readAt: serverTimestamp() }));
  await batch.commit();
});

// =========================
// Admin
// =========================
function setupAdminDashboard() {
  els.adminView.classList.remove("hidden");
  els.employeeView.classList.add("hidden");
  state.adminDateFilter = { mode: "today", single: todayInputValue(), from: todayInputValue(), to: todayInputValue() };
  updateDateFilterControls("admin");

  const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
    state.employees = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .filter((user) => user.role === "employee")
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));
    renderEmployees();
    renderEmployeeSelects();
    renderTaskRowsAssigneeOptions();
  }, handleSnapshotError);

  const unsubTasks = onSnapshot(query(collection(db, "tasks"), orderBy("createdAt", "desc")), (snapshot) => {
    state.tasks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort(compareTaskOrder);
    renderAdminTasks();
  }, handleSnapshotError);

  const unsubReasons = onSnapshot(collection(db, "timeExtensionReasons"), (snapshot) => {
    state.reasons = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (timestampToDate(a.createdAt)?.getTime() || 0) - (timestampToDate(b.createdAt)?.getTime() || 0));
    renderTimeExtensionReasons();
  }, handleSnapshotError);

  state.unsubs.push(unsubUsers, unsubTasks, unsubReasons);
}

function handleSnapshotError(error) {
  console.error(error);
  toast("Không đọc được dữ liệu realtime. Kiểm tra Firestore Rules.", "error");
}

function renderEmployees() {
  if (!state.employees.length) {
    els.employeeList.innerHTML = "Chưa có nhân viên.";
    els.employeeList.classList.add("empty-box");
    return;
  }
  els.employeeList.classList.remove("empty-box");
  els.employeeList.innerHTML = state.employees.map((employee) => `
    <div class="employee-item">
      <div class="avatar">${escapeHtml(initials(employee.name))}</div>
      <div><strong>${escapeHtml(employee.name)}</strong><span>${escapeHtml(employee.email)}</span></div>
    </div>
  `).join("");
}

function renderEmployeeSelects() {
  const options = state.employees.map((employee) => `<option value="${escapeHtml(employee.uid)}">${escapeHtml(employee.name)} - ${escapeHtml(employee.email)}</option>`).join("");
  els.adminEmployeeFilter.innerHTML = `<option value="all">Tất cả nhân viên</option>${options}`;
  els.adminEmployeeFilter.value = state.adminEmployeeFilter;
}

function renderTaskRowsAssigneeOptions() {
  const options = state.employees.map((employee) => `<option value="${escapeHtml(employee.uid)}">${escapeHtml(employee.name)} - ${escapeHtml(employee.email)}</option>`).join("");
  $$(".task-assignee-select").forEach((select) => {
    const current = select.value;
    select.innerHTML = `<option value="">Chọn nhân viên</option>${options}`;
    select.value = current;
  });
}

els.createEmployeeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#createEmployeeBtn");
  setButtonLoading(button, true, "Đang tạo...");
  try {
    const name = $("#employeeName").value.trim();
    const email = $("#employeeEmail").value.trim().toLowerCase();
    const password = $("#employeePassword").value;
    const sAuth = getSecondaryAuth();
    const credential = await createUserWithEmailAndPassword(sAuth, email, password);
    await updateProfile(credential.user, { displayName: name });
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

els.openTaskModalBtn.addEventListener("click", () => {
  if (!state.employees.length) {
    toast("Bạn cần tạo ít nhất 1 tài khoản nhân viên trước khi giao việc.", "error");
    return;
  }
  els.createTaskForm.reset();
  els.taskRowsContainer.innerHTML = "";
  addTaskRow();
  els.taskModal.classList.remove("hidden");
});

$$("[data-close-modal]").forEach((button) => button.addEventListener("click", () => els.taskModal.classList.add("hidden")));
els.addTaskRowBtn.addEventListener("click", () => addTaskRow());

function addTaskRow() {
  const index = els.taskRowsContainer.children.length + 1;
  const row = document.createElement("div");
  row.className = "task-row";
  row.innerHTML = `
    <div class="task-row-grid">
      <label>Tên công việc
        <input class="task-title-input" type="text" placeholder="Ví dụ: Cạo lông mèo 6kg" required />
      </label>
      <label>Người làm
        <select class="task-assignee-select" required><option value="">Chọn nhân viên</option></select>
      </label>
      <label>Giờ
        <input class="task-hours-input" type="number" min="0" step="1" value="0" required />
      </label>
      <label>Phút
        <input class="task-minutes-input" type="number" min="0" step="1" value="30" required />
      </label>
    </div>
    <label>Mô tả công việc
      <textarea class="task-description-input" placeholder="Ghi rõ yêu cầu, tiêu chuẩn hoàn thành..."></textarea>
    </label>
    <div class="task-row-actions">
      <button class="btn danger small" type="button" data-remove-task-row>🗑 Xoá dòng ${index}</button>
    </div>
  `;
  els.taskRowsContainer.appendChild(row);
  renderTaskRowsAssigneeOptions();
}

els.taskRowsContainer.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-task-row]");
  if (!button) return;
  if (els.taskRowsContainer.children.length <= 1) {
    toast("Phiếu cần ít nhất 1 công việc.", "error");
    return;
  }
  button.closest(".task-row")?.remove();
});

els.createTaskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#createTaskBtn");
  setButtonLoading(button, true, "Đang giao phiếu...");
  try {
    const workOrderName = els.workOrderName.value.trim();
    const rows = $$(".task-row").map((row, index) => {
      const assignedToUid = row.querySelector(".task-assignee-select").value;
      const assignedEmployee = state.employees.find((employee) => employee.uid === assignedToUid);
      const hours = Number(row.querySelector(".task-hours-input").value || 0);
      const minutes = Number(row.querySelector(".task-minutes-input").value || 0);
      const deadlineMinutes = hours * 60 + minutes;
      return {
        sequenceIndex: index + 1,
        title: row.querySelector(".task-title-input").value.trim(),
        description: row.querySelector(".task-description-input").value.trim(),
        assignedToUid,
        assignedToName: assignedEmployee?.name || "",
        deadlineMinutes
      };
    });
    if (!workOrderName) throw new Error("Vui lòng nhập tên phiếu công việc.");
    if (!rows.length) throw new Error("Vui lòng thêm ít nhất 1 công việc.");
    for (const row of rows) {
      if (!row.title) throw new Error("Vui lòng nhập tên cho tất cả công việc.");
      if (!row.assignedToUid) throw new Error("Vui lòng chọn nhân viên cho tất cả công việc.");
      if (row.deadlineMinutes <= 0) throw new Error("Thời gian quy định phải lớn hơn 0 phút.");
    }

    const now = new Date();
    const taskDate = todayInputValue();
    const workOrderRef = doc(collection(db, "workOrders"));
    const batch = writeBatch(db);
    batch.set(workOrderRef, {
      id: workOrderRef.id,
      name: workOrderName,
      totalTasks: rows.length,
      taskDate,
      assignedByUid: state.user.uid,
      assignedByName: state.profile.name,
      createdAt: toTimestamp(now),
      updatedAt: serverTimestamp()
    });

    const cursors = new Map();
    const employeeSequence = new Map();
    const createdTasks = [];
    rows.forEach((row) => {
      const start = cursors.get(row.assignedToUid) || new Date(now.getTime());
      const deadline = new Date(start.getTime() + row.deadlineMinutes * 60000);
      const employeeSeq = (employeeSequence.get(row.assignedToUid) || 0) + 1;
      employeeSequence.set(row.assignedToUid, employeeSeq);
      cursors.set(row.assignedToUid, deadline);
      const taskRef = doc(collection(db, "tasks"));
      const task = {
        id: taskRef.id,
        workOrderId: workOrderRef.id,
        workOrderName,
        workOrderTotalTasks: rows.length,
        workOrderCreatedAtMs: now.getTime(),
        sequenceIndex: row.sequenceIndex,
        employeeSequenceIndex: employeeSeq,
        title: row.title,
        description: row.description,
        taskDate,
        assignedToUid: row.assignedToUid,
        assignedToName: row.assignedToName,
        assignedByUid: state.user.uid,
        assignedByName: state.profile.name,
        createdAt: toTimestamp(now),
        dispatchedAt: toTimestamp(start),
        deadlineMinutes: row.deadlineMinutes,
        deadlineAt: toTimestamp(deadline),
        submittedAt: null,
        approvedAt: null,
        status: "doing",
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
      createdTasks.push(task);
      batch.set(taskRef, task);
    });

    await batch.commit();
    await Promise.all(createdTasks.map((task) => Promise.all([
      createNotification({ recipientUid: task.assignedToUid, type: "task_assigned", title: "Bạn có công việc mới", message: `${task.workOrderName} - ${task.title}`, taskId: task.id, workOrderId: task.workOrderId }),
      createNotification({ recipientUid: state.user.uid, type: "task_assigned_admin", title: "Đã giao việc thành công", message: `${task.assignedToName}: ${task.workOrderName} - ${task.title}`, taskId: task.id, workOrderId: task.workOrderId })
    ])));

    els.taskModal.classList.add("hidden");
    toast("Đã giao phiếu công việc thành công.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không giao được phiếu công việc.", "error");
  } finally {
    setButtonLoading(button, false);
  }
});

els.deleteAllWorkOrdersBtn.addEventListener("click", async () => {
  if (!state.tasks.length) return;
  if (!confirm("Bạn chắc chắn muốn xoá toàn bộ phiếu và công việc?")) return;
  try {
    const batch = writeBatch(db);
    const workOrderIds = new Set(state.tasks.map((task) => task.workOrderId).filter(Boolean));
    state.tasks.forEach((task) => batch.delete(doc(db, "tasks", task.id)));
    workOrderIds.forEach((id) => batch.delete(doc(db, "workOrders", id)));
    await batch.commit();
    toast("Đã xoá toàn bộ phiếu công việc.", "success");
  } catch (error) {
    console.error(error);
    toast("Không xoá được toàn bộ phiếu.", "error");
  }
});

// Filters
function wireDateFilter(prefix) {
  const modeEl = prefix === "admin" ? els.adminDateMode : els.employeeDateMode;
  const singleEl = prefix === "admin" ? els.adminSingleDate : els.employeeSingleDate;
  const fromEl = prefix === "admin" ? els.adminDateFrom : els.employeeDateFrom;
  const toEl = prefix === "admin" ? els.adminDateTo : els.employeeDateTo;
  const clearBtn = prefix === "admin" ? els.adminClearDateFilter : els.employeeClearDateFilter;
  const filter = () => prefix === "admin" ? state.adminDateFilter : state.employeeDateFilter;
  const render = () => prefix === "admin" ? renderAdminTasks() : renderEmployeeTasks();
  modeEl.addEventListener("change", () => { filter().mode = modeEl.value; updateDateFilterControls(prefix); render(); });
  singleEl.addEventListener("change", () => { filter().single = singleEl.value; render(); });
  fromEl.addEventListener("change", () => { filter().from = fromEl.value; render(); });
  toEl.addEventListener("change", () => { filter().to = toEl.value; render(); });
  clearBtn.addEventListener("click", () => { filter().mode = "all"; updateDateFilterControls(prefix); render(); });
}
wireDateFilter("admin");
wireDateFilter("employee");
els.adminStatusFilter.addEventListener("change", (e) => { state.adminStatusFilter = e.target.value; renderAdminTasks(); });
els.adminEmployeeFilter.addEventListener("change", (e) => { state.adminEmployeeFilter = e.target.value; renderAdminTasks(); });

// =========================
// Employee
// =========================
function setupEmployeeDashboard() {
  els.adminView.classList.add("hidden");
  els.employeeView.classList.remove("hidden");
  state.employeeDateFilter = { mode: "today", single: todayInputValue(), from: todayInputValue(), to: todayInputValue() };
  updateDateFilterControls("employee");
  const ownTasksQuery = query(collection(db, "tasks"), where("assignedToUid", "==", state.user.uid));
  const unsubTasks = onSnapshot(ownTasksQuery, (snapshot) => {
    state.tasks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort(compareTaskOrder);
    renderEmployeeTasks();
  }, handleSnapshotError);
  state.unsubs.push(unsubTasks);
}

// =========================
// Render tasks
// =========================
function renderAdminTasks() {
  const computed = state.tasks.map((task) => ({ ...task, displayStatus: getDisplayStatus(task) }));
  const stats = {
    doing: computed.filter((task) => ["scheduled", "doing", "near_due", "redo"].includes(task.displayStatus)).length,
    submitted: computed.filter((task) => task.displayStatus === "submitted").length,
    overdue: computed.filter((task) => task.displayStatus === "overdue").length,
    completed: computed.filter((task) => task.displayStatus === "completed").length
  };
  els.statDoing.textContent = stats.doing;
  els.statSubmitted.textContent = stats.submitted;
  els.statOverdue.textContent = stats.overdue;
  els.statCompleted.textContent = stats.completed;

  let filtered = computed;
  if (state.adminStatusFilter !== "all") filtered = filtered.filter((task) => task.displayStatus === state.adminStatusFilter || task.status === state.adminStatusFilter);
  if (state.adminEmployeeFilter !== "all") filtered = filtered.filter((task) => task.assignedToUid === state.adminEmployeeFilter);
  filtered = applyDateFilter(filtered, state.adminDateFilter);
  els.adminDateSummary.textContent = dateSummary(state.adminDateFilter);

  if (!filtered.length) {
    els.adminTaskList.innerHTML = "Chưa có công việc trong bộ lọc này.";
    els.adminTaskList.classList.add("empty-box");
    return;
  }
  els.adminTaskList.classList.remove("empty-box");
  els.adminTaskList.innerHTML = groupTasksByWorkOrder(filtered).map((group) => renderWorkOrderGroup(group, "admin")).join("");
  updateCountdowns();
}

function renderEmployeeTasks() {
  let filtered = state.tasks.map((task) => ({ ...task, displayStatus: getDisplayStatus(task) }));
  filtered = applyDateFilter(filtered, state.employeeDateFilter);
  els.employeeDateSummary.textContent = dateSummary(state.employeeDateFilter);
  if (!filtered.length) {
    els.employeeTaskList.innerHTML = "Chưa có công việc trong bộ lọc này.";
    els.employeeTaskList.classList.add("empty-box");
    return;
  }
  els.employeeTaskList.classList.remove("empty-box");
  els.employeeTaskList.innerHTML = groupTasksByWorkOrder(filtered).map((group) => renderWorkOrderGroup(group, "employee")).join("");
  updateCountdowns();
}

function renderWorkOrderGroup(group, mode) {
  return `
    <section class="work-order-card">
      <div class="work-order-head">
        <div>
          <p class="eyebrow">Phiếu công việc</p>
          <div class="work-order-title">${escapeHtml(group.name)} - ${Number(group.totalTasks || group.tasks.length)} công việc</div>
        </div>
        ${mode === "admin" ? `<button class="btn danger small" data-action="delete-work-order" data-work-order-id="${escapeHtml(group.id)}">🗑 Xoá phiếu</button>` : ""}
      </div>
      <div class="work-order-tasks">${group.tasks.map((task) => renderTaskCard(task, mode)).join("")}</div>
    </section>
  `;
}

function renderTaskCard(task, mode) {
  const displayStatus = task.displayStatus || getDisplayStatus(task);
  const deadlineDate = timestampToDate(task.deadlineAt);
  const startDate = timestampToDate(task.dispatchedAt || task.createdAt);
  const canEmployeeSubmit = mode === "employee" && ["doing", "redo", "overdue"].includes(task.status) && displayStatus !== "scheduled";
  const canAdminReview = mode === "admin" && task.status === "submitted";
  const canAdminExtend = mode === "admin" && ["scheduled", "doing", "near_due", "overdue", "redo"].includes(displayStatus) && task.status !== "submitted" && task.status !== "completed";
  return `
    <article class="task-card ${taskCardClass(displayStatus)}" data-task-card data-task-id="${escapeHtml(task.id)}" data-start-ms="${startDate?.getTime() || 0}" data-deadline-ms="${deadlineDate?.getTime() || 0}" data-deadline-minutes="${Number(task.deadlineMinutes || 0)}" data-raw-status="${escapeHtml(task.status)}">
      <div class="task-top">
        <div>
          <h4 class="task-title">${escapeHtml(task.title)}</h4>
          <p class="task-desc">${escapeHtml(task.description)}</p>
        </div>
        <span class="status-pill status-${displayStatus}">${statusLabel(displayStatus)}</span>
      </div>
      <div class="task-meta">
        <div class="meta-box"><span>Nhân viên</span><strong>${escapeHtml(task.assignedToName || "--")}</strong></div>
        <div class="meta-box"><span>Ngày giao</span><strong>${formatDateOnly(getTaskDateValue(task))}</strong></div>
        <div class="meta-box"><span>Thời gian quy định</span><strong>${formatMinutes(task.deadlineMinutes)}</strong></div>
        <div class="meta-box"><span>Đếm ngược</span><strong data-countdown>${getInitialCountdownText(task)}</strong></div>
      </div>
      <div class="task-meta">
        <div class="meta-box"><span>Giao lúc</span><strong>${formatDateTime(task.dispatchedAt || task.createdAt)}</strong></div>
        <div class="meta-box"><span>Hạn lúc</span><strong>${formatDateTime(task.deadlineAt)}</strong></div>
        <div class="meta-box"><span>Báo hoàn thành</span><strong>${formatDateTime(task.submittedAt)}</strong></div>
        <div class="meta-box"><span>Admin duyệt</span><strong>${formatDateTime(task.approvedAt)}</strong></div>
      </div>
      ${renderExtensionBox(task)}
      ${renderResultBox(task)}
      ${renderTaskActions(task, { canEmployeeSubmit, canAdminReview, canAdminExtend })}
    </article>
  `;
}

function getInitialCountdownText(task) {
  if (task.status === "completed") return "Đã hoàn thành";
  if (task.status === "submitted") return "Chờ Admin duyệt";
  const now = Date.now();
  const start = timestampToDate(task.dispatchedAt || task.createdAt);
  const deadline = timestampToDate(task.deadlineAt);
  if (start && now < start.getTime()) return `Bắt đầu sau ${formatCountdown(start.getTime() - now)}`;
  if (!deadline) return "--";
  const ms = deadline.getTime() - now;
  return ms >= 0 ? `Còn ${formatCountdown(ms)}` : `Quá hạn ${formatCountdown(ms)}`;
}

function renderExtensionBox(task) {
  const extensions = Array.isArray(task.timeExtensions) ? task.timeExtensions : [];
  if (!extensions.length) return "";
  return `
    <div class="extension-box">
      <strong>Đã thêm giờ ${Number(task.timeExtensionCount || extensions.length)} lần • Tổng ${Number(task.timeExtensionTotalMinutes || 0)} phút</strong>
      <ul>${extensions.map((item, index) => `<li>Lần ${index + 1}: +${Number(item.minutes || 0)} phút — ${escapeHtml(item.reason || "Không ghi mục đích")} — ${formatDateTime(item.createdAt)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderResultBox(task) {
  if (task.status !== "completed" || !task.resultType) return "";
  let summary = "Hoàn thành đúng thời gian quy định.";
  let className = "result-box";
  if (task.resultType === "faster") summary = `Nhanh hơn ${task.differenceMinutes} phút (${task.differencePercent}%).`;
  if (task.resultType === "slower") { summary = `Chậm hơn ${task.differenceMinutes} phút (${task.differencePercent}%).`; className = "result-box slower"; }
  return `<div class="${className}"><strong>Kết quả: ${summary}</strong><br><span>Thời gian thực tế: ${formatMinutes(task.actualMinutes)} • Thời gian quy định: ${formatMinutes(task.deadlineMinutes)}</span></div>`;
}

function renderTaskActions(task, permissions) {
  const buttons = [];
  if (permissions.canAdminExtend) buttons.push(`<button class="btn ghost" data-action="open-time-extension" data-task-id="${escapeHtml(task.id)}">+ Thêm giờ</button>`);
  if (permissions.canAdminReview) {
    buttons.push(`<button class="btn secondary" data-action="approve-task" data-task-id="${escapeHtml(task.id)}">Xác nhận hoàn thành</button>`);
    buttons.push(`<button class="btn warning" data-action="redo-task" data-task-id="${escapeHtml(task.id)}">Yêu cầu làm lại</button>`);
  }
  if (permissions.canEmployeeSubmit) buttons.push(`<button class="btn primary" data-action="submit-task" data-task-id="${escapeHtml(task.id)}">Hoàn thành</button>`);
  return buttons.length ? `<div class="task-actions">${buttons.join("")}</div>` : "";
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const taskId = button.dataset.taskId;
  if (action === "submit-task") await submitTask(taskId, button);
  if (action === "approve-task") await approveTask(taskId, button);
  if (action === "redo-task") await requestRedo(taskId, button);
  if (action === "open-time-extension") openTimeExtensionModal(taskId);
  if (action === "delete-work-order") await deleteWorkOrder(button.dataset.workOrderId, button);
  if (action === "delete-extension-reason") await deleteTimeExtensionReason(button.dataset.reasonId, button);
});

async function submitTask(taskId, button) {
  setButtonLoading(button, true, "Đang gửi...");
  try {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task || task.assignedToUid !== state.user.uid) throw new Error("Bạn không có quyền hoàn thành công việc này.");
    const start = timestampToDate(task.dispatchedAt || task.createdAt);
    if (start && Date.now() < start.getTime()) throw new Error("Công việc này chưa đến giờ bắt đầu.");
    await updateDoc(doc(db, "tasks", taskId), { status: "submitted", submittedAt: serverTimestamp() });
    await createNotification({ recipientUid: task.assignedByUid, type: "task_submitted", title: "Nhân viên đã báo hoàn thành", message: `${task.assignedToName}: ${task.workOrderName} - ${task.title}`, taskId: task.id, workOrderId: task.workOrderId });
    toast("Đã gửi báo hoàn thành. Vui lòng chờ Admin xác nhận.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không gửi được trạng thái hoàn thành.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function calculateResult(task) {
  const startedAt = timestampToDate(task.dispatchedAt || task.createdAt);
  const submittedAt = timestampToDate(task.submittedAt);
  if (!startedAt || !submittedAt) throw new Error("Thiếu thời gian bắt đầu hoặc thời gian báo hoàn thành.");
  const actualMinutes = Math.max(0, Math.ceil((submittedAt.getTime() - startedAt.getTime()) / 60000));
  const deadlineMinutes = Number(task.deadlineMinutes || 0);
  if (deadlineMinutes <= 0) throw new Error("Thời gian quy định không hợp lệ.");
  const differenceMinutes = Math.abs(deadlineMinutes - actualMinutes);
  const differencePercent = Number(((differenceMinutes / deadlineMinutes) * 100).toFixed(1));
  let resultType = "on_time";
  if (actualMinutes < deadlineMinutes) resultType = "faster";
  if (actualMinutes > deadlineMinutes) resultType = "slower";
  return { actualMinutes, resultType, differenceMinutes, differencePercent };
}

async function approveTask(taskId, button) {
  setButtonLoading(button, true, "Đang xác nhận...");
  try {
    const taskSnap = await getDoc(doc(db, "tasks", taskId));
    if (!taskSnap.exists()) throw new Error("Không tìm thấy công việc.");
    const task = { id: taskSnap.id, ...taskSnap.data() };
    const result = calculateResult(task);
    await updateDoc(doc(db, "tasks", taskId), { status: "completed", approvedAt: serverTimestamp(), ...result });
    await createNotification({ recipientUid: task.assignedToUid, type: "task_completed", title: "Admin đã xác nhận hoàn thành", message: `${task.workOrderName} - ${task.title}`, taskId: task.id, workOrderId: task.workOrderId });
    toast("Đã xác nhận hoàn thành và tính kết quả.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không xác nhận được công việc.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function requestRedo(taskId, button) {
  setButtonLoading(button, true, "Đang cập nhật...");
  try {
    const task = state.tasks.find((item) => item.id === taskId);
    await updateDoc(doc(db, "tasks", taskId), { status: "redo", submittedAt: null });
    if (task) await createNotification({ recipientUid: task.assignedToUid, type: "task_redo", title: "Admin yêu cầu làm lại", message: `${task.workOrderName} - ${task.title}`, taskId: task.id, workOrderId: task.workOrderId });
    toast("Đã yêu cầu nhân viên làm lại.", "success");
  } catch (error) {
    console.error(error);
    toast("Không cập nhật được yêu cầu làm lại.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

async function deleteWorkOrder(workOrderId, button) {
  if (!workOrderId || !confirm("Bạn chắc chắn muốn xoá phiếu công việc này?")) return;
  setButtonLoading(button, true, "Đang xoá...");
  try {
    const batch = writeBatch(db);
    state.tasks.filter((task) => task.workOrderId === workOrderId).forEach((task) => batch.delete(doc(db, "tasks", task.id)));
    batch.delete(doc(db, "workOrders", workOrderId));
    await batch.commit();
    toast("Đã xoá phiếu công việc.", "success");
  } catch (error) {
    console.error(error);
    toast("Không xoá được phiếu công việc.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

// =========================
// Time extension
// =========================
function openTimeExtensionModal(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  state.activeExtensionTaskId = taskId;
  els.timeExtensionTaskName.textContent = task.title;
  els.timeExtensionMinutes.value = "15";
  els.newTimeExtensionReason.value = "";
  renderTimeExtensionReasons();
  els.timeExtensionModal.classList.remove("hidden");
}

$$("[data-close-time-extension]").forEach((button) => button.addEventListener("click", () => els.timeExtensionModal.classList.add("hidden")));

function renderTimeExtensionReasons() {
  if (!els.timeExtensionReasonSelect) return;
  const options = state.reasons.map((reason) => `<option value="${escapeHtml(reason.label)}">${escapeHtml(reason.label)}</option>`).join("");
  els.timeExtensionReasonSelect.innerHTML = `<option value="">Chọn mục đích thêm giờ</option>${options}`;
  if (!state.reasons.length) {
    els.timeExtensionReasonList.innerHTML = "Chưa có mục đích nào do Admin tự tạo.";
    els.timeExtensionReasonList.classList.add("empty-box");
    return;
  }
  els.timeExtensionReasonList.classList.remove("empty-box");
  els.timeExtensionReasonList.innerHTML = state.reasons.map((reason) => `
    <div class="reason-item">
      <strong>${escapeHtml(reason.label)}</strong>
      <button class="btn danger small" type="button" data-action="delete-extension-reason" data-reason-id="${escapeHtml(reason.id)}">Xoá</button>
    </div>
  `).join("");
}

async function addTimeExtensionReason(label) {
  const clean = String(label || "").trim();
  if (!clean) throw new Error("Vui lòng nhập mục đích thêm giờ.");
  const existed = state.reasons.find((reason) => reason.label.toLowerCase() === clean.toLowerCase());
  if (existed) return existed;
  const ref = doc(collection(db, "timeExtensionReasons"));
  const item = { id: ref.id, label: clean, createdByUid: state.user.uid, createdByName: state.profile.name, createdAt: serverTimestamp() };
  await setDoc(ref, item);
  return { ...item, createdAt: new Date() };
}

els.addTimeExtensionReasonBtn.addEventListener("click", async () => {
  const button = els.addTimeExtensionReasonBtn;
  setButtonLoading(button, true, "Đang thêm...");
  try {
    const item = await addTimeExtensionReason(els.newTimeExtensionReason.value);
    els.newTimeExtensionReason.value = "";
    toast("Đã thêm mục đích.", "success");
    setTimeout(() => { els.timeExtensionReasonSelect.value = item.label; }, 300);
  } catch (error) {
    console.error(error);
    toast(error.message || "Không thêm được mục đích.", "error");
  } finally {
    setButtonLoading(button, false);
  }
});

async function deleteTimeExtensionReason(reasonId, button) {
  if (!reasonId || !confirm("Bạn chắc muốn xoá mục đích thêm giờ này?")) return;
  setButtonLoading(button, true, "Đang xoá...");
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "timeExtensionReasons", reasonId));
    await batch.commit();
    toast("Đã xoá mục đích thêm giờ.", "success");
  } catch (error) {
    console.error(error);
    toast("Không xoá được mục đích thêm giờ.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

els.timeExtensionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = els.confirmTimeExtensionBtn;
  setButtonLoading(button, true, "Đang cộng giờ...");
  try {
    const minutes = Number(els.timeExtensionMinutes.value || 0);
    if (minutes <= 0) throw new Error("Số phút thêm phải lớn hơn 0.");
    let reason = els.timeExtensionReasonSelect.value;
    const typedReason = els.newTimeExtensionReason.value.trim();
    if (!reason && typedReason) {
      const item = await addTimeExtensionReason(typedReason);
      reason = item.label;
    }
    if (!reason) throw new Error("Vui lòng chọn hoặc nhập mục đích thêm giờ.");
    await extendTaskTime(state.activeExtensionTaskId, minutes, reason);
    els.timeExtensionModal.classList.add("hidden");
    toast("Đã cộng thêm giờ cho công việc.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không cộng thêm giờ được.", "error");
  } finally {
    setButtonLoading(button, false);
  }
});

async function extendTaskTime(taskId, minutes, reason) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error("Không tìm thấy công việc.");
  const oldDeadline = timestampToDate(task.deadlineAt);
  if (!oldDeadline) throw new Error("Công việc thiếu hạn giờ.");
  const newDeadline = new Date(oldDeadline.getTime() + minutes * 60000);
  const extension = {
    minutes,
    reason,
    createdAt: Timestamp.fromDate(new Date()),
    createdByUid: state.user.uid,
    createdByName: state.profile.name
  };
  const batch = writeBatch(db);
  const currentExtensions = Array.isArray(task.timeExtensions) ? task.timeExtensions : [];
  const currentStatus = ["completed", "submitted"].includes(task.status) ? task.status : (newDeadline.getTime() > Date.now() ? "doing" : task.status);
  batch.update(doc(db, "tasks", task.id), {
    deadlineMinutes: Number(task.deadlineMinutes || 0) + minutes,
    deadlineAt: toTimestamp(newDeadline),
    status: currentStatus,
    timeExtensionCount: Number(task.timeExtensionCount || 0) + 1,
    timeExtensionTotalMinutes: Number(task.timeExtensionTotalMinutes || 0) + minutes,
    timeExtensions: [...currentExtensions, extension],
    lastTimeExtendedAt: serverTimestamp(),
    lastTimeExtendedByUid: state.user.uid,
    lastTimeExtendedByName: state.profile.name
  });

  // Dời tất cả công việc phía sau cùng phiếu, cùng nhân viên.
  const following = state.tasks
    .filter((item) => item.workOrderId === task.workOrderId)
    .filter((item) => item.assignedToUid === task.assignedToUid)
    .filter((item) => Number(item.employeeSequenceIndex || 0) > Number(task.employeeSequenceIndex || 0))
    .filter((item) => !["completed", "submitted"].includes(item.status));

  following.forEach((item) => {
    const start = timestampToDate(item.dispatchedAt || item.createdAt);
    const deadline = timestampToDate(item.deadlineAt);
    if (!start || !deadline) return;
    const shiftedStart = new Date(start.getTime() + minutes * 60000);
    const shiftedDeadline = new Date(deadline.getTime() + minutes * 60000);
    batch.update(doc(db, "tasks", item.id), {
      dispatchedAt: toTimestamp(shiftedStart),
      deadlineAt: toTimestamp(shiftedDeadline),
      status: shiftedDeadline.getTime() > Date.now() ? "doing" : item.status
    });
  });

  await batch.commit();
  await Promise.all([
    createNotification({ recipientUid: task.assignedToUid, type: "task_time_extended", title: "Công việc được thêm giờ", message: `${task.workOrderName} - ${task.title}: +${minutes} phút (${reason})`, taskId: task.id, workOrderId: task.workOrderId }),
    createNotification({ recipientUid: state.user.uid, type: "task_time_extended_admin", title: "Đã thêm giờ thành công", message: `${task.assignedToName}: ${task.workOrderName} - ${task.title}: +${minutes} phút`, taskId: task.id, workOrderId: task.workOrderId })
  ]);
}

// =========================
// Countdown updater
// =========================
setInterval(updateCountdowns, 1000);

function updateCountdowns() {
  $$("[data-task-card]").forEach((card) => {
    const rawStatus = card.dataset.rawStatus;
    const countdown = card.querySelector("[data-countdown]");
    if (!countdown) return;
    if (rawStatus === "completed") { countdown.textContent = "Đã hoàn thành"; return; }
    if (rawStatus === "submitted") { countdown.textContent = "Chờ Admin duyệt"; return; }
    const startMs = Number(card.dataset.startMs || 0);
    const deadlineMs = Number(card.dataset.deadlineMs || 0);
    const now = Date.now();
    if (startMs && now < startMs) {
      countdown.textContent = `Bắt đầu sau ${formatCountdown(startMs - now)}`;
      card.classList.add("is-scheduled");
      return;
    }
    if (!deadlineMs) { countdown.textContent = "--"; return; }
    const remainingMs = deadlineMs - now;
    countdown.textContent = remainingMs >= 0 ? `Còn ${formatCountdown(remainingMs)}` : `Quá hạn ${formatCountdown(remainingMs)}`;
    card.classList.toggle("is-overdue", remainingMs <= 0);
    const deadlineMinutes = Number(card.dataset.deadlineMinutes || 0);
    const nearThreshold = Math.min(15 * 60 * 1000, Math.max(1, deadlineMinutes) * 60 * 1000 * 0.2);
    card.classList.toggle("is-near-due", remainingMs > 0 && remainingMs <= nearThreshold);
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(console.warn));
}
