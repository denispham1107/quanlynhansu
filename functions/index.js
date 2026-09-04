"use strict";

const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage: getAdminStorage } = require("firebase-admin/storage");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");

initializeApp();

const db = getFirestore();
const workOrderSettingsPassword = defineSecret("WORK_ORDER_SETTINGS_PASSWORD");

const REGION = "asia-southeast1";
const SESSION_TTL_MS = 10 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 5 * 60 * 1000;
const ALLOWED_EXTEND_LIMITS = new Set([10, 20, 30]);
const PUSH_SUBSCRIPTIONS_COLLECTION = "pushSubscriptions";
const MAX_PUSH_TOKEN_LENGTH = 4096;
const WORK_SUPERVISION_COLLECTION = "workSupervision";
const WORK_SUPERVISION_LEGACY_STATE_PATH = `${WORK_SUPERVISION_COLLECTION}/current`;
const WORK_SUPERVISION_DEFAULT_COUNTDOWN_MINUTES = 5;
const WORK_SUPERVISION_MIN_COUNTDOWN_MINUTES = 1;
const WORK_SUPERVISION_MAX_COUNTDOWN_MINUTES = 30;
const WORK_SUPERVISION_DEFAULT_LUNCH_CREDIT_MINUTES = 5;
const WORK_SUPERVISION_MIN_LUNCH_CREDIT_MINUTES = 0;
const WORK_SUPERVISION_MAX_LUNCH_CREDIT_MINUTES = 30;
const WORK_SUPERVISION_LUNCH_TOTAL_MINUTES = 30;
const WORK_SUPERVISION_TIME_ZONE = "Asia/Ho_Chi_Minh";
const WORK_SUPERVISION_ACTIVE_TASK_STATUSES = ["doing", "lunch_break", "hotel", "redo", "overdue"];

function pushTokenDocumentId(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sanitizePushText(value, fallback, maxLength = 240) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function getWebAppBaseUrl() {
  return "https://denispham1107.github.io/quanlynhansu/";
}

function assertAuthenticated(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Bạn cần đăng nhập để thực hiện thao tác này.");
  }
  return request.auth.uid;
}

async function assertAdmin(uid) {
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists || userSnap.data()?.role !== "admin") {
    throw new HttpsError("permission-denied", "Chỉ Admin được truy cập Cài đặt.");
  }
  return userSnap.data();
}

function safeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), "utf8");
  const rightBuffer = Buffer.from(String(right), "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signSessionPayload(encodedPayload, secret) {
  return crypto
    .createHmac("sha256", `work-order-settings-session:${secret}`)
    .update(encodedPayload)
    .digest("base64url");
}

function issueAuthorizationToken(uid, secret) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = {
    uid,
    exp: expiresAt,
    nonce: crypto.randomBytes(18).toString("base64url")
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signSessionPayload(encodedPayload, secret);
  return {
    authorizationToken: `${encodedPayload}.${signature}`,
    expiresAt
  };
}

function verifyAuthorizationToken(token, uid, secret) {
  if (typeof token !== "string" || token.length < 40 || token.length > 2048) {
    throw new HttpsError("unauthenticated", "Phiên xác thực Cài đặt không hợp lệ.");
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new HttpsError("unauthenticated", "Phiên xác thực Cài đặt không hợp lệ.");
  }

  const [encodedPayload, receivedSignature] = parts;
  const expectedSignature = signSessionPayload(encodedPayload, secret);
  if (!safeStringEqual(receivedSignature, expectedSignature)) {
    throw new HttpsError("unauthenticated", "Phiên xác thực Cài đặt không hợp lệ.");
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (_) {
    throw new HttpsError("unauthenticated", "Phiên xác thực Cài đặt không hợp lệ.");
  }

  if (payload?.uid !== uid || !Number.isFinite(payload?.exp) || payload.exp <= Date.now()) {
    throw new HttpsError("unauthenticated", "Phiên xác thực Cài đặt đã hết hạn.");
  }

  return payload;
}

function rateLimitRef(uid) {
  const safeUid = crypto.createHash("sha256").update(uid).digest("hex");
  return db.doc(`securityRateLimits/workOrderSettings_${safeUid}`);
}

async function assertNotBlocked(uid) {
  const snap = await rateLimitRef(uid).get();
  const blockedUntil = snap.data()?.blockedUntil;
  if (blockedUntil instanceof Timestamp && blockedUntil.toMillis() > Date.now()) {
    throw new HttpsError("resource-exhausted", "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau.");
  }
}

async function recordFailedAttempt(uid) {
  const ref = rateLimitRef(uid);
  const nowMs = Date.now();

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.exists ? snap.data() : {};
    const lastAttemptMs = data.lastAttemptAt instanceof Timestamp
      ? data.lastAttemptAt.toMillis()
      : 0;
    const previousCount = nowMs - lastAttemptMs <= ATTEMPT_WINDOW_MS
      ? Number(data.failedAttempts || 0)
      : 0;
    const failedAttempts = previousCount + 1;
    const shouldBlock = failedAttempts >= MAX_FAILED_ATTEMPTS;

    transaction.set(ref, {
      failedAttempts: shouldBlock ? 0 : failedAttempts,
      lastAttemptAt: Timestamp.fromMillis(nowMs),
      blockedUntil: shouldBlock
        ? Timestamp.fromMillis(nowMs + BLOCK_DURATION_MS)
        : null,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

async function clearFailedAttempts(uid) {
  await rateLimitRef(uid).set({
    failedAttempts: 0,
    blockedUntil: null,
    lastAttemptAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

exports.verifyWorkOrderSettingsPassword = onCall({
  region: REGION,
  secrets: [workOrderSettingsPassword],
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 10
}, async (request) => {
  const uid = assertAuthenticated(request);
  await assertAdmin(uid);
  await assertNotBlocked(uid);

  const password = request.data?.password;
  if (typeof password !== "string" || password.length < 1 || password.length > 128) {
    throw new HttpsError("invalid-argument", "Mật khẩu không hợp lệ.");
  }

  const expectedPassword = workOrderSettingsPassword.value();
  if (!expectedPassword) {
    throw new HttpsError("failed-precondition", "Chưa cấu hình mật khẩu Cài đặt trên máy chủ.");
  }

  if (!safeStringEqual(password, expectedPassword)) {
    await recordFailedAttempt(uid);
    throw new HttpsError("permission-denied", "Mật khẩu không đúng.");
  }

  await clearFailedAttempts(uid);
  const session = issueAuthorizationToken(uid, expectedPassword);

  return {
    authorized: true,
    authorizationToken: session.authorizationToken,
    expiresAt: session.expiresAt
  };
});

exports.saveWorkOrderControlSettings = onCall({
  region: REGION,
  secrets: [workOrderSettingsPassword],
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 10
}, async (request) => {
  const uid = assertAuthenticated(request);
  const adminProfile = await assertAdmin(uid);
  const expectedPassword = workOrderSettingsPassword.value();

  if (!expectedPassword) {
    throw new HttpsError("failed-precondition", "Chưa cấu hình mật khẩu Cài đặt trên máy chủ.");
  }

  verifyAuthorizationToken(request.data?.authorizationToken, uid, expectedPassword);

  const rawMaxExtendMinutes = request.data?.maxExtendMinutes;
  const maxExtendMinutes = rawMaxExtendMinutes === null || rawMaxExtendMinutes === undefined
    ? null
    : Number(rawMaxExtendMinutes);
  const preventWorkOrderDeletion = request.data?.preventWorkOrderDeletion;
  const rawPreventDispatchedPhotoRequirementEditing = request.data?.preventDispatchedPhotoRequirementEditing;
  const existingSettingsSnap = rawPreventDispatchedPhotoRequirementEditing === undefined
    ? await db.doc("appSettings/workOrderControls").get()
    : null;
  const preventDispatchedPhotoRequirementEditing = rawPreventDispatchedPhotoRequirementEditing === undefined
    ? existingSettingsSnap?.data()?.preventDispatchedPhotoRequirementEditing === true
    : rawPreventDispatchedPhotoRequirementEditing;
  const allowOverdueTimeExtension = request.data?.allowOverdueTimeExtension;
  const rawAllowEditCompletedTaskActualTime = request.data?.allowEditCompletedTaskActualTime;
  const allowEditCompletedTaskActualTime = rawAllowEditCompletedTaskActualTime === undefined
    ? false
    : rawAllowEditCompletedTaskActualTime;
  const workSupervisionEnabled = request.data?.workSupervisionEnabled;
  const rawWorkSupervisionCountdownMinutes = request.data?.workSupervisionCountdownMinutes;
  const workSupervisionCountdownMinutes = Number(rawWorkSupervisionCountdownMinutes);
  const rawWorkSupervisionLunchCreditMinutes = request.data?.workSupervisionLunchCreditMinutes;
  const workSupervisionLunchCreditMinutes = rawWorkSupervisionLunchCreditMinutes === undefined
    ? workSupervisionCountdownMinutes
    : Number(rawWorkSupervisionLunchCreditMinutes);
  const legacyWorkSupervisionExcludedEmployeeUid = typeof request.data?.workSupervisionExcludedEmployeeUid === "string"
    ? request.data.workSupervisionExcludedEmployeeUid.trim()
    : "";
  const rawWorkSupervisionExcludedEmployeeUids = Array.isArray(request.data?.workSupervisionExcludedEmployeeUids)
    ? request.data.workSupervisionExcludedEmployeeUids
    : (legacyWorkSupervisionExcludedEmployeeUid ? [legacyWorkSupervisionExcludedEmployeeUid] : []);
  const workSupervisionExcludedEmployeeUids = [...new Set(
    rawWorkSupervisionExcludedEmployeeUids
      .map((employeeUid) => String(employeeUid || "").trim())
      .filter(Boolean)
  )];

  if (maxExtendMinutes !== null && !ALLOWED_EXTEND_LIMITS.has(maxExtendMinutes)) {
    throw new HttpsError("invalid-argument", "Giới hạn thêm giờ chỉ được là 10, 20 hoặc 30 phút.");
  }
  if (typeof preventWorkOrderDeletion !== "boolean") {
    throw new HttpsError("invalid-argument", "Giá trị khóa xóa Phiếu không hợp lệ.");
  }
  if (typeof preventDispatchedPhotoRequirementEditing !== "boolean") {
    throw new HttpsError("invalid-argument", "Giá trị khóa chỉnh số Ảnh báo cáo không hợp lệ.");
  }
  if (typeof allowOverdueTimeExtension !== "boolean") {
    throw new HttpsError("invalid-argument", "Giá trị cho phép thêm giờ công việc quá hạn không hợp lệ.");
  }
  if (typeof allowEditCompletedTaskActualTime !== "boolean") {
    throw new HttpsError("invalid-argument", "Giá trị cho phép sửa Phiếu công việc đã hoàn thành không hợp lệ.");
  }
  if (typeof workSupervisionEnabled !== "boolean") {
    throw new HttpsError("invalid-argument", "Giá trị Giám sát công việc không hợp lệ.");
  }
  if (
    !Number.isInteger(workSupervisionCountdownMinutes)
    || workSupervisionCountdownMinutes < WORK_SUPERVISION_MIN_COUNTDOWN_MINUTES
    || workSupervisionCountdownMinutes > WORK_SUPERVISION_MAX_COUNTDOWN_MINUTES
  ) {
    throw new HttpsError("invalid-argument", "Thời gian Giám sát công việc phải từ 1 đến 30 phút.");
  }
  if (
    !Number.isInteger(workSupervisionLunchCreditMinutes)
    || workSupervisionLunchCreditMinutes < WORK_SUPERVISION_MIN_LUNCH_CREDIT_MINUTES
    || workSupervisionLunchCreditMinutes > WORK_SUPERVISION_MAX_LUNCH_CREDIT_MINUTES
  ) {
    throw new HttpsError("invalid-argument", "Số phút cộng thêm vào Phiếu nghỉ trưa phải từ 0 đến 30 phút.");
  }
  if (workSupervisionExcludedEmployeeUids.length > 500) {
    throw new HttpsError("invalid-argument", "Danh sách nhân viên miễn giám sát vượt quá giới hạn cho phép.");
  }
  if (workSupervisionExcludedEmployeeUids.some((employeeUid) => employeeUid.length > 128)) {
    throw new HttpsError("invalid-argument", "Nhân viên miễn giám sát không hợp lệ.");
  }

  const workSupervisionExcludedEmployeeNames = {};
  if (workSupervisionExcludedEmployeeUids.length) {
    const excludedEmployeeSnaps = await Promise.all(
      workSupervisionExcludedEmployeeUids.map((employeeUid) => db.doc(`users/${employeeUid}`).get())
    );
    excludedEmployeeSnaps.forEach((excludedEmployeeSnap, index) => {
      const employeeUid = workSupervisionExcludedEmployeeUids[index];
      const excludedEmployee = excludedEmployeeSnap.exists ? excludedEmployeeSnap.data() || {} : {};
      if (!excludedEmployeeSnap.exists || excludedEmployee.role !== "employee") {
        throw new HttpsError("invalid-argument", "Tất cả tài khoản được miễn giám sát phải là nhân viên hợp lệ.");
      }
      workSupervisionExcludedEmployeeNames[employeeUid] = supervisionEmployeeName({
        uid: employeeUid,
        ...excludedEmployee
      }).slice(0, 120);
    });
  }
  const workSupervisionExcludedEmployees = workSupervisionExcludedEmployeeUids.map((employeeUid) => ({
    uid: employeeUid,
    name: workSupervisionExcludedEmployeeNames[employeeUid] || "Nhân viên"
  }));
  const workSupervisionExcludedEmployeeUid = workSupervisionExcludedEmployeeUids[0] || "";
  const workSupervisionExcludedEmployeeName = workSupervisionExcludedEmployeeNames[workSupervisionExcludedEmployeeUid] || "";

  const settings = {
    maxExtendMinutes,
    preventWorkOrderDeletion,
    preventDispatchedPhotoRequirementEditing,
    allowOverdueTimeExtension,
    allowEditCompletedTaskActualTime,
    workSupervisionEnabled,
    workSupervisionCountdownMinutes,
    workSupervisionLunchCreditMinutes,
    workSupervisionExcludedEmployeeUids,
    workSupervisionExcludedEmployeeNames,
    workSupervisionExcludedEmployees,
    // Giữ hai field cũ để các bản client chưa cập nhật vẫn đọc được ít nhất người đầu tiên.
    workSupervisionExcludedEmployeeUid,
    workSupervisionExcludedEmployeeName,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: uid,
    updatedByName: String(adminProfile?.name || request.auth.token?.email || "Admin").slice(0, 120)
  };

  await db.doc("appSettings/workOrderControls").set(settings, { merge: true });

  // Khi Admin bật/tắt Giám sát công việc, đánh giá điều kiện ngay để giao diện
  // không phải chờ đến lượt Cloud Scheduler kế tiếp.
  await evaluateWorkSupervision({ source: "settings_save" });

  return {
    saved: true,
    settings: {
      maxExtendMinutes,
      preventWorkOrderDeletion,
      preventDispatchedPhotoRequirementEditing,
      allowOverdueTimeExtension,
      allowEditCompletedTaskActualTime,
      workSupervisionEnabled,
      workSupervisionCountdownMinutes,
      workSupervisionLunchCreditMinutes,
      workSupervisionExcludedEmployeeUids,
      workSupervisionExcludedEmployeeNames,
      workSupervisionExcludedEmployees,
      workSupervisionExcludedEmployeeUid,
      workSupervisionExcludedEmployeeName
    }
  };
});


// =========================
// Giám sát công việc -> mỗi nhân viên có một bộ đếm riêng
// =========================
function supervisionTimestampToMillis(value) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function supervisionEmployeeName(data = {}) {
  return String(data.name || data.email || "Nhân viên").trim().slice(0, 120) || "Nhân viên";
}

function supervisionTaskDateKey(task = {}) {
  const directTaskDate = typeof task.taskDate === "string" ? task.taskDate.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(directTaskDate)) return directTaskDate;

  const createdAtMs = supervisionTimestampToMillis(task.createdAt);
  return createdAtMs ? supervisionDateKey(new Date(createdAtMs)) : "";
}

function supervisionTaskBlocksEmployee(task = {}, nowMs = Date.now()) {
  const assignedToUid = typeof task.assignedToUid === "string" ? task.assignedToUid.trim() : "";
  if (!assignedToUid || !WORK_SUPERVISION_ACTIVE_TASK_STATUSES.includes(task.status)) return false;

  // Giống ô “Tổng số bạn nhân viên đang chưa được giao việc” trên giao diện:
  // task đang chờ đến lượt (queueStartAt ở tương lai) chưa chiếm thời gian làm thực tế.
  const queueStartMs = supervisionTimestampToMillis(task.queueStartAt);
  if (queueStartMs > nowMs) return false;
  return true;
}

function supervisionDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WORK_SUPERVISION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function supervisionTimeLabel(now = new Date()) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: WORK_SUPERVISION_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);
}

function supervisionCycleId(nowMs, participantUids) {
  return crypto
    .createHash("sha256")
    .update(`${nowMs}:${participantUids.slice().sort().join("|")}:${crypto.randomBytes(8).toString("hex")}`)
    .digest("hex")
    .slice(0, 24);
}

function normalizeWorkSupervisionCountdownMinutes(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return WORK_SUPERVISION_DEFAULT_COUNTDOWN_MINUTES;
  return Math.min(
    WORK_SUPERVISION_MAX_COUNTDOWN_MINUTES,
    Math.max(WORK_SUPERVISION_MIN_COUNTDOWN_MINUTES, parsed)
  );
}

function normalizeWorkSupervisionLunchCreditMinutes(value, fallbackValue = WORK_SUPERVISION_DEFAULT_LUNCH_CREDIT_MINUTES) {
  const parsed = Number(value);
  if (Number.isInteger(parsed)) {
    return Math.min(
      WORK_SUPERVISION_MAX_LUNCH_CREDIT_MINUTES,
      Math.max(WORK_SUPERVISION_MIN_LUNCH_CREDIT_MINUTES, parsed)
    );
  }
  const fallback = Number(fallbackValue);
  if (Number.isInteger(fallback)) {
    return Math.min(
      WORK_SUPERVISION_MAX_LUNCH_CREDIT_MINUTES,
      Math.max(WORK_SUPERVISION_MIN_LUNCH_CREDIT_MINUTES, fallback)
    );
  }
  return WORK_SUPERVISION_DEFAULT_LUNCH_CREDIT_MINUTES;
}

function workSupervisionEmployeeStateRef(employeeUid) {
  return db.doc(`${WORK_SUPERVISION_COLLECTION}/${employeeUid}`);
}

function normalizeEmployeeSupervisionState(snapshot) {
  const data = snapshot.data() || {};
  const employeeUid = String(data.employeeUid || snapshot.id || "").trim();
  if (!employeeUid || snapshot.id === "current") return null;
  return {
    id: snapshot.id,
    ...data,
    employeeUid,
    employeeName: String(data.employeeName || "Nhân viên").trim().slice(0, 120) || "Nhân viên"
  };
}

async function loadWorkSupervisionContext(nowMs = Date.now()) {
  const [settingsSnap, statesSnap] = await Promise.all([
    db.doc("appSettings/workOrderControls").get(),
    db.collection(WORK_SUPERVISION_COLLECTION).get()
  ]);
  const settingsData = settingsSnap.data() || {};
  const enabled = settingsData.workSupervisionEnabled === true;
  const draftWorkOrderDateKey = supervisionDateKey(new Date(nowMs));
  const countdownMinutes = normalizeWorkSupervisionCountdownMinutes(settingsData.workSupervisionCountdownMinutes);
  const lunchCreditMinutes = normalizeWorkSupervisionLunchCreditMinutes(
    settingsData.workSupervisionLunchCreditMinutes,
    countdownMinutes
  );
  const legacyExcludedEmployeeUid = typeof settingsData.workSupervisionExcludedEmployeeUid === "string"
    ? settingsData.workSupervisionExcludedEmployeeUid.trim()
    : "";
  const excludedEmployeeUids = [...new Set(
    (Array.isArray(settingsData.workSupervisionExcludedEmployeeUids)
      ? settingsData.workSupervisionExcludedEmployeeUids
      : (legacyExcludedEmployeeUid ? [legacyExcludedEmployeeUid] : []))
      .map((employeeUid) => String(employeeUid || "").trim())
      .filter(Boolean)
  )].sort();
  const excludedEmployeeUidSet = new Set(excludedEmployeeUids);
  const excludedEmployeeNames = {};
  if (settingsData.workSupervisionExcludedEmployeeNames && typeof settingsData.workSupervisionExcludedEmployeeNames === "object" && !Array.isArray(settingsData.workSupervisionExcludedEmployeeNames)) {
    Object.entries(settingsData.workSupervisionExcludedEmployeeNames).forEach(([employeeUid, employeeName]) => {
      const safeUid = String(employeeUid || "").trim();
      const safeName = String(employeeName || "").trim();
      if (safeUid && safeName) excludedEmployeeNames[safeUid] = safeName;
    });
  }
  const legacyExcludedEmployeeName = typeof settingsData.workSupervisionExcludedEmployeeName === "string"
    ? settingsData.workSupervisionExcludedEmployeeName.trim()
    : "";
  if (legacyExcludedEmployeeUid && legacyExcludedEmployeeName && !excludedEmployeeNames[legacyExcludedEmployeeUid]) {
    excludedEmployeeNames[legacyExcludedEmployeeUid] = legacyExcludedEmployeeName;
  }

  const legacyStateSnap = statesSnap.docs.find((snap) => snap.id === "current");
  const legacyState = legacyStateSnap?.data() || {};
  const employeeStates = statesSnap.docs
    .map(normalizeEmployeeSupervisionState)
    .filter(Boolean);
  const stateByEmployeeUid = new Map(employeeStates.map((item) => [item.employeeUid, item]));

  // Khi tính năng đang tắt, chỉ cần danh sách state để tắt các bộ đếm còn sót.
  if (!enabled) {
    return {
      enabled: false,
      freeEmployees: [],
      totalFreeEmployeeCount: 0,
      admins: [],
      draftWorkOrderCount: 0,
      waitingAssigneeWorkOrderCount: 0,
      availableWorkOrderCount: 0,
      draftWorkOrderDateKey,
      countdownMinutes,
      lunchCreditMinutes,
      excludedEmployeeUids,
      excludedEmployeeNames,
      employeeStates,
      stateByEmployeeUid,
      legacyState
    };
  }

  const [employeesSnap, adminsSnap, activeTasksSnap, draftTasksSnap, waitingAssigneeTasksSnap] = await Promise.all([
    db.collection("users").where("role", "==", "employee").get(),
    db.collection("users").where("role", "==", "admin").get(),
    db.collection("tasks").where("status", "in", WORK_SUPERVISION_ACTIVE_TASK_STATUSES).get(),
    db.collection("tasks")
      .where("status", "==", "draft")
      .where("taskDate", "==", draftWorkOrderDateKey)
      .limit(1)
      .get(),
    db.collection("tasks")
      .where("status", "==", "waiting_assignee")
      .limit(1)
      .get()
  ]);

  const workingEmployees = employeesSnap.docs
    .map((snap) => ({ uid: snap.id, ...snap.data() }))
    .filter((employee) => employee.employmentStatus !== "off")
    .map((employee) => ({ uid: String(employee.uid || employee.id || "").trim(), name: supervisionEmployeeName(employee) }))
    .filter((employee) => employee.uid);

  const busyUids = new Set();
  activeTasksSnap.docs.forEach((snap) => {
    const task = snap.data() || {};
    if (supervisionTaskBlocksEmployee(task, nowMs)) {
      busyUids.add(String(task.assignedToUid || "").trim());
    }
  });

  const allFreeEmployees = workingEmployees.filter((employee) => !busyUids.has(employee.uid));
  const freeEmployees = allFreeEmployees.filter((employee) => !excludedEmployeeUidSet.has(employee.uid));

  const draftWorkOrderCount = draftTasksSnap.empty ? 0 : 1;
  const waitingAssigneeWorkOrderCount = waitingAssigneeTasksSnap.empty ? 0 : 1;
  const availableWorkOrderCount = draftWorkOrderCount + waitingAssigneeWorkOrderCount;

  const admins = adminsSnap.docs
    .map((snap) => ({ uid: snap.id, ...snap.data() }))
    .map((admin) => ({ uid: String(admin.uid || admin.id || "").trim(), name: supervisionEmployeeName(admin) }))
    .filter((admin) => admin.uid);

  return {
    enabled,
    freeEmployees,
    totalFreeEmployeeCount: allFreeEmployees.length,
    admins,
    draftWorkOrderCount,
    waitingAssigneeWorkOrderCount,
    availableWorkOrderCount,
    draftWorkOrderDateKey,
    countdownMinutes,
    lunchCreditMinutes,
    excludedEmployeeUids,
    excludedEmployeeNames,
    employeeStates,
    stateByEmployeeUid,
    legacyState
  };
}

async function retireLegacyWorkSupervisionState(legacyState = {}, source = "migration") {
  if (!legacyState || (legacyState.active !== true && legacyState.status === "per_employee_migrated")) return;
  await db.doc(WORK_SUPERVISION_LEGACY_STATE_PATH).set({
    active: false,
    status: "per_employee_migrated",
    participantUids: [],
    participantNames: {},
    participantCount: 0,
    startedAt: null,
    endsAt: null,
    reason: "per_employee_countdown_enabled",
    source: String(source || "migration").slice(0, 80),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

function workSupervisionHistoryDocumentId(eventType, cycleId, employeeUid) {
  const safeType = String(eventType || "event").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "event";
  const safeCycleId = String(cycleId || "cycle").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "cycle";
  const safeEmployeeId = crypto.createHash("sha256").update(String(employeeUid || "unknown")).digest("hex").slice(0, 18);
  return `workSupervision_${safeType}_${safeCycleId}_${safeEmployeeId}`;
}

function addWorkSupervisionHistoryToBatch(batch, eventType, state = {}, eventAtMs = Date.now(), reason = "", source = "") {
  if (!batch) return;

  const employeeUid = String(state.employeeUid || "").trim();
  if (!employeeUid) return;

  const employeeName = String(state.employeeName || "Nhân viên").trim().slice(0, 120) || "Nhân viên";
  const cycleId = String(state.cycleId || state.lastCycleId || "").trim();
  if (!cycleId) return;

  const countdownMinutes = normalizeWorkSupervisionCountdownMinutes(state.countdownMinutes);
  const startedAtMs = supervisionTimestampToMillis(state.startedAt) || Number(eventAtMs || Date.now());
  const safeEventAtMs = Number(eventAtMs || Date.now());
  const plannedSeconds = Math.max(1, countdownMinutes * 60);
  const rawElapsedSeconds = Math.max(0, Math.floor((safeEventAtMs - startedAtMs) / 1000));
  const isEnded = eventType === "countdown_ended";
  const elapsedSeconds = isEnded ? Math.min(rawElapsedSeconds, plannedSeconds) : 0;
  const historyType = isEnded
    ? "work_supervision_countdown_ended"
    : "work_supervision_countdown_started";
  const historyId = workSupervisionHistoryDocumentId(eventType, cycleId, employeeUid);
  const eventAt = Timestamp.fromMillis(safeEventAtMs);
  const startedAt = Timestamp.fromMillis(startedAtMs);

  batch.set(db.doc(`workAssignmentHistory/${historyId}`), {
    id: historyId,
    historyType,
    source: "work_supervision_countdown",
    workOrderId: "",
    workOrderName: `Giám sát công việc - ${employeeName}`,
    workOrderCreatedAt: isEnded ? startedAt : eventAt,
    assignedAt: eventAt,
    assignedByUid: "system",
    assignedByName: "Giám sát công việc",
    assignedEmployeeUids: [employeeUid],
    assignedEmployeeNames: [employeeName],
    taskIds: [],
    taskNames: [],
    taskAssignments: [],
    taskCount: 0,
    workSupervisionCycleId: cycleId,
    workSupervisionEmployeeUid: employeeUid,
    workSupervisionEmployeeName: employeeName,
    countdownMinutes,
    countdownStartedAt: startedAt,
    countdownEndedAt: isEnded ? eventAt : null,
    elapsedSeconds,
    endReason: isEnded ? String(reason || "countdown_ended").slice(0, 120) : "",
    triggerSource: String(source || "unknown").slice(0, 80),
    ensuredByServer: true
  }, { merge: false });
}

async function writeWorkSupervisionCountdownEndHistory(previous = {}, eventAtMs = Date.now(), reason = "", source = "") {
  if (previous?.active !== true && previous?.status !== "counting") return;
  const batch = db.batch();
  addWorkSupervisionHistoryToBatch(batch, "countdown_ended", previous, eventAtMs, reason, source);
  await batch.commit();
}

async function writeEmployeeWorkSupervisionIdle(employeeUid, reason, source, previous = {}) {
  const safeUid = String(employeeUid || previous.employeeUid || "").trim();
  if (!safeUid) return;

  const nowMs = Date.now();
  const batch = db.batch();
  if (previous?.active === true || previous?.status === "counting") {
    addWorkSupervisionHistoryToBatch(batch, "countdown_ended", {
      ...previous,
      employeeUid: safeUid
    }, nowMs, reason, source);
  }

  batch.set(workSupervisionEmployeeStateRef(safeUid), {
    scope: "employee",
    employeeUid: safeUid,
    employeeName: String(previous.employeeName || "Nhân viên").trim().slice(0, 120) || "Nhân viên",
    active: false,
    status: "idle",
    reason: String(reason || "condition_not_met").slice(0, 120),
    source: String(source || "unknown").slice(0, 80),
    startedAt: null,
    endsAt: null,
    updatedAt: FieldValue.serverTimestamp(),
    lastCycleId: previous.cycleId || previous.lastCycleId || ""
  }, { merge: true });
  await batch.commit();
}

async function cancelEmployeeWorkSupervisionStates(states, reason, source) {
  const activeStates = (Array.isArray(states) ? states : []).filter(
    (item) => item?.active === true || item?.status === "counting"
  );
  if (!activeStates.length) return;

  const batch = db.batch();
  const nowMs = Date.now();
  activeStates.forEach((item) => {
    addWorkSupervisionHistoryToBatch(batch, "countdown_ended", item, nowMs, reason, source);
    batch.set(workSupervisionEmployeeStateRef(item.employeeUid), {
      scope: "employee",
      employeeUid: item.employeeUid,
      employeeName: item.employeeName || "Nhân viên",
      active: false,
      status: "idle",
      reason: String(reason || "condition_not_met").slice(0, 120),
      source: String(source || "unknown").slice(0, 80),
      startedAt: null,
      endsAt: null,
      updatedAt: FieldValue.serverTimestamp(),
      lastCycleId: item.cycleId || item.lastCycleId || ""
    }, { merge: true });
  });
  await batch.commit();
}

async function startEmployeeWorkSupervisionCountdown(context, employee, nowMs, source) {
  const cycleId = supervisionCycleId(nowMs, [employee.uid]);
  const countdownMinutes = normalizeWorkSupervisionCountdownMinutes(context.countdownMinutes);
  const countdownMs = countdownMinutes * 60 * 1000;
  const now = Timestamp.fromMillis(nowMs);
  const stateRef = workSupervisionEmployeeStateRef(employee.uid);
  const batch = db.batch();

  batch.set(stateRef, {
    scope: "employee",
    active: true,
    status: "counting",
    cycleId,
    source: String(source || "schedule").slice(0, 80),
    employeeUid: employee.uid,
    employeeName: employee.name,
    participantUids: [employee.uid],
    participantNames: { [employee.uid]: employee.name },
    participantCount: 1,
    draftWorkOrderCount: context.draftWorkOrderCount,
    waitingAssigneeWorkOrderCount: context.waitingAssigneeWorkOrderCount,
    availableWorkOrderCount: context.availableWorkOrderCount,
    draftWorkOrderDateKey: context.draftWorkOrderDateKey || supervisionDateKey(new Date(nowMs)),
    countdownMinutes,
    lunchCreditMinutes: normalizeWorkSupervisionLunchCreditMinutes(context.lunchCreditMinutes, countdownMinutes),
    startedAt: now,
    endsAt: Timestamp.fromMillis(nowMs + countdownMs),
    updatedAt: FieldValue.serverTimestamp(),
    reason: ""
  }, { merge: false });

  addWorkSupervisionHistoryToBatch(batch, "countdown_started", {
    cycleId,
    employeeUid: employee.uid,
    employeeName: employee.name,
    countdownMinutes,
    startedAt: now
  }, nowMs, "countdown_started", source);

  const safeEmployeeId = crypto.createHash("sha256").update(employee.uid).digest("hex").slice(0, 18);
  const notificationId = `workSupervisionStarted_${cycleId}_${safeEmployeeId}`;
  batch.set(db.doc(`notifications/${notificationId}`), {
    id: notificationId,
    recipientUid: employee.uid,
    type: "work_supervision_countdown_started",
    title: "Bạn đang được Giám sát công việc",
    message: `Bộ đếm riêng ${countdownMinutes} phút của bạn đã bắt đầu. Nếu hết thời gian mà bạn vẫn chưa nhận việc mới, hệ thống sẽ tạo Phiếu nghỉ trưa tự động và cộng sẵn ${normalizeWorkSupervisionLunchCreditMinutes(context.lunchCreditMinutes, countdownMinutes)} phút theo Cài đặt.`,
    actorUid: "system",
    actorName: "Giám sát công việc",
    createdAt: now,
    readAt: null
  }, { merge: true });

  await batch.commit();
  return cycleId;
}

async function createAutomaticLunchBreakForEmployee(context, currentState, employee, nowMs, source) {
  if (!employee?.uid) {
    await writeEmployeeWorkSupervisionIdle(currentState?.employeeUid, "employee_not_free", source, currentState);
    return { created: false };
  }

  const cycleId = String(currentState.cycleId || supervisionCycleId(nowMs, [employee.uid]))
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 32);
  const stateRef = workSupervisionEmployeeStateRef(employee.uid);
  const primaryAdmin = context.admins[0] || { uid: "system", name: "Giám sát công việc" };
  const now = Timestamp.fromMillis(nowMs);
  const countdownMinutes = normalizeWorkSupervisionCountdownMinutes(
    currentState.countdownMinutes || context.countdownMinutes
  );
  const lunchCreditMinutes = normalizeWorkSupervisionLunchCreditMinutes(
    currentState.lunchCreditMinutes,
    context.lunchCreditMinutes
  );
  const lunchCreditMs = lunchCreditMinutes * 60 * 1000;
  const remainingMinutes = Math.max(0, WORK_SUPERVISION_LUNCH_TOTAL_MINUTES - lunchCreditMinutes);
  const deadlineAt = Timestamp.fromMillis(nowMs + remainingMinutes * 60 * 1000);
  const taskDate = supervisionDateKey(new Date(nowMs));
  const timeLabel = supervisionTimeLabel(new Date(nowMs));
  const batch = db.batch();

  const safeEmployeeId = crypto.createHash("sha256").update(employee.uid).digest("hex").slice(0, 18);
  const workOrderId = `supervisionLunch_${cycleId}_${safeEmployeeId}`;
  const taskId = `supervisionLunch_${cycleId}_${safeEmployeeId}`;
  const workOrderName = `Nghỉ trưa tự động - ${employee.name} - ${timeLabel}`;

  batch.set(db.doc(`workOrders/${workOrderId}`), {
    id: workOrderId,
    name: workOrderName,
    createdByUid: primaryAdmin.uid,
    createdByName: "Giám sát công việc",
    createdAt: now,
    taskCount: 1,
    status: "dispatched",
    autoCreatedByWorkSupervision: true,
    workSupervisionCycleId: cycleId,
    workSupervisionEmployeeUid: employee.uid,
    workSupervisionEmployeeName: employee.name
  }, { merge: true });

  batch.set(db.doc(`tasks/${taskId}`), {
    id: taskId,
    title: "Phiếu nghỉ trưa",
    description: `Tự động tạo bởi Giám sát công việc. Phiếu được cộng sẵn ${lunchCreditMinutes} phút nghỉ theo Cài đặt của Admin.`,
    taskDate,
    assignedToUid: employee.uid,
    assignedToName: employee.name,
    assignedByUid: primaryAdmin.uid,
    assignedByName: "Giám sát công việc",
    workOrderId,
    workOrderName,
    workOrderTaskCount: 1,
    rowIndex: 0,
    createdAt: now,
    deadlineMinutes: WORK_SUPERVISION_LUNCH_TOTAL_MINUTES,
    isLunchBreak: true,
    isHotel: false,
    isShip: false,
    hotelPetCount: 0,
    hotelAllowedMinutes: 0,
    deadlineAt,
    dispatchedAt: now,
    queueStartAt: now,
    pauseStartedAt: null,
    remainingMsAtPause: null,
    accumulatedWorkedMs: lunchCreditMs,
    workSupervisionInitialMinutes: lunchCreditMinutes,
    workSupervisionLunchCreditMinutes: lunchCreditMinutes,
    autoCreatedByWorkSupervision: true,
    workSupervisionCycleId: cycleId,
    submittedAt: null,
    approvedAt: null,
    status: "lunch_break",
    actualMinutes: null,
    resultType: null,
    differenceMinutes: null,
    differencePercent: null,
    workPhotos: [],
    workPhotoCount: 0,
    lastWorkPhotoUploadedAt: null,
    photoRequired: false,
    requiredPhotoCount: 0,
    photos: [],
    photoCount: 0,
    lastPhotoUploadedAt: null
  }, { merge: true });

  addWorkSupervisionHistoryToBatch(batch, "countdown_ended", {
    ...currentState,
    cycleId,
    employeeUid: employee.uid,
    employeeName: employee.name,
    countdownMinutes
  }, nowMs, "countdown_completed", source);

  const notificationId = `supervisionLunch_${cycleId}_${safeEmployeeId}`;
  batch.set(db.doc(`notifications/${notificationId}`), {
    id: notificationId,
    recipientUid: employee.uid,
    type: "work_supervision_lunch_created",
    title: "Đã tạo Phiếu nghỉ trưa tự động",
    message: `Bộ đếm riêng của bạn đã hết ${countdownMinutes} phút. Hệ thống đã tạo một Phiếu nghỉ trưa riêng và cộng sẵn ${lunchCreditMinutes} phút theo Cài đặt.`,
    taskId,
    taskTitle: "Phiếu nghỉ trưa",
    actorUid: primaryAdmin.uid,
    actorName: "Giám sát công việc",
    createdAt: now,
    readAt: null
  }, { merge: true });

  context.admins.forEach((admin) => {
    const safeAdminId = crypto.createHash("sha256").update(admin.uid).digest("hex").slice(0, 18);
    const adminNotificationId = `supervisionLunchAdmin_${cycleId}_${safeEmployeeId}_${safeAdminId}`;
    batch.set(db.doc(`notifications/${adminNotificationId}`), {
      id: adminNotificationId,
      recipientUid: admin.uid,
      type: "work_supervision_lunch_created_admin",
      title: "Giám sát công việc đã tạo Phiếu nghỉ trưa",
      message: `Bộ đếm riêng của ${employee.name} đã kết thúc. Hệ thống đã tạo Phiếu nghỉ trưa riêng và cộng sẵn ${lunchCreditMinutes} phút theo Cài đặt.`,
      taskId,
      taskTitle: "Phiếu nghỉ trưa tự động",
      actorUid: "system",
      actorName: "Giám sát công việc",
      createdAt: now,
      readAt: null
    }, { merge: true });
  });

  batch.set(stateRef, {
    scope: "employee",
    employeeUid: employee.uid,
    employeeName: employee.name,
    active: false,
    status: "lunch_created",
    source: String(source || "schedule").slice(0, 80),
    completedAt: now,
    updatedAt: now,
    createdWorkOrderId: workOrderId,
    createdTaskId: taskId,
    lastCycleId: cycleId,
    reason: "countdown_completed"
  }, { merge: true });

  await batch.commit();
  return { created: true, workOrderId, taskId, employeeUid: employee.uid };
}

async function evaluateWorkSupervision({ source = "schedule" } = {}) {
  const nowMs = Date.now();
  const context = await loadWorkSupervisionContext(nowMs);
  await retireLegacyWorkSupervisionState(context.legacyState, source);

  const activeStates = context.employeeStates.filter(
    (item) => item.active === true && item.status === "counting"
  );

  if (!context.enabled) {
    await cancelEmployeeWorkSupervisionStates(activeStates, "setting_disabled", source);
    return { active: false, reason: "setting_disabled" };
  }

  // Điều kiện chung vẫn giữ nguyên: phải có trên 1 nhân viên chưa được giao việc
  // và phải còn Phiếu Chưa giao việc hôm nay hoặc Phiếu Chờ chọn người.
  const hasAvailableWork = context.draftWorkOrderCount > 0
    || context.waitingAssigneeWorkOrderCount > 0;
  const baseCondition = context.totalFreeEmployeeCount > 1
    && context.freeEmployees.length > 0
    && hasAvailableWork;

  if (!baseCondition) {
    const reason = context.totalFreeEmployeeCount <= 1
      ? "not_enough_free_employees"
      : (context.freeEmployees.length < 1
        ? "all_free_employees_excluded"
        : "no_draft_or_waiting_assignee_work_orders");
    await cancelEmployeeWorkSupervisionStates(activeStates, reason, source);
    return { active: false, reason: "condition_not_met" };
  }

  const eligibleByUid = new Map(context.freeEmployees.map((employee) => [employee.uid, employee]));
  const statesToCancel = activeStates.filter((item) => !eligibleByUid.has(item.employeeUid));
  await cancelEmployeeWorkSupervisionStates(statesToCancel, "employee_received_work_or_excluded", source);

  let startedCount = 0;
  let createdCount = 0;
  let activeCount = 0;

  for (const employee of context.freeEmployees) {
    const current = context.stateByEmployeeUid.get(employee.uid) || null;
    const currentCountdownMinutes = normalizeWorkSupervisionCountdownMinutes(current?.countdownMinutes);
    const currentLunchCreditMinutes = normalizeWorkSupervisionLunchCreditMinutes(
      current?.lunchCreditMinutes,
      currentCountdownMinutes
    );
    const mustStart = !current
      || current.active !== true
      || current.status !== "counting"
      || currentCountdownMinutes !== context.countdownMinutes
      || currentLunchCreditMinutes !== context.lunchCreditMinutes;

    if (mustStart) {
      if (current?.active === true && current?.status === "counting") {
        await writeWorkSupervisionCountdownEndHistory(current, nowMs, "countdown_restarted", source);
      }
      await startEmployeeWorkSupervisionCountdown(context, employee, nowMs, source);
      startedCount += 1;
      activeCount += 1;
      continue;
    }

    const endsAtMs = supervisionTimestampToMillis(current.endsAt);
    if (endsAtMs && nowMs >= endsAtMs) {
      const result = await createAutomaticLunchBreakForEmployee(context, current, employee, nowMs, source);
      if (result.created) createdCount += 1;
      continue;
    }

    activeCount += 1;
  }

  return {
    active: activeCount > 0,
    startedCount,
    createdCount,
    activeCount,
    participantCount: context.freeEmployees.length
  };
}

exports.processWorkSupervisionNow = onCall({
  region: REGION,
  timeoutSeconds: 120,
  memory: "256MiB",
  maxInstances: 10
}, async (request) => {
  const callerUid = assertAuthenticated(request);
  const employeeUid = typeof request.data?.employeeUid === "string"
    ? request.data.employeeUid.trim().slice(0, 128)
    : "";
  const requestedCycleId = typeof request.data?.cycleId === "string"
    ? request.data.cycleId.trim().slice(0, 64)
    : "";

  if (!employeeUid || !requestedCycleId) {
    return { processed: false, reason: "missing_employee_or_cycle" };
  }

  if (callerUid !== employeeUid) {
    const callerProfile = await db.doc(`users/${callerUid}`).get();
    if (!callerProfile.exists || callerProfile.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Bạn không có quyền xử lý bộ đếm của nhân viên khác.");
    }
  }

  const stateSnap = await workSupervisionEmployeeStateRef(employeeUid).get();
  const current = stateSnap.exists ? stateSnap.data() || {} : {};
  const endsAtMs = supervisionTimestampToMillis(current.endsAt);

  if (
    current.active !== true
    || current.status !== "counting"
    || requestedCycleId !== String(current.cycleId || "")
    || !endsAtMs
    || Date.now() < endsAtMs
  ) {
    return { processed: false, reason: "not_ready" };
  }

  const result = await evaluateWorkSupervision({ source: "client_countdown_elapsed" });
  return { processed: true, result };
});

exports.monitorWorkSupervision = onSchedule({
  schedule: "every 1 minutes",
  timeZone: WORK_SUPERVISION_TIME_ZONE,
  region: REGION,
  timeoutSeconds: 120,
  memory: "256MiB",
  maxInstances: 1
}, async () => {
  await evaluateWorkSupervision({ source: "schedule" });
});

function supervisionTaskSignature(data = {}) {
  return [
    String(data.status || ""),
    String(data.assignedToUid || ""),
    String(supervisionTimestampToMillis(data.queueStartAt) || 0)
  ].join("|");
}

exports.monitorWorkSupervisionOnTaskChange = onDocumentWritten({
  document: "tasks/{taskId}",
  region: REGION,
  timeoutSeconds: 120,
  memory: "256MiB",
  maxInstances: 5
}, async (event) => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  if (supervisionTaskSignature(before) === supervisionTaskSignature(after)) return;
  await evaluateWorkSupervision({ source: "task_change" });
});

exports.monitorWorkSupervisionOnWorkOrderChange = onDocumentWritten({
  document: "workOrders/{workOrderId}",
  region: REGION,
  timeoutSeconds: 120,
  memory: "256MiB",
  maxInstances: 5
}, async (event) => {
  const beforeStatus = String(event.data?.before?.data()?.status || "");
  const afterStatus = String(event.data?.after?.data()?.status || "");
  if (beforeStatus === afterStatus) return;
  await evaluateWorkSupervision({ source: "work_order_change" });
});

exports.monitorWorkSupervisionOnUserChange = onDocumentWritten({
  document: "users/{userId}",
  region: REGION,
  timeoutSeconds: 120,
  memory: "256MiB",
  maxInstances: 5
}, async (event) => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  const beforeSignature = `${String(before.role || "")}|${String(before.employmentStatus || "working")}`;
  const afterSignature = `${String(after.role || "")}|${String(after.employmentStatus || "working")}`;
  if (beforeSignature === afterSignature) return;
  await evaluateWorkSupervision({ source: "user_change" });
});


// =========================
// Google Calendar -> Phiếu công việc nháp
// Calendar ID được lưu phía máy chủ; API Key được mã hóa trước khi lưu trong Firestore và không trả về frontend.
// =========================
const GOOGLE_CALENDAR_CANCELLED_LABEL = "Khách hủy -Đã xóa trên Google lịch";
const GOOGLE_CALENDAR_DEFAULT_DEADLINE_MINUTES = 30;
const MAX_CALENDAR_RANGE_DAYS = 366;
const MAX_CALENDAR_PREVIEW_EVENTS = 1000;
const GOOGLE_CALENDAR_CONFIG_REF = db.doc("serverSecrets/googleCalendarImport");

function getGoogleCalendarEncryptionKey() {
  const secret = String(workOrderSettingsPassword.value() || "");
  if (!secret) {
    throw new HttpsError("failed-precondition", "Chưa cấu hình khóa bảo mật phía máy chủ.");
  }
  return crypto.createHash("sha256")
    .update(`google-calendar-import-config:${secret}`)
    .digest();
}

function encryptGoogleCalendarApiKey(apiKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getGoogleCalendarEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(apiKey), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };
}

function decryptGoogleCalendarApiKey(payload) {
  if (!payload || payload.algorithm !== "aes-256-gcm") return "";
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getGoogleCalendarEncryptionKey(),
      Buffer.from(String(payload.iv || ""), "base64")
    );
    decipher.setAuthTag(Buffer.from(String(payload.tag || ""), "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(String(payload.data || ""), "base64")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("Không thể giải mã Google Calendar API Key:", error?.message || error);
    throw new HttpsError("failed-precondition", "API Key đã lưu không thể đọc. Vui lòng nhập API Key mới.");
  }
}

async function readGoogleCalendarImportConfig() {
  const snap = await GOOGLE_CALENDAR_CONFIG_REF.get();
  if (!snap.exists) return { calendarId: "", apiKey: "", hasApiKey: false };
  const data = snap.data() || {};
  const apiKey = data.apiKeyEncrypted ? decryptGoogleCalendarApiKey(data.apiKeyEncrypted) : "";
  return {
    calendarId: String(data.calendarId || "").trim(),
    apiKey,
    hasApiKey: Boolean(apiKey)
  };
}

async function saveGoogleCalendarImportConfig({ calendarId, apiKey, uid, actorName }) {
  const data = {
    calendarId: String(calendarId || "").trim(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: uid,
    updatedByName: String(actorName || "Admin").slice(0, 120)
  };
  if (apiKey) data.apiKeyEncrypted = encryptGoogleCalendarApiKey(apiKey);
  await GOOGLE_CALENDAR_CONFIG_REF.set(data, { merge: true });
}

exports.getGoogleCalendarImportSettings = onCall({
  region: REGION,
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 5,
  secrets: [workOrderSettingsPassword]
}, async (request) => {
  const uid = assertAuthenticated(request);
  await assertAdmin(uid);
  const config = await readGoogleCalendarImportConfig();
  return {
    calendarId: config.calendarId,
    hasApiKey: config.hasApiKey
  };
});

function normalizeDateOnly(value, fieldName) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new HttpsError("invalid-argument", `${fieldName} không hợp lệ.`);
  }
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError("invalid-argument", `${fieldName} không hợp lệ.`);
  }
  return text;
}

function dateOnlyToUtcBoundary(value, endExclusive = false) {
  const [year, month, day] = value.split("-").map(Number);
  const base = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 7 * 60 * 60 * 1000;
  return new Date(base + (endExclusive ? 24 * 60 * 60 * 1000 : 0));
}

function safeTimeZone(value) {
  const candidate = String(value || "Asia/Ho_Chi_Minh").slice(0, 80);
  try {
    new Intl.DateTimeFormat("vi-VN", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch (_) {
    return "Asia/Ho_Chi_Minh";
  }
}

function getEventStartDate(event) {
  const dateTime = event?.start?.dateTime;
  if (dateTime) {
    const parsed = new Date(dateTime);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const dateOnly = event?.start?.date;
  if (dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return new Date(`${dateOnly}T00:00:00.000Z`);
  }
  return null;
}

function getEventTaskDate(event, timeZone) {
  if (event?.start?.date && /^\d{4}-\d{2}-\d{2}$/.test(event.start.date)) return event.start.date;
  const start = getEventStartDate(event);
  if (!start) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(start).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatCalendarWorkOrderName(event, timeZone) {
  if (event?.start?.date && !event?.start?.dateTime) {
    const [year, month, day] = event.start.date.split("-");
    return `${day}/${month}/${year} • Cả ngày`;
  }
  const start = getEventStartDate(event);
  if (!start) return "Sự kiện Google Calendar";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(start).replace(",", "");
}

function getCalendarEventKey(event) {
  const originalStart = event?.originalStartTime?.dateTime || event?.originalStartTime?.date || "";
  return `${String(event?.id || "")}|${originalStart}`;
}

function getCalendarDocumentSuffix(calendarId, event) {
  return crypto.createHash("sha256")
    .update(`${calendarId}\n${getCalendarEventKey(event)}`)
    .digest("hex")
    .slice(0, 40);
}

function buildGoogleCalendarUrl({ calendarId, apiKey, timeMin, timeMax, pageToken }) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("timeMin", timeMin.toISOString());
  url.searchParams.set("timeMax", timeMax.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("showDeleted", "true");
  url.searchParams.set("maxResults", "2500");
  url.searchParams.set("orderBy", "startTime");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url;
}

async function fetchGoogleCalendarEvents(params) {
  const items = [];
  let pageToken = "";
  do {
    const response = await fetch(buildGoogleCalendarUrl({ ...params, pageToken }), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(45000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const googleMessage = payload?.error?.message || "Google Calendar từ chối yêu cầu.";
      const status = response.status === 404 ? "not-found" : response.status === 403 ? "permission-denied" : "failed-precondition";
      throw new HttpsError(status, googleMessage);
    }
    if (Array.isArray(payload.items)) items.push(...payload.items);
    pageToken = String(payload.nextPageToken || "");
  } while (pageToken && items.length < 10000);
  return items.slice(0, 10000);
}

async function resolveGoogleCalendarOperationContext(request) {
  const uid = assertAuthenticated(request);
  const adminProfile = await assertAdmin(uid);

  const submittedCalendarId = String(request.data?.calendarId || "").trim();
  const submittedApiKey = String(request.data?.apiKey || "").trim();
  const savedConfig = await readGoogleCalendarImportConfig();
  const calendarId = submittedCalendarId || savedConfig.calendarId;
  const apiKey = submittedApiKey || savedConfig.apiKey;
  const fromDate = normalizeDateOnly(request.data?.fromDate, "Từ ngày");
  const toDate = normalizeDateOnly(request.data?.toDate, "Đến ngày");
  const timeZone = safeTimeZone(request.data?.timeZone);

  if (!calendarId || calendarId.length > 500) {
    throw new HttpsError("invalid-argument", "Calendar ID không hợp lệ.");
  }
  if (!apiKey || apiKey.length > 500) {
    throw new HttpsError("invalid-argument", "Google Calendar API Key không hợp lệ. Hãy nhập API Key ở lần đầu sử dụng.");
  }

  const actorName = String(adminProfile?.name || request.auth.token?.email || "Admin").slice(0, 120);
  if (submittedCalendarId || submittedApiKey || !savedConfig.calendarId || !savedConfig.hasApiKey) {
    await saveGoogleCalendarImportConfig({
      calendarId,
      apiKey: submittedApiKey || savedConfig.apiKey,
      uid,
      actorName
    });
  }

  const timeMin = dateOnlyToUtcBoundary(fromDate, false);
  const timeMax = dateOnlyToUtcBoundary(toDate, true);
  const rangeDays = Math.ceil((timeMax.getTime() - timeMin.getTime()) / 86400000);
  if (rangeDays < 1 || rangeDays > MAX_CALENDAR_RANGE_DAYS) {
    throw new HttpsError("invalid-argument", `Chỉ được nạp tối đa ${MAX_CALENDAR_RANGE_DAYS} ngày mỗi lần.`);
  }

  return {
    uid,
    actorName,
    calendarId,
    apiKey,
    fromDate,
    toDate,
    timeZone,
    timeMin,
    timeMax
  };
}

function createGoogleCalendarEntry(calendarId, event) {
  const suffix = getCalendarDocumentSuffix(calendarId, event);
  return {
    selectionId: suffix,
    event,
    workOrderRef: db.doc(`workOrders/gcal_${suffix}`),
    taskRef: db.doc(`tasks/gcal_task_${suffix}`)
  };
}

exports.previewGoogleCalendarEvents = onCall({
  region: REGION,
  timeoutSeconds: 300,
  memory: "512MiB",
  maxInstances: 5,
  secrets: [workOrderSettingsPassword]
}, async (request) => {
  const context = await resolveGoogleCalendarOperationContext(request);
  const events = await fetchGoogleCalendarEvents({
    calendarId: context.calendarId,
    apiKey: context.apiKey,
    timeMin: context.timeMin,
    timeMax: context.timeMax
  });
  const usableEvents = events.filter((event) => event?.id);

  if (usableEvents.length > MAX_CALENDAR_PREVIEW_EVENTS) {
    throw new HttpsError(
      "resource-exhausted",
      `Khoảng thời gian có ${usableEvents.length} sự kiện. Hãy chọn khoảng ngắn hơn, tối đa ${MAX_CALENDAR_PREVIEW_EVENTS} sự kiện mỗi lần xem trước.`
    );
  }

  const entries = usableEvents.map((event) => createGoogleCalendarEntry(context.calendarId, event));
  const snapshots = entries.length
    ? await db.getAll(...entries.flatMap((entry) => [entry.workOrderRef, entry.taskRef]))
    : [];
  const existing = new Map();
  snapshots.forEach((snapshot) => existing.set(snapshot.ref.path, snapshot));

  const items = entries.map((entry) => {
    const event = entry.event;
    const workOrderSnap = existing.get(entry.workOrderRef.path);
    const taskSnap = existing.get(entry.taskRef.path);
    const wasImported = Boolean(workOrderSnap?.exists || taskSnap?.exists);
    const isCancelled = event.status === "cancelled";
    const selectable = !isCancelled || wasImported;
    const startAt = getEventStartDate(event);
    const endAt = event?.end?.dateTime
      ? new Date(event.end.dateTime)
      : event?.end?.date && /^\d{4}-\d{2}-\d{2}$/.test(event.end.date)
        ? new Date(`${event.end.date}T00:00:00.000Z`)
        : null;

    let statusLabel = "Chưa nạp";
    let statusClass = "is-new";
    if (isCancelled && wasImported) {
      statusLabel = "Đã hủy • sẽ cập nhật";
      statusClass = "is-cancelled";
    } else if (isCancelled) {
      statusLabel = "Đã hủy • không thể nạp";
      statusClass = "is-disabled";
    } else if (wasImported) {
      statusLabel = "Đã nạp • có thể cập nhật";
      statusClass = "is-existing";
    }

    return {
      selectionId: entry.selectionId,
      workOrderName: formatCalendarWorkOrderName(event, context.timeZone),
      summary: String(event.summary || "(Sự kiện không có tựa đề)").trim().slice(0, 1000),
      description: String(event.description || "").trim().slice(0, 2000),
      location: String(event.location || "").trim().slice(0, 500),
      taskDate: getEventTaskDate(event, context.timeZone),
      startAt: startAt && !Number.isNaN(startAt.getTime()) ? startAt.toISOString() : null,
      endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt.toISOString() : null,
      allDay: Boolean(event?.start?.date && !event?.start?.dateTime),
      wasImported,
      isCancelled,
      selectable,
      statusLabel,
      statusClass
    };
  });

  return {
    calendarId: context.calendarId,
    fromDate: context.fromDate,
    toDate: context.toDate,
    read: events.length,
    items
  };
});

exports.importGoogleCalendarEvents = onCall({
  region: REGION,
  timeoutSeconds: 300,
  memory: "512MiB",
  maxInstances: 5,
  secrets: [workOrderSettingsPassword]
}, async (request) => {
  const context = await resolveGoogleCalendarOperationContext(request);
  const selectedEventIdsInput = request.data?.selectedEventIds;
  const selectedEventIds = Array.isArray(selectedEventIdsInput)
    ? Array.from(new Set(selectedEventIdsInput.map((value) => String(value || "").trim()).filter(Boolean)))
    : null;
  if (selectedEventIds && selectedEventIds.length > MAX_CALENDAR_PREVIEW_EVENTS) {
    throw new HttpsError("invalid-argument", `Chỉ được chọn tối đa ${MAX_CALENDAR_PREVIEW_EVENTS} Phiếu mỗi lần.`);
  }
  if (selectedEventIds && selectedEventIds.some((value) => !/^[a-f0-9]{40}$/.test(value))) {
    throw new HttpsError("invalid-argument", "Danh sách Phiếu được chọn không hợp lệ.");
  }
  if (selectedEventIds && selectedEventIds.length === 0) {
    throw new HttpsError("invalid-argument", "Hãy chọn ít nhất một Phiếu cần xuất lịch.");
  }

  const events = await fetchGoogleCalendarEvents({
    calendarId: context.calendarId,
    apiKey: context.apiKey,
    timeMin: context.timeMin,
    timeMax: context.timeMax
  });
  const usableEvents = events.filter((event) => event?.id);
  const requestedIds = selectedEventIds ? new Set(selectedEventIds) : null;
  const entries = usableEvents
    .map((event) => createGoogleCalendarEntry(context.calendarId, event))
    .filter((entry) => !requestedIds || requestedIds.has(entry.selectionId));

  if (requestedIds && entries.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Các sự kiện đã chọn không còn tồn tại trong Google Calendar. Hãy quay lại xem trước danh sách mới."
    );
  }

  const snapshots = entries.length
    ? await db.getAll(...entries.flatMap((entry) => [entry.workOrderRef, entry.taskRef]))
    : [];

  const existing = new Map();
  snapshots.forEach((snapshot) => existing.set(snapshot.ref.path, snapshot));

  let created = 0;
  let updated = 0;
  let cancelled = 0;
  let skipped = requestedIds ? Math.max(0, requestedIds.size - entries.length) : 0;
  let operationCount = 0;
  let batch = db.batch();

  async function commitIfNeeded(force = false) {
    if (operationCount >= 400 || (force && operationCount > 0)) {
      await batch.commit();
      batch = db.batch();
      operationCount = 0;
    }
  }

  const calendarIdHash = crypto.createHash("sha256").update(context.calendarId).digest("hex");

  for (const entry of entries) {
    const event = entry.event;
    const workOrderSnap = existing.get(entry.workOrderRef.path);
    const taskSnap = existing.get(entry.taskRef.path);
    const wasImported = Boolean(workOrderSnap?.exists || taskSnap?.exists);
    const isCancelled = event.status === "cancelled";

    if (isCancelled && !wasImported) {
      skipped += 1;
      continue;
    }

    const baseName = formatCalendarWorkOrderName(event, context.timeZone);
    const summary = String(event.summary || "(Sự kiện không có tựa đề)").trim().slice(0, 1000);
    const workOrderName = isCancelled ? `${GOOGLE_CALENDAR_CANCELLED_LABEL} • ${baseName}` : baseName;
    const taskDescription = isCancelled ? `${GOOGLE_CALENDAR_CANCELLED_LABEL}\n${summary}` : summary;
    const taskDate = getEventTaskDate(event, context.timeZone);
    const eventStart = getEventStartDate(event);
    const eventEnd = event?.end?.dateTime ? new Date(event.end.dateTime) : null;
    const updatedAt = event?.updated ? new Date(event.updated) : null;
    const googleMetadata = {
      source: "google_calendar",
      googleCalendarEventId: String(event.id),
      googleCalendarEventKey: getCalendarEventKey(event),
      googleCalendarIdHash: calendarIdHash,
      googleCalendarStatus: isCancelled ? "cancelled" : "confirmed",
      googleCalendarCancellationMessage: isCancelled ? GOOGLE_CALENDAR_CANCELLED_LABEL : null,
      googleCalendarSummary: summary,
      googleCalendarEventUpdatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? Timestamp.fromDate(updatedAt) : null,
      googleCalendarEventStartAt: eventStart ? Timestamp.fromDate(eventStart) : null,
      googleCalendarEventEndAt: eventEnd && !Number.isNaN(eventEnd.getTime()) ? Timestamp.fromDate(eventEnd) : null,
      googleCalendarLastSyncedAt: FieldValue.serverTimestamp(),
      googleCalendarLastSyncedByUid: context.uid,
      googleCalendarLastSyncedByName: context.actorName
    };

    if (!wasImported) {
      batch.set(entry.workOrderRef, {
        id: entry.workOrderRef.id,
        name: workOrderName,
        createdByUid: context.uid,
        createdByName: context.actorName,
        createdAt: FieldValue.serverTimestamp(),
        taskCount: 1,
        status: "draft",
        ...googleMetadata
      });
      operationCount += 1;

      batch.set(entry.taskRef, {
        id: entry.taskRef.id,
        title: "",
        description: taskDescription,
        taskDate,
        assignedToUid: "",
        assignedToName: "",
        assignedByUid: context.uid,
        assignedByName: context.actorName,
        workOrderId: entry.workOrderRef.id,
        workOrderName,
        workOrderTaskCount: 1,
        rowIndex: 0,
        createdAt: FieldValue.serverTimestamp(),
        deadlineMinutes: GOOGLE_CALENDAR_DEFAULT_DEADLINE_MINUTES,
        isLunchBreak: false,
        isHotel: false,
        hotelPetCount: 0,
        hotelAllowedMinutes: 0,
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
        workPhotos: [],
        workPhotoCount: 0,
        lastWorkPhotoUploadedAt: null,
        photoRequired: true,
        requiredPhotoCount: 1,
        photos: [],
        photoCount: 0,
        lastPhotoUploadedAt: null,
        importedDefaultDeadlineMinutes: GOOGLE_CALENDAR_DEFAULT_DEADLINE_MINUTES,
        ...googleMetadata
      });
      operationCount += 1;
      created += 1;
    } else {
      batch.set(entry.workOrderRef, {
        name: workOrderName,
        taskCount: 1,
        ...googleMetadata
      }, { merge: true });
      operationCount += 1;

      batch.set(entry.taskRef, {
        description: taskDescription,
        taskDate,
        workOrderName,
        ...googleMetadata
      }, { merge: true });
      operationCount += 1;
      if (isCancelled) cancelled += 1;
      else updated += 1;
    }

    await commitIfNeeded(false);
  }

  await commitIfNeeded(true);

  return {
    read: events.length,
    created,
    updated,
    cancelled,
    skipped,
    defaultDeadlineMinutes: GOOGLE_CALENDAR_DEFAULT_DEADLINE_MINUTES
  };
});

// =========================
// Web Push / Firebase Cloud Messaging
// =========================
exports.registerWebPushToken = onCall({
  region: REGION,
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 20
}, async (request) => {
  const uid = assertAuthenticated(request);
  const token = typeof request.data?.token === "string" ? request.data.token.trim() : "";

  if (!token || token.length > MAX_PUSH_TOKEN_LENGTH) {
    throw new HttpsError("invalid-argument", "Mã thiết bị nhận thông báo không hợp lệ.");
  }

  const tokenId = pushTokenDocumentId(token);
  const platform = sanitizePushText(request.data?.platform, "web", 40);
  const userAgent = sanitizePushText(request.data?.userAgent, "", 500);

  await db.doc(`${PUSH_SUBSCRIPTIONS_COLLECTION}/${tokenId}`).set({
    uid,
    token,
    platform,
    standalone: request.data?.standalone === true,
    userAgent,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { registered: true };
});

exports.unregisterWebPushToken = onCall({
  region: REGION,
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 20
}, async (request) => {
  const uid = assertAuthenticated(request);
  const token = typeof request.data?.token === "string" ? request.data.token.trim() : "";

  if (!token || token.length > MAX_PUSH_TOKEN_LENGTH) {
    throw new HttpsError("invalid-argument", "Mã thiết bị nhận thông báo không hợp lệ.");
  }

  const ref = db.doc(`${PUSH_SUBSCRIPTIONS_COLLECTION}/${pushTokenDocumentId(token)}`);
  const snap = await ref.get();
  if (snap.exists && snap.data()?.uid === uid) {
    await ref.delete();
  }

  return { unregistered: true };
});


const CHAT_CONVERSATIONS_COLLECTION = "chatConversations";
const CHAT_USER_CONVERSATIONS_COLLECTION = "chatUserConversations";
const CHAT_DELETION_LOGS_COLLECTION = "chatDeletionLogs";
const MAX_CHAT_TEXT_LENGTH = 2000;
const MAX_CHAT_USERS = 500;
const MAX_CHAT_CONVERSATIONS = 1000;
const MAX_CHAT_ATTACHMENTS = 5;
const MAX_CHAT_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_CHAT_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_CHAT_FILE_BYTES = 50 * 1024 * 1024;
const MAX_CHAT_FILE_NAME_LENGTH = 180;
const CHAT_ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/vnd.rar",
  "application/x-7z-compressed"
]);

function chatConversationId(uidA, uidB) {
  return [String(uidA || "").trim(), String(uidB || "").trim()]
    .filter(Boolean)
    .sort()
    .map((uid) => encodeURIComponent(uid))
    .join("::");
}

function sanitizeChatText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, MAX_CHAT_TEXT_LENGTH);
}

function sanitizeChatClientMessageId(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 180 || !/^[a-zA-Z0-9._:-]+$/.test(text)) {
    throw new HttpsError("invalid-argument", "Mã gửi tin nhắn không hợp lệ.");
  }
  return text;
}

function sanitizeChatFileName(value, fallback = "tep-dinh-kem") {
  const raw = typeof value === "string" ? value.trim() : "";
  const cleaned = (raw || fallback)
    .replace(/[\\/<>:"|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, MAX_CHAT_FILE_NAME_LENGTH);
  return cleaned || fallback;
}

function getChatAttachmentKind(contentType) {
  if (typeof contentType !== "string") return "";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (CHAT_ALLOWED_FILE_TYPES.has(contentType)) return "file";
  return "";
}

function chatAttachmentSummary(attachments) {
  const items = Array.isArray(attachments) ? attachments : [];
  if (!items.length) return "";
  if (items.length === 1) {
    if (items[0].kind === "video") return "Đã gửi một video";
    if (items[0].kind === "file") return `Đã gửi tệp ${items[0].name || "đính kèm"}`;
    return "Đã gửi một hình ảnh";
  }
  const imageCount = items.filter((item) => item.kind === "image").length;
  const videoCount = items.filter((item) => item.kind === "video").length;
  const fileCount = items.filter((item) => item.kind === "file").length;
  if (fileCount && !imageCount && !videoCount) return `Đã gửi ${fileCount} tệp`;
  if (imageCount && !videoCount && !fileCount) return `Đã gửi ${imageCount} hình ảnh`;
  if (videoCount && !imageCount && !fileCount) return `Đã gửi ${videoCount} video`;
  return `Đã gửi ${items.length} tệp đính kèm`;
}

async function validateChatAttachments(rawAttachments, { conversationId, senderUid, clientMessageId }) {
  const rawItems = Array.isArray(rawAttachments) ? rawAttachments : [];
  if (rawItems.length > MAX_CHAT_ATTACHMENTS) {
    throw new HttpsError("invalid-argument", `Mỗi tin nhắn chỉ được gửi tối đa ${MAX_CHAT_ATTACHMENTS} tệp đính kèm.`);
  }
  if (!rawItems.length) return [];

  const expectedPrefix = `chat-media/${conversationId}/${senderUid}/${clientMessageId}/`;
  const bucket = getAdminStorage().bucket();
  const validated = [];

  for (let index = 0; index < rawItems.length; index += 1) {
    const raw = rawItems[index] && typeof rawItems[index] === "object" ? rawItems[index] : {};
    const storagePath = typeof raw.storagePath === "string" ? raw.storagePath.trim() : "";
    if (!storagePath || !storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) {
      throw new HttpsError("invalid-argument", "Đường dẫn tệp Chat không hợp lệ.");
    }

    let metadata;
    try {
      [metadata] = await bucket.file(storagePath).getMetadata();
    } catch (error) {
      console.error("Không đọc được metadata tệp Chat:", storagePath, error);
      throw new HttpsError("failed-precondition", "Tệp Chat chưa tải lên hoàn tất hoặc không còn tồn tại.");
    }

    const contentType = String(metadata?.contentType || raw.contentType || "").toLowerCase();
    const kind = getChatAttachmentKind(contentType);
    const size = Number(metadata?.size || raw.size || 0);
    const customMetadata = metadata?.metadata || {};
    if (!kind || !Number.isFinite(size) || size <= 0) {
      throw new HttpsError("invalid-argument", "Định dạng tệp Chat không được hỗ trợ.");
    }
    if (kind === "image" && size > MAX_CHAT_IMAGE_BYTES) {
      throw new HttpsError("invalid-argument", "Mỗi hình ảnh Chat tối đa 15 MB.");
    }
    if (kind === "video" && size > MAX_CHAT_VIDEO_BYTES) {
      throw new HttpsError("invalid-argument", "Mỗi video Chat tối đa 100 MB.");
    }
    if (kind === "file" && size > MAX_CHAT_FILE_BYTES) {
      throw new HttpsError("invalid-argument", "Mỗi tệp Chat tối đa 50 MB.");
    }
    if (customMetadata.uploaderUid !== senderUid
      || customMetadata.conversationId !== conversationId
      || customMetadata.uploadId !== clientMessageId
      || customMetadata.kind !== kind) {
      throw new HttpsError("permission-denied", "Thông tin xác thực tệp Chat không hợp lệ.");
    }

    validated.push({
      storagePath,
      name: sanitizeChatFileName(
        raw.name || metadata?.name?.split("/").pop(),
        kind === "video" ? "video" : kind === "file" ? "tep-dinh-kem" : "hinh-anh"
      ),
      contentType,
      kind,
      size,
      width: Math.max(0, Math.round(Number(raw.width || 0))),
      height: Math.max(0, Math.round(Number(raw.height || 0))),
      duration: Math.max(0, Math.round(Number(raw.duration || 0) * 100) / 100)
    });
  }
  return validated;
}

function sanitizedChatProfile(snapshot) {
  const data = snapshot.data() || {};
  const role = ["admin", "supervisor", "employee"].includes(data.role)
    ? data.role
    : "employee";
  return {
    uid: snapshot.id,
    name: sanitizePushText(data.name, data.email || "Tài khoản", 120),
    email: sanitizePushText(data.email, "", 180),
    role
  };
}


function chatUserConversationRef(uid, conversationId) {
  return db.doc(`${CHAT_USER_CONVERSATIONS_COLLECTION}/${uid}/conversations/${conversationId}`);
}

function normalizeChatConversationSummary(data = {}, conversationId = "") {
  const participantIds = Array.isArray(data.participantIds)
    ? data.participantIds.filter((uid) => typeof uid === "string" && uid.trim())
    : [];

  return {
    id: String(data.id || conversationId || ""),
    participantIds,
    participantNames: data.participantNames && typeof data.participantNames === "object"
      ? data.participantNames
      : {},
    participantRoles: data.participantRoles && typeof data.participantRoles === "object"
      ? data.participantRoles
      : {},
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    lastMessage: typeof data.lastMessage === "string" ? data.lastMessage : "",
    lastMessageAt: data.lastMessageAt || null,
    lastSenderId: typeof data.lastSenderId === "string" ? data.lastSenderId : "",
    lastMessageId: typeof data.lastMessageId === "string" ? data.lastMessageId : "",
    messageCount: Math.max(0, Number(data.messageCount || 0)),
    unreadCounts: data.unreadCounts && typeof data.unreadCounts === "object"
      ? data.unreadCounts
      : {},
    readAtBy: data.readAtBy && typeof data.readAtBy === "object"
      ? data.readAtBy
      : {},
    lastReadMessageIdBy: data.lastReadMessageIdBy && typeof data.lastReadMessageIdBy === "object"
      ? data.lastReadMessageIdBy
      : {},
    historyClearedAt: data.historyClearedAt || null,
    historyClearedByUid: typeof data.historyClearedByUid === "string"
      ? data.historyClearedByUid
      : ""
  };
}

function setChatConversationIndexesInTransaction(transaction, conversationData, conversationId = "") {
  const summary = normalizeChatConversationSummary(conversationData, conversationId);
  summary.participantIds.forEach((uid) => {
    transaction.set(chatUserConversationRef(uid, summary.id), summary, { merge: false });
  });
}

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  }
  return null;
}

function serializeChatConversationSummary(data = {}, conversationId = "") {
  const summary = normalizeChatConversationSummary(data, conversationId);
  const readAtBy = Object.fromEntries(
    Object.entries(summary.readAtBy || {}).map(([uid, value]) => [uid, timestampToMillis(value)])
  );

  return {
    ...summary,
    createdAt: timestampToMillis(summary.createdAt),
    updatedAt: timestampToMillis(summary.updatedAt),
    lastMessageAt: timestampToMillis(summary.lastMessageAt),
    historyClearedAt: timestampToMillis(summary.historyClearedAt),
    readAtBy
  };
}

async function repairChatConversationIndex(uid, conversationDocs) {
  const indexCollection = db.collection(CHAT_USER_CONVERSATIONS_COLLECTION).doc(uid).collection("conversations");
  const existingSnapshot = await indexCollection.get();
  const desiredIds = new Set(conversationDocs.map((item) => item.id));
  const operations = [];

  conversationDocs.forEach((item) => {
    operations.push({
      type: "set",
      ref: indexCollection.doc(item.id),
      data: normalizeChatConversationSummary(item.data() || {}, item.id)
    });
  });

  existingSnapshot.docs.forEach((item) => {
    if (!desiredIds.has(item.id)) operations.push({ type: "delete", ref: item.ref });
  });

  for (let start = 0; start < operations.length; start += 400) {
    const batch = db.batch();
    operations.slice(start, start + 400).forEach((operation) => {
      if (operation.type === "delete") batch.delete(operation.ref);
      else batch.set(operation.ref, operation.data, { merge: false });
    });
    await batch.commit();
  }
}

function normalizeOptionalIsoDate(value, fieldName) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new HttpsError("invalid-argument", `${fieldName} không đúng định dạng YYYY-MM-DD.`);
  }

  const [year, month, day] = text.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const valid = parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;

  if (!valid) {
    throw new HttpsError("invalid-argument", `${fieldName} không phải ngày hợp lệ.`);
  }

  return text;
}


async function assertWorkAssignmentHistoryDeletionAllowed() {
  const settingsSnap = await db.doc("appSettings/workOrderControls").get();
  if (settingsSnap.exists && settingsSnap.data()?.preventWorkOrderDeletion === true) {
    throw new HttpsError(
      "failed-precondition",
      "Chức năng xóa Phiếu công việc và Lịch sử giao việc đang bị khóa trong Cài đặt."
    );
  }
}

function normalizeHistoryDocumentId(value) {
  const historyId = typeof value === "string" ? value.trim() : "";
  if (!historyId || historyId.length > 180 || historyId.includes("/")) {
    throw new HttpsError("invalid-argument", "Mã Lịch sử giao việc không hợp lệ.");
  }
  return historyId;
}

function isAutomaticSupervisionLunchHistory(history = {}) {
  return history?.autoCreatedByWorkSupervision === true
    || String(history?.historyType || "") === "automatic_lunch_break"
    || String(history?.source || "") === "work_supervision_auto_lunch"
    || String(history?.workOrderId || "").startsWith("supervisionLunch_");
}

function automaticLunchHistoryDeletionMarkerRef(historyId) {
  return db.doc(`workAssignmentHistoryDeletionMarkers/${historyId}`);
}

exports.deleteWorkAssignmentHistoryItem = onCall({
  region: REGION,
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 10
}, async (request) => {
  const uid = assertAuthenticated(request);
  await assertAdmin(uid);
  await assertWorkAssignmentHistoryDeletionAllowed();

  const historyId = normalizeHistoryDocumentId(request.data?.historyId);
  const historyRef = db.doc(`workAssignmentHistory/${historyId}`);
  const historySnap = await historyRef.get();

  if (!historySnap.exists) {
    return { deleted: false, historyId };
  }

  const history = historySnap.data() || {};
  const batch = db.batch();

  // Riêng Phiếu nghỉ trưa tự động, lưu marker xóa thủ công để trigger/backfill
  // không được tự tạo lại dòng lịch sử sau khi Admin đã chủ động xóa.
  if (isAutomaticSupervisionLunchHistory(history)) {
    batch.set(automaticLunchHistoryDeletionMarkerRef(historyId), {
      historyId,
      workOrderId: String(history.workOrderId || ""),
      deletedByUid: uid,
      deletedAt: Timestamp.now(),
      reason: "manual_history_delete"
    }, { merge: true });
  }

  batch.delete(historyRef);
  await batch.commit();
  return { deleted: true, historyId };
});

exports.deleteAllWorkAssignmentHistory = onCall({
  region: REGION,
  timeoutSeconds: 120,
  memory: "256MiB",
  maxInstances: 3
}, async (request) => {
  const uid = assertAuthenticated(request);
  await assertAdmin(uid);
  await assertWorkAssignmentHistoryDeletionAllowed();

  let deletedCount = 0;

  while (true) {
    // Dùng tối đa 200 dòng để batch vẫn dưới giới hạn 500 writes kể cả khi
    // mỗi dòng Nghỉ trưa tự động cần thêm một marker xóa thủ công.
    const snapshot = await db.collection("workAssignmentHistory").limit(200).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((item) => {
      const history = item.data() || {};
      if (isAutomaticSupervisionLunchHistory(history)) {
        batch.set(automaticLunchHistoryDeletionMarkerRef(item.id), {
          historyId: item.id,
          workOrderId: String(history.workOrderId || ""),
          deletedByUid: uid,
          deletedAt: Timestamp.now(),
          reason: "manual_delete_all_history"
        }, { merge: true });
      }
      batch.delete(item.ref);
    });
    await batch.commit();
    deletedCount += snapshot.size;
  }

  return { deletedCount };
});

function firestoreTimestampOrNull(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    if (date instanceof Date && Number.isFinite(date.getTime())) return Timestamp.fromDate(date);
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return Timestamp.fromDate(value);
  return null;
}

function earliestTimestamp(values = []) {
  return values
    .map(firestoreTimestampOrNull)
    .filter(Boolean)
    .sort((left, right) => left.toMillis() - right.toMillis())[0] || null;
}

async function ensureInitialWorkAssignmentHistory(workOrderId, beforeData, afterData) {
  if (!workOrderId || !afterData || afterData.status !== "dispatched") return;
  if (beforeData?.status === "dispatched") return;

  const isAutomaticSupervisionLunch = afterData.autoCreatedByWorkSupervision === true
    || String(workOrderId || "").startsWith("supervisionLunch_");

  // Nếu Admin đã chủ động xóa dòng lịch sử của Phiếu nghỉ trưa tự động thì tuyệt đối
  // không được tự tạo lại ở các lần backfill/trigger sau. Marker chỉ được ghi bởi
  // Cloud Function xóa lịch sử và không phụ thuộc vào việc Phiếu gốc còn tồn tại.
  const deterministicHistoryId = `initial_${workOrderId}`.slice(0, 180);
  if (isAutomaticSupervisionLunch) {
    const deletionMarker = await db.doc(`workAssignmentHistoryDeletionMarkers/${deterministicHistoryId}`).get();
    if (deletionMarker.exists) return;
  }

  // Nếu client đã ghi lịch sử trong cùng batch thì không tạo thêm dòng trùng.
  const existing = await db.collection("workAssignmentHistory")
    .where("workOrderId", "==", workOrderId)
    .limit(1)
    .get();
  if (!existing.empty) return;

  const taskSnapshot = await db.collection("tasks")
    .where("workOrderId", "==", workOrderId)
    .get();
  if (taskSnapshot.empty) return;

  const recipients = new Map();
  const taskIds = [];
  const taskAssignments = [];
  const taskNames = new Set();
  const taskCreatedAtValues = [];
  const dispatchedAtValues = [];
  let assignedByUid = typeof afterData.createdByUid === "string" ? afterData.createdByUid : "";
  let assignedByName = typeof afterData.createdByName === "string" ? afterData.createdByName : "Admin";

  taskSnapshot.docs.forEach((item) => {
    const task = item.data() || {};
    taskIds.push(item.id);
    taskCreatedAtValues.push(task.createdAt);
    dispatchedAtValues.push(task.dispatchedAt);

    const employeeUid = typeof task.assignedToUid === "string" ? task.assignedToUid.trim() : "";
    if (employeeUid) {
      const employeeName = typeof task.assignedToName === "string" && task.assignedToName.trim()
        ? task.assignedToName.trim()
        : "Nhân viên";
      if (!recipients.has(employeeUid)) recipients.set(employeeUid, employeeName);

      const taskName = typeof task.title === "string" ? task.title.trim() : "";
      if (taskName) {
        taskNames.add(taskName);
        taskAssignments.push({
          taskId: item.id,
          taskName,
          employeeUid,
          employeeName
        });
      }
    }

    if (!assignedByUid && typeof task.assignedByUid === "string") assignedByUid = task.assignedByUid;
    if ((!assignedByName || assignedByName === "Admin") && typeof task.assignedByName === "string" && task.assignedByName.trim()) {
      assignedByName = task.assignedByName.trim();
    }
  });

  if (!recipients.size) return;

  const workOrderCreatedAt = firestoreTimestampOrNull(afterData.createdAt)
    || earliestTimestamp(taskCreatedAtValues)
    || Timestamp.now();
  const assignedAt = earliestTimestamp(dispatchedAtValues)
    || firestoreTimestampOrNull(afterData.updatedAt)
    || Timestamp.now();
  const historyId = deterministicHistoryId;
  const historyRef = db.doc(`workAssignmentHistory/${historyId}`);

  // Kiểm tra deterministic ID thêm lần cuối để an toàn khi nhiều trigger chạy gần nhau.
  const deterministicSnap = await historyRef.get();
  if (deterministicSnap.exists) return;

  await historyRef.set({
    id: historyId,
    workOrderId,
    workOrderName: typeof afterData.name === "string" && afterData.name.trim()
      ? afterData.name.trim()
      : "Phiếu công việc",
    workOrderCreatedAt,
    assignedAt,
    assignedByUid: assignedByUid || "system",
    assignedByName: assignedByName || "Admin",
    assignedEmployeeUids: Array.from(recipients.keys()),
    assignedEmployeeNames: Array.from(recipients.values()),
    taskIds,
    taskNames: Array.from(taskNames),
    taskAssignments,
    taskCount: Math.max(1, Number(afterData.taskCount || taskIds.length || 1)),
    source: isAutomaticSupervisionLunch
      ? "work_supervision_auto_lunch"
      : (beforeData?.status === "draft" ? "draft_dispatched" : "created_and_dispatched"),
    historyType: isAutomaticSupervisionLunch ? "automatic_lunch_break" : "assignment",
    autoCreatedByWorkSupervision: isAutomaticSupervisionLunch,
    workSupervisionCycleId: isAutomaticSupervisionLunch
      ? String(afterData.workSupervisionCycleId || "")
      : "",
    ensuredByServer: true
  }, { merge: false });
}

exports.ensureWorkAssignmentHistoryOnDispatch = onDocumentWritten({
  document: "workOrders/{workOrderId}",
  region: REGION,
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 20
}, async (event) => {
  const afterSnapshot = event.data?.after;
  if (!afterSnapshot?.exists) return;

  const beforeSnapshot = event.data?.before;
  const beforeData = beforeSnapshot?.exists ? beforeSnapshot.data() : null;
  const afterData = afterSnapshot.data() || {};

  await ensureInitialWorkAssignmentHistory(
    event.params.workOrderId,
    beforeData,
    afterData
  );
});

exports.backfillAutomaticLunchBreakAssignmentHistory = onCall({
  region: REGION,
  timeoutSeconds: 120,
  memory: "256MiB",
  maxInstances: 3
}, async (request) => {
  const uid = assertAuthenticated(request);
  await assertAdmin(uid);

  // Bổ sung các Phiếu nghỉ trưa tự động đã tồn tại trước bản cập nhật này.
  // ensureInitialWorkAssignmentHistory tự kiểm tra trùng và marker xóa thủ công,
  // nên lịch sử mà Admin đã xóa sẽ không bao giờ bị backfill tạo lại.
  const snapshot = await db.collection("workOrders")
    .where("autoCreatedByWorkSupervision", "==", true)
    .get();

  let processedCount = 0;
  for (let start = 0; start < snapshot.docs.length; start += 60) {
    const slice = snapshot.docs.slice(start, start + 60);
    await Promise.all(slice.map(async (item) => {
      const workOrder = item.data() || {};
      if (String(workOrder.status || "") !== "dispatched") return;
      await ensureInitialWorkAssignmentHistory(item.id, null, workOrder);
      processedCount += 1;
    }));
  }

  return { scannedCount: snapshot.size, processedCount };
});


const INVALID_TASK_HISTORY_MIN_FAST_PERCENT = 15;

function taskHasTimeExtensionForInvalidHistory(task = {}) {
  const extensions = Array.isArray(task.timeExtensions) ? task.timeExtensions : [];
  return Number(task.timeExtensionTotalMinutes || 0) > 0
    || Number(task.timeExtensionCount || 0) > 0
    || extensions.some((item) => Number(item?.minutes || 0) > 0);
}

function invalidTaskHistoryFastPercent(task = {}) {
  const deadlineMinutes = Number(task.deadlineMinutes || 0);
  const differenceMinutes = Number(task.differenceMinutes || 0);
  if (deadlineMinutes <= 0 || differenceMinutes <= 0) return 0;
  return Number(((differenceMinutes / deadlineMinutes) * 100).toFixed(1));
}

function shouldRecordInvalidTaskHistory(task = {}) {
  if (String(task.status || "") !== "completed") return false;
  if (String(task.resultType || "") !== "faster") return false;
  if (task.isLunchBreak === true || task.isHotel === true) return false;
  if (taskHasTimeExtensionForInvalidHistory(task)) return false;

  return invalidTaskHistoryFastPercent(task) >= INVALID_TASK_HISTORY_MIN_FAST_PERCENT;
}

function invalidTaskHistoryCompletedAt(task = {}) {
  const direct = firestoreTimestampOrNull(task.approvedAt)
    || firestoreTimestampOrNull(task.adminEndedAt)
    || firestoreTimestampOrNull(task.submittedAt);
  if (direct) return direct;

  // Dữ liệu cũ có thể thiếu approvedAt/submittedAt. Dùng mốc bắt đầu + thời gian
  // thực tế để có completedAt ổn định, tránh tạo bản ghi trùng ở mỗi lần backfill.
  const startedAt = firestoreTimestampOrNull(task.queueStartAt)
    || firestoreTimestampOrNull(task.dispatchedAt)
    || firestoreTimestampOrNull(task.createdAt);
  const actualMinutes = Math.max(0, Number(task.actualMinutes || 0));
  if (startedAt) return Timestamp.fromMillis(startedAt.toMillis() + (actualMinutes * 60000));

  return Timestamp.fromMillis(0);
}

async function upsertInvalidTaskHistory(taskId, task = {}) {
  if (!taskId || !shouldRecordInvalidTaskHistory(task)) return false;

  const completedAt = invalidTaskHistoryCompletedAt(task);
  const completedAtMs = completedAt.toMillis();
  const historyId = `${String(taskId)}_${completedAtMs}`.slice(0, 180);
  const ref = db.doc(`invalidTaskHistory/${historyId}`);
  const differencePercent = invalidTaskHistoryFastPercent(task);

  await ref.set({
    id: historyId,
    taskId: String(taskId),
    taskName: typeof task.title === "string" && task.title.trim() ? task.title.trim() : "Công việc",
    workOrderId: typeof task.workOrderId === "string" ? task.workOrderId : "",
    workOrderName: typeof task.workOrderName === "string" && task.workOrderName.trim()
      ? task.workOrderName.trim()
      : "Phiếu công việc",
    employeeUid: typeof task.assignedToUid === "string" ? task.assignedToUid : "",
    employeeName: typeof task.assignedToName === "string" && task.assignedToName.trim()
      ? task.assignedToName.trim()
      : "Nhân viên",
    actualMinutes: Math.max(0, Number(task.actualMinutes || 0)),
    deadlineMinutes: Math.max(0, Number(task.deadlineMinutes || 0)),
    differenceMinutes: Math.max(0, Number(task.differenceMinutes || 0)),
    differencePercent,
    completedType: task.isShip === true ? "ship" : "normal",
    completedAt,
    recordedAt: Timestamp.now(),
    source: task.adminEndedAt ? "admin_ended" : "completed_result"
  }, { merge: true });

  return true;
}

async function syncInvalidTaskHistoryForCompletedTask(taskId, task = {}) {
  const existingSnapshot = await db.collection("invalidTaskHistory").where("taskId", "==", String(taskId)).get();

  if (!shouldRecordInvalidTaskHistory(task)) {
    if (existingSnapshot.empty) return false;
    const batch = db.batch();
    existingSnapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
    return true;
  }

  const completedAt = invalidTaskHistoryCompletedAt(task);
  const expectedHistoryId = `${String(taskId)}_${completedAt.toMillis()}`.slice(0, 180);
  await upsertInvalidTaskHistory(taskId, task);

  const staleDocs = existingSnapshot.docs.filter((item) => item.id !== expectedHistoryId);
  if (staleDocs.length) {
    const batch = db.batch();
    staleDocs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  }
  return true;
}

exports.ensureInvalidTaskHistoryOnCompletion = onDocumentWritten({
  document: "tasks/{taskId}",
  region: REGION,
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 20
}, async (event) => {
  const afterSnapshot = event.data?.after;
  if (!afterSnapshot?.exists) return;

  const after = afterSnapshot.data() || {};
  if (String(after.status || "") !== "completed") return;

  // Đồng bộ ở mọi lần ghi khi task đã hoàn thành, không chỉ lúc chuyển trạng thái.
  // Nhờ vậy khi Admin sửa “Thời gian thực tế”, Lịch sử công việc không hợp lệ
  // sẽ tự cập nhật hoặc tự gỡ nếu kết quả mới không còn nhanh hơn >= 15%.
  await syncInvalidTaskHistoryForCompletedTask(event.params.taskId, after);
});

exports.backfillInvalidTaskHistory = onCall({
  region: REGION,
  timeoutSeconds: 120,
  memory: "256MiB",
  maxInstances: 3
}, async (request) => {
  const uid = assertAuthenticated(request);
  await assertAdmin(uid);

  const snapshot = await db.collection("tasks").where("status", "==", "completed").get();
  let createdCount = 0;

  for (let start = 0; start < snapshot.docs.length; start += 80) {
    const slice = snapshot.docs.slice(start, start + 80);
    const results = await Promise.all(slice.map(async (item) => {
      const task = item.data() || {};
      if (!shouldRecordInvalidTaskHistory(task)) return false;
      return upsertInvalidTaskHistory(item.id, task);
    }));
    createdCount += results.filter(Boolean).length;
  }

  return {
    scannedCount: snapshot.size,
    qualifyingCount: createdCount,
    minFastPercent: INVALID_TASK_HISTORY_MIN_FAST_PERCENT
  };
});


function normalizeInvalidTaskHistoryDocumentId(value) {
  const historyId = typeof value === "string" ? value.trim() : "";
  if (!historyId || historyId.length > 180 || historyId.includes("/")) {
    throw new HttpsError("invalid-argument", "Mã Lịch sử công việc không hợp lệ.");
  }
  return historyId;
}

function invalidConversionMediaStoragePaths(task = {}) {
  const paths = new Set();
  const items = [
    ...(Array.isArray(task.photos) ? task.photos : []),
    ...(Array.isArray(task.workPhotos) ? task.workPhotos : [])
  ];

  items.forEach((photo) => {
    if (!photo || typeof photo !== "object") return;
    const direct = [photo.storagePath, photo.fullPath, photo.path]
      .find((value) => typeof value === "string" && value.trim());
    if (direct) {
      paths.add(direct.trim());
      return;
    }

    const url = typeof photo.url === "string" ? photo.url : "";
    if (!url.includes("/o/")) return;
    try {
      const encodedPath = url.split("/o/")[1]?.split("?")[0] || "";
      const decoded = decodeURIComponent(encodedPath);
      if (decoded) paths.add(decoded);
    } catch (error) {
      console.warn("Không đọc được đường dẫn ảnh khi chuyển công việc không hợp lệ:", error);
    }
  });

  return [...paths];
}

async function deleteInvalidConversionMediaBestEffort(task = {}) {
  const paths = invalidConversionMediaStoragePaths(task);
  if (!paths.length) return;

  const bucket = getAdminStorage().bucket();
  await Promise.all(paths.map(async (storagePath) => {
    try {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });
    } catch (error) {
      const code = Number(error?.code || 0);
      if (code === 404) return;
      console.error("Không xóa được ảnh của công việc đã chuyển:", storagePath, error);
    }
  }));
}

function completedLunchResultFields(actualMinutes) {
  const actual = Math.max(0, Math.trunc(Number(actualMinutes || 0)));
  const deadline = WORK_SUPERVISION_LUNCH_TOTAL_MINUTES;
  if (actual < deadline) {
    const differenceMinutes = deadline - actual;
    return {
      resultType: "faster",
      differenceMinutes,
      differencePercent: Number(((differenceMinutes / deadline) * 100).toFixed(1))
    };
  }
  if (actual > deadline) {
    const differenceMinutes = actual - deadline;
    return {
      resultType: "slower",
      differenceMinutes,
      differencePercent: Number(((differenceMinutes / actual) * 100).toFixed(1))
    };
  }
  return { resultType: "on_time", differenceMinutes: 0, differencePercent: 0 };
}

exports.convertInvalidTaskHistoryToLunchBreak = onCall({
  region: REGION,
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 10
}, async (request) => {
  const adminUid = assertAuthenticated(request);
  const adminProfile = await assertAdmin(adminUid);
  await assertWorkAssignmentHistoryDeletionAllowed();

  const historyId = normalizeInvalidTaskHistoryDocumentId(request.data?.historyId);
  const historyRef = db.doc(`invalidTaskHistory/${historyId}`);
  const historySnapshot = await historyRef.get();
  if (!historySnapshot.exists) {
    throw new HttpsError("not-found", "Không tìm thấy Lịch sử công việc không hợp lệ.");
  }

  const initialHistory = historySnapshot.data() || {};
  if (initialHistory.convertedAt) {
    return {
      converted: true,
      alreadyConverted: true,
      actualMinutes: Math.max(0, Math.trunc(Number(initialHistory.actualMinutes || 0))),
      lunchTaskId: initialHistory.convertedLunchTaskId || "",
      lunchWorkOrderId: initialHistory.convertedLunchWorkOrderId || ""
    };
  }

  const sourceTaskId = typeof initialHistory.taskId === "string" ? initialHistory.taskId.trim() : "";
  const sourceTaskRef = sourceTaskId ? db.doc(`tasks/${sourceTaskId}`) : null;
  const sourceTaskSnapshot = sourceTaskRef ? await sourceTaskRef.get() : null;
  const initialSourceTask = sourceTaskSnapshot?.exists ? sourceTaskSnapshot.data() || {} : null;
  const sourceWorkOrderId = String(
    initialSourceTask?.workOrderId || initialHistory.workOrderId || ""
  ).trim();

  let groupSnapshots = [];
  if (sourceWorkOrderId && sourceWorkOrderId !== "legacy") {
    const querySnapshot = await db.collection("tasks").where("workOrderId", "==", sourceWorkOrderId).get();
    groupSnapshots = querySnapshot.docs;
  } else if (sourceTaskSnapshot?.exists) {
    groupSnapshots = [sourceTaskSnapshot];
  }

  const now = Timestamp.now();
  const adminName = String(adminProfile?.name || request.auth?.token?.email || "Admin").slice(0, 120);
  const deterministicKey = crypto.createHash("sha256").update(historyId).digest("hex").slice(0, 22);
  const lunchWorkOrderId = `invalidLunchOrder_${deterministicKey}`;
  const lunchTaskId = `invalidLunchTask_${deterministicKey}`;
  const lunchWorkOrderRef = db.doc(`workOrders/${lunchWorkOrderId}`);
  const lunchTaskRef = db.doc(`tasks/${lunchTaskId}`);
  const sourceWorkOrderRef = sourceWorkOrderId && sourceWorkOrderId !== "legacy"
    ? db.doc(`workOrders/${sourceWorkOrderId}`)
    : null;

  const transactionResult = await db.runTransaction(async (transaction) => {
    const currentHistorySnapshot = await transaction.get(historyRef);
    if (!currentHistorySnapshot.exists) {
      throw new HttpsError("not-found", "Dòng Lịch sử công việc không hợp lệ đã không còn tồn tại.");
    }
    const history = currentHistorySnapshot.data() || {};
    if (history.convertedAt) {
      return {
        alreadyConverted: true,
        actualMinutes: Math.max(0, Math.trunc(Number(history.actualMinutes || 0))),
        sourceTask: null,
        sourceTaskDeleted: false
      };
    }

    const sourceSnapshot = sourceTaskRef ? await transaction.get(sourceTaskRef) : null;
    const sourceTask = sourceSnapshot?.exists ? sourceSnapshot.data() || {} : null;

    const currentGroupSnapshots = [];
    for (const item of groupSnapshots) {
      if (sourceTaskRef && item.id === sourceTaskRef.id) continue;
      const current = await transaction.get(item.ref);
      if (current.exists) currentGroupSnapshots.push(current);
    }

    const sourceWorkOrderSnapshot = sourceWorkOrderRef
      ? await transaction.get(sourceWorkOrderRef)
      : null;

    const employeeUid = String(history.employeeUid || sourceTask?.assignedToUid || "").trim();
    const employeeName = String(history.employeeName || sourceTask?.assignedToName || "Nhân viên").trim() || "Nhân viên";
    if (!employeeUid) {
      throw new HttpsError("failed-precondition", "Dòng lịch sử thiếu nhân viên nên không thể tạo Phiếu nghỉ trưa.");
    }

    const actualMinutes = Math.max(0, Math.trunc(Number(
      history.actualMinutes ?? sourceTask?.actualMinutes ?? 0
    )));
    const completedAt = firestoreTimestampOrNull(history.completedAt)
      || (sourceTask ? invalidTaskHistoryCompletedAt(sourceTask) : null)
      || now;
    const completedAtMs = completedAt.toMillis();
    const startedAtMs = Math.max(0, completedAtMs - (actualMinutes * 60 * 1000));
    const startedAt = Timestamp.fromMillis(startedAtMs);
    const deadlineAt = Timestamp.fromMillis(startedAtMs + (WORK_SUPERVISION_LUNCH_TOTAL_MINUTES * 60 * 1000));
    const taskDate = supervisionDateKey(new Date(completedAtMs));
    const result = completedLunchResultFields(actualMinutes);
    const workOrderName = `Phiếu nghỉ trưa - ${employeeName}`.slice(0, 180);

    if (sourceSnapshot?.exists && sourceTaskRef) {
      transaction.delete(sourceTaskRef);
    }

    const remainingGroup = currentGroupSnapshots
      .filter((item) => item.id !== sourceTaskId)
      .sort((left, right) => Number(left.data()?.rowIndex ?? 0) - Number(right.data()?.rowIndex ?? 0));

    remainingGroup.forEach((item, index) => {
      transaction.update(item.ref, {
        rowIndex: index,
        workOrderTaskCount: remainingGroup.length
      });
    });

    if (sourceWorkOrderRef && sourceWorkOrderSnapshot?.exists) {
      if (remainingGroup.length === 0) {
        transaction.delete(sourceWorkOrderRef);
      } else {
        transaction.update(sourceWorkOrderRef, { taskCount: remainingGroup.length });
      }
    }

    transaction.set(lunchWorkOrderRef, {
      id: lunchWorkOrderId,
      name: workOrderName,
      createdByUid: adminUid,
      createdByName: adminName,
      createdAt: startedAt,
      taskCount: 1,
      status: "dispatched",
      convertedFromInvalidTaskHistoryId: historyId,
      convertedFromTaskId: sourceTaskId
    }, { merge: false });

    transaction.set(lunchTaskRef, {
      id: lunchTaskId,
      title: "Phiếu nghỉ trưa",
      description: `Được Admin chuyển từ công việc không hợp lệ “${String(history.taskName || sourceTask?.title || "Công việc").trim()}”. Thời gian nghỉ được lấy đúng theo thời gian thực tế đã ghi nhận: ${actualMinutes} phút.`,
      taskDate,
      assignedToUid: employeeUid,
      assignedToName: employeeName,
      assignedByUid: adminUid,
      assignedByName: adminName,
      workOrderId: lunchWorkOrderId,
      workOrderName,
      workOrderTaskCount: 1,
      rowIndex: 0,
      createdAt: startedAt,
      deadlineMinutes: WORK_SUPERVISION_LUNCH_TOTAL_MINUTES,
      isLunchBreak: true,
      isHotel: false,
      isShip: false,
      hotelPetCount: 0,
      hotelAllowedMinutes: 0,
      deadlineAt,
      dispatchedAt: startedAt,
      queueStartAt: startedAt,
      pauseStartedAt: null,
      remainingMsAtPause: null,
      accumulatedWorkedMs: 0,
      submittedAt: completedAt,
      approvedAt: completedAt,
      status: "completed",
      actualMinutes,
      resultType: result.resultType,
      differenceMinutes: result.differenceMinutes,
      differencePercent: result.differencePercent,
      workPhotos: [],
      workPhotoCount: 0,
      lastWorkPhotoUploadedAt: null,
      photoRequired: false,
      requiredPhotoCount: 0,
      photos: [],
      photoCount: 0,
      lastPhotoUploadedAt: null,
      convertedFromInvalidTaskHistoryId: historyId,
      convertedFromTaskId: sourceTaskId,
      convertedAt: now,
      convertedByUid: adminUid,
      convertedByName: adminName
    }, { merge: false });

    transaction.update(historyRef, {
      convertedAt: now,
      convertedByUid: adminUid,
      convertedByName: adminName,
      convertedLunchTaskId: lunchTaskId,
      convertedLunchWorkOrderId: lunchWorkOrderId,
      conversionType: "completed_lunch_break",
      sourceTaskDeleted: Boolean(sourceSnapshot?.exists)
    });

    return {
      alreadyConverted: false,
      actualMinutes,
      sourceTask,
      sourceTaskDeleted: Boolean(sourceSnapshot?.exists),
      deletedSourceWorkOrder: Boolean(sourceWorkOrderSnapshot?.exists && remainingGroup.length === 0)
    };
  });

  if (transactionResult.sourceTask) {
    await deleteInvalidConversionMediaBestEffort(transactionResult.sourceTask);
  }

  return {
    converted: true,
    alreadyConverted: Boolean(transactionResult.alreadyConverted),
    actualMinutes: transactionResult.actualMinutes,
    sourceTaskDeleted: Boolean(transactionResult.sourceTaskDeleted),
    deletedSourceWorkOrder: Boolean(transactionResult.deletedSourceWorkOrder),
    lunchTaskId,
    lunchWorkOrderId
  };
});

exports.getEmployeeUnassignedTaskCount = onCall({
  region: REGION,
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 30
}, async (request) => {
  assertAuthenticated(request);

  const dateScope = request.data?.dateScope && typeof request.data.dateScope === "object"
    ? request.data.dateScope
    : {};
  const from = normalizeOptionalIsoDate(dateScope.from, "Ngày bắt đầu");
  const to = normalizeOptionalIsoDate(dateScope.to, "Ngày kết thúc");

  if (from && to && from > to) {
    throw new HttpsError("invalid-argument", "Ngày bắt đầu không được lớn hơn ngày kết thúc.");
  }

  // Chỉ đọc các task còn ở trạng thái draft và chỉ lấy trường taskDate.
  // Cách này cho kết quả giống ô Chưa giao việc của Admin nhưng không mở
  // quyền đọc nội dung task nháp cho tài khoản Nhân viên.
  const snapshot = await db.collection("tasks")
    .where("status", "==", "draft")
    .select("taskDate")
    .get();

  let count = 0;
  snapshot.docs.forEach((item) => {
    const taskDate = typeof item.data()?.taskDate === "string"
      ? item.data().taskDate.trim()
      : "";

    // Giống isTaskInDateFilter ở giao diện Admin: khi không chọn giới hạn
    // ngày thì tính cả task thiếu taskDate; khi đã lọc ngày thì task thiếu
    // ngày không được tính.
    if (!from && !to) {
      count += 1;
      return;
    }

    if (!taskDate) return;
    if (from && taskDate < from) return;
    if (to && taskDate > to) return;
    count += 1;
  });

  return { count };
});


exports.getChatUsers = onCall({
  region: REGION,
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 20
}, async (request) => {
  const uid = assertAuthenticated(request);
  const currentUser = await db.doc(`users/${uid}`).get();
  if (!currentUser.exists) {
    throw new HttpsError("failed-precondition", "Tài khoản chưa có hồ sơ người dùng.");
  }

  const snapshot = await db.collection("users").limit(MAX_CHAT_USERS).get();
  const users = snapshot.docs
    .map(sanitizedChatProfile)
    .filter((item) => item.uid !== uid)
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  return { users };
});


exports.syncChatConversationIndex = onCall({
  region: REGION,
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 30
}, async (request) => {
  const uid = assertAuthenticated(request);
  const profileSnapshot = await db.doc(`users/${uid}`).get();
  if (!profileSnapshot.exists) {
    throw new HttpsError("failed-precondition", "Tài khoản chưa có hồ sơ người dùng.");
  }

  const profileRole = profileSnapshot.data()?.role;
  const includeAll = request.data?.includeAll === true && profileRole === "admin";
  const repairIndex = request.data?.repairIndex === true;

  const ownQuery = db.collection(CHAT_CONVERSATIONS_COLLECTION)
    .where("participantIds", "array-contains", uid)
    .limit(MAX_CHAT_CONVERSATIONS);

  const [ownSnapshot, allSnapshot] = await Promise.all([
    ownQuery.get(),
    includeAll
      ? db.collection(CHAT_CONVERSATIONS_COLLECTION).limit(MAX_CHAT_CONVERSATIONS).get()
      : Promise.resolve(null)
  ]);
  const resultSnapshot = allSnapshot || ownSnapshot;

  if (repairIndex) {
    await repairChatConversationIndex(uid, ownSnapshot.docs);
  }

  const conversations = resultSnapshot.docs
    .map((item) => serializeChatConversationSummary(item.data() || {}, item.id))
    .sort((a, b) => Number(b.lastMessageAt || b.updatedAt || 0) - Number(a.lastMessageAt || a.updatedAt || 0));

  return { conversations, indexed: ownSnapshot.size, mode: includeAll ? "admin" : "participant" };
});

exports.ensureChatConversation = onCall({
  region: REGION,
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 30
}, async (request) => {
  const senderUid = assertAuthenticated(request);
  const recipientUid = typeof request.data?.recipientUid === "string"
    ? request.data.recipientUid.trim()
    : "";

  if (!recipientUid || recipientUid === senderUid) {
    throw new HttpsError("invalid-argument", "Người nhận Chat không hợp lệ.");
  }

  const [senderSnap, recipientSnap] = await Promise.all([
    db.doc(`users/${senderUid}`).get(),
    db.doc(`users/${recipientUid}`).get()
  ]);
  if (!senderSnap.exists || !recipientSnap.exists) {
    throw new HttpsError("not-found", "Không tìm thấy tài khoản Chat.");
  }

  const sender = sanitizedChatProfile(senderSnap);
  const recipient = sanitizedChatProfile(recipientSnap);
  const conversationId = chatConversationId(senderUid, recipientUid);
  const conversationRef = db.doc(`${CHAT_CONVERSATIONS_COLLECTION}/${conversationId}`);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(conversationRef);
    const now = Timestamp.now();
    const previous = existing.exists ? (existing.data() || {}) : {};
    const conversationData = {
      id: conversationId,
      participantIds: [senderUid, recipientUid].sort(),
      participantNames: {
        ...(previous.participantNames || {}),
        [senderUid]: sender.name,
        [recipientUid]: recipient.name
      },
      participantRoles: {
        ...(previous.participantRoles || {}),
        [senderUid]: sender.role,
        [recipientUid]: recipient.role
      },
      createdAt: previous.createdAt || now,
      updatedAt: previous.updatedAt || now,
      lastMessage: typeof previous.lastMessage === "string" ? previous.lastMessage : "",
      lastMessageAt: previous.lastMessageAt || null,
      lastSenderId: typeof previous.lastSenderId === "string" ? previous.lastSenderId : "",
      lastMessageId: typeof previous.lastMessageId === "string" ? previous.lastMessageId : "",
      messageCount: Math.max(0, Number(previous.messageCount || 0)),
      unreadCounts: {
        ...(previous.unreadCounts || {}),
        [senderUid]: Math.max(0, Number(previous.unreadCounts?.[senderUid] || 0)),
        [recipientUid]: Math.max(0, Number(previous.unreadCounts?.[recipientUid] || 0))
      },
      readAtBy: {
        ...(previous.readAtBy || {}),
        [senderUid]: previous.readAtBy?.[senderUid] || now,
        [recipientUid]: previous.readAtBy?.[recipientUid] || now
      },
      lastReadMessageIdBy: {
        ...(previous.lastReadMessageIdBy || {}),
        [senderUid]: previous.lastReadMessageIdBy?.[senderUid] || "",
        [recipientUid]: previous.lastReadMessageIdBy?.[recipientUid] || ""
      }
    };

    transaction.set(conversationRef, conversationData, { merge: true });
    setChatConversationIndexesInTransaction(transaction, conversationData, conversationId);
  });

  return { conversationId };
});

exports.sendChatMessage = onCall({
  region: REGION,
  timeoutSeconds: 60,
  memory: "512MiB",
  maxInstances: 40
}, async (request) => {
  const senderUid = assertAuthenticated(request);
  const recipientUid = typeof request.data?.recipientUid === "string"
    ? request.data.recipientUid.trim()
    : "";
  const text = sanitizeChatText(request.data?.text);
  const clientMessageId = sanitizeChatClientMessageId(request.data?.clientMessageId);

  if (!recipientUid || recipientUid === senderUid) {
    throw new HttpsError("invalid-argument", "Người nhận tin nhắn không hợp lệ.");
  }

  const conversationId = chatConversationId(senderUid, recipientUid);
  if (!conversationId) {
    throw new HttpsError("invalid-argument", "Không tạo được mã cuộc trò chuyện.");
  }

  const attachments = await validateChatAttachments(request.data?.attachments, {
    conversationId,
    senderUid,
    clientMessageId
  });
  if (!text && !attachments.length) {
    throw new HttpsError("invalid-argument", "Tin nhắn phải có nội dung hoặc tệp đính kèm.");
  }

  const mediaSummary = chatAttachmentSummary(attachments);
  const previewText = text || mediaSummary;
  const messageType = attachments.length
    ? (attachments.length === 1 ? attachments[0].kind : "attachments")
    : "text";

  const messageId = crypto
    .createHash("sha256")
    .update(`${senderUid}:${clientMessageId}`)
    .digest("hex")
    .slice(0, 40);

  const senderRef = db.doc(`users/${senderUid}`);
  const recipientRef = db.doc(`users/${recipientUid}`);
  const conversationRef = db.doc(`${CHAT_CONVERSATIONS_COLLECTION}/${conversationId}`);
  const messageRef = conversationRef.collection("messages").doc(messageId);
  const notificationRef = db.collection("notifications").doc();
  const now = Timestamp.now();

  const result = await db.runTransaction(async (transaction) => {
    const [senderSnap, recipientSnap, conversationSnap, messageSnap] = await Promise.all([
      transaction.get(senderRef),
      transaction.get(recipientRef),
      transaction.get(conversationRef),
      transaction.get(messageRef)
    ]);

    if (!senderSnap.exists || !recipientSnap.exists) {
      throw new HttpsError("not-found", "Không tìm thấy tài khoản gửi hoặc nhận tin nhắn.");
    }

    if (messageSnap.exists) {
      return { duplicate: true, conversationId, messageId };
    }

    const sender = sanitizedChatProfile(senderSnap);
    const recipient = sanitizedChatProfile(recipientSnap);
    const previous = conversationSnap.exists ? conversationSnap.data() || {} : {};
    const previousUnread = previous.unreadCounts && typeof previous.unreadCounts === "object"
      ? previous.unreadCounts
      : {};
    const previousReadAt = previous.readAtBy && typeof previous.readAtBy === "object"
      ? previous.readAtBy
      : {};
    const previousLastRead = previous.lastReadMessageIdBy && typeof previous.lastReadMessageIdBy === "object"
      ? previous.lastReadMessageIdBy
      : {};

    const unreadCounts = {
      ...previousUnread,
      [senderUid]: 0,
      [recipientUid]: Math.max(0, Number(previousUnread[recipientUid] || 0)) + 1
    };
    const readAtBy = {
      ...previousReadAt,
      [senderUid]: now
    };
    const lastReadMessageIdBy = {
      ...previousLastRead,
      [senderUid]: messageId
    };
    const participantIds = [senderUid, recipientUid].sort();
    const participantNames = {
      ...(previous.participantNames || {}),
      [senderUid]: sender.name,
      [recipientUid]: recipient.name
    };
    const participantRoles = {
      ...(previous.participantRoles || {}),
      [senderUid]: sender.role,
      [recipientUid]: recipient.role
    };

    const conversationData = {
      id: conversationId,
      participantIds,
      participantNames,
      participantRoles,
      createdAt: conversationSnap.exists ? (previous.createdAt || now) : now,
      updatedAt: now,
      lastMessage: previewText.slice(0, 240),
      lastMessageAt: now,
      lastSenderId: senderUid,
      lastMessageId: messageId,
      messageCount: Math.max(0, Number(previous.messageCount || 0)) + 1,
      unreadCounts,
      readAtBy,
      lastReadMessageIdBy
    };

    transaction.set(conversationRef, conversationData, { merge: true });
    setChatConversationIndexesInTransaction(transaction, conversationData, conversationId);

    transaction.create(messageRef, {
      id: messageId,
      conversationId,
      senderId: senderUid,
      receiverId: recipientUid,
      senderName: sender.name,
      text,
      attachments,
      messageType,
      clientMessageId,
      createdAt: now
    });

    transaction.create(notificationRef, {
      id: notificationRef.id,
      recipientUid,
      type: "chat_message",
      title: `Tin nhắn từ ${sender.name}`,
      message: previewText.slice(0, 400),
      taskId: null,
      taskTitle: null,
      chatConversationId: conversationId,
      chatSenderUid: senderUid,
      actorUid: senderUid,
      actorName: sender.name,
      createdAt: now,
      readAt: null
    });

    return { duplicate: false, conversationId, messageId };
  });

  return result;
});

exports.discardChatMediaUpload = onCall({
  region: REGION,
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 20
}, async (request) => {
  const senderUid = assertAuthenticated(request);
  const recipientUid = typeof request.data?.recipientUid === "string"
    ? request.data.recipientUid.trim()
    : "";
  const uploadId = sanitizeChatClientMessageId(request.data?.uploadId);
  if (!recipientUid || recipientUid === senderUid) {
    throw new HttpsError("invalid-argument", "Người nhận Chat không hợp lệ.");
  }
  const conversationId = chatConversationId(senderUid, recipientUid);
  const messageId = crypto
    .createHash("sha256")
    .update(`${senderUid}:${uploadId}`)
    .digest("hex")
    .slice(0, 40);
  const messageSnapshot = await db.doc(
    `${CHAT_CONVERSATIONS_COLLECTION}/${conversationId}/messages/${messageId}`
  ).get();
  if (messageSnapshot.exists) {
    throw new HttpsError("failed-precondition", "Tin nhắn đã được lưu nên không thể xóa tệp đính kèm.");
  }

  const prefix = `chat-media/${conversationId}/${senderUid}/${uploadId}/`;
  await getAdminStorage().bucket().deleteFiles({ prefix, force: true });
  return { deleted: true };
});

exports.markChatConversationRead = onCall({
  region: REGION,
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 40
}, async (request) => {
  const uid = assertAuthenticated(request);
  const conversationId = typeof request.data?.conversationId === "string"
    ? request.data.conversationId.trim()
    : "";
  if (!conversationId || conversationId.length > 1200) {
    throw new HttpsError("invalid-argument", "Mã cuộc trò chuyện không hợp lệ.");
  }

  const conversationRef = db.doc(`${CHAT_CONVERSATIONS_COLLECTION}/${conversationId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(conversationRef);
    if (!snapshot.exists) return;
    const data = snapshot.data() || {};
    const participants = Array.isArray(data.participantIds) ? data.participantIds : [];
    if (!participants.includes(uid)) {
      throw new HttpsError("permission-denied", "Bạn không thuộc cuộc trò chuyện này.");
    }

    const unreadCounts = {
      ...(data.unreadCounts || {}),
      [uid]: 0
    };
    const readAtBy = {
      ...(data.readAtBy || {}),
      [uid]: Timestamp.now()
    };
    const lastReadMessageIdBy = {
      ...(data.lastReadMessageIdBy || {}),
      [uid]: data.lastMessageId || data.lastReadMessageIdBy?.[uid] || ""
    };

    const updatedConversationData = {
      ...data,
      id: data.id || conversationId,
      unreadCounts,
      readAtBy,
      lastReadMessageIdBy
    };

    transaction.update(conversationRef, {
      unreadCounts,
      readAtBy,
      lastReadMessageIdBy
    });
    setChatConversationIndexesInTransaction(transaction, updatedConversationData, conversationId);
  });

  return { read: true };
});

async function deleteQueryInBatches(queryRef, batchSize = 400) {
  let deleted = 0;
  while (true) {
    const snapshot = await queryRef.limit(batchSize).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < batchSize) break;
  }
  return deleted;
}

exports.deleteChatConversation = onCall({
  region: REGION,
  timeoutSeconds: 120,
  memory: "512MiB",
  maxInstances: 10
}, async (request) => {
  const adminUid = assertAuthenticated(request);
  const adminProfile = await assertAdmin(adminUid);
  const conversationId = typeof request.data?.conversationId === "string"
    ? request.data.conversationId.trim()
    : "";
  if (!conversationId || conversationId.length > 1200) {
    throw new HttpsError("invalid-argument", "Mã cuộc trò chuyện không hợp lệ.");
  }

  const conversationRef = db.doc(`${CHAT_CONVERSATIONS_COLLECTION}/${conversationId}`);
  const snapshot = await conversationRef.get();
  if (!snapshot.exists) return { deleted: true, messageCount: 0 };
  const data = snapshot.data() || {};
  const participants = Array.isArray(data.participantIds) ? data.participantIds : [];
  const deletedMessages = await deleteQueryInBatches(conversationRef.collection("messages"));
  const deletedNotifications = await deleteQueryInBatches(
    db.collection("notifications").where("chatConversationId", "==", conversationId)
  );
  let deletedMedia = false;
  try {
    await getAdminStorage().bucket().deleteFiles({
      prefix: `chat-media/${conversationId}/`,
      force: true
    });
    deletedMedia = true;
  } catch (error) {
    console.error("Không xóa được tệp Chat trong Storage:", conversationId, error);
  }
  const clearedAt = Timestamp.now();
  const unreadCounts = Object.fromEntries(participants.map((uid) => [uid, 0]));
  const readAtBy = Object.fromEntries(participants.map((uid) => [uid, clearedAt]));
  const lastReadMessageIdBy = Object.fromEntries(participants.map((uid) => [uid, ""]));

  // Giữ lại document phòng Chat rỗng để các thiết bị đang mở không bị mất quyền
  // đọc đột ngột. Chỉ lịch sử tin nhắn và thông báo liên quan bị xóa.
  const clearedConversationData = {
    ...data,
    id: data.id || conversationId,
    participantIds: participants,
    lastMessage: "",
    lastMessageAt: null,
    lastSenderId: "",
    lastMessageId: "",
    messageCount: 0,
    unreadCounts,
    readAtBy,
    lastReadMessageIdBy,
    updatedAt: clearedAt,
    historyClearedAt: clearedAt,
    historyClearedByUid: adminUid
  };

  await conversationRef.set(clearedConversationData, { merge: true });

  const indexBatch = db.batch();
  participants.forEach((uid) => {
    indexBatch.set(
      chatUserConversationRef(uid, conversationId),
      normalizeChatConversationSummary(clearedConversationData, conversationId),
      { merge: false }
    );
  });
  await indexBatch.commit();

  await db.collection(CHAT_DELETION_LOGS_COLLECTION).add({
    conversationId,
    participantIds: participants,
    participantNames: data.participantNames || {},
    deletedMessageCount: deletedMessages,
    deletedNotificationCount: deletedNotifications,
    deletedMedia,
    deletedByUid: adminUid,
    deletedByName: sanitizePushText(adminProfile?.name, adminProfile?.email || "Admin", 120),
    deletedAt: FieldValue.serverTimestamp()
  });

  return { deleted: true, messageCount: deletedMessages, deletedNotifications, deletedMedia };
});


exports.sendPushForNotification = onDocumentCreated({
  document: "notifications/{notificationId}",
  region: REGION,
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 20,
  retry: false
}, async (event) => {
  const notification = event.data?.data();
  if (!notification) return;

  const recipientUid = typeof notification.recipientUid === "string"
    ? notification.recipientUid.trim()
    : "";
  if (!recipientUid) return;

  const subscriptionSnapshot = await db
    .collection(PUSH_SUBSCRIPTIONS_COLLECTION)
    .where("uid", "==", recipientUid)
    .get();

  if (subscriptionSnapshot.empty) return;

  const title = sanitizePushText(notification.title, "Culao Task", 100);
  const body = sanitizePushText(notification.message, "Bạn có thông báo mới.", 400);
  const taskId = typeof notification.taskId === "string" ? notification.taskId : "";
  const chatConversationId = typeof notification.chatConversationId === "string"
    ? notification.chatConversationId
    : "";
  const chatPartnerUid = typeof notification.chatSenderUid === "string"
    ? notification.chatSenderUid
    : "";
  const notificationId = event.params.notificationId;
  const targetUrl = chatConversationId
    ? `${getWebAppBaseUrl()}?chatId=${encodeURIComponent(chatConversationId)}&chatWith=${encodeURIComponent(chatPartnerUid)}&notificationId=${encodeURIComponent(notificationId)}`
    : taskId
      ? `${getWebAppBaseUrl()}?taskId=${encodeURIComponent(taskId)}&notificationId=${encodeURIComponent(notificationId)}`
      : `${getWebAppBaseUrl()}?notificationId=${encodeURIComponent(notificationId)}`;

  const docs = subscriptionSnapshot.docs.filter((item) => item.data()?.active !== false);
  const tokens = docs.map((item) => item.data()?.token).filter(Boolean);
  if (!tokens.length) return;

  for (let start = 0; start < tokens.length; start += 500) {
    const tokenChunk = tokens.slice(start, start + 500);
    const docChunk = docs.slice(start, start + 500);
    const response = await getMessaging().sendEachForMulticast({
      tokens: tokenChunk,
      notification: {
        title,
        body
      },
      data: {
        title,
        body,
        taskId,
        chatConversationId,
        chatPartnerUid,
        notificationId,
        url: targetUrl
      },
      webpush: {
        headers: {
          Urgency: "high",
          TTL: "86400"
        },
        notification: {
          title,
          body,
          icon: `${getWebAppBaseUrl()}icon-192.png`,
          badge: `${getWebAppBaseUrl()}notification-badge.png`,
          tag: notificationId,
          renotify: false,
          data: {
            url: targetUrl,
            taskId,
            chatConversationId,
            chatPartnerUid,
            notificationId
          }
        },
        fcmOptions: {
          link: targetUrl
        }
      }
    });

    const staleDeletes = [];
    response.responses.forEach((item, index) => {
      if (item.success) return;
      const code = item.error?.code || "";
      console.warn("Không gửi được Web Push:", code, item.error?.message || "");
      if (
        code === "messaging/registration-token-not-registered"
        || code === "messaging/invalid-registration-token"
        || code === "messaging/invalid-argument"
      ) {
        staleDeletes.push(docChunk[index].ref.delete());
      }
    });

    if (staleDeletes.length) await Promise.allSettled(staleDeletes);
  }
});
