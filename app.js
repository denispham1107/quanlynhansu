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
  Timestamp
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
  unsubs: [],
  adminStatusFilter: "all",
  adminEmployeeFilter: "all"
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
  taskAssignee: $("#taskAssignee"),
  adminEmployeeFilter: $("#adminEmployeeFilter"),
  adminStatusFilter: $("#adminStatusFilter"),
  adminTaskList: $("#adminTaskList"),
  employeeTaskList: $("#employeeTaskList"),
  statDoing: $("#statDoing"),
  statSubmitted: $("#statSubmitted"),
  statOverdue: $("#statOverdue"),
  statCompleted: $("#statCompleted")
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
  setTimeout(() => item.remove(), 3600);
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
    console.error(error);
    toast("Đăng nhập thất bại. Kiểm tra email/mật khẩu hoặc tài khoản Firebase.", "error");
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

  if (!user) {
    showLogin();
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
}

function showApp() {
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");
  const roleText = state.profile.role === "admin" ? "Admin" : "Nhân viên";
  els.currentUserText.textContent = `${state.profile.name || state.user.email} • ${roleText}`;
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

  const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
    state.employees = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((user) => user.role === "employee")
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));

    renderEmployees();
    renderEmployeeSelects();
  }, handleSnapshotError);

  const tasksQuery = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
  const unsubTasks = onSnapshot(tasksQuery, async (snapshot) => {
    state.tasks = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAdminTasks();
    // Admin mở dashboard thì hệ thống tự đánh dấu quá hạn để trạng thái được lưu vào database.
    await syncOverdueTasksByAdmin();
  }, handleSnapshotError);

  state.unsubs.push(unsubUsers, unsubTasks);
}

function handleSnapshotError(error) {
  console.error(error);
  toast("Không đọc được dữ liệu realtime. Kiểm tra Firestore Rules hoặc index.", "error");
}

function renderEmployees() {
  if (!state.employees.length) {
    els.employeeList.innerHTML = "";
    els.employeeList.classList.add("empty");
    return;
  }

  els.employeeList.classList.remove("empty");
  els.employeeList.innerHTML = state.employees.map((employee) => `
    <div class="employee-item">
      <div class="avatar">${escapeHtml(initials(employee.name))}</div>
      <div>
        <strong>${escapeHtml(employee.name)}</strong>
        <span>${escapeHtml(employee.email)}</span>
      </div>
    </div>
  `).join("");
}

function renderEmployeeSelects() {
  const employeeOptions = state.employees.map((employee) => (
    `<option value="${escapeHtml(employee.uid)}">${escapeHtml(employee.name)} - ${escapeHtml(employee.email)}</option>`
  )).join("");

  els.taskAssignee.innerHTML = `<option value="">Chọn nhân viên</option>${employeeOptions}`;
  els.adminEmployeeFilter.innerHTML = `<option value="all">Tất cả nhân viên</option>${employeeOptions}`;
  els.adminEmployeeFilter.value = state.adminEmployeeFilter;
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
  const today = new Date();
  $("#taskDate").valueAsDate = today;
  els.taskModal.classList.remove("hidden");
});

$$("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => els.taskModal.classList.add("hidden"));
});

els.createTaskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.profile?.role !== "admin") return;

  const button = $("#createTaskBtn");
  setButtonLoading(button, true, "Đang giao việc...");

  try {
    const title = $("#taskTitle").value.trim();
    const description = $("#taskDescription").value.trim();
    const assignedToUid = $("#taskAssignee").value;
    const assignedEmployee = state.employees.find((employee) => employee.uid === assignedToUid);
    const hours = Number($("#taskHours").value || 0);
    const minutes = Number($("#taskMinutes").value || 0);
    const deadlineMinutes = hours * 60 + minutes;

    if (!assignedEmployee) throw new Error("Vui lòng chọn nhân viên hợp lệ.");
    if (deadlineMinutes <= 0) throw new Error("Thời gian cần hoàn thành phải lớn hơn 0 phút.");

    const now = new Date();
    const deadlineAt = new Date(now.getTime() + deadlineMinutes * 60 * 1000);
    const taskDateInput = $("#taskDate").value;

    const taskRef = doc(collection(db, "tasks"));
    await setDoc(taskRef, {
      id: taskRef.id,
      title,
      description,
      taskDate: taskDateInput,
      assignedToUid,
      assignedToName: assignedEmployee.name,
      assignedByUid: state.user.uid,
      assignedByName: state.profile.name,
      createdAt: serverTimestamp(),
      deadlineMinutes,
      deadlineAt: Timestamp.fromDate(deadlineAt),
      submittedAt: null,
      approvedAt: null,
      status: "doing",
      actualMinutes: null,
      resultType: null,
      differenceMinutes: null,
      differencePercent: null
    });

    els.createTaskForm.reset();
    $("#taskHours").value = 0;
    $("#taskMinutes").value = 30;
    els.taskModal.classList.add("hidden");
    toast("Đã giao việc thành công.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không giao được việc.", "error");
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
    .slice(0, 10) // tránh update quá nhiều cùng lúc nếu dữ liệu lớn
    .map((task) => updateDoc(doc(db, "tasks", task.id), { status: "overdue" }));

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
  const ownTasksQuery = query(collection(db, "tasks"), where("assignedToUid", "==", state.user.uid));
  const unsubTasks = onSnapshot(ownTasksQuery, (snapshot) => {
    state.tasks = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => {
        const bDate = timestampToDate(b.createdAt)?.getTime() || 0;
        const aDate = timestampToDate(a.createdAt)?.getTime() || 0;
        return bDate - aDate;
      });
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
    doing: computed.filter((task) => task.displayStatus === "doing" || task.displayStatus === "near_due" || task.displayStatus === "redo").length,
    submitted: computed.filter((task) => task.displayStatus === "submitted").length,
    overdue: computed.filter((task) => task.displayStatus === "overdue").length,
    completed: computed.filter((task) => task.displayStatus === "completed").length
  };
  els.statDoing.textContent = stats.doing;
  els.statSubmitted.textContent = stats.submitted;
  els.statOverdue.textContent = stats.overdue;
  els.statCompleted.textContent = stats.completed;

  let filtered = computed;
  if (state.adminStatusFilter !== "all") {
    filtered = filtered.filter((task) => task.displayStatus === state.adminStatusFilter || task.status === state.adminStatusFilter);
  }
  if (state.adminEmployeeFilter !== "all") {
    filtered = filtered.filter((task) => task.assignedToUid === state.adminEmployeeFilter);
  }

  if (!filtered.length) {
    els.adminTaskList.innerHTML = "";
    els.adminTaskList.classList.add("empty");
    return;
  }

  els.adminTaskList.classList.remove("empty");
  els.adminTaskList.innerHTML = filtered.map((task) => renderTaskCard(task, "admin")).join("");
  updateCountdowns();
}

function renderEmployeeTasks() {
  if (!state.tasks.length) {
    els.employeeTaskList.innerHTML = "";
    els.employeeTaskList.classList.add("empty");
    return;
  }

  els.employeeTaskList.classList.remove("empty");
  els.employeeTaskList.innerHTML = state.tasks
    .map((task) => ({ ...task, displayStatus: getDisplayStatus(task) }))
    .map((task) => renderTaskCard(task, "employee"))
    .join("");
  updateCountdowns();
}

function renderTaskCard(task, mode) {
  const displayStatus = task.displayStatus || getDisplayStatus(task);
  const deadlineDate = timestampToDate(task.deadlineAt);
  const deadlineMs = deadlineDate?.getTime() || 0;
  const canEmployeeSubmit = mode === "employee" && ["doing", "redo", "overdue"].includes(task.status) && task.status !== "completed" && task.status !== "submitted";
  const canAdminReview = mode === "admin" && task.status === "submitted";

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
        <div class="meta-box">
          <span>Nhân viên</span>
          <strong>${escapeHtml(task.assignedToName || "--")}</strong>
        </div>
        <div class="meta-box">
          <span>Ngày giao</span>
          <strong>${escapeHtml(task.taskDate || formatDateTime(task.createdAt))}</strong>
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
  return ms >= 0 ? `Còn ${formatCountdown(ms)}` : `Quá hạn ${formatCountdown(ms)}`;
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
    buttons.push(`<button class="btn primary" data-action="submit-task" data-task-id="${escapeHtml(task.id)}">Hoàn thành</button>`);
  }

  if (permissions.canAdminReview) {
    buttons.push(`<button class="btn secondary" data-action="approve-task" data-task-id="${escapeHtml(task.id)}">Xác nhận hoàn thành</button>`);
    buttons.push(`<button class="btn warning" data-action="redo-task" data-task-id="${escapeHtml(task.id)}">Yêu cầu làm lại</button>`);
  }

  if (!buttons.length) return "";
  return `<div class="task-actions">${buttons.join("")}</div>`;
}

// Event delegation cho các nút trong task card.
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;
  const taskId = button.dataset.taskId;
  if (!taskId) return;

  if (action === "submit-task") {
    await submitTask(taskId, button);
  }
  if (action === "approve-task") {
    await approveTask(taskId, button);
  }
  if (action === "redo-task") {
    await requestRedo(taskId, button);
  }
});

async function submitTask(taskId, button) {
  setButtonLoading(button, true, "Đang gửi...");
  try {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task || task.assignedToUid !== state.user.uid) throw new Error("Bạn không có quyền hoàn thành công việc này.");

    await updateDoc(doc(db, "tasks", taskId), {
      status: "submitted",
      submittedAt: serverTimestamp()
    });
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
    if (!taskSnap.exists()) throw new Error("Không tìm thấy công việc.");
    const task = { id: taskSnap.id, ...taskSnap.data() };
    if (task.status !== "submitted") throw new Error("Công việc chưa ở trạng thái chờ xác nhận.");

    const result = calculateResult(task);
    await updateDoc(doc(db, "tasks", taskId), {
      status: "completed",
      approvedAt: serverTimestamp(),
      actualMinutes: result.actualMinutes,
      resultType: result.resultType,
      differenceMinutes: result.differenceMinutes,
      differencePercent: result.differencePercent
    });
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
    await updateDoc(doc(db, "tasks", taskId), {
      status: "redo",
      submittedAt: null
    });
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
  if (!createdAt || !submittedAt) throw new Error("Thiếu thời gian giao việc hoặc thời gian nhân viên báo hoàn thành.");

  const actualMinutes = Math.max(0, Math.ceil((submittedAt.getTime() - createdAt.getTime()) / 60000));
  const deadlineMinutes = Number(task.deadlineMinutes || 0);
  if (deadlineMinutes <= 0) throw new Error("Thời gian quy định không hợp lệ.");

  const differenceMinutes = Math.abs(deadlineMinutes - actualMinutes);
  const differencePercent = Number(((differenceMinutes / deadlineMinutes) * 100).toFixed(1));
  let resultType = "on_time";
  if (actualMinutes < deadlineMinutes) resultType = "faster";
  if (actualMinutes > deadlineMinutes) resultType = "slower";

  return { actualMinutes, resultType, differenceMinutes, differencePercent };
}

// Cập nhật đồng hồ đếm ngược mỗi giây mà không cần đọc lại database.
setInterval(updateCountdowns, 1000);

function updateCountdowns() {
  $$('[data-task-card]').forEach((card) => {
    const rawStatus = card.dataset.rawStatus;
    const countdown = card.querySelector('[data-countdown]');
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
    const nearThreshold = Math.min(15 * 60 * 1000, Math.max(1, deadlineMinutes) * 60 * 1000 * 0.2);
    card.classList.toggle("is-near-due", remainingMs > 0 && remainingMs <= nearThreshold);
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
