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
  notifications: [],
  knownNotificationIds: new Set(),
  notificationsReady: false,
  unsubs: [],
  adminStatusFilter: "all",
  adminEmployeeFilter: "all",
  adminDateFilter: {
    mode: "all",
    single: "",
    from: "",
    to: ""
  },
  employeeDateFilter: {
    mode: "all",
    single: "",
    from: "",
    to: ""
  }
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
  markAllNotificationsReadBtn: $("#markAllNotificationsReadBtn")
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
  if (task.status === "completed") return "completed";
  if (task.status === "submitted") return "submitted";

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

  const onChange = () => {
    state[`${prefix}DateFilter`] = {
      mode: modeEl.value,
      single: singleEl?.value || "",
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

      // Admin mở dashboard thì hệ thống tự đánh dấu quá hạn để trạng thái được lưu vào database.
      await syncOverdueTasksByAdmin();
    },
    handleSnapshotError
  );

  state.unsubs.push(unsubUsers, unsubTasks);
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

function createTaskRowElement() {
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

  wrapper.querySelector(".row-date").valueAsDate = new Date();

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

  els.workOrderName.value = "";
  resetTaskRows();

  els.taskModal.classList.remove("hidden");
});

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

els.createTaskForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (state.profile?.role !== "admin") return;

  const button = $("#createTaskBtn");
  setButtonLoading(button, true, "Đang tạo phiếu...");

  try {
    const workOrderName = els.workOrderName.value.trim();

    if (!workOrderName) {
      throw new Error("Vui lòng nhập tên phiếu công việc.");
    }

    const rows = readTaskRowsData();
    const validationError = validateTaskRows(rows);

    if (validationError) {
      throw new Error(validationError);
    }

    const now = new Date();
    const batch = writeBatch(db);

    const workOrderRef = doc(collection(db, "workOrders"));
    batch.set(workOrderRef, {
      id: workOrderRef.id,
      name: workOrderName,
      createdByUid: state.user.uid,
      createdByName: state.profile.name,
      createdAt: serverTimestamp(),
      taskCount: rows.length
    });

    const notificationItems = [];
    const createdTaskRefs = [];

    rows.forEach((row) => {
      const deadlineAt = new Date(now.getTime() + row.deadlineMinutes * 60 * 1000);
      const taskRef = doc(collection(db, "tasks"));
      createdTaskRefs.push({ ref: taskRef, row });

      batch.set(taskRef, {
        id: taskRef.id,
        title: row.title,
        description: row.description,
        taskDate: row.taskDate,
        assignedToUid: row.assignedToUid,
        assignedToName: row.assignedEmployee.name,
        assignedByUid: state.user.uid,
        assignedByName: state.profile.name,
        workOrderId: workOrderRef.id,
        workOrderName,
        createdAt: serverTimestamp(),
        deadlineMinutes: row.deadlineMinutes,
        deadlineAt: Timestamp.fromDate(deadlineAt),
        submittedAt: null,
        approvedAt: null,
        status: "doing",
        actualMinutes: null,
        resultType: null,
        differenceMinutes: null,
        differencePercent: null
      });

      notificationItems.push({
        recipientUid: row.assignedToUid,
        type: "task_assigned",
        title: "Bạn có công việc mới",
        message: `${state.profile.name || "Admin"} đã giao cho bạn: ${row.title} (phiếu “${workOrderName}”). Hạn hoàn thành: ${formatMinutes(row.deadlineMinutes)}.`,
        taskId: taskRef.id,
        taskTitle: row.title
      });
    });

    await batch.commit();

    notificationItems.push({
      recipientUid: state.user.uid,
      type: "task_assigned_admin",
      title: "Đã tạo phiếu công việc",
      message: `Bạn đã tạo phiếu “${workOrderName}” với ${rows.length} công việc.`,
      taskId: createdTaskRefs[0].ref.id,
      taskTitle: workOrderName
    });

    await createNotifications(notificationItems);

    els.workOrderName.value = "";
    resetTaskRows();

    els.taskModal.classList.add("hidden");

    toast(`Đã tạo phiếu “${workOrderName}” với ${rows.length} công việc.`, "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không tạo được phiếu công việc.", "error");
  } finally {
    setButtonLoading(button, false);
  }
});

els.adminStatusFilter.addEventListener("change", (event) => {
  state.adminStatusFilter = event.target.value;
  renderAdminTasks();
});

els.adminEmployeeFilter.addEventListener("change", (event) => {
  state.adminEmployeeFilter = event.target.value;
  renderAdminTasks();
});

async function syncOverdueTasksByAdmin() {
  if (state.profile?.role !== "admin") return;

  const updates = state.tasks
    .filter((task) => ["doing", "redo"].includes(task.status))
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
        .sort((a, b) => {
          const bDate = timestampToDate(b.createdAt)?.getTime() || 0;
          const aDate = timestampToDate(a.createdAt)?.getTime() || 0;
          return bDate - aDate;
        });

      renderEmployeeTasks();
    },
    handleSnapshotError
  );

  state.unsubs.push(unsubTasks);
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

  if (!filtered.length) {
    els.adminTaskList.innerHTML = "Không có công việc phù hợp bộ lọc.";
    els.adminTaskList.classList.add("empty");
    return;
  }

  els.adminTaskList.classList.remove("empty");

  els.adminTaskList.innerHTML = groupTasksByWorkOrder(filtered)
    .map((group) => renderTicketGroup(group))
    .join("");

  updateCountdowns();
}

// Gom các công việc thuộc cùng 1 phiếu (workOrder) lại với nhau, giữ nguyên thứ tự
// xuất hiện đầu tiên của mỗi phiếu (task mới nhất trước, vì state.tasks đã sort desc).
function groupTasksByWorkOrder(tasks) {
  const groups = [];
  const groupByKey = new Map();

  tasks.forEach((task) => {
    const key = task.workOrderId || "legacy";

    if (!groupByKey.has(key)) {
      const group = {
        key,
        name: task.workOrderName || "Công việc lẻ (giao trước khi có Phiếu)",
        tasks: []
      };
      groupByKey.set(key, group);
      groups.push(group);
    }

    groupByKey.get(key).tasks.push(task);
  });

  return groups;
}

function renderTicketGroup(group) {
  return `
    <section class="ticket-group">
      <div class="ticket-group-header">
        <div>
          <span class="ticket-badge">Phiếu công việc</span>
          <h4>${escapeHtml(group.name)}</h4>
        </div>
        <span class="ticket-count">${group.tasks.length} công việc</span>
      </div>
      <div class="ticket-tasks">
        ${group.tasks.map((task) => renderTaskCard(task, "admin")).join("")}
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

  els.employeeTaskList.innerHTML = filtered
    .map((task) => renderTaskCard(task, "employee"))
    .join("");

  updateCountdowns();
}

function renderTaskCard(task, mode) {
  const displayStatus = task.displayStatus || getDisplayStatus(task);
  const deadlineDate = timestampToDate(task.deadlineAt);
  const deadlineMs = deadlineDate?.getTime() || 0;

  const canEmployeeSubmit =
    mode === "employee" &&
    ["doing", "redo", "overdue"].includes(task.status) &&
    task.status !== "completed" &&
    task.status !== "submitted";

  const canAdminReview =
    mode === "admin" &&
    task.status === "submitted";

  return `
    <article class="task-card ${taskCardClass(displayStatus)}" data-task-card data-deadline-ms="${deadlineMs}" data-deadline-minutes="${Number(task.deadlineMinutes || 0)}" data-raw-status="${escapeHtml(task.status)}">
      <div class="task-top">
        <div>
          <h4 class="task-title">${escapeHtml(task.title)}</h4>
          <p class="task-desc">${escapeHtml(task.description)}</p>
        </div>
        <span class="status-pill status-${displayStatus}">${statusLabel(displayStatus)}</span>
      </div>

      <div class="task-meta">
        ${mode === "employee" ? `
        <div class="meta-box">
          <span>Phiếu công việc</span>
          <strong>${escapeHtml(task.workOrderName || "--")}</strong>
        </div>
        ` : ""}
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
          <strong>${formatDateTime(task.createdAt)}</strong>
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

      ${renderResultBox(task)}
      ${renderTaskActions(task, { canEmployeeSubmit, canAdminReview })}
    </article>
  `;
}

function getInitialCountdownText(task) {
  if (task.status === "completed") return "Đã hoàn thành";
  if (task.status === "submitted") return "Chờ Admin duyệt";

  const deadline = timestampToDate(task.deadlineAt);

  if (!deadline) return "--";

  const ms = deadline.getTime() - Date.now();

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

function renderTaskActions(task, permissions) {
  const buttons = [];

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

// Event delegation cho các nút trong task card và notification list.
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  const action = button.dataset.action;
  const taskId = button.dataset.taskId;

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
  const createdAt = timestampToDate(task.createdAt);
  const submittedAt = timestampToDate(task.submittedAt);

  if (!createdAt || !submittedAt) {
    throw new Error("Thiếu thời gian giao việc hoặc thời gian nhân viên báo hoàn thành.");
  }

  const actualMinutes = Math.max(
    0,
    Math.ceil((submittedAt.getTime() - createdAt.getTime()) / 60000)
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

function updateCountdowns() {
  $$("[data-task-card]").forEach((card) => {
    const rawStatus = card.dataset.rawStatus;
    const countdown = card.querySelector("[data-countdown]");

    if (!countdown) return;

    if (rawStatus === "completed") {
      countdown.textContent = "Đã hoàn thành";
      return;
    }

    if (rawStatus === "submitted") {
      countdown.textContent = "Chờ Admin duyệt";
      return;
    }

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
