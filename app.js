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
  increment,
  limit,
  startAfter
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  getBlob,
  getBytes
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import {
  getMessaging,
  getToken as getMessagingToken,
  deleteToken as deleteMessagingToken,
  isSupported as isMessagingSupported,
  onMessage as onForegroundMessage
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";

// =========================
// Firebase init
// =========================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, "asia-southeast1");

const verifyWorkOrderSettingsPasswordCallable = httpsCallable(
  functions,
  "verifyWorkOrderSettingsPassword"
);
const saveWorkOrderControlSettingsCallable = httpsCallable(
  functions,
  "saveWorkOrderControlSettings"
);
const importGoogleCalendarEventsCallable = httpsCallable(
  functions,
  "importGoogleCalendarEvents"
);
const getGoogleCalendarImportSettingsCallable = httpsCallable(
  functions,
  "getGoogleCalendarImportSettings"
);
const registerWebPushTokenCallable = httpsCallable(
  functions,
  "registerWebPushToken"
);
const unregisterWebPushTokenCallable = httpsCallable(
  functions,
  "unregisterWebPushToken"
);
const getChatUsersCallable = httpsCallable(functions, "getChatUsers");
const ensureChatConversationCallable = httpsCallable(functions, "ensureChatConversation");
const sendChatMessageCallable = httpsCallable(functions, "sendChatMessage");
const markChatConversationReadCallable = httpsCallable(functions, "markChatConversationRead");
const deleteChatConversationCallable = httpsCallable(functions, "deleteChatConversation");
const discardChatMediaUploadCallable = httpsCallable(functions, "discardChatMediaUpload");
const syncChatConversationIndexCallable = httpsCallable(functions, "syncChatConversationIndex");

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
  supervisors: [],
  staffAccounts: [],
  tasks: [],
  workOrders: [],
  timeExtensionReasons: [],
  workTemplates: [],
  hotelDailyReports: [],
  notifications: [],
  knownNotificationIds: new Set(),
  notificationsReady: false,
  photoShareFile: null,
  photoShareTaskId: null,
  photoShareFileName: "",
  photoShareCacheKey: "",
  unsubs: [],
  editingWorkOrderId: null,
  editingWorkTemplateId: null,
  adminStatusFilter: "all",
  adminCompletedTypeFilter: "all",
  adminEmployeeFilter: "all",
  adminWorkOrderSearch: "",
  adminWorkOrderSuggestionIndex: -1,
  adminEmployeeStatusGroups: { free: [], assigned: [], hotel: [], lunch: [] },
  mobileEmployeeStatusExpanded: true,
  adminMobileFilterSheetOpen: false,
  adminHotelReportHygiene: "pending",
  adminHotelEndPetCount: "",
  adminHotelReportDrafts: {},
  employeeStatusFilter: "all",
  employeeCompletedTypeFilter: "all",
  employeeWorkOrderSearch: "",
  employeeWorkOrderSuggestionIndex: -1,
  employeeMobileFilterSheetOpen: false,
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
  extendReasonListExpanded: false,
  reassignTaskId: null,
  photoReportTaskId: null,
  photoReportReturnView: null,
  photoReportReturnTaskId: null,
  photoReportReturnScrollY: 0,
  photoViewerPhotos: [],
  photoViewerIndex: -1,
  photoReportSelectedKeys: new Set(),
  workPhotoManagerRowId: null,
  workPhotoManagerTaskId: null,
  workPhotoManagerSelectedKeys: new Set(),
  deletingEmployeeUid: null,
  editingSupervisorUid: null,
  mobileTaskDetailOverrides: new Map(),
  desktopTaskDetailOverrides: new Map(),
  desktopTaskViewMode: "compact",
  workOrderControlSettings: {
    maxExtendMinutes: null,
    preventWorkOrderDeletion: false,
    allowOverdueTimeExtension: false
  },
  workOrderControlSettingsReady: false,
  workOrderSettingsAuthorizationToken: "",
  workOrderSettingsAuthorizationExpiresAt: 0,
  pushServiceWorkerRegistration: null,
  pushMessaging: null,
  pushToken: "",
  pushTokenOwnerUid: "",
  pushForegroundUnsubscribe: null,
  pendingPushTaskId: "",
  pendingPushConversationId: "",
  pendingPushChatPartnerUid: "",
  chatUsers: [],
  chatConversations: [],
  chatConversationMap: new Map(),
  chatViewStates: new Map(),
  chatDirectoryOpen: false,
  chatDirectoryFilter: "all",
  chatSearchText: "",
  chatAdminSearchText: "",
  chatMobileConversationId: "",
  chatMobilePartnerUid: "",
  chatMobileReviewMode: false,
  chatOpenDesktopIds: [],
  chatReadRequestsInFlight: new Set(),
  chatUsersLoading: false,
  chatConversationFallbackTimer: null,
  chatConversationListenerWarningShown: false
};


// =========================
// Vai trò Giám sát và phân quyền
// =========================
const SUPERVISOR_PERMISSION_DEFINITIONS = [
  { key: "createWorkOrder", label: "Quyền tạo phiếu", description: "Tạo Phiếu công việc mới và lưu ở trạng thái Chưa giao việc.", primary: true },
  { key: "deleteWorkOrder", label: "Quyền xóa phiếu", description: "Xóa từng Phiếu công việc và dữ liệu liên quan trong phiếu.", primary: true },
  { key: "accessEmployeeManager", label: "Quyền truy cập trang Danh sách nhân viên", description: "Mở trang tài khoản nhân viên/giám sát. Nếu không có quyền quản lý tài khoản thì chỉ được xem.", primary: true },
  { key: "accessWorkTemplates", label: "Quyền truy cập trang Danh sách công việc", description: "Mở và xem danh sách công việc mẫu đã tạo.", primary: true },
  { key: "dispatchWorkOrder", label: "Giao Phiếu công việc", description: "Giao một Phiếu đang nháp hoặc tạo và giao ngay cho nhân viên." },
  { key: "editWorkOrder", label: "Sửa Phiếu chưa giao", description: "Sửa tên Phiếu, các dòng công việc, nhân viên, thời gian và yêu cầu ảnh trước khi giao." },
  { key: "reviewTasks", label: "Duyệt kết quả công việc", description: "Xác nhận hoàn thành, yêu cầu làm lại và kết thúc Phiếu nghỉ trưa." },
  { key: "reassignTasks", label: "Đổi nhân viên phụ trách", description: "Chuyển công việc sang nhân viên khác hoặc đưa về trạng thái Chờ chọn người." },
  { key: "extendTaskTime", label: "Thêm giờ công việc", description: "Cộng thêm thời gian và quản lý danh sách mục đích thêm giờ." },
  { key: "managePhotoRequirements", label: "Chỉnh số ảnh bắt buộc", description: "Thay đổi số lượng ảnh báo cáo bắt buộc của công việc chưa hoàn thành." },
  { key: "deleteReportPhotos", label: "Xóa ảnh báo cáo", description: "Xóa ảnh đã chọn khỏi Phiếu và xóa file thật trên Firebase Storage." },
  { key: "manageHotelReports", label: "Lưu Tổng kết Hotel", description: "Nhập vệ sinh, số lượng bé và lưu báo cáo Hotel theo ngày." },
  { key: "manageWorkTemplates", label: "Quản lý công việc mẫu", description: "Tạo, chỉnh sửa và xóa công việc trong trang Danh sách công việc." },
  { key: "exportData", label: "Xuất dữ liệu", description: "Tải bản sao lưu JSON của dữ liệu hệ thống." },
  { key: "importData", label: "Nhập dữ liệu", description: "Khôi phục hoặc ghi đè dữ liệu từ file JSON. Đây là quyền có mức ảnh hưởng cao." },
  { key: "deleteAllWorkOrders", label: "Xóa toàn bộ Phiếu", description: "Xóa toàn bộ Phiếu, công việc, ảnh báo cáo và thông báo liên quan. Đây là quyền nguy hiểm." },
  { key: "manageEmployeeAccounts", label: "Quản lý tài khoản nhân viên", description: "Tạo và xóa tài khoản Nhân viên. Không được tạo Giám sát hoặc tự thay đổi quyền Giám sát." }
];

const SUPERVISOR_PERMISSION_KEYS = SUPERVISOR_PERMISSION_DEFINITIONS.map((item) => item.key);

function isAdminProfile(profile = state.profile) {
  return profile?.role === "admin";
}

function isSupervisorProfile(profile = state.profile) {
  return profile?.role === "supervisor";
}

function isManagementProfile(profile = state.profile) {
  return isAdminProfile(profile) || isSupervisorProfile(profile);
}

function normalizeSupervisorPermissions(value = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return SUPERVISOR_PERMISSION_KEYS.reduce((result, key) => {
    result[key] = input[key] === true;
    return result;
  }, {});
}

function hasPermission(permissionKey, profile = state.profile) {
  if (isAdminProfile(profile)) return true;
  if (!isSupervisorProfile(profile)) return false;
  return normalizeSupervisorPermissions(profile?.permissions)[permissionKey] === true;
}

function getGrantedSupervisorPermissionCount(profile) {
  if (!isSupervisorProfile(profile)) return 0;
  const permissions = normalizeSupervisorPermissions(profile.permissions);
  return SUPERVISOR_PERMISSION_KEYS.filter((key) => permissions[key]).length;
}

function getRoleDisplayName(role) {
  if (role === "admin") return "Admin";
  if (role === "supervisor") return "Giám sát";
  return "Nhân viên";
}

// =========================
// Cài đặt chung cho Phiếu công việc
// =========================
const WORK_ORDER_CONTROL_SETTINGS_DOC_ID = "workOrderControls";
const WORK_ORDER_EXTENSION_LIMIT_OPTIONS = [10, 20, 30];

function normalizeWorkOrderControlSettings(value = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const parsedMax = Number(input.maxExtendMinutes);

  return {
    maxExtendMinutes: WORK_ORDER_EXTENSION_LIMIT_OPTIONS.includes(parsedMax) ? parsedMax : null,
    preventWorkOrderDeletion: input.preventWorkOrderDeletion === true,
    allowOverdueTimeExtension: input.allowOverdueTimeExtension === true
  };
}

function getWorkOrderControlSettings() {
  return normalizeWorkOrderControlSettings(state.workOrderControlSettings);
}

function getConfiguredMaxExtendMinutes() {
  return getWorkOrderControlSettings().maxExtendMinutes;
}

function isWorkOrderDeletionLocked() {
  return getWorkOrderControlSettings().preventWorkOrderDeletion === true;
}

function isOverdueTimeExtensionAllowed() {
  return getWorkOrderControlSettings().allowOverdueTimeExtension === true;
}

function getTaskExtensionTotalMinutes(task = {}) {
  const storedTotal = Number(task.timeExtensionTotalMinutes);
  if (Number.isFinite(storedTotal) && storedTotal >= 0) return storedTotal;

  const extensions = Array.isArray(task.timeExtensions) ? task.timeExtensions : [];
  return extensions.reduce((sum, item) => {
    const minutes = Number(item?.minutes || 0);
    return sum + (Number.isFinite(minutes) && minutes > 0 ? minutes : 0);
  }, 0);
}

function getRemainingExtendMinutes(task = {}) {
  const maxMinutes = getConfiguredMaxExtendMinutes();
  if (!maxMinutes) return null;
  return Math.max(0, maxMinutes - getTaskExtensionTotalMinutes(task));
}

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
  mobileTopbarMenuBtn: $("#mobileTopbarMenuBtn"),
  mobileTopbarMenu: $("#mobileTopbarMenu"),
  mobileNotificationPermissionBtn: $("#mobileNotificationPermissionBtn"),
  mobileLogoutBtn: $("#mobileLogoutBtn"),
  createEmployeeForm: $("#createEmployeeForm"),
  employeeList: $("#employeeList"),
  employeeSearch: $("#employeeSearch"),
  employeeRoleFilter: $("#employeeRoleFilter"),
  employeeStats: $("#employeeStats"),
  createStaffAccountPanel: $("#createStaffAccountPanel"),
  staffAccountRole: $("#staffAccountRole"),
  createSupervisorPermissions: $("#createSupervisorPermissions"),
  createSupervisorPermissionList: $("#createSupervisorPermissionList"),
  selectAllCreateSupervisorPermissions: $("#selectAllCreateSupervisorPermissions"),
  clearCreateSupervisorPermissions: $("#clearCreateSupervisorPermissions"),
  supervisorPermissionModal: $("#supervisorPermissionModal"),
  supervisorPermissionModalAccount: $("#supervisorPermissionModalAccount"),
  editSupervisorPermissionList: $("#editSupervisorPermissionList"),
  selectAllEditSupervisorPermissions: $("#selectAllEditSupervisorPermissions"),
  clearEditSupervisorPermissions: $("#clearEditSupervisorPermissions"),
  saveSupervisorPermissionsBtn: $("#saveSupervisorPermissionsBtn"),
  openTaskModalBtn: $("#openTaskModalBtn"),
  floatingCreateTaskBtn: $("#floatingCreateTaskBtn"),
  openWorkTemplatePageBtn: $("#openWorkTemplatePageBtn"),
  openEmployeeManagerPageBtn: $("#openEmployeeManagerPageBtn"),
  exportDataBtn: $("#exportDataBtn"),
  importDataBtn: $("#importDataBtn"),
  importDataInput: $("#importDataInput"),
  openGoogleCalendarImportBtn: $("#openGoogleCalendarImportBtn"),
  openGoogleCalendarImportMobileBtn: $("#openGoogleCalendarImportMobileBtn"),
  googleCalendarImportModal: $("#googleCalendarImportModal"),
  googleCalendarImportForm: $("#googleCalendarImportForm"),
  googleCalendarIdInput: $("#googleCalendarIdInput"),
  googleCalendarApiKeyInput: $("#googleCalendarApiKeyInput"),
  googleCalendarRangeMode: $("#googleCalendarRangeMode"),
  googleCalendarFromDate: $("#googleCalendarFromDate"),
  googleCalendarToDate: $("#googleCalendarToDate"),
  googleCalendarCustomRange: $("#googleCalendarCustomRange"),
  googleCalendarSavedStatus: $("#googleCalendarSavedStatus"),
  syncGoogleCalendarBtn: $("#syncGoogleCalendarBtn"),
  mobileDataActionsGroup: $("#mobileDataActionsGroup"),
  mobileDataMenuBtn: $("#mobileDataMenuBtn"),
  mobileDataMenu: $("#mobileDataMenu"),
  managementDashboardEyebrow: $("#managementDashboardEyebrow"),
  supervisorPermissionBanner: $("#supervisorPermissionBanner"),
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
  openWorkOrderSettingsBtn: $("#openWorkOrderSettingsBtn"),
  workOrderSettingsPasswordModal: $("#workOrderSettingsPasswordModal"),
  workOrderSettingsPasswordForm: $("#workOrderSettingsPasswordForm"),
  workOrderSettingsPasswordInput: $("#workOrderSettingsPasswordInput"),
  workOrderSettingsPasswordError: $("#workOrderSettingsPasswordError"),
  verifyWorkOrderSettingsPasswordBtn: $("#verifyWorkOrderSettingsPasswordBtn"),
  toggleWorkOrderSettingsPasswordBtn: $("#toggleWorkOrderSettingsPasswordBtn"),
  workOrderSettingsModal: $("#workOrderSettingsModal"),
  workOrderSettingsForm: $("#workOrderSettingsForm"),
  enableMaxExtendMinutes: $("#enableMaxExtendMinutes"),
  maxExtendMinutesOptions: $("#maxExtendMinutesOptions"),
  preventWorkOrderDeletion: $("#preventWorkOrderDeletion"),
  allowOverdueTimeExtension: $("#allowOverdueTimeExtension"),
  saveWorkOrderSettingsBtn: $("#saveWorkOrderSettingsBtn"),
  extendTimeLimitNote: $("#extendTimeLimitNote"),
  destructiveConfirmModal: $("#destructiveConfirmModal"),
  destructiveConfirmBackdrop: $("#destructiveConfirmBackdrop"),
  destructiveConfirmTitle: $("#destructiveConfirmTitle"),
  destructiveConfirmMessage: $("#destructiveConfirmMessage"),
  destructiveConfirmDetails: $("#destructiveConfirmDetails"),
  destructiveConfirmCancelBtn: $("#destructiveConfirmCancelBtn"),
  destructiveConfirmAcceptBtn: $("#destructiveConfirmAcceptBtn"),
  mobileTaskPanelMenuBtn: $("#mobileTaskPanelMenuBtn"),
  mobileTaskPanelMenu: $("#mobileTaskPanelMenu"),
  adminMobileEmployeeStatusToggle: $("#adminMobileEmployeeStatusToggle"),
  adminMobileEmployeeStatusOverview: $("#adminMobileEmployeeStatusOverview"),
  adminMobileEmployeeStatusChevron: $("#adminMobileEmployeeStatusChevron"),
  adminEmployeeStatusDetailBackdrop: $("#adminEmployeeStatusDetailBackdrop"),
  adminEmployeeStatusDetailSheet: $("#adminEmployeeStatusDetailSheet"),
  adminEmployeeStatusDetailTitle: $("#adminEmployeeStatusDetailTitle"),
  adminEmployeeStatusDetailList: $("#adminEmployeeStatusDetailList"),
  adminEmployeeStatusDetailCloseBtn: $("#adminEmployeeStatusDetailCloseBtn"),
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
  adminWorkOrderSearch: $("#adminWorkOrderSearch"),
  adminClearWorkOrderSearch: $("#adminClearWorkOrderSearch"),
  adminWorkOrderSuggestions: $("#adminWorkOrderSuggestions"),
  adminWorkOrderSearchSummary: $("#adminWorkOrderSearchSummary"),
  adminMobileFilterModalRoot: $("#adminMobileFilterModalRoot"),
  adminMobileFilterBackdrop: $("#adminMobileFilterBackdrop"),
  adminMobileFilterSheet: $("#adminMobileFilterSheet"),
  adminMobileFilterOpenBtn: $("#adminMobileFilterOpenBtn"),
  adminMobileFilterCount: $("#adminMobileFilterCount"),
  adminMobileFilterCloseBtn: $("#adminMobileFilterCloseBtn"),
  adminMobileFilterResetBtn: $("#adminMobileFilterResetBtn"),
  adminMobileFilterApplyBtn: $("#adminMobileFilterApplyBtn"),
  adminActiveFilterChips: $("#adminActiveFilterChips"),
  adminMobileResultSummary: $("#adminMobileResultSummary"),
  adminEmployeeStatusSummary: $("#adminEmployeeStatusSummary"),
  adminTaskList: $("#adminTaskList"),
  desktopCompactViewBtn: $("#desktopCompactViewBtn"),
  desktopDetailedViewBtn: $("#desktopDetailedViewBtn"),
  employeeStatusFilter: $("#employeeStatusFilter"),
  employeeCompletedTypeFilter: $("#employeeCompletedTypeFilter"),
  employeeCompletedTypeReport: $("#employeeCompletedTypeReport"),
  employeeDateMode: $("#employeeDateMode"),
  employeeSingleDate: $("#employeeSingleDate"),
  employeeDateFrom: $("#employeeDateFrom"),
  employeeDateTo: $("#employeeDateTo"),
  employeeClearDateFilter: $("#employeeClearDateFilter"),
  employeeDateSummary: $("#employeeDateSummary"),
  employeeWorkOrderSearch: $("#employeeWorkOrderSearch"),
  employeeClearWorkOrderSearch: $("#employeeClearWorkOrderSearch"),
  employeeWorkOrderSuggestions: $("#employeeWorkOrderSuggestions"),
  employeeWorkOrderSearchSummary: $("#employeeWorkOrderSearchSummary"),
  employeeMobileFilterModalRoot: $("#employeeMobileFilterModalRoot"),
  employeeMobileFilterBackdrop: $("#employeeMobileFilterBackdrop"),
  employeeMobileFilterSheet: $("#employeeMobileFilterSheet"),
  employeeMobileFilterOpenBtn: $("#employeeMobileFilterOpenBtn"),
  employeeMobileFilterCount: $("#employeeMobileFilterCount"),
  employeeMobileFilterCloseBtn: $("#employeeMobileFilterCloseBtn"),
  employeeMobileFilterResetBtn: $("#employeeMobileFilterResetBtn"),
  employeeMobileFilterApplyBtn: $("#employeeMobileFilterApplyBtn"),
  employeeActiveFilterChips: $("#employeeActiveFilterChips"),
  employeeMobileResultSummary: $("#employeeMobileResultSummary"),
  employeeUnassignedWorkOrderCard: $("#employeeUnassignedWorkOrderCard"),
  employeeUnassignedWorkOrderCount: $("#employeeUnassignedWorkOrderCount"),
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
  chatToggleBtn: $("#chatToggleBtn"),
  chatUnreadBadge: $("#chatUnreadBadge"),
  chatDirectoryPanel: $("#chatDirectoryPanel"),
  chatDirectoryView: $("#chatDirectoryView"),
  chatDirectorySearch: $("#chatDirectorySearch"),
  chatDirectoryList: $("#chatDirectoryList"),
  chatDirectoryAllTab: $("#chatDirectoryAllTab"),
  chatDirectoryUnreadTab: $("#chatDirectoryUnreadTab"),
  chatDirectoryCloseBtn: $("#chatDirectoryCloseBtn"),
  openChatAdminBtn: $("#openChatAdminBtn"),
  chatMobileConversationView: $("#chatMobileConversationView"),
  chatMobileBackBtn: $("#chatMobileBackBtn"),
  chatMobileCloseBtn: $("#chatMobileCloseBtn"),
  chatMobileTitle: $("#chatMobileTitle"),
  chatMobileSubtitle: $("#chatMobileSubtitle"),
  chatMobileMessages: $("#chatMobileMessages"),
  chatMobileLoadMoreBtn: $("#chatMobileLoadMoreBtn"),
  chatMobileComposer: $("#chatMobileComposer"),
  chatMobileInput: $("#chatMobileInput"),
  chatMobileAttachBtn: $("#chatMobileAttachBtn"),
  chatMobileFileInput: $("#chatMobileFileInput"),
  chatMiniContainer: $("#chatMiniContainer"),
  chatMediaViewer: $("#chatMediaViewer"),
  chatMediaViewerCloseBtn: $("#chatMediaViewerCloseBtn"),
  chatMediaViewerContent: $("#chatMediaViewerContent"),
  chatAdminModal: $("#chatAdminModal"),
  chatAdminCloseBtn: $("#chatAdminCloseBtn"),
  chatAdminSearch: $("#chatAdminSearch"),
  chatAdminConversationList: $("#chatAdminConversationList"),
  extendTimeModal: $("#extendTimeModal"),
  extendTimeForm: $("#extendTimeForm"),
  extendTimeTaskTitle: $("#extendTimeTaskTitle"),
  extendMinutes: $("#extendMinutes"),
  extendReasonSelect: $("#extendReasonSelect"),
  newExtendReason: $("#newExtendReason"),
  addExtendReasonBtn: $("#addExtendReasonBtn"),
  extendReasonList: $("#extendReasonList"),
  extendReasonListToggle: $("#extendReasonListToggle"),
  extendReasonCount: $("#extendReasonCount"),
  confirmExtendTimeBtn: $("#confirmExtendTimeBtn"),
  reassignEmployeeModal: $("#reassignEmployeeModal"),
  reassignEmployeeForm: $("#reassignEmployeeForm"),
  reassignTaskTitle: $("#reassignTaskTitle"),
  reassignCurrentEmployee: $("#reassignCurrentEmployee"),
  reassignEmployeeSelect: $("#reassignEmployeeSelect"),
  confirmReassignEmployeeBtn: $("#confirmReassignEmployeeBtn"),
  photoRequiredCheckbox: $("#photoRequiredCheckbox"),
  requiredPhotoCount: $("#requiredPhotoCount"),
  photoReportView: $("#photoReportView"),
  backFromPhotoReportBtn: $("#backFromPhotoReportBtn"),
  photoReportModal: $("#photoReportModal"),
  photoReportTaskTitle: $("#photoReportTaskTitle"),
  photoReportSummary: $("#photoReportSummary"),
  photoReportGrid: $("#photoReportGrid"),
  photoSelectionToolbar: $("#photoSelectionToolbar"),
  photoSelectionCount: $("#photoSelectionCount"),
  photoSelectAllBtn: $("#photoSelectAllBtn"),
  photoClearSelectionBtn: $("#photoClearSelectionBtn"),
  downloadSelectedPhotosBtn: $("#downloadSelectedPhotosBtn"),
  shareSelectedPhotosBtn: $("#shareSelectedPhotosBtn"),
  deleteSelectedPhotosBtn: $("#deleteSelectedPhotosBtn"),
  downloadPhotoZipBtn: $("#downloadPhotoZipBtn"),
  sharePhotoReportBtn: $("#sharePhotoReportBtn"),
  photoViewer: $("#photoViewer"),
  photoViewerImage: $("#photoViewerImage"),
  photoViewerName: $("#photoViewerName"),
  photoViewerMeta: $("#photoViewerMeta"),
  photoViewerCounter: $("#photoViewerCounter"),
  photoViewerStage: $("#photoViewerStage"),
  photoViewerPrevBtn: $("#photoViewerPrevBtn"),
  photoViewerNextBtn: $("#photoViewerNextBtn"),
  photoViewerCloseBtn: $("#photoViewerCloseBtn"),
  photoViewerOpenOriginal: $("#photoViewerOpenOriginal")
};

// =========================
// Popup xác nhận thao tác xóa nguy hiểm
// =========================
let destructiveConfirmResolver = null;
let destructiveConfirmPreviousFocus = null;

function isDestructiveConfirmOpen() {
  return Boolean(
    els.destructiveConfirmModal
    && !els.destructiveConfirmModal.classList.contains("hidden")
  );
}

function closeDestructiveConfirmModal(confirmed = false) {
  if (!isDestructiveConfirmOpen()) return;

  els.destructiveConfirmModal.classList.add("hidden");
  els.destructiveConfirmModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("destructive-confirm-open");

  const resolver = destructiveConfirmResolver;
  destructiveConfirmResolver = null;

  const previousFocus = destructiveConfirmPreviousFocus;
  destructiveConfirmPreviousFocus = null;

  if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
    requestAnimationFrame(() => previousFocus.focus({ preventScroll: true }));
  }

  resolver?.(Boolean(confirmed));
}

function requestDestructiveConfirmation({
  title = "Xác nhận xóa",
  message = "Bạn có chắc chắn muốn thực hiện thao tác này không?",
  details = "Hành động này không thể hoàn tác.",
  confirmLabel = "Xóa",
  cancelLabel = "Hủy"
} = {}) {
  // Fallback an toàn nếu HTML của popup chưa được tải đúng phiên bản.
  if (!els.destructiveConfirmModal || !els.destructiveConfirmAcceptBtn) {
    return Promise.resolve(window.confirm(`${message}\n\n${details}`));
  }

  if (isDestructiveConfirmOpen()) {
    closeDestructiveConfirmModal(false);
  }

  destructiveConfirmPreviousFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  if (els.destructiveConfirmTitle) els.destructiveConfirmTitle.textContent = title;
  if (els.destructiveConfirmMessage) els.destructiveConfirmMessage.textContent = message;
  if (els.destructiveConfirmDetails) {
    els.destructiveConfirmDetails.textContent = details;
    els.destructiveConfirmDetails.classList.toggle("hidden", !String(details || "").trim());
  }
  if (els.destructiveConfirmAcceptBtn) els.destructiveConfirmAcceptBtn.textContent = confirmLabel;
  if (els.destructiveConfirmCancelBtn) els.destructiveConfirmCancelBtn.textContent = cancelLabel;

  els.destructiveConfirmModal.classList.remove("hidden");
  els.destructiveConfirmModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("destructive-confirm-open");

  return new Promise((resolve) => {
    destructiveConfirmResolver = resolve;
    requestAnimationFrame(() => {
      els.destructiveConfirmCancelBtn?.focus({ preventScroll: true });
    });
  });
}

els.destructiveConfirmCancelBtn?.addEventListener("click", () => {
  closeDestructiveConfirmModal(false);
});

els.destructiveConfirmAcceptBtn?.addEventListener("click", () => {
  closeDestructiveConfirmModal(true);
});

els.destructiveConfirmBackdrop?.addEventListener("click", () => {
  closeDestructiveConfirmModal(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !isDestructiveConfirmOpen()) return;
  event.preventDefault();
  closeDestructiveConfirmModal(false);
});

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

function requirePermission(permissionKey, deniedMessage = "Tài khoản của bạn chưa được Admin cấp quyền thực hiện chức năng này.") {
  if (hasPermission(permissionKey)) return true;
  toast(deniedMessage, "error");
  return false;
}

function timestampToDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;

  // Dữ liệu Chat có thể đến từ Firestore listener (Timestamp) hoặc từ
  // Cloud Function dự phòng (milliseconds / ISO string). Chuẩn hóa tất cả
  // về Date để giao diện sắp xếp và hiển thị thời gian nhất quán.
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) {
    const milliseconds = Number(value.seconds) * 1000
      + Math.floor(Number(value.nanoseconds || 0) / 1e6);
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

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
function makeUniqueZipFileName(existingNames, fileName = "image") {
  const safeName = sanitizeStorageFileName(fileName || "image");
  const dotIndex = safeName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const extension = dotIndex > 0 ? safeName.slice(dotIndex) : ".jpg";
  let candidate = `${baseName}${extension}`;
  let counter = 2;

  while (existingNames.has(candidate.toLowerCase())) {
    candidate = `${baseName}-${counter}${extension}`;
    counter += 1;
  }

  existingNames.add(candidate.toLowerCase());
  return candidate;
}

function downloadBlobFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const PHOTO_UPLOAD_MAX_DIMENSION = 1600;
const PHOTO_UPLOAD_JPEG_QUALITY = 0.82;
const PHOTO_UPLOAD_MIN_OPTIMIZE_BYTES = 350 * 1024;

const PHOTO_CAPTURE_BEFORE_ASSIGNMENT_TOLERANCE_MS = 2 * 60 * 1000;

function readExifAscii(view, offset, length) {
  if (!Number.isFinite(offset) || !Number.isFinite(length) || offset < 0 || length <= 0 || offset + length > view.byteLength) return "";
  let value = "";
  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(offset + index);
    if (!code) break;
    value += String.fromCharCode(code);
  }
  return value.trim();
}

function parseExifDateText(value = "") {
  const match = String(value).trim().match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isNaN(date.getTime()) ? null : date;
}

function readTiffIfdEntries(view, tiffStart, ifdOffset, littleEndian) {
  const absoluteOffset = tiffStart + ifdOffset;
  if (absoluteOffset < 0 || absoluteOffset + 2 > view.byteLength) return [];
  const count = view.getUint16(absoluteOffset, littleEndian);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const entryOffset = absoluteOffset + 2 + index * 12;
    if (entryOffset + 12 > view.byteLength) break;
    entries.push({
      tag: view.getUint16(entryOffset, littleEndian),
      type: view.getUint16(entryOffset + 2, littleEndian),
      count: view.getUint32(entryOffset + 4, littleEndian),
      valueOffset: entryOffset + 8,
      rawValue: view.getUint32(entryOffset + 8, littleEndian)
    });
  }
  return entries;
}

function readExifEntryAscii(view, tiffStart, entry, littleEndian) {
  if (!entry || entry.type !== 2 || !entry.count) return "";
  const dataOffset = entry.count <= 4 ? entry.valueOffset : tiffStart + entry.rawValue;
  return readExifAscii(view, dataOffset, entry.count);
}

async function readPhotoCapturedAt(file) {
  const fallbackDate = Number(file?.lastModified || 0) > 946684800000
    ? new Date(Number(file.lastModified))
    : null;

  try {
    const type = String(file?.type || "").toLowerCase();
    const name = String(file?.name || "").toLowerCase();
    const canContainJpegExif = type.includes("jpeg") || type.includes("jpg") || /\.jpe?g$/i.test(name);
    if (!canContainJpegExif) {
      return fallbackDate && !Number.isNaN(fallbackDate.getTime())
        ? { date: fallbackDate, source: "file_last_modified" }
        : { date: null, source: "unavailable" };
    }

    const buffer = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) throw new Error("Not JPEG");

    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      const segmentLength = view.getUint16(offset + 2, false);
      if (segmentLength < 2 || offset + 2 + segmentLength > view.byteLength) break;

      if (marker === 0xe1 && segmentLength >= 10 && readExifAscii(view, offset + 4, 6) === "Exif") {
        const tiffStart = offset + 10;
        if (tiffStart + 8 > view.byteLength) break;
        const byteOrder = view.getUint16(tiffStart, false);
        const littleEndian = byteOrder === 0x4949;
        if (!littleEndian && byteOrder !== 0x4d4d) break;
        if (view.getUint16(tiffStart + 2, littleEndian) !== 42) break;

        const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
        const ifd0Entries = readTiffIfdEntries(view, tiffStart, ifd0Offset, littleEndian);
        const exifPointer = ifd0Entries.find((entry) => entry.tag === 0x8769);
        const exifEntries = exifPointer
          ? readTiffIfdEntries(view, tiffStart, exifPointer.rawValue, littleEndian)
          : [];

        const dateEntry = exifEntries.find((entry) => entry.tag === 0x9003)
          || exifEntries.find((entry) => entry.tag === 0x9004)
          || ifd0Entries.find((entry) => entry.tag === 0x0132);
        const exifDate = parseExifDateText(readExifEntryAscii(view, tiffStart, dateEntry, littleEndian));
        if (exifDate) return { date: exifDate, source: "exif" };
        break;
      }

      offset += 2 + segmentLength;
    }
  } catch (error) {
    console.warn("Không đọc được EXIF của ảnh:", file?.name, error);
  }

  return fallbackDate && !Number.isNaN(fallbackDate.getTime())
    ? { date: fallbackDate, source: "file_last_modified" }
    : { date: null, source: "unavailable" };
}

function getTaskAssignmentDate(task) {
  return timestampToDate(task?.dispatchedAt) || timestampToDate(task?.createdAt);
}

function isPhotoCapturedBeforeTaskAssignment(capturedAt, task) {
  const capturedDate = capturedAt instanceof Date ? capturedAt : timestampToDate(capturedAt);
  const assignmentDate = getTaskAssignmentDate(task);
  if (!capturedDate || !assignmentDate) return false;
  return capturedDate.getTime() + PHOTO_CAPTURE_BEFORE_ASSIGNMENT_TOLERANCE_MS < assignmentDate.getTime();
}

function isPreAssignmentPhoto(photo) {
  return Boolean(photo?.capturedBeforeAssignment || photo?.takenBeforeDispatch);
}

function getOptimizedImageFileName(fileName = "image.jpg") {
  const safeName = sanitizeStorageFileName(fileName || "image.jpg");
  const dotIndex = safeName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  return `${baseName || "image"}.jpg`;
}

function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Không đọc được hình “${file.name}”.`));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas, type = "image/jpeg", quality = PHOTO_UPLOAD_JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Không tối ưu được hình ảnh."));
    }, type, quality);
  });
}

async function optimizePhotoFileForUpload(file) {
  const type = String(file?.type || "").toLowerCase();

  // GIF thường có animation; SVG/HEIC có thể không vẽ lên canvas ổn định trên mọi trình duyệt.
  if (!type.startsWith("image/") || type.includes("gif") || type.includes("svg") || type.includes("heic")) {
    return {
      file,
      optimized: false,
      originalName: file.name,
      originalSize: Number(file.size || 0),
      width: 0,
      height: 0
    };
  }

  // Hình quá nhỏ không cần tối ưu, tránh giảm chất lượng không cần thiết.
  if (Number(file.size || 0) < PHOTO_UPLOAD_MIN_OPTIMIZE_BYTES) {
    return {
      file,
      optimized: false,
      originalName: file.name,
      originalSize: Number(file.size || 0),
      width: 0,
      height: 0
    };
  }

  const image = await loadImageElementFromFile(file);
  const width = image.naturalWidth || image.width || 0;
  const height = image.naturalHeight || image.height || 0;

  if (!width || !height) {
    return {
      file,
      optimized: false,
      originalName: file.name,
      originalSize: Number(file.size || 0),
      width,
      height
    };
  }

  const scale = Math.min(1, PHOTO_UPLOAD_MAX_DIMENSION / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await canvasToBlob(canvas, "image/jpeg", PHOTO_UPLOAD_JPEG_QUALITY);

  // Chỉ dùng bản tối ưu nếu thật sự nhỏ hơn bản gốc.
  if (!blob || blob.size >= Number(file.size || 0)) {
    return {
      file,
      optimized: false,
      originalName: file.name,
      originalSize: Number(file.size || 0),
      width,
      height
    };
  }

  const optimizedName = getOptimizedImageFileName(file.name);
  const optimizedFile = new File([blob], optimizedName, {
    type: "image/jpeg",
    lastModified: Date.now()
  });

  return {
    file: optimizedFile,
    optimized: true,
    originalName: file.name,
    originalSize: Number(file.size || 0),
    width: targetWidth,
    height: targetHeight
  };
}

function getOptimizationSummary(results = []) {
  const optimizedItems = results.filter((item) => item?.optimized);
  const originalTotal = results.reduce((sum, item) => sum + Number(item?.originalSize || item?.file?.size || 0), 0);
  const finalTotal = results.reduce((sum, item) => sum + Number(item?.file?.size || 0), 0);
  const savedBytes = Math.max(0, originalTotal - finalTotal);

  return {
    optimizedCount: optimizedItems.length,
    originalTotal,
    finalTotal,
    savedBytes
  };
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

function isShipTask(task) {
  return Boolean(task?.isShip);
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

function yesterdayInputValue() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return toLocalDateInputValue(date);
}

function getMonthDateRange(monthOffset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);

  return {
    from: toLocalDateInputValue(start),
    to: toLocalDateInputValue(end)
  };
}

function getDateRangeByMode(mode) {
  if (mode === "today") {
    const today = todayInputValue();
    return { from: today, to: today };
  }

  if (mode === "yesterday") {
    const yesterday = yesterdayInputValue();
    return { from: yesterday, to: yesterday };
  }

  if (mode === "current_month") return getMonthDateRange(0);
  if (mode === "previous_month") return getMonthDateRange(-1);

  return { from: "", to: "" };
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
    ship: "Đang ship",
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
  if (isShipTask(task)) return "ship";

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
    ship: "is-ship",
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
// PWA + Web Push notifications
// =========================
const PUSH_TOKEN_STORAGE_KEY = "shopTaskWebPushToken";
const PUSH_TOKEN_OWNER_STORAGE_KEY = "shopTaskWebPushTokenOwnerUid";
let serviceWorkerRegistrationPromise = null;

registerServiceWorker();
updateNotificationPermissionButton();

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  if (serviceWorkerRegistrationPromise) return serviceWorkerRegistrationPromise;

  serviceWorkerRegistrationPromise = navigator.serviceWorker
    .register("./sw.js", { scope: "./" })
    .then(async (registration) => {
      state.pushServiceWorkerRegistration = registration;

      try {
        await registration.update();
      } catch (_) {
        // Trình duyệt có thể giới hạn kiểm tra cập nhật Service Worker. Không ảnh hưởng đăng ký hiện tại.
      }

      return registration;
    })
    .catch((error) => {
      serviceWorkerRegistrationPromise = null;
      console.warn("Không đăng ký được service worker:", error);
      return null;
    });

  return serviceWorkerRegistrationPromise;
}

function notificationSupported() {
  return "Notification" in window && "serviceWorker" in navigator;
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneWebApp() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.navigator.standalone === true;
}

function getConfiguredVapidKey() {
  const value = firebaseConfig?.messagingVapidKey
    || firebaseConfig?.vapidKey
    || "";
  return typeof value === "string" ? value.trim() : "";
}

async function getPushMessaging() {
  if (state.pushMessaging) return state.pushMessaging;
  if (!(await isMessagingSupported())) return null;

  state.pushMessaging = getMessaging(app);

  if (!state.pushForegroundUnsubscribe) {
    state.pushForegroundUnsubscribe = onForegroundMessage(state.pushMessaging, (payload) => {
      // Firestore listener hiện tại chịu trách nhiệm toast/thông báo khi app đang mở.
      // Không tự bật thêm notification ở đây để tránh trùng lặp.
      console.debug("Đã nhận FCM khi app đang mở:", payload?.messageId || payload);
    });
  }

  return state.pushMessaging;
}

function updateNotificationPermissionButton() {
  const desktopButton = els.enableNotificationsBtn;
  const mobileButton = els.mobileNotificationPermissionBtn;
  if (!desktopButton && !mobileButton) return;

  let desktopText = "Bật thông báo";
  let mobileText = "🔔 Bật thông báo";
  let disabled = false;
  let statusClass = "";

  if (!notificationSupported()) {
    desktopText = "Trình duyệt không hỗ trợ thông báo";
    mobileText = "🔕 Không hỗ trợ thông báo";
    disabled = true;
  } else if (Notification.permission === "granted" && state.pushToken) {
    desktopText = "Đã bật thông báo nền";
    mobileText = "🔔 Đã bật thông báo nền";
    statusClass = "is-enabled";
  } else if (Notification.permission === "granted") {
    desktopText = "Hoàn tất bật thông báo";
    mobileText = "🔔 Hoàn tất bật thông báo";
  } else if (Notification.permission === "denied") {
    desktopText = "Thông báo đang bị chặn";
    mobileText = "🔕 Thông báo đang bị chặn";
    statusClass = "is-blocked";
  }

  [desktopButton, mobileButton].filter(Boolean).forEach((button) => {
    button.classList.remove("is-enabled", "is-blocked");
    if (statusClass) button.classList.add(statusClass);
    button.disabled = disabled;
  });

  if (desktopButton) desktopButton.textContent = desktopText;
  if (mobileButton) mobileButton.textContent = mobileText;
}

async function registerCurrentDeviceForPush({ showSuccessToast = false } = {}) {
  if (!state.user || Notification.permission !== "granted") return false;

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error("Không đăng ký được Service Worker nhận thông báo nền.");
  }

  const messaging = await getPushMessaging();
  if (!messaging) {
    throw new Error("Thiết bị hoặc trình duyệt này chưa hỗ trợ Firebase Cloud Messaging.");
  }

  const tokenOptions = { serviceWorkerRegistration: registration };
  const vapidKey = getConfiguredVapidKey();
  if (vapidKey) tokenOptions.vapidKey = vapidKey;

  const token = await getMessagingToken(messaging, tokenOptions);
  if (!token) {
    throw new Error("Không lấy được mã nhận thông báo của thiết bị.");
  }

  await registerWebPushTokenCallable({
    token,
    platform: isIosDevice() ? "ios-web" : "web",
    standalone: isStandaloneWebApp(),
    userAgent: navigator.userAgent.slice(0, 500)
  });

  state.pushToken = token;
  state.pushTokenOwnerUid = state.user.uid;
  localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  localStorage.setItem(PUSH_TOKEN_OWNER_STORAGE_KEY, state.user.uid);
  updateNotificationPermissionButton();

  if (showSuccessToast) {
    toast("Đã bật thông báo nền. Thiết bị có thể nhận thông báo khi Web App đã đóng.", "success");
  }

  return true;
}

async function unregisterCurrentDevicePushToken() {
  const token = state.pushToken || localStorage.getItem(PUSH_TOKEN_STORAGE_KEY) || "";
  if (!token || !state.user) return;

  try {
    await unregisterWebPushTokenCallable({ token });
  } catch (error) {
    console.warn("Không xóa được đăng ký push trên máy chủ:", error);
  }

  try {
    const messaging = await getPushMessaging();
    if (messaging) await deleteMessagingToken(messaging);
  } catch (error) {
    console.warn("Không xóa được token FCM trên thiết bị:", error);
  }

  state.pushToken = "";
  state.pushTokenOwnerUid = "";
  localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(PUSH_TOKEN_OWNER_STORAGE_KEY);
  updateNotificationPermissionButton();
}

async function syncPushSubscriptionIfAllowed() {
  if (!state.user || !notificationSupported() || Notification.permission !== "granted") {
    updateNotificationPermissionButton();
    return;
  }

  try {
    await registerCurrentDeviceForPush();
  } catch (error) {
    console.warn("Chưa đồng bộ được thông báo nền:", error);
    updateNotificationPermissionButton();
  }
}

async function requestNotificationPermission() {
  if (!notificationSupported()) {
    toast("Trình duyệt này chưa hỗ trợ thông báo hệ thống.", "error");
    return;
  }

  if (isIosDevice() && !isStandaloneWebApp()) {
    toast("Trên iPhone/iPad, hãy thêm website vào Màn hình chính rồi mở từ biểu tượng Culao Task để bật thông báo nền.", "info");
    return;
  }

  try {
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    updateNotificationPermissionButton();

    if (permission === "granted") {
      await registerCurrentDeviceForPush({ showSuccessToast: true });
      await showSystemNotification({
        id: "permission-test",
        title: "Culao Task đã bật thông báo nền",
        message: "Bạn sẽ nhận thông báo kể cả khi Web App không còn mở trên màn hình."
      });
    } else if (permission === "denied") {
      toast("Bạn đã chặn thông báo. Hãy mở quyền Notifications của Culao Task trong cài đặt thiết bị.", "error");
    } else {
      toast("Bạn chưa cấp quyền thông báo.", "info");
    }
  } catch (error) {
    console.error("PUSH REGISTRATION ERROR:", error);
    const vapidHint = getConfiguredVapidKey()
      ? ""
      : " Nếu vẫn lỗi, hãy thêm Web Push VAPID public key vào firebaseConfig.messagingVapidKey.";
    toast(`Không bật được thông báo nền: ${error?.message || String(error)}.${vapidHint}`, "error");
  }
}

async function showSystemNotification(notification) {
  if (!notificationSupported() || Notification.permission !== "granted") return;

  const title = notification.title || "Culao Task";
  const chatConversationId = notification.chatConversationId || "";
  const chatPartnerUid = notification.chatSenderUid || notification.actorUid || "";
  const targetUrl = chatConversationId
    ? `./?chatId=${encodeURIComponent(chatConversationId)}&chatWith=${encodeURIComponent(chatPartnerUid)}`
    : notification.taskId
      ? `./?taskId=${encodeURIComponent(notification.taskId)}`
      : "./";
  const options = {
    body: notification.message || "Bạn có thông báo mới.",
    icon: "./icon-192.png",
    badge: "./notification-badge.png",
    tag: notification.id || chatConversationId || notification.taskId || `${Date.now()}`,
    data: {
      url: targetUrl,
      taskId: notification.taskId || null,
      chatConversationId: chatConversationId || null,
      chatPartnerUid: chatPartnerUid || null
    }
  };

  try {
    const registration = await registerServiceWorker();
    if (registration) {
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

function queuePushTaskOpen(taskId) {
  const normalizedTaskId = typeof taskId === "string" ? taskId.trim() : "";
  if (!normalizedTaskId) return;
  state.pendingPushTaskId = normalizedTaskId;

  let attempts = 0;
  const tryOpen = () => {
    attempts += 1;
    const task = state.tasks.find((item) => item.id === normalizedTaskId);
    if (task) {
      state.pendingPushTaskId = "";
      showTaskInCurrentDashboard(task);
      window.setTimeout(() => scrollToTaskCard(normalizedTaskId), 180);
      return;
    }
    if (attempts < 20 && state.user) window.setTimeout(tryOpen, 500);
  };

  tryOpen();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "SHOP_TASK_PUSH_OPEN") {
      const chatConversationId = event.data.chatConversationId || "";
      if (chatConversationId) {
        queuePushChatOpen(chatConversationId, event.data.chatPartnerUid || "");
      } else {
        queuePushTaskOpen(event.data.taskId || "");
      }
    }
  });
}

const initialUrlParams = new URLSearchParams(window.location.search);
const initialPushTaskId = initialUrlParams.get("taskId") || "";
const initialPushConversationId = initialUrlParams.get("chatId") || "";
const initialPushChatPartnerUid = initialUrlParams.get("chatWith") || "";
if (initialPushTaskId) state.pendingPushTaskId = initialPushTaskId;
if (initialPushConversationId) {
  state.pendingPushConversationId = initialPushConversationId;
  state.pendingPushChatPartnerUid = initialPushChatPartnerUid;
}

function setMobileTopbarMenuOpen(open) {
  const shouldOpen = Boolean(open);
  els.mobileTopbarMenu?.classList.toggle("is-open", shouldOpen);
  els.mobileTopbarMenu?.setAttribute("aria-hidden", String(!shouldOpen));
  els.mobileTopbarMenuBtn?.setAttribute("aria-expanded", String(shouldOpen));
}

function setMobileDataMenuOpen(open) {
  const shouldOpen = Boolean(open);
  els.mobileDataMenu?.classList.toggle("is-open", shouldOpen);
  els.mobileDataActionsGroup?.classList.toggle("is-open", shouldOpen);
  els.mobileDataMenu?.setAttribute("aria-hidden", String(!shouldOpen));
  els.mobileDataMenuBtn?.setAttribute("aria-expanded", String(shouldOpen));
}

els.mobileTopbarMenuBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  closeChatDirectory();
  const shouldOpen = !els.mobileTopbarMenu?.classList.contains("is-open");
  setMobileDataMenuOpen(false);
  els.notificationPanel?.classList.add("hidden");
  setMobileTopbarMenuOpen(shouldOpen);
});

els.mobileNotificationPermissionBtn?.addEventListener("click", async () => {
  setMobileTopbarMenuOpen(false);
  await requestNotificationPermission();
});

els.mobileLogoutBtn?.addEventListener("click", () => {
  setMobileTopbarMenuOpen(false);
  els.logoutBtn?.click();
});

els.mobileDataMenuBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  closeChatDirectory();
  const shouldOpen = !els.mobileDataMenu?.classList.contains("is-open");
  setMobileTopbarMenuOpen(false);
  setMobileDataMenuOpen(shouldOpen);
});

[els.exportDataBtn, els.importDataBtn].filter(Boolean).forEach((button) => {
  button.addEventListener("click", () => setMobileDataMenuOpen(false));
});

els.notificationBellBtn?.addEventListener("click", () => {
  closeChatDirectory();
  setMobileTopbarMenuOpen(false);
  setMobileDataMenuOpen(false);
  els.notificationPanel.classList.toggle("hidden");
});

document.addEventListener("click", (event) => {
  if (!els.notificationPanel || els.notificationPanel.classList.contains("hidden")) return;
  const clickedInside = event.target.closest(".notification-wrap");
  if (!clickedInside) els.notificationPanel.classList.add("hidden");
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".mobile-topbar-menu-wrap")) setMobileTopbarMenuOpen(false);
  if (!event.target.closest(".dashboard-data-actions")) setMobileDataMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  setMobileTopbarMenuOpen(false);
  setMobileDataMenuOpen(false);
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 768) {
    setMobileTopbarMenuOpen(false);
    setMobileDataMenuOpen(false);
  }
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

        if (notification.chatConversationId && isChatConversationVisible(notification.chatConversationId)) {
          markNotificationRead(notification.id);
          return;
        }

        const toastText = notification.type === "chat_message"
          ? (() => {
              const senderName = String(notification.actorName || "").trim();
              const title = String(notification.title || (senderName ? `Tin nhắn từ ${senderName}` : "Tin nhắn mới")).trim();
              const message = String(notification.message || "").trim();
              return message ? `${title}: ${message}` : title;
            })()
          : (notification.message || notification.title || "Bạn có thông báo mới.");

        toast(toastText, "info");
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

  if (isManagementProfile()) {
    backToAdminDashboard();

    state.adminStatusFilter = "all";
    state.adminCompletedTypeFilter = "all";
    state.adminEmployeeFilter = "all";
    state.adminWorkOrderSearch = "";
    state.adminWorkOrderSuggestionIndex = -1;
    if (els.adminWorkOrderSearch) els.adminWorkOrderSearch.value = "";
    hideAdminWorkOrderSuggestions();
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
  state.employeeWorkOrderSearch = "";
  state.employeeWorkOrderSuggestionIndex = -1;
  if (els.employeeWorkOrderSearch) els.employeeWorkOrderSearch.value = "";
  hideEmployeeWorkOrderSuggestions();
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

  if (notification.chatConversationId) {
    await openChatConversationFromNotification(notification);
    return;
  }

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
// Chat nội bộ 1-1
// =========================
const CHAT_PAGE_SIZE = 50;
const CHAT_MAX_DESKTOP_WINDOWS = 3;
const CHAT_MAX_ATTACHMENTS = 5;
const CHAT_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const CHAT_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const CHAT_ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"]);
const chatMediaUrlCache = new Map();
let chatUiBound = false;
let chatMobileViewportRaf = 0;
let chatMobileViewportBaseHeight = 0;

function resetMobileChatVisualViewport() {
  if (chatMobileViewportRaf) {
    cancelAnimationFrame(chatMobileViewportRaf);
    chatMobileViewportRaf = 0;
  }
  chatMobileViewportBaseHeight = 0;
  document.body.classList.remove("culao-chat-keyboard-open");
  const panel = els.chatDirectoryPanel;
  if (!panel) return;
  ["--culao-chat-vv-top", "--culao-chat-vv-left", "--culao-chat-vv-width", "--culao-chat-vv-height"]
    .forEach((name) => panel.style.removeProperty(name));
}

function updateMobileChatVisualViewport({ keepLatestMessageVisible = false } = {}) {
  const panel = els.chatDirectoryPanel;
  if (!panel || !isMobileChatLayout() || panel.classList.contains("hidden")) {
    resetMobileChatVisualViewport();
    return;
  }

  const viewport = window.visualViewport;
  const viewportWidth = Math.max(1, Math.round(viewport?.width || document.documentElement.clientWidth || window.innerWidth || 1));
  const viewportHeight = Math.max(1, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1));
  const viewportTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
  const viewportLeft = Math.max(0, Math.round(viewport?.offsetLeft || 0));

  panel.style.setProperty("--culao-chat-vv-top", `${viewportTop}px`);
  panel.style.setProperty("--culao-chat-vv-left", `${viewportLeft}px`);
  panel.style.setProperty("--culao-chat-vv-width", `${viewportWidth}px`);
  panel.style.setProperty("--culao-chat-vv-height", `${viewportHeight}px`);

  const inputFocused = document.activeElement === els.chatMobileInput;
  if (!inputFocused) {
    chatMobileViewportBaseHeight = viewportHeight;
  } else if (!chatMobileViewportBaseHeight) {
    chatMobileViewportBaseHeight = Math.max(viewportHeight, Math.round(window.innerHeight || viewportHeight));
  }

  const keyboardOpen = inputFocused
    && chatMobileViewportBaseHeight > 0
    && chatMobileViewportBaseHeight - viewportHeight > 80;
  document.body.classList.toggle("culao-chat-keyboard-open", keyboardOpen);

  if ((keyboardOpen || keepLatestMessageVisible) && !els.chatMobileConversationView?.classList.contains("hidden")) {
    const messages = els.chatMobileMessages;
    if (messages) messages.scrollTop = messages.scrollHeight;
  }
}

function scheduleMobileChatVisualViewport(options = {}) {
  if (chatMobileViewportRaf) cancelAnimationFrame(chatMobileViewportRaf);
  chatMobileViewportRaf = requestAnimationFrame(() => {
    chatMobileViewportRaf = 0;
    updateMobileChatVisualViewport(options);
  });
}

function getChatConversationId(uidA, uidB) {
  return [String(uidA || "").trim(), String(uidB || "").trim()]
    .filter(Boolean)
    .sort()
    .map((uid) => encodeURIComponent(uid))
    .join("::");
}

function isMobileChatLayout() {
  return window.matchMedia?.("(max-width: 768px)")?.matches === true;
}

function getChatUser(uid) {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) return null;
  if (normalizedUid === state.user?.uid) {
    return {
      uid: normalizedUid,
      name: state.profile?.name || state.user?.email || "Tôi",
      email: state.profile?.email || state.user?.email || "",
      role: state.profile?.role || "employee"
    };
  }
  return state.chatUsers.find((item) => item.uid === normalizedUid) || null;
}

function getChatUserName(uid, conversation = null) {
  const user = getChatUser(uid);
  if (user?.name) return user.name;
  const storedName = conversation?.participantNames?.[uid];
  return storedName || "Tài khoản";
}

function getChatUserRole(uid, conversation = null) {
  const user = getChatUser(uid);
  const role = user?.role || conversation?.participantRoles?.[uid] || "employee";
  return getRoleDisplayName(role);
}

function getChatConversation(conversationId) {
  return state.chatConversationMap.get(conversationId) || null;
}

function getChatPartnerUid(conversation, currentUid = state.user?.uid) {
  const participants = Array.isArray(conversation?.participantIds)
    ? conversation.participantIds
    : [];
  return participants.find((uid) => uid !== currentUid) || "";
}

function getChatUnreadCount(conversation, uid = state.user?.uid) {
  const value = Number(conversation?.unreadCounts?.[uid] || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function getChatTimestampMs(value) {
  return timestampToDate(value)?.getTime() || 0;
}

function formatChatListTime(value) {
  const date = timestampToDate(value);
  if (!date) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function formatChatMessageTime(value) {
  const date = timestampToDate(value);
  if (!date) return "Đang gửi...";
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function chatAvatarHtml(user, conversation = null) {
  const name = user?.name || getChatUserName(user?.uid, conversation) || "Tài khoản";
  const avatarInitials = initials(name);
  const role = user?.role || conversation?.participantRoles?.[user?.uid] || "employee";
  return `<span class="culao-chat-avatar role-${escapeHtml(role)}" aria-hidden="true">${escapeHtml(avatarInitials)}</span>`;
}

function totalChatUnreadCount() {
  if (!state.user) return 0;
  return state.chatConversations.reduce((sum, item) => {
    if (!Array.isArray(item.participantIds) || !item.participantIds.includes(state.user.uid)) return sum;
    return sum + getChatUnreadCount(item);
  }, 0);
}

function updateChatUnreadBadge() {
  const unread = totalChatUnreadCount();
  if (!els.chatUnreadBadge) return;
  els.chatUnreadBadge.textContent = unread > 99 ? "99+" : String(unread);
  els.chatUnreadBadge.classList.toggle("hidden", unread === 0);
  els.chatToggleBtn?.setAttribute("aria-label", unread ? `Chat, ${unread} tin chưa đọc` : "Chat");
}

async function loadChatUsers({ silent = false } = {}) {
  if (!state.user || state.chatUsersLoading) return;
  state.chatUsersLoading = true;
  if (!silent) renderChatDirectory();

  try {
    const response = await getChatUsersCallable();
    const users = Array.isArray(response.data?.users) ? response.data.users : [];
    state.chatUsers = users
      .filter((item) => item?.uid && item.uid !== state.user.uid)
      .map((item) => ({
        uid: String(item.uid),
        name: String(item.name || item.email || "Tài khoản"),
        email: String(item.email || ""),
        role: ["admin", "supervisor", "employee"].includes(item.role) ? item.role : "employee"
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
    renderChatDirectory();
  } catch (error) {
    console.error("Không tải được danh sách Chat:", error);
    if (!silent) toast(error.message || "Không tải được danh sách tài khoản Chat.", "error");
  } finally {
    state.chatUsersLoading = false;
    renderChatDirectory();
  }
}

function applyChatConversationList(items = []) {
  const conversations = (Array.isArray(items) ? items : [])
    .filter((item) => item?.id)
    .map((item) => ({ ...item, id: String(item.id) }))
    .sort((a, b) => getChatTimestampMs(b.lastMessageAt || b.updatedAt) - getChatTimestampMs(a.lastMessageAt || a.updatedAt));

  state.chatConversations = conversations;
  state.chatConversationMap = new Map(conversations.map((item) => [item.id, item]));
  updateChatUnreadBadge();
  renderChatDirectory();
  renderChatAdminConversations();
  refreshAllChatViews();
  markVisibleChatConversationsRead();

  if (state.pendingPushConversationId) {
    queuePushChatOpen(state.pendingPushConversationId, state.pendingPushChatPartnerUid);
  }
}

function stopChatConversationFallbackPolling() {
  if (!state.chatConversationFallbackTimer) return;
  clearInterval(state.chatConversationFallbackTimer);
  state.chatConversationFallbackTimer = null;
}

async function refreshChatConversationsViaCallable({ repairIndex = false, silent = true } = {}) {
  if (!state.user) return;
  const response = await syncChatConversationIndexCallable({
    includeAll: isAdminProfile(),
    repairIndex
  });
  applyChatConversationList(response.data?.conversations || []);
  if (!silent) renderChatDirectory();
}

function startChatConversationFallbackPolling() {
  if (!state.user || state.chatConversationFallbackTimer) return;

  const refresh = async () => {
    try {
      await refreshChatConversationsViaCallable({ repairIndex: false, silent: true });
    } catch (error) {
      console.warn("Đồng bộ Chat dự phòng chưa thành công:", error);
    }
  };

  refresh();
  state.chatConversationFallbackTimer = window.setInterval(refresh, 12000);
}

async function setupChatConversationListener() {
  if (!state.user) return;

  // Cloud Function dùng Admin SDK để sửa/tạo chỉ mục Chat riêng của tài khoản.
  // Cách này tương thích với cả các cuộc trò chuyện đã tạo trước bản cập nhật.
  try {
    await refreshChatConversationsViaCallable({ repairIndex: true, silent: true });
  } catch (error) {
    console.warn("Chưa đồng bộ được chỉ mục Chat ban đầu:", error);
  }

  const conversationsQuery = isAdminProfile()
    ? collection(db, "chatConversations")
    : collection(db, "chatUserConversations", state.user.uid, "conversations");

  const unsubscribe = onSnapshot(
    conversationsQuery,
    (snapshot) => {
      stopChatConversationFallbackPolling();
      applyChatConversationList(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    },
    (error) => {
      console.error("Không đồng bộ được danh sách cuộc trò chuyện realtime:", error);

      // Không để lỗi listener làm mất chức năng Chat. Hệ thống tự chuyển sang
      // callable polling; nội dung cuộc trò chuyện đang mở vẫn realtime qua
      // listener messages riêng.
      startChatConversationFallbackPolling();

      if (!state.chatConversationListenerWarningShown) {
        state.chatConversationListenerWarningShown = true;
        const errorCode = String(error?.code || "");
        if (["unavailable", "deadline-exceeded", "cancelled"].includes(errorCode) || navigator.onLine === false) {
          toast("Kết nối danh sách Chat đang gián đoạn. Hệ thống sẽ tự đồng bộ lại khi có mạng.", "error");
        } else {
          toast("Danh sách Chat đang dùng chế độ đồng bộ dự phòng và vẫn có thể nhắn tin bình thường.", "info");
        }
      }
    }
  );

  state.unsubs.push(unsubscribe);
}

async function setupChatFeature() {
  if (!state.user) return;
  bindChatUI();
  updateChatUnreadBadge();
  renderChatDirectory();
  await setupChatConversationListener();
  await loadChatUsers({ silent: true });
  if (state.pendingPushConversationId) {
    queuePushChatOpen(state.pendingPushConversationId, state.pendingPushChatPartnerUid);
  }
}

function cleanupChatFeature() {
  stopChatConversationFallbackPolling();
  state.chatConversationListenerWarningShown = false;
  state.chatViewStates?.forEach((view) => {
    try { view.unsubscribe?.(); } catch (_) { /* no-op */ }
  });
  state.chatViewStates = new Map();
  state.chatOpenDesktopIds = [];
  if (els.chatMiniContainer) els.chatMiniContainer.innerHTML = "";
  els.chatDirectoryPanel?.classList.add("hidden");
  els.chatAdminModal?.classList.add("hidden");
  closeChatMediaViewer();
  els.chatMobileConversationView?.classList.add("hidden");
  els.chatDirectoryView?.classList.remove("hidden");
  document.body.classList.remove("culao-chat-overlay-open");
}

function setChatDirectoryFilter(filter) {
  state.chatDirectoryFilter = filter === "unread" ? "unread" : "all";
  els.chatDirectoryAllTab?.classList.toggle("is-active", state.chatDirectoryFilter === "all");
  els.chatDirectoryUnreadTab?.classList.toggle("is-active", state.chatDirectoryFilter === "unread");
  renderChatDirectory();
}

function renderChatDirectory() {
  if (!els.chatDirectoryList) return;
  if (state.chatUsersLoading && !state.chatUsers.length) {
    els.chatDirectoryList.innerHTML = '<div class="culao-chat-empty">Đang tải danh sách tài khoản...</div>';
    return;
  }

  const search = normalizeSearchText(state.chatSearchText || "");
  const rows = state.chatUsers
    .map((user) => {
      const conversationId = getChatConversationId(state.user?.uid, user.uid);
      const conversation = getChatConversation(conversationId);
      return { user, conversationId, conversation, unread: getChatUnreadCount(conversation) };
    })
    .filter((item) => {
      if (state.chatDirectoryFilter === "unread" && item.unread <= 0) return false;
      if (!search) return true;
      return normalizeSearchText(`${item.user.name} ${item.user.email} ${getRoleDisplayName(item.user.role)}`).includes(search);
    })
    .sort((a, b) => {
      const timeDiff = getChatTimestampMs(b.conversation?.lastMessageAt) - getChatTimestampMs(a.conversation?.lastMessageAt);
      if (timeDiff) return timeDiff;
      return a.user.name.localeCompare(b.user.name, "vi");
    });

  els.openChatAdminBtn?.classList.toggle("hidden", !isAdminProfile());

  if (!rows.length) {
    els.chatDirectoryList.innerHTML = `<div class="culao-chat-empty">${state.chatDirectoryFilter === "unread" ? "Không có tin nhắn chưa đọc." : "Không tìm thấy tài khoản phù hợp."}</div>`;
    return;
  }

  els.chatDirectoryList.innerHTML = rows.map(({ user, conversationId, conversation, unread }) => {
    const preview = conversation?.lastMessage || "Bắt đầu trò chuyện";
    const senderPrefix = conversation?.lastSenderId === state.user?.uid ? "Bạn: " : "";
    return `
      <button class="culao-chat-contact ${unread ? "has-unread" : ""}" type="button" data-chat-action="open-user" data-chat-user-id="${escapeHtml(user.uid)}" data-chat-conversation-id="${escapeHtml(conversationId)}">
        ${chatAvatarHtml(user)}
        <span class="culao-chat-contact-copy">
          <span class="culao-chat-contact-line">
            <strong>${escapeHtml(user.name)}</strong>
            <time>${escapeHtml(formatChatListTime(conversation?.lastMessageAt))}</time>
          </span>
          <span class="culao-chat-contact-role">${escapeHtml(getRoleDisplayName(user.role))}</span>
          <span class="culao-chat-contact-preview">${escapeHtml(senderPrefix + preview)}</span>
        </span>
        ${unread ? `<span class="culao-chat-count">${unread > 99 ? "99+" : unread}</span>` : ""}
      </button>
    `;
  }).join("");
}

function openChatDirectory() {
  if (!state.user || !els.chatDirectoryPanel) return;
  state.chatDirectoryOpen = true;
  els.notificationPanel?.classList.add("hidden");
  setMobileTopbarMenuOpen(false);
  setMobileDataMenuOpen(false);
  els.chatDirectoryPanel.classList.remove("hidden");
  els.chatToggleBtn?.setAttribute("aria-expanded", "true");
  els.chatDirectoryView?.classList.remove("hidden");
  els.chatMobileConversationView?.classList.add("hidden");
  if (isMobileChatLayout()) {
    document.body.classList.add("culao-chat-overlay-open");
    scheduleMobileChatVisualViewport();
  }
  renderChatDirectory();
  loadChatUsers({ silent: true });
  if (!isMobileChatLayout()) window.setTimeout(() => els.chatDirectorySearch?.focus(), 60);
}

function closeChatDirectory() {
  state.chatDirectoryOpen = false;
  els.chatDirectoryPanel?.classList.add("hidden");
  els.chatToggleBtn?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("culao-chat-overlay-open");
  closeMobileChatConversation({ returnToDirectory: false });
  resetMobileChatVisualViewport();
}

function toggleChatDirectory() {
  if (els.chatDirectoryPanel?.classList.contains("hidden")) openChatDirectory();
  else closeChatDirectory();
}

function getChatViewElements(viewKey) {
  if (viewKey === "mobile") {
    return {
      root: els.chatMobileConversationView,
      messages: els.chatMobileMessages,
      loadMore: els.chatMobileLoadMoreBtn,
      form: els.chatMobileComposer,
      input: els.chatMobileInput,
      attachButton: els.chatMobileAttachBtn,
      fileInput: els.chatMobileFileInput
    };
  }
  const safeKey = window.CSS?.escape ? CSS.escape(viewKey) : viewKey.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  const root = document.querySelector(`[data-chat-view-key="${safeKey}"]`);
  return {
    root,
    messages: root?.querySelector("[data-chat-messages]"),
    loadMore: root?.querySelector("[data-chat-load-more]"),
    form: root?.querySelector("[data-chat-composer]"),
    input: root?.querySelector("[data-chat-input]"),
    attachButton: root?.querySelector("[data-chat-attach]"),
    fileInput: root?.querySelector("[data-chat-file-input]")
  };
}

function unsubscribeChatView(viewKey) {
  const view = state.chatViewStates.get(viewKey);
  if (!view) return;
  try { view.unsubscribe?.(); } catch (_) { /* no-op */ }
  state.chatViewStates.delete(viewKey);
}

function getMergedChatMessages(view) {
  const map = new Map();
  [...(view.olderMessages || []), ...(view.realtimeMessages || [])].forEach((message) => {
    if (message?.id) map.set(message.id, message);
  });
  return [...map.values()].sort((a, b) => getChatTimestampMs(a.createdAt) - getChatTimestampMs(b.createdAt));
}

function isChatMessageReadByRecipient(message, conversation) {
  if (!message || message.senderId !== state.user?.uid) return false;
  const otherUid = message.receiverId || getChatPartnerUid(conversation);
  const readAt = conversation?.readAtBy?.[otherUid];
  return getChatTimestampMs(readAt) >= getChatTimestampMs(message.createdAt) && getChatTimestampMs(message.createdAt) > 0;
}


function getChatAttachmentKind(attachment) {
  const explicit = String(attachment?.kind || "").toLowerCase();
  if (explicit === "image" || explicit === "video") return explicit;
  const type = String(attachment?.contentType || "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return "";
}

function renderChatAttachmentsHtml(message) {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments.filter((item) => item?.storagePath && getChatAttachmentKind(item))
    : [];
  if (!attachments.length) return "";

  return `
    <div class="culao-chat-media-grid ${attachments.length === 1 ? "is-single" : ""}">
      ${attachments.map((attachment) => {
        const kind = getChatAttachmentKind(attachment);
        const path = escapeHtml(String(attachment.storagePath || ""));
        const name = escapeHtml(String(attachment.name || (kind === "video" ? "Video" : "Hình ảnh")));
        const contentType = escapeHtml(String(attachment.contentType || ""));
        if (kind === "video") {
          return `
            <div class="culao-chat-media-item" data-chat-media-container>
              <video
                controls
                playsinline
                preload="metadata"
                data-chat-media-path="${path}"
                data-chat-media-kind="video"
                data-chat-media-name="${name}"
                data-chat-media-content-type="${contentType}"
                aria-label="${name}"
              ></video>
              <span class="culao-chat-media-loading">Đang tải video...</span>
            </div>
          `;
        }
        return `
          <button class="culao-chat-media-item" type="button" data-chat-media-open data-chat-media-view-path="${path}" data-chat-media-view-kind="image" data-chat-media-view-name="${name}" aria-label="Xem ${name}">
            <img
              loading="lazy"
              alt="${name}"
              data-chat-media-path="${path}"
              data-chat-media-kind="image"
              data-chat-media-name="${name}"
              data-chat-media-content-type="${contentType}"
            />
            <span class="culao-chat-media-loading">Đang tải hình...</span>
          </button>
        `;
      }).join("")}
    </div>
    <div class="culao-chat-media-actions">
      <button class="culao-chat-media-download-btn" type="button" data-chat-media-download aria-label="Tải tất cả hình ảnh và video trong tin nhắn này">
        <span aria-hidden="true">⬇</span>
        <span>Tải</span>
      </button>
    </div>
  `;
}

async function getChatMediaDownloadUrl(storagePath) {
  const path = String(storagePath || "").trim();
  if (!path) throw new Error("Đường dẫn tệp Chat không hợp lệ.");
  if (!chatMediaUrlCache.has(path)) {
    chatMediaUrlCache.set(path, getDownloadURL(storageRef(storage, path)).catch((error) => {
      chatMediaUrlCache.delete(path);
      throw error;
    }));
  }
  return chatMediaUrlCache.get(path);
}

function getChatMediaFileExtension(contentType = "", kind = "") {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  if (type.includes("heic") || type.includes("heif")) return ".heic";
  if (type.includes("quicktime")) return ".mov";
  if (type.includes("webm")) return ".webm";
  if (type.includes("3gpp")) return ".3gp";
  if (type.includes("mp4") || type.includes("m4v")) return ".mp4";
  return kind === "video" ? ".mp4" : ".jpg";
}

function getChatMediaDownloadFileName(attachment, index = 0) {
  const kind = String(attachment?.kind || "").toLowerCase() === "video" ? "video" : "image";
  const fallback = kind === "video" ? `video-chat-${index + 1}` : `hinh-chat-${index + 1}`;
  const safeName = sanitizeStorageFileName(attachment?.name || fallback);
  if (/\.[a-zA-Z0-9]{2,6}$/.test(safeName)) return safeName;
  return `${safeName}${getChatMediaFileExtension(attachment?.contentType, kind)}`;
}

function collectChatMediaAttachmentsFromBubble(button) {
  const bubble = button?.closest?.(".culao-chat-bubble");
  if (!bubble) return [];
  const seen = new Set();
  return [...bubble.querySelectorAll("[data-chat-media-path]")]
    .map((element) => ({
      storagePath: String(element.dataset.chatMediaPath || "").trim(),
      name: String(element.dataset.chatMediaName || "").trim(),
      kind: String(element.dataset.chatMediaKind || "").trim(),
      contentType: String(element.dataset.chatMediaContentType || "").trim()
    }))
    .filter((item) => {
      if (!item.storagePath || seen.has(item.storagePath)) return false;
      seen.add(item.storagePath);
      return true;
    });
}

async function getChatMediaBlobForDownload(attachment) {
  const storagePath = String(attachment?.storagePath || "").trim();
  if (!storagePath) throw new Error("Đường dẫn tệp Chat không hợp lệ.");
  const errors = [];

  try {
    const blob = await getBlob(storageRef(storage, storagePath));
    if (blob instanceof Blob) return blob;
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  try {
    const url = await getChatMediaDownloadUrl(storagePath);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  throw new Error(errors.filter(Boolean).join(" | ") || "Không tải được tệp Chat.");
}

function makeChatMediaZipFileName() {
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `culao-task-chat-media-${date}-${time}.zip`;
}

async function downloadAllChatMediaFromButton(button) {
  const attachments = collectChatMediaAttachmentsFromBubble(button);
  if (!attachments.length) {
    toast("Không tìm thấy hình ảnh hoặc video để tải.", "error");
    return;
  }

  const idleHtml = button.innerHTML;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");

  try {
    if (attachments.length === 1) {
      button.textContent = "Đang tải...";
      const blob = await getChatMediaBlobForDownload(attachments[0]);
      downloadBlobFile(blob, getChatMediaDownloadFileName(attachments[0], 0));
      toast("Đã tải tệp Chat về thiết bị.", "success");
      return;
    }

    if (!window.JSZip) {
      throw new Error("Chưa tải được thư viện tạo file ZIP. Vui lòng tải lại trang rồi thử lại.");
    }

    const zip = new window.JSZip();
    const usedNames = new Set();
    const failedFiles = [];
    let successCount = 0;

    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      button.textContent = `Đang tải ${index + 1}/${attachments.length}...`;
      try {
        const blob = await getChatMediaBlobForDownload(attachment);
        const fileName = makeUniqueZipFileName(
          usedNames,
          `${String(index + 1).padStart(2, "0")}-${getChatMediaDownloadFileName(attachment, index)}`
        );
        zip.file(fileName, blob, { binary: true, compression: "STORE" });
        successCount += 1;
      } catch (error) {
        console.error("Không tải được tệp Chat để tạo ZIP:", attachment, error);
        failedFiles.push(`${attachment.name || `Tệp ${index + 1}`}: ${error?.message || "Không rõ lỗi"}`);
      }
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    }

    if (!successCount) {
      throw new Error("Không tải được tệp Chat nào. Hãy kiểm tra kết nối mạng và thử lại.");
    }

    if (failedFiles.length) {
      zip.file("tep-khong-tai-duoc.txt", failedFiles.join("\n"), { compression: "STORE" });
    }

    button.textContent = "Đang tạo ZIP 0%...";
    const zipBlob = await zip.generateAsync(
      { type: "blob", compression: "STORE", streamFiles: true },
      (metadata) => {
        if (button.isConnected) button.textContent = `Đang tạo ZIP ${Math.round(metadata.percent || 0)}%...`;
      }
    );

    downloadBlobFile(zipBlob, makeChatMediaZipFileName());
    toast(
      `Đã tải ${successCount}/${attachments.length} tệp Chat trong file ZIP.`,
      failedFiles.length ? "warning" : "success"
    );
  } catch (error) {
    console.error(error);
    toast(error.message || "Không tải được hình ảnh và video Chat.", "error");
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = idleHtml;
    }
  }
}

function hydrateChatMediaElements(root) {
  if (!root) return;
  root.querySelectorAll("[data-chat-media-path]").forEach((element) => {
    if (element.dataset.chatMediaHydrated === "true" || element.dataset.chatMediaLoading === "true") return;
    const storagePath = element.dataset.chatMediaPath || "";
    element.dataset.chatMediaLoading = "true";
    getChatMediaDownloadUrl(storagePath)
      .then((url) => {
        element.dataset.chatMediaHydrated = "true";
        element.src = url;
        const container = element.closest("[data-chat-media-container], .culao-chat-media-item");
        container?.querySelector(".culao-chat-media-loading")?.remove();
      })
      .catch((error) => {
        console.error("Không tải được tệp Chat:", error);
        const container = element.closest("[data-chat-media-container], .culao-chat-media-item");
        const loading = container?.querySelector(".culao-chat-media-loading");
        if (loading) {
          loading.className = "culao-chat-media-error";
          loading.textContent = "Không tải được tệp.";
        }
      })
      .finally(() => {
        delete element.dataset.chatMediaLoading;
      });
  });
}

async function openChatMediaViewer(storagePath, kind = "image", name = "Tệp Chat") {
  if (!els.chatMediaViewer || !els.chatMediaViewerContent) return;
  try {
    const url = await getChatMediaDownloadUrl(storagePath);
    els.chatMediaViewerContent.innerHTML = kind === "video"
      ? `<video src="${escapeHtml(url)}" controls autoplay playsinline aria-label="${escapeHtml(name)}"></video>`
      : `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" />`;
    els.chatMediaViewer.classList.remove("hidden");
    document.body.classList.add("culao-chat-overlay-open");
  } catch (error) {
    console.error(error);
    toast("Không mở được tệp Chat.", "error");
  }
}

function closeChatMediaViewer() {
  if (!els.chatMediaViewer) return;
  els.chatMediaViewer.classList.add("hidden");
  const video = els.chatMediaViewerContent?.querySelector("video");
  try { video?.pause(); } catch (_) { /* no-op */ }
  if (els.chatMediaViewerContent) els.chatMediaViewerContent.innerHTML = "";
  if (!state.chatDirectoryOpen && els.chatAdminModal?.classList.contains("hidden")) {
    document.body.classList.remove("culao-chat-overlay-open");
  }
}

function inferChatMediaType(file) {
  const type = String(file?.type || "").toLowerCase();
  if (type) return type;
  const name = String(file?.name || "").toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name)) return "image/jpeg";
  if (/\.mov$/i.test(name)) return "video/quicktime";
  if (/\.webm$/i.test(name)) return "video/webm";
  if (/\.(mp4|m4v)$/i.test(name)) return "video/mp4";
  return "";
}

function readVideoFileMetadata(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const finish = (result) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(result);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => finish({
      width: Number(video.videoWidth || 0),
      height: Number(video.videoHeight || 0),
      duration: Number.isFinite(video.duration) ? Number(video.duration) : 0
    });
    video.onerror = () => finish({ width: 0, height: 0, duration: 0 });
    video.src = url;
  });
}

async function prepareChatMediaFile(file) {
  const contentType = inferChatMediaType(file);
  if (contentType.startsWith("image/")) {
    const optimized = await optimizePhotoFileForUpload(file);
    const preparedFile = optimized.file;
    const preparedType = inferChatMediaType(preparedFile);
    if (Number(preparedFile.size || 0) > CHAT_MAX_IMAGE_BYTES) {
      throw new Error(`Hình “${file.name}” vượt quá 15 MB.`);
    }
    let width = Number(optimized.width || 0);
    let height = Number(optimized.height || 0);
    if ((!width || !height) && !preparedType.includes("heic") && !preparedType.includes("heif")) {
      try {
        const image = await loadImageElementFromFile(preparedFile);
        width = Number(image.naturalWidth || image.width || 0);
        height = Number(image.naturalHeight || image.height || 0);
      } catch (_) { /* metadata không bắt buộc */ }
    }
    return {
      file: preparedFile,
      originalName: file.name,
      contentType: preparedType || contentType,
      kind: "image",
      width,
      height,
      duration: 0
    };
  }

  if (contentType.startsWith("video/")) {
    if (!CHAT_ALLOWED_VIDEO_TYPES.has(contentType) && contentType !== "video/3gpp") {
      throw new Error(`Video “${file.name}” không thuộc định dạng MP4, MOV hoặc WebM được hỗ trợ.`);
    }
    if (Number(file.size || 0) > CHAT_MAX_VIDEO_BYTES) {
      throw new Error(`Video “${file.name}” vượt quá 100 MB.`);
    }
    const metadata = await readVideoFileMetadata(file);
    return {
      file,
      originalName: file.name,
      contentType,
      kind: "video",
      ...metadata
    };
  }

  throw new Error(`Tệp “${file?.name || "đã chọn"}” không phải hình ảnh hoặc video.`);
}

function setChatMediaUploadBusy(elements, busy, current = 0, total = 0) {
  const button = elements?.attachButton;
  const fileInput = elements?.fileInput;
  if (button) {
    if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent || "＋";
    button.disabled = busy;
    button.setAttribute("aria-busy", busy ? "true" : "false");
    button.textContent = busy ? (total > 1 ? `${current}/${total}` : "…") : button.dataset.idleLabel;
  }
  if (fileInput) fileInput.disabled = busy;
  const sendButton = elements?.form?.querySelector(".culao-chat-send-btn");
  if (sendButton) sendButton.disabled = busy;
}

async function sendChatMediaFiles(viewKey, recipientUid, fileList) {
  const view = state.chatViewStates.get(viewKey);
  const elements = getChatViewElements(viewKey);
  const files = Array.from(fileList || []).filter(Boolean);
  if (!view || view.reviewMode || !recipientUid || view.sendingMedia === true || !files.length) return;
  if (files.length > CHAT_MAX_ATTACHMENTS) {
    toast(`Mỗi lần chỉ gửi tối đa ${CHAT_MAX_ATTACHMENTS} hình ảnh hoặc video.`, "error");
    if (elements.fileInput) elements.fileInput.value = "";
    return;
  }

  const text = getChatInputText(elements.input).trim();
  if (text.length > 2000) {
    toast("Mỗi tin nhắn tối đa 2.000 ký tự.", "error");
    return;
  }

  const clientMessageId = window.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const conversationId = view.conversationId || getChatConversationId(state.user?.uid, recipientUid);
  const uploadedAttachments = [];
  view.sendingMedia = true;
  setChatMediaUploadBusy(elements, true, 0, files.length);

  try {
    for (let index = 0; index < files.length; index += 1) {
      setChatMediaUploadBusy(elements, true, index + 1, files.length);
      const prepared = await prepareChatMediaFile(files[index]);
      const safeName = sanitizeStorageFileName(prepared.file.name || prepared.originalName || `tep-${index + 1}`);
      const storagePath = `chat-media/${conversationId}/${state.user.uid}/${clientMessageId}/${String(index + 1).padStart(2, "0")}-${safeName}`;
      await uploadBytes(storageRef(storage, storagePath), prepared.file, {
        contentType: prepared.contentType,
        customMetadata: {
          uploaderUid: state.user.uid,
          conversationId,
          uploadId: clientMessageId,
          originalName: String(prepared.originalName || prepared.file.name || "").slice(0, 180),
          kind: prepared.kind
        }
      });
      uploadedAttachments.push({
        storagePath,
        name: prepared.originalName || prepared.file.name || safeName,
        contentType: prepared.contentType,
        kind: prepared.kind,
        size: Number(prepared.file.size || 0),
        width: Number(prepared.width || 0),
        height: Number(prepared.height || 0),
        duration: Number(prepared.duration || 0)
      });
    }

    await sendChatMessageCallable({
      recipientUid,
      text,
      clientMessageId,
      attachments: uploadedAttachments
    });
    clearChatInput(elements.input);
    if (elements.fileInput) elements.fileInput.value = "";
    if (viewKey === "mobile") {
      window.requestAnimationFrame(() => {
        try { elements.input?.focus({ preventScroll: true }); } catch (_) { elements.input?.focus(); }
      });
      scheduleMobileChatVisualViewport({ keepLatestMessageVisible: true });
    }
  } catch (error) {
    console.error(error);
    try {
      await discardChatMediaUploadCallable({ recipientUid, uploadId: clientMessageId });
    } catch (cleanupError) {
      console.warn("Không dọn được tệp Chat tải dở:", cleanupError);
    }
    toast(error.message || "Không gửi được hình ảnh hoặc video.", "error");
  } finally {
    view.sendingMedia = false;
    setChatMediaUploadBusy(elements, false);
    if (elements.fileInput) elements.fileInput.value = "";
  }
}

function renderChatMessages(viewKey, { preserveScroll = false, forceBottom = false } = {}) {
  const view = state.chatViewStates.get(viewKey);
  const elements = getChatViewElements(viewKey);
  if (!view || !elements.messages) return;

  const conversation = getChatConversation(view.conversationId);
  const messages = getMergedChatMessages(view);
  const previousHeight = elements.messages.scrollHeight;
  const previousTop = elements.messages.scrollTop;
  const wasNearBottom = previousHeight - previousTop - elements.messages.clientHeight < 90;

  if (!messages.length) {
    elements.messages.innerHTML = '<div class="culao-chat-empty culao-chat-message-empty">Chưa có tin nhắn. Hãy gửi lời nhắn đầu tiên.</div>';
  } else {
    elements.messages.innerHTML = messages.map((message, index) => {
      const own = message.senderId === state.user?.uid;
      const senderName = getChatUserName(message.senderId, conversation);
      const showSender = view.reviewMode || (!own && view.showSenderNames);
      const receipt = index === messages.length - 1 && own && isChatMessageReadByRecipient(message, conversation)
        ? '<span class="culao-chat-receipt">Đã xem ✓✓</span>'
        : "";
      const attachmentHtml = renderChatAttachmentsHtml(message);
      const textHtml = message.text
        ? `<div class="${attachmentHtml ? "culao-chat-caption" : ""}">${escapeHtml(message.text).replace(/\n/g, "<br>")}</div>`
        : "";
      return `
        <div class="culao-chat-message-row ${own ? "is-own" : "is-other"}">
          <div class="culao-chat-bubble">
            ${showSender ? `<strong class="culao-chat-sender-name">${escapeHtml(senderName)}</strong>` : ""}
            ${attachmentHtml}
            ${textHtml}
            <span class="culao-chat-message-meta">${escapeHtml(formatChatMessageTime(message.createdAt))}${receipt}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  hydrateChatMediaElements(elements.messages);

  if (elements.loadMore) {
    elements.loadMore.classList.toggle("hidden", !view.hasMore);
    elements.loadMore.disabled = view.loadingOlder === true;
    elements.loadMore.textContent = view.loadingOlder ? "Đang tải..." : "Tải tin nhắn cũ";
  }

  if (preserveScroll) {
    const nextHeight = elements.messages.scrollHeight;
    elements.messages.scrollTop = previousTop + (nextHeight - previousHeight);
  } else if (forceBottom || wasNearBottom || !view.hasRendered) {
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }
  view.hasRendered = true;
}

function subscribeChatView({ viewKey, conversationId, partnerUid = "", reviewMode = false, showSenderNames = false }) {
  unsubscribeChatView(viewKey);
  const view = {
    viewKey,
    conversationId,
    partnerUid,
    reviewMode,
    showSenderNames,
    realtimeMessages: [],
    olderMessages: [],
    nextCursor: null,
    hasMore: false,
    loadingOlder: false,
    hasRendered: false,
    unsubscribe: null
  };
  state.chatViewStates.set(viewKey, view);

  const messagesQuery = query(
    collection(db, "chatConversations", conversationId, "messages"),
    orderBy("createdAt", "desc"),
    limit(CHAT_PAGE_SIZE)
  );

  view.unsubscribe = onSnapshot(
    messagesQuery,
    (snapshot) => {
      const docs = snapshot.docs;
      view.realtimeMessages = docs.map((item) => ({ id: item.id, ...item.data() }));
      if (!view.olderMessages.length) {
        view.nextCursor = docs[docs.length - 1] || null;
        view.hasMore = docs.length === CHAT_PAGE_SIZE;
      }
      renderChatMessages(viewKey, { forceBottom: !view.hasRendered });
      requestMarkChatRead(conversationId);
    },
    (error) => {
      console.error("Không đồng bộ được tin nhắn Chat:", error);
      const elements = getChatViewElements(viewKey);
      if (elements.messages) {
        const errorCode = String(error?.code || "");
        const message = errorCode === "permission-denied"
          ? "Không có quyền đọc cuộc trò chuyện này. Hãy tải lại trang sau khi cập nhật Firestore Rules."
          : (["unavailable", "deadline-exceeded", "cancelled"].includes(errorCode) || navigator.onLine === false)
            ? "Kết nối Chat đang bị gián đoạn. Hãy kiểm tra mạng rồi thử lại."
            : "Tin nhắn tạm thời chưa đồng bộ được. Hãy tải lại trang và thử lại.";
        elements.messages.innerHTML = `<div class="culao-chat-empty">${escapeHtml(message)}</div>`;
      }
    }
  );
}

async function loadOlderChatMessages(viewKey) {
  const view = state.chatViewStates.get(viewKey);
  if (!view || view.loadingOlder || !view.hasMore || !view.nextCursor) return;
  view.loadingOlder = true;
  renderChatMessages(viewKey, { preserveScroll: true });

  try {
    const olderQuery = query(
      collection(db, "chatConversations", view.conversationId, "messages"),
      orderBy("createdAt", "desc"),
      startAfter(view.nextCursor),
      limit(CHAT_PAGE_SIZE)
    );
    const snapshot = await getDocs(olderQuery);
    const page = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    view.olderMessages = [...view.olderMessages, ...page];
    view.nextCursor = snapshot.docs[snapshot.docs.length - 1] || view.nextCursor;
    view.hasMore = snapshot.docs.length === CHAT_PAGE_SIZE;
    renderChatMessages(viewKey, { preserveScroll: true });
  } catch (error) {
    console.error(error);
    toast("Không tải được tin nhắn cũ.", "error");
  } finally {
    view.loadingOlder = false;
    renderChatMessages(viewKey, { preserveScroll: true });
  }
}

function isChatConversationVisible(conversationId) {
  if (!conversationId) return false;
  if (state.chatMobileConversationId === conversationId
    && !els.chatMobileConversationView?.classList.contains("hidden")) {
    return true;
  }
  const safeId = window.CSS?.escape ? CSS.escape(conversationId) : conversationId;
  const windowRoot = els.chatMiniContainer?.querySelector(`[data-chat-conversation-id="${safeId}"]`);
  return Boolean(windowRoot && !windowRoot.classList.contains("is-minimized"));
}

async function markChatNotificationsRead(conversationId) {
  const unread = state.notifications.filter((item) =>
    item.chatConversationId === conversationId && !item.readAt
  );
  if (!unread.length) return;
  try {
    await Promise.all(unread.slice(0, 50).map((item) => updateDoc(doc(db, "notifications", item.id), {
      readAt: serverTimestamp()
    })));
  } catch (error) {
    console.warn("Không đánh dấu được thông báo Chat đã đọc:", error);
  }
}

async function requestMarkChatRead(conversationId) {
  const conversation = getChatConversation(conversationId);
  if (!state.user || !conversation || !Array.isArray(conversation.participantIds)) return;
  if (!conversation.participantIds.includes(state.user.uid)) return;
  if (state.chatReadRequestsInFlight.has(conversationId)) return;

  const shouldResetUnread = getChatUnreadCount(conversation) > 0;
  state.chatReadRequestsInFlight.add(conversationId);
  try {
    await Promise.all([
      shouldResetUnread ? markChatConversationReadCallable({ conversationId }) : Promise.resolve(),
      markChatNotificationsRead(conversationId)
    ]);
  } catch (error) {
    console.warn("Không đánh dấu được Chat đã đọc:", error);
  } finally {
    state.chatReadRequestsInFlight.delete(conversationId);
  }
}

function markVisibleChatConversationsRead() {
  state.chatViewStates.forEach((view) => {
    if (!view.reviewMode) requestMarkChatRead(view.conversationId);
  });
}

function refreshAllChatViews() {
  state.chatViewStates.forEach((view, viewKey) => {
    const conversation = getChatConversation(view.conversationId);
    if (conversation && Number(conversation.messageCount || 0) === 0 && !conversation.lastMessage) {
      view.realtimeMessages = [];
      view.olderMessages = [];
      view.nextCursor = null;
      view.hasMore = false;
    }
    renderChatMessages(viewKey);
  });
}

function getChatInputText(input) {
  if (!input) return "";
  if (input.isContentEditable) return String(input.textContent || "").replace(/\u00a0/g, " ");
  return String(input.value || "");
}

function clearChatInput(input) {
  if (!input) return;
  if (input.isContentEditable) {
    input.textContent = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  input.value = "";
}

function normalizeSingleLineChatText(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .slice(0, 2000);
}

function setPlainTextAtSelection(element, text) {
  if (!element) return;
  const normalized = normalizeSingleLineChatText(text);
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || !element.contains(selection.anchorNode)) {
    element.textContent = normalizeSingleLineChatText(`${getChatInputText(element)}${normalized}`);
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(normalized);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function sanitizeMobileChatInput({ preserveCaret = true } = {}) {
  const input = els.chatMobileInput;
  if (!input?.isContentEditable) return;
  const current = getChatInputText(input);
  const normalized = normalizeSingleLineChatText(current);
  if (current === normalized) return;
  input.textContent = normalized;
  if (preserveCaret) {
    const selection = window.getSelection?.();
    const range = document.createRange?.();
    if (selection && range) {
      range.selectNodeContents(input);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

async function sendChatMessage(viewKey, recipientUid) {
  const view = state.chatViewStates.get(viewKey);
  const elements = getChatViewElements(viewKey);
  const input = elements.input;
  const form = elements.form;
  if (!view || view.reviewMode || !input || !recipientUid || view.sending === true || view.sendingMedia === true) return;

  const text = getChatInputText(input).trim();
  if (!text) return;
  if (text.length > 2000) {
    toast("Mỗi tin nhắn tối đa 2.000 ký tự.", "error");
    return;
  }

  const sendButton = form?.querySelector(".culao-chat-send-btn")
    || form?.querySelector('[type="submit"]');
  view.sending = true;
  setButtonLoading(sendButton, true, "Đang gửi...");
  try {
    const clientMessageId = window.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await sendChatMessageCallable({ recipientUid, text, clientMessageId });
    clearChatInput(input);

    // Trên iOS, giữ focus ngay trong vùng nhập để bàn phím không bị trượt xuống
    // khi người dùng bấm nút Gửi nằm ngoài contenteditable.
    window.requestAnimationFrame(() => {
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
      if (input.isContentEditable) {
        const selection = window.getSelection?.();
        const range = document.createRange?.();
        if (selection && range) {
          range.selectNodeContents(input);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    });

    if (viewKey === "mobile") scheduleMobileChatVisualViewport({ keepLatestMessageVisible: true });
  } catch (error) {
    console.error(error);
    toast(error.message || "Không gửi được tin nhắn.", "error");
  } finally {
    view.sending = false;
    setButtonLoading(sendButton, false);
  }
}

function buildChatWindowTitle(conversationId, partnerUid, reviewMode) {
  const conversation = getChatConversation(conversationId);
  if (reviewMode && conversation) {
    return conversation.participantIds
      .map((uid) => getChatUserName(uid, conversation))
      .join(" ↔ ");
  }
  return getChatUserName(partnerUid, conversation);
}

function openDesktopChatWindow({ conversationId, partnerUid = "", reviewMode = false }) {
  if (!els.chatMiniContainer) return;
  const existing = els.chatMiniContainer.querySelector(`[data-chat-conversation-id="${window.CSS?.escape ? CSS.escape(conversationId) : conversationId}"]`);
  if (existing) {
    existing.classList.remove("is-minimized");
    existing.querySelector("[data-chat-input]")?.focus();
    return;
  }

  if (state.chatOpenDesktopIds.length >= CHAT_MAX_DESKTOP_WINDOWS) {
    closeDesktopChatWindow(state.chatOpenDesktopIds[0]);
  }

  const viewKey = `desktop:${conversationId}`;
  const title = buildChatWindowTitle(conversationId, partnerUid, reviewMode);
  const conversation = getChatConversation(conversationId);
  const subtitle = reviewMode
    ? "Chế độ xem của Admin"
    : getChatUserRole(partnerUid, conversation);
  const root = document.createElement("section");
  root.className = "culao-chat-mini-window";
  root.dataset.chatConversationId = conversationId;
  root.dataset.chatViewKey = viewKey;
  root.innerHTML = `
    <header class="culao-chat-mini-head">
      <div class="culao-chat-mini-person">
        ${reviewMode ? '<span class="culao-chat-avatar role-admin" aria-hidden="true">QL</span>' : chatAvatarHtml(getChatUser(partnerUid) || { uid: partnerUid, name: title }, conversation)}
        <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span>
      </div>
      <div class="culao-chat-mini-actions">
        <button type="button" data-chat-action="minimize-window" aria-label="Thu nhỏ">—</button>
        <button type="button" data-chat-action="close-window" aria-label="Đóng">×</button>
      </div>
    </header>
    <div class="culao-chat-mini-body">
      <button class="culao-chat-load-more hidden" type="button" data-chat-load-more>Tải tin nhắn cũ</button>
      <div class="culao-chat-messages" data-chat-messages></div>
      ${reviewMode ? '<div class="culao-chat-readonly-note">Admin đang xem lịch sử. Không thể gửi thay người tham gia.</div>' : `
        <form class="culao-chat-composer" data-chat-composer>
          <button type="button" class="culao-chat-attach-btn" data-chat-attach aria-label="Gửi hình ảnh hoặc video">＋</button>
          <input class="hidden" type="file" accept="image/*,video/*" multiple data-chat-file-input />
          <textarea data-chat-input rows="1" maxlength="2000" placeholder="Nhập tin nhắn..." aria-label="Nhập tin nhắn"></textarea>
          <button type="submit" class="culao-chat-send-btn" aria-label="Gửi tin nhắn">➤</button>
        </form>
      `}
    </div>
  `;
  els.chatMiniContainer.appendChild(root);
  state.chatOpenDesktopIds.push(conversationId);
  subscribeChatView({ viewKey, conversationId, partnerUid, reviewMode, showSenderNames: reviewMode });
  root.querySelector("[data-chat-input]")?.focus();
}

function closeDesktopChatWindow(conversationId) {
  const safeId = window.CSS?.escape ? CSS.escape(conversationId) : conversationId;
  const root = els.chatMiniContainer?.querySelector(`[data-chat-conversation-id="${safeId}"]`);
  const viewKey = root?.dataset.chatViewKey || `desktop:${conversationId}`;
  unsubscribeChatView(viewKey);
  root?.remove();
  state.chatOpenDesktopIds = state.chatOpenDesktopIds.filter((id) => id !== conversationId);
}

function openMobileChatConversation({ conversationId, partnerUid = "", reviewMode = false }) {
  if (!els.chatMobileConversationView) return;
  state.chatMobileConversationId = conversationId;
  state.chatMobilePartnerUid = partnerUid;
  state.chatMobileReviewMode = reviewMode;
  const title = buildChatWindowTitle(conversationId, partnerUid, reviewMode);
  const conversation = getChatConversation(conversationId);
  if (els.chatMobileTitle) els.chatMobileTitle.textContent = title;
  if (els.chatMobileSubtitle) {
    els.chatMobileSubtitle.textContent = reviewMode
      ? "Chế độ xem của Admin"
      : getChatUserRole(partnerUid, conversation);
  }
  els.chatDirectoryView?.classList.add("hidden");
  els.chatMobileConversationView.classList.remove("hidden");
  els.chatMobileComposer?.classList.toggle("hidden", reviewMode);
  subscribeChatView({ viewKey: "mobile", conversationId, partnerUid, reviewMode, showSenderNames: reviewMode });
  // Không tự bật bàn phím khi vừa mở cuộc trò chuyện. Chỉ mở khi người dùng
  // chủ động chạm vào ô nhập, giống hành vi của các ứng dụng nhắn tin.
  els.chatMobileInput?.blur();
  scheduleMobileChatVisualViewport({ keepLatestMessageVisible: true });
}

function closeMobileChatConversation({ returnToDirectory = true } = {}) {
  unsubscribeChatView("mobile");
  state.chatMobileConversationId = "";
  state.chatMobilePartnerUid = "";
  state.chatMobileReviewMode = false;
  els.chatMobileConversationView?.classList.add("hidden");
  els.chatMobileInput?.blur();
  document.body.classList.remove("culao-chat-keyboard-open");
  if (returnToDirectory) els.chatDirectoryView?.classList.remove("hidden");
  scheduleMobileChatVisualViewport();
}

async function openChatWithUser(userUid) {
  if (!state.user || !userUid || userUid === state.user.uid) return;
  const conversationId = getChatConversationId(state.user.uid, userUid);
  try {
    await ensureChatConversationCallable({ recipientUid: userUid });
  } catch (error) {
    console.error(error);
    toast(error.message || "Không mở được cuộc trò chuyện.", "error");
    return;
  }
  if (isMobileChatLayout()) {
    openChatDirectory();
    openMobileChatConversation({ conversationId, partnerUid: userUid });
  } else {
    closeChatDirectory();
    openDesktopChatWindow({ conversationId, partnerUid: userUid });
  }
}

async function openChatConversationById(conversationId, suggestedPartnerUid = "", { reviewMode = false } = {}) {
  if (!conversationId || !state.user) return;
  let conversation = getChatConversation(conversationId);
  if (!conversation) {
    try {
      const snapshot = await getDoc(doc(db, "chatConversations", conversationId));
      if (snapshot.exists()) conversation = { id: snapshot.id, ...snapshot.data() };
    } catch (error) {
      console.warn("Không đọc được cuộc trò chuyện cần mở:", error);
    }
  }

  const isParticipant = conversation?.participantIds?.includes(state.user.uid) === true;
  const effectiveReviewMode = reviewMode || (isAdminProfile() && conversation && !isParticipant);
  const partnerUid = suggestedPartnerUid
    || (isParticipant ? getChatPartnerUid(conversation) : "");

  if (!conversation && !partnerUid) {
    toast("Không tìm thấy cuộc trò chuyện.", "error");
    return;
  }

  closeChatAdminModal();
  if (isMobileChatLayout()) {
    openChatDirectory();
    openMobileChatConversation({ conversationId, partnerUid, reviewMode: effectiveReviewMode });
  } else {
    closeChatDirectory();
    openDesktopChatWindow({ conversationId, partnerUid, reviewMode: effectiveReviewMode });
  }
  clearChatPushQueryParams();
}

async function openChatConversationFromNotification(notification) {
  await openChatConversationById(
    notification.chatConversationId,
    notification.chatSenderUid || notification.actorUid || ""
  );
}

function clearChatPushQueryParams() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("chatId") && !url.searchParams.has("chatWith")) return;
  url.searchParams.delete("chatId");
  url.searchParams.delete("chatWith");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function queuePushChatOpen(conversationId, partnerUid = "") {
  const normalizedId = String(conversationId || "").trim();
  if (!normalizedId) return;
  state.pendingPushConversationId = normalizedId;
  state.pendingPushChatPartnerUid = String(partnerUid || "").trim();
  let attempts = 0;
  const tryOpen = async () => {
    attempts += 1;
    if (state.user && state.profile && !state.chatUsersLoading) {
      state.pendingPushConversationId = "";
      state.pendingPushChatPartnerUid = "";
      await openChatConversationById(normalizedId, partnerUid);
      return;
    }
    if (attempts < 30 && state.user) window.setTimeout(tryOpen, 400);
  };
  tryOpen();
}

function openChatAdminModal() {
  if (!isAdminProfile() || !els.chatAdminModal) return;
  closeChatDirectory();
  state.chatAdminSearchText = "";
  if (els.chatAdminSearch) els.chatAdminSearch.value = "";
  els.chatAdminModal.classList.remove("hidden");
  document.body.classList.add("culao-chat-overlay-open");
  renderChatAdminConversations();
}

function closeChatAdminModal() {
  els.chatAdminModal?.classList.add("hidden");
  if (!state.chatDirectoryOpen) document.body.classList.remove("culao-chat-overlay-open");
}

function renderChatAdminConversations() {
  if (!els.chatAdminConversationList || !isAdminProfile()) return;
  const search = normalizeSearchText(state.chatAdminSearchText || "");
  const conversations = state.chatConversations
    .filter((item) => Number(item.messageCount || 0) > 0 || item.lastMessage)
    .filter((item) => {
      if (!search) return true;
      const names = (item.participantIds || []).map((uid) => getChatUserName(uid, item)).join(" ");
      return normalizeSearchText(`${names} ${item.lastMessage || ""}`).includes(search);
    })
    .sort((a, b) => getChatTimestampMs(b.lastMessageAt) - getChatTimestampMs(a.lastMessageAt));

  if (!conversations.length) {
    els.chatAdminConversationList.innerHTML = '<div class="culao-chat-empty">Chưa có lịch sử trò chuyện phù hợp.</div>';
    return;
  }

  els.chatAdminConversationList.innerHTML = conversations.map((conversation) => {
    const participants = (conversation.participantIds || []).map((uid) => ({
      uid,
      name: getChatUserName(uid, conversation),
      role: getChatUserRole(uid, conversation)
    }));
    const participantText = participants.map((item) => `${item.name} (${item.role})`).join(" ↔ ");
    return `
      <article class="culao-chat-admin-row">
        <div class="culao-chat-admin-participants">
          <strong>${escapeHtml(participantText)}</strong>
          <span>${escapeHtml(conversation.lastMessage || "Chưa có nội dung")}</span>
        </div>
        <time>${escapeHtml(formatDateTime(conversation.lastMessageAt || conversation.updatedAt))}</time>
        <span class="culao-chat-admin-count">${Number(conversation.messageCount || 0)} tin</span>
        <div class="culao-chat-admin-actions">
          <button class="btn primary small" type="button" data-chat-action="admin-open-conversation" data-chat-conversation-id="${escapeHtml(conversation.id)}">Mở Chat</button>
          <button class="btn danger small" type="button" data-chat-action="admin-delete-conversation" data-chat-conversation-id="${escapeHtml(conversation.id)}">Xóa lịch sử</button>
        </div>
      </article>
    `;
  }).join("");
}

async function deleteChatConversationAsAdmin(conversationId, button) {
  if (!isAdminProfile() || !conversationId) return;
  const conversation = getChatConversation(conversationId);
  const names = conversation?.participantIds?.map((uid) => getChatUserName(uid, conversation)).join(" và ") || "hai tài khoản";
  if (!window.confirm(`Xóa toàn bộ lịch sử Chat giữa ${names}? Hành động này không thể hoàn tác.`)) return;

  setButtonLoading(button, true, "Đang xóa...");
  try {
    await deleteChatConversationCallable({ conversationId });
    closeDesktopChatWindow(conversationId);
    if (state.chatMobileConversationId === conversationId) closeMobileChatConversation();
    toast("Đã xóa toàn bộ lịch sử Chat.", "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không xóa được lịch sử Chat.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function bindChatUI() {
  if (chatUiBound) return;
  chatUiBound = true;

  // Đưa panel ra thẳng body để position: fixed không bị ảnh hưởng bởi
  // backdrop-filter/stacking context của thanh topbar trên iOS và Android.
  if (els.chatDirectoryPanel && els.chatDirectoryPanel.parentElement !== document.body) {
    document.body.appendChild(els.chatDirectoryPanel);
  }

  els.chatToggleBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleChatDirectory();
  });
  els.chatDirectoryCloseBtn?.addEventListener("click", closeChatDirectory);
  els.chatDirectorySearch?.addEventListener("input", () => {
    state.chatSearchText = els.chatDirectorySearch.value;
    renderChatDirectory();
  });
  els.chatDirectoryAllTab?.addEventListener("click", () => setChatDirectoryFilter("all"));
  els.chatDirectoryUnreadTab?.addEventListener("click", () => setChatDirectoryFilter("unread"));
  els.openChatAdminBtn?.addEventListener("click", openChatAdminModal);
  els.chatMobileBackBtn?.addEventListener("click", () => closeMobileChatConversation());
  els.chatMobileCloseBtn?.addEventListener("click", closeChatDirectory);
  els.chatMobileLoadMoreBtn?.addEventListener("click", () => loadOlderChatMessages("mobile"));
  els.chatMobileAttachBtn?.addEventListener("click", () => {
    if (!state.chatMobilePartnerUid || state.chatMobileReviewMode) return;
    els.chatMobileFileInput?.click();
  });
  els.chatMobileFileInput?.addEventListener("change", async () => {
    await sendChatMediaFiles("mobile", state.chatMobilePartnerUid, els.chatMobileFileInput?.files);
  });

  // iOS có thể làm mất focus của contenteditable ngay khi chạm nút Gửi,
  // khiến lần chạm đầu chỉ đóng bàn phím và sự kiện click bị nuốt. Gửi ngay từ
  // pointerdown/touchstart và preventDefault để giữ bàn phím mở.
  const mobileSendButton = els.chatMobileComposer?.querySelector(".culao-chat-send-btn");
  let mobileSendHandledAt = 0;
  const handleMobileSendPress = async (event) => {
    if (event?.cancelable) event.preventDefault();
    event?.stopPropagation?.();
    mobileSendHandledAt = Date.now();
    await sendChatMessage("mobile", state.chatMobilePartnerUid);
  };

  if (mobileSendButton) {
    if ("PointerEvent" in window) {
      mobileSendButton.addEventListener("pointerdown", handleMobileSendPress, { passive: false });
    } else {
      mobileSendButton.addEventListener("touchstart", handleMobileSendPress, { passive: false });
    }
    mobileSendButton.addEventListener("click", async (event) => {
      // Click là phương án dự phòng cho bàn phím/mouse; bỏ qua click phát sinh
      // ngay sau pointerdown để tránh gửi trùng.
      if (Date.now() - mobileSendHandledAt < 900) {
        if (event.cancelable) event.preventDefault();
        return;
      }
      await handleMobileSendPress(event);
    });
  }

  els.chatMobileInput?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    await sendChatMessage("mobile", state.chatMobilePartnerUid);
    scheduleMobileChatVisualViewport({ keepLatestMessageVisible: true });
  });
  els.chatMobileInput?.addEventListener("beforeinput", (event) => {
    if (event.isComposing) return;
    if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      event.preventDefault();
    }
  });
  els.chatMobileInput?.addEventListener("paste", (event) => {
    event.preventDefault();
    setPlainTextAtSelection(els.chatMobileInput, event.clipboardData?.getData("text/plain") || "");
    sanitizeMobileChatInput();
  });
  els.chatMobileInput?.addEventListener("input", () => sanitizeMobileChatInput());
  els.chatMobileInput?.addEventListener("focus", () => {
    scheduleMobileChatVisualViewport({ keepLatestMessageVisible: true });
    window.setTimeout(() => scheduleMobileChatVisualViewport({ keepLatestMessageVisible: true }), 120);
    window.setTimeout(() => scheduleMobileChatVisualViewport({ keepLatestMessageVisible: true }), 360);
  });
  els.chatMobileInput?.addEventListener("blur", () => {
    document.body.classList.remove("culao-chat-keyboard-open");
    window.setTimeout(() => scheduleMobileChatVisualViewport(), 80);
  });

  const mobileChatViewportHandler = () => scheduleMobileChatVisualViewport({ keepLatestMessageVisible: true });
  window.visualViewport?.addEventListener("resize", mobileChatViewportHandler, { passive: true });
  window.visualViewport?.addEventListener("scroll", mobileChatViewportHandler, { passive: true });
  window.addEventListener("orientationchange", () => {
    chatMobileViewportBaseHeight = 0;
    window.setTimeout(mobileChatViewportHandler, 120);
  }, { passive: true });
  els.chatAdminCloseBtn?.addEventListener("click", closeChatAdminModal);
  els.chatAdminModal?.querySelector("[data-chat-admin-close]")?.addEventListener("click", closeChatAdminModal);
  els.chatAdminSearch?.addEventListener("input", () => {
    state.chatAdminSearchText = els.chatAdminSearch.value;
    renderChatAdminConversations();
  });

  els.chatDirectoryList?.addEventListener("click", (event) => {
    const button = event.target.closest('[data-chat-action="open-user"]');
    if (button) openChatWithUser(button.dataset.chatUserId);
  });

  els.chatMiniContainer?.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-chat-action]");
    const root = event.target.closest("[data-chat-conversation-id]");
    if (!actionButton || !root) return;
    const conversationId = root.dataset.chatConversationId;
    const viewKey = root.dataset.chatViewKey;
    if (actionButton.dataset.chatAction === "close-window") closeDesktopChatWindow(conversationId);
    if (actionButton.dataset.chatAction === "minimize-window") root.classList.toggle("is-minimized");
    if (actionButton.hasAttribute("data-chat-load-more")) loadOlderChatMessages(viewKey);
  });

  els.chatMiniContainer?.addEventListener("click", (event) => {
    const attachButton = event.target.closest("[data-chat-attach]");
    const root = event.target.closest("[data-chat-view-key]");
    if (!attachButton || !root) return;
    root.querySelector("[data-chat-file-input]")?.click();
  });

  els.chatMiniContainer?.addEventListener("change", async (event) => {
    const fileInput = event.target.closest("[data-chat-file-input]");
    const root = event.target.closest("[data-chat-view-key]");
    if (!fileInput || !root) return;
    const view = state.chatViewStates.get(root.dataset.chatViewKey);
    await sendChatMediaFiles(root.dataset.chatViewKey, view?.partnerUid || "", fileInput.files);
  });

  els.chatMiniContainer?.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-chat-composer]");
    const root = event.target.closest("[data-chat-conversation-id]");
    if (!form || !root) return;
    event.preventDefault();
    const view = state.chatViewStates.get(root.dataset.chatViewKey);
    await sendChatMessage(root.dataset.chatViewKey, view?.partnerUid || "");
  });

  els.chatMiniContainer?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    const input = event.target.closest("[data-chat-input]");
    const root = event.target.closest("[data-chat-conversation-id]");
    if (!input || !root) return;
    event.preventDefault();
    const view = state.chatViewStates.get(root.dataset.chatViewKey);
    await sendChatMessage(root.dataset.chatViewKey, view?.partnerUid || "");
  });

  els.chatMiniContainer?.addEventListener("click", (event) => {
    const loadMore = event.target.closest("[data-chat-load-more]");
    const root = event.target.closest("[data-chat-view-key]");
    if (loadMore && root) loadOlderChatMessages(root.dataset.chatViewKey);
  });

  els.chatAdminConversationList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-chat-action]");
    if (!button) return;
    const conversationId = button.dataset.chatConversationId;
    if (button.dataset.chatAction === "admin-open-conversation") {
      await openChatConversationById(conversationId, "", { reviewMode: true });
    }
    if (button.dataset.chatAction === "admin-delete-conversation") {
      await deleteChatConversationAsAdmin(conversationId, button);
    }
  });

  els.chatMediaViewerCloseBtn?.addEventListener("click", closeChatMediaViewer);
  els.chatMediaViewer?.addEventListener("click", (event) => {
    if (event.target === els.chatMediaViewer) closeChatMediaViewer();
  });

  document.addEventListener("click", async (event) => {
    const downloadButton = event.target.closest("[data-chat-media-download]");
    if (downloadButton) {
      event.preventDefault();
      event.stopPropagation();
      await downloadAllChatMediaFromButton(downloadButton);
      return;
    }

    const mediaButton = event.target.closest("[data-chat-media-open]");
    if (mediaButton) {
      openChatMediaViewer(
        mediaButton.dataset.chatMediaViewPath || "",
        mediaButton.dataset.chatMediaViewKind || "image",
        mediaButton.dataset.chatMediaViewName || "Tệp Chat"
      );
      return;
    }
    if (!state.chatDirectoryOpen || isMobileChatLayout()) return;
    if (!event.target.closest(".culao-chat-wrap") && !event.target.closest(".culao-chat-directory-panel")) {
      closeChatDirectory();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.chatMediaViewer?.classList.contains("hidden")) {
      closeChatMediaViewer();
      return;
    }
    if (!els.chatAdminModal?.classList.contains("hidden")) {
      closeChatAdminModal();
      return;
    }
    if (state.chatDirectoryOpen) closeChatDirectory();
  });
}

bindChatUI();


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
  } else if ((currentFilter.mode || "today") === "yesterday" && singleEl && !currentFilter.single) {
    singleEl.value = yesterdayInputValue();
  } else if (singleEl) {
    singleEl.value = currentFilter.single || "";
  }
  if (fromEl) fromEl.value = currentFilter.from || "";
  if (toEl) toEl.value = currentFilter.to || "";

  const onChange = () => {
    const mode = modeEl.value;
    const autoRange = getDateRangeByMode(mode);

    if (mode === "today" && singleEl) {
      singleEl.value = todayInputValue();
    }

    if (mode === "yesterday" && singleEl) {
      singleEl.value = yesterdayInputValue();
    }

    if (["current_month", "previous_month"].includes(mode) && singleEl) {
      singleEl.value = "";
    }

    state[`${prefix}DateFilter`] = {
      mode,
      single: ["today", "yesterday"].includes(mode) ? autoRange.from : (singleEl?.value || ""),
      from: ["current_month", "previous_month"].includes(mode) ? autoRange.from : (fromEl?.value || ""),
      to: ["current_month", "previous_month"].includes(mode) ? autoRange.to : (toEl?.value || "")
    };

    refreshDateFilterVisibility(scope);

    if (scope === "admin") {
      renderAdminTasks();
      // Nếu ô tìm kiếm đang mở, cập nhật ngay gợi ý theo phạm vi thời gian mới.
      renderAdminWorkOrderSuggestions();
    }
    if (scope === "employee") {
      renderEmployeeTasks();
      renderEmployeeWorkOrderSuggestions();
    }
  };

  modeEl.addEventListener("change", () => {
    const mode = modeEl.value;

    if (mode === "today" && singleEl) {
      singleEl.value = todayInputValue();
    }

    if (mode === "yesterday" && singleEl) {
      singleEl.value = yesterdayInputValue();
    }

    if (["current_month", "previous_month"].includes(mode)) {
      if (singleEl) singleEl.value = "";
      if (fromEl) fromEl.value = "";
      if (toEl) toEl.value = "";
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

  // Cả Admin và Nhân viên dùng cùng giao diện Bộ lọc:
  // - “Chọn 1 ngày”: chỉ hiện 1 ô lịch.
  // - “Khoảng ngày”: chỉ hiện 2 ô lịch.
  // - Các chế độ còn lại không hiện ô lịch phụ.
  const showSingleDate = filter.mode === "single";
  const showDateRange = filter.mode === "range";
  const sheet = singleEl?.closest?.(".mobile-filter-sheet") || fromEl?.closest?.(".mobile-filter-sheet");

  singleEl?.classList.toggle("hidden", !showSingleDate);
  singleEl?.classList.remove("mobile-auto-date-control");
  fromEl?.classList.toggle("hidden", !showDateRange);
  toEl?.classList.toggle("hidden", !showDateRange);

  sheet?.querySelector(".mobile-single-date-label")?.classList.toggle("hidden", !showSingleDate);
  sheet?.querySelector(".mobile-date-from-label")?.classList.toggle("hidden", !showDateRange);
  sheet?.querySelector(".mobile-date-to-label")?.classList.toggle("hidden", !showDateRange);

  clearEl?.classList.toggle("hidden", filter.mode === "all");

  if (summaryEl) summaryEl.textContent = getDateFilterSummary(filter);
}

function getDateFilterSummary(filter) {
  if (filter.mode === "today") return `Đang hiển thị công việc giao hôm nay (${formatDateOnly(todayInputValue())}).`;
  if (filter.mode === "yesterday") return `Đang hiển thị công việc giao hôm qua (${formatDateOnly(yesterdayInputValue())}).`;

  if (filter.mode === "current_month") {
    const range = getMonthDateRange(0);
    return `Đang hiển thị công việc trong tháng này (${formatDateOnly(range.from)} đến ${formatDateOnly(range.to)}).`;
  }

  if (filter.mode === "previous_month") {
    const range = getMonthDateRange(-1);
    return `Đang hiển thị công việc trong tháng trước (${formatDateOnly(range.from)} đến ${formatDateOnly(range.to)}).`;
  }

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
  if (filter.mode === "yesterday") return taskDate === yesterdayInputValue();

  if (["current_month", "previous_month"].includes(filter.mode)) {
    const range = filter.mode === "current_month" ? getMonthDateRange(0) : getMonthDateRange(-1);
    return taskDate >= range.from && taskDate <= range.to;
  }

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
bindAdminWorkOrderSearch();
bindEmployeeWorkOrderSearch();

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
  try {
    await unregisterCurrentDevicePushToken();
  } finally {
    await signOut(auth);
  }
});

onAuthStateChanged(auth, async (user) => {
  cleanupSubscriptions();
  cleanupChatFeature();

  state.user = user;
  state.profile = null;
  state.employees = [];
  state.supervisors = [];
  state.staffAccounts = [];
  state.tasks = [];
  state.workOrders = [];
  state.adminWorkOrderSearch = "";
  state.adminWorkOrderSuggestionIndex = -1;
  if (els.adminWorkOrderSearch) els.adminWorkOrderSearch.value = "";
  hideAdminWorkOrderSuggestions();
  state.timeExtensionReasons = [];
  state.workTemplates = [];
  state.notifications = [];
  state.knownNotificationIds = new Set();
  state.notificationsReady = false;
  state.workOrderControlSettings = normalizeWorkOrderControlSettings({});
  state.workOrderControlSettingsReady = false;
  state.workOrderSettingsAuthorizationToken = "";
  state.workOrderSettingsAuthorizationExpiresAt = 0;
  state.pushToken = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY) || "";
  state.pushTokenOwnerUid = localStorage.getItem(PUSH_TOKEN_OWNER_STORAGE_KEY) || "";
  state.chatUsers = [];
  state.chatConversations = [];
  state.chatConversationMap = new Map();
  state.chatViewStates = new Map();
  state.chatDirectoryOpen = false;
  state.chatDirectoryFilter = "all";
  state.chatSearchText = "";
  state.chatAdminSearchText = "";
  state.chatMobileConversationId = "";
  state.chatMobilePartnerUid = "";
  state.chatMobileReviewMode = false;
  state.chatOpenDesktopIds = [];
  state.chatReadRequestsInFlight = new Set();
  state.chatConversationFallbackTimer = null;
  state.chatConversationListenerWarningShown = false;

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
    setupChatFeature();
    await syncPushSubscriptionIfAllowed();

    if (isManagementProfile()) {
      setupAdminDashboard();
    } else {
      setupEmployeeDashboard();
    }

    if (state.pendingPushTaskId) queuePushTaskOpen(state.pendingPushTaskId);
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
  els.photoReportView?.classList.add("hidden");
  els.employeeView.classList.add("hidden");
  els.notificationPanel?.classList.add("hidden");
  closeChatDirectory();
  closeChatAdminModal();
}

function showApp() {
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");

  const roleText = getRoleDisplayName(state.profile.role);

  els.currentUserText.textContent = `${state.profile.name || state.user.email} • ${roleText}`;
  updateNotificationPermissionButton();
}

function cleanupSubscriptions() {
  state.unsubs.forEach((unsubscribe) => unsubscribe());
  state.unsubs = [];
}

// =========================
// Giao diện phân quyền Giám sát
// =========================
function permissionChecklistHtml(permissions = {}) {
  const normalized = normalizeSupervisorPermissions(permissions);

  return SUPERVISOR_PERMISSION_DEFINITIONS.map((permission) => `
    <label class="supervisor-permission-option ${permission.primary ? "is-primary" : ""}">
      <input type="checkbox" data-supervisor-permission-key="${escapeHtml(permission.key)}" ${normalized[permission.key] ? "checked" : ""} />
      <span class="supervisor-permission-copy">
        ${permission.primary ? '<span class="supervisor-permission-primary-tag">Quyền chính</span>' : ""}
        <strong>${escapeHtml(permission.label)}</strong>
        <span>${escapeHtml(permission.description)}</span>
      </span>
    </label>
  `).join("");
}

function renderSupervisorPermissionChecklist(container, permissions = {}) {
  if (!container) return;
  container.innerHTML = permissionChecklistHtml(permissions);
}

function readSupervisorPermissionChecklist(container) {
  const permissions = normalizeSupervisorPermissions({});
  if (!container) return permissions;

  container.querySelectorAll("[data-supervisor-permission-key]").forEach((checkbox) => {
    const key = checkbox.dataset.supervisorPermissionKey;
    if (SUPERVISOR_PERMISSION_KEYS.includes(key)) permissions[key] = checkbox.checked === true;
  });

  return permissions;
}

function setSupervisorPermissionChecklist(container, checked) {
  container?.querySelectorAll("[data-supervisor-permission-key]").forEach((checkbox) => {
    checkbox.checked = Boolean(checked);
  });
}

function updateCreateAccountRoleUI() {
  if (!els.staffAccountRole) return;

  const canCreateSupervisor = isAdminProfile();
  const supervisorOption = els.staffAccountRole.querySelector('option[value="supervisor"]');

  if (supervisorOption) supervisorOption.hidden = !canCreateSupervisor;
  if (!canCreateSupervisor && els.staffAccountRole.value === "supervisor") {
    els.staffAccountRole.value = "employee";
  }

  const isSupervisorAccount = canCreateSupervisor && els.staffAccountRole.value === "supervisor";
  els.createSupervisorPermissions?.classList.toggle("hidden", !isSupervisorAccount);

  const createButton = $("#createEmployeeBtn");
  if (createButton && !createButton.disabled) {
    createButton.textContent = isSupervisorAccount ? "Tạo Giám sát" : "Tạo Nhân viên";
  }
}

function applyManagementPermissionUI() {
  if (!isManagementProfile()) return;

  const isAdmin = isAdminProfile();
  const canCreate = hasPermission("createWorkOrder");
  const canAccessTemplates = hasPermission("accessWorkTemplates");
  const canAccessEmployees = hasPermission("accessEmployeeManager");
  const canExport = hasPermission("exportData");
  const canImport = hasPermission("importData");

  if (els.managementDashboardEyebrow) {
    els.managementDashboardEyebrow.textContent = isAdmin ? "Admin Dashboard" : "Giám sát Dashboard";
  }
  document.querySelectorAll(".management-section-eyebrow").forEach((element) => {
    element.textContent = isAdmin ? "Admin Dashboard" : "Giám sát Dashboard";
  });

  if (els.supervisorPermissionBanner) {
    if (isSupervisorProfile()) {
      const permissions = normalizeSupervisorPermissions(state.profile?.permissions);
      const grantedLabels = SUPERVISOR_PERMISSION_DEFINITIONS
        .filter((item) => permissions[item.key])
        .map((item) => item.label);

      els.supervisorPermissionBanner.innerHTML = `
        <strong>Tài khoản Giám sát • ${grantedLabels.length}/${SUPERVISOR_PERMISSION_KEYS.length} quyền đang bật</strong>
        <span>${grantedLabels.length ? escapeHtml(grantedLabels.join(" • ")) : "Admin chưa cấp quyền thao tác. Bạn vẫn được xem toàn bộ Phiếu công việc và kết quả báo cáo."}</span>
      `;
      els.supervisorPermissionBanner.classList.remove("hidden");
    } else {
      els.supervisorPermissionBanner.classList.add("hidden");
      els.supervisorPermissionBanner.innerHTML = "";
    }
  }

  els.openTaskModalBtn?.classList.toggle("hidden", !canCreate);
  els.floatingCreateTaskBtn?.classList.toggle("hidden", !canCreate);
  els.openWorkTemplatePageBtn?.classList.toggle("hidden", !canAccessTemplates);
  els.openEmployeeManagerPageBtn?.classList.toggle("hidden", !canAccessEmployees);
  els.exportDataBtn?.classList.toggle("hidden", !canExport);
  els.importDataBtn?.classList.toggle("hidden", !canImport);
  els.openGoogleCalendarImportBtn?.classList.toggle("hidden", !isAdmin);
  els.openGoogleCalendarImportMobileBtn?.classList.toggle("hidden", !isAdmin);

  const deletionLocked = isWorkOrderDeletionLocked();
  els.deleteAllWorkOrdersBtn?.classList.toggle(
    "hidden",
    !hasPermission("deleteAllWorkOrders") || deletionLocked
  );
  els.openWorkOrderSettingsBtn?.classList.toggle("hidden", !isAdmin);
  updateMobileTaskPanelMenuAvailability();
  els.openWorkTemplateModalBtn?.classList.toggle("hidden", !hasPermission("manageWorkTemplates"));

  const backupActions = els.exportDataBtn?.closest(".backup-actions");
  backupActions?.classList.toggle("hidden", !canExport && !canImport);

  if (els.mobileDataMenuBtn) {
    els.mobileDataMenuBtn.textContent = canExport && canImport
      ? "Xuất / Nhập dữ liệu"
      : canExport
        ? "Xuất dữ liệu"
        : "Nhập dữ liệu";
  }
  els.mobileDataMenu?.classList.toggle("has-single-action", canExport !== canImport);

  const visibleSecondaryActions = [canAccessTemplates, canAccessEmployees].filter(Boolean).length;
  document.querySelector(".management-dashboard-actions")?.classList.toggle(
    "has-single-secondary-action",
    visibleSecondaryActions === 1
  );

  if (!canExport && !canImport) setMobileDataMenuOpen(false);

  const canManageEmployeeAccounts = isAdmin || hasPermission("manageEmployeeAccounts");
  els.createStaffAccountPanel?.classList.toggle("hidden", !canManageEmployeeAccounts);

  // Nếu Admin vừa thu hồi quyền trong lúc Giám sát đang mở một trang/modal,
  // đóng ngay khu vực đó để quyền mới có hiệu lực realtime, không cần đăng xuất lại.
  if (!canAccessTemplates && els.workTemplateView && !els.workTemplateView.classList.contains("hidden")) {
    els.workTemplateView.classList.add("hidden");
    els.workTemplateModal?.classList.add("hidden");
    els.adminView?.classList.remove("hidden");
  }

  if (!canAccessEmployees && els.employeeManagerView && !els.employeeManagerView.classList.contains("hidden")) {
    els.employeeManagerView.classList.add("hidden");
    els.adminView?.classList.remove("hidden");
  }

  if (!canCreate && els.taskModal && !els.taskModal.classList.contains("hidden")) {
    els.taskModal.classList.add("hidden");
    state.editingWorkOrderId = null;
  }

  if (!isAdmin) closeSupervisorPermissionModal();

  updateCreateAccountRoleUI();
  renderEmployees();
  renderWorkTemplateList();
  renderAdminTasks();
  refreshPhotoReportPageIfOpen();
}

function closeSupervisorPermissionModal() {
  state.editingSupervisorUid = null;
  els.supervisorPermissionModal?.classList.add("hidden");
}

function openSupervisorPermissionModal(supervisorUid) {
  if (!isAdminProfile()) {
    toast("Chỉ Admin được thay đổi quyền của tài khoản Giám sát.", "error");
    return;
  }

  const supervisor = state.supervisors.find((item) => item.uid === supervisorUid);
  if (!supervisor) {
    toast("Không tìm thấy tài khoản Giám sát cần phân quyền.", "error");
    return;
  }

  state.editingSupervisorUid = supervisorUid;
  if (els.supervisorPermissionModalAccount) {
    els.supervisorPermissionModalAccount.textContent = `${supervisor.name || "Giám sát"} • ${supervisor.email || ""}`;
  }
  renderSupervisorPermissionChecklist(els.editSupervisorPermissionList, supervisor.permissions);
  els.supervisorPermissionModal?.classList.remove("hidden");
}

function bindSupervisorPermissionUI() {
  renderSupervisorPermissionChecklist(els.createSupervisorPermissionList, {});
  updateCreateAccountRoleUI();

  els.staffAccountRole?.addEventListener("change", updateCreateAccountRoleUI);
  els.selectAllCreateSupervisorPermissions?.addEventListener("click", () => setSupervisorPermissionChecklist(els.createSupervisorPermissionList, true));
  els.clearCreateSupervisorPermissions?.addEventListener("click", () => setSupervisorPermissionChecklist(els.createSupervisorPermissionList, false));
  els.selectAllEditSupervisorPermissions?.addEventListener("click", () => setSupervisorPermissionChecklist(els.editSupervisorPermissionList, true));
  els.clearEditSupervisorPermissions?.addEventListener("click", () => setSupervisorPermissionChecklist(els.editSupervisorPermissionList, false));

  document.querySelectorAll("[data-close-supervisor-permission-modal]").forEach((button) => {
    button.addEventListener("click", closeSupervisorPermissionModal);
  });

  els.saveSupervisorPermissionsBtn?.addEventListener("click", async () => {
    if (!isAdminProfile() || !state.editingSupervisorUid) return;

    const supervisor = state.supervisors.find((item) => item.uid === state.editingSupervisorUid);
    if (!supervisor) {
      toast("Không tìm thấy tài khoản Giám sát cần cập nhật.", "error");
      return;
    }

    const permissions = readSupervisorPermissionChecklist(els.editSupervisorPermissionList);
    setButtonLoading(els.saveSupervisorPermissionsBtn, true, "Đang lưu...");

    try {
      await updateDoc(doc(db, "users", supervisor.uid), {
        permissions,
        permissionsUpdatedAt: serverTimestamp(),
        permissionsUpdatedByUid: state.user.uid,
        permissionsUpdatedByName: state.profile?.name || state.user?.email || "Admin"
      });
      closeSupervisorPermissionModal();
      toast(`Đã cập nhật phân quyền cho ${supervisor.name || supervisor.email}.`, "success");
    } catch (error) {
      console.error(error);
      toast(error.message || "Không lưu được phân quyền Giám sát.", "error");
    } finally {
      setButtonLoading(els.saveSupervisorPermissionsBtn, false);
    }
  });
}

bindSupervisorPermissionUI();

// =========================
// Admin / Giám sát dashboard
// =========================
function setupAdminDashboard() {
  els.adminView.classList.remove("hidden");
  els.workTemplateView?.classList.add("hidden");
  els.employeeManagerView?.classList.add("hidden");
  els.photoReportView?.classList.add("hidden");
  els.employeeView.classList.add("hidden");
  applyManagementPermissionUI();

  const unsubUsers = onSnapshot(
    collection(db, "users"),
    (snapshot) => {
      const users = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }));

      const currentProfile = users.find((item) => item.uid === state.user?.uid || item.id === state.user?.uid);
      if (currentProfile && isManagementProfile(currentProfile)) {
        state.profile = currentProfile;
        showApp();
      }

      state.employees = users
        .filter((user) => user.role === "employee")
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));

      state.supervisors = users
        .filter((user) => user.role === "supervisor")
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "vi"));

      state.staffAccounts = [...state.employees, ...state.supervisors]
        .sort((a, b) => {
          const roleDifference = (a.role === "supervisor" ? 1 : 0) - (b.role === "supervisor" ? 1 : 0);
          return roleDifference || (a.name || "").localeCompare(b.name || "", "vi");
        });

      applyManagementPermissionUI();
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

      // Chỉ tài khoản Admin tự đồng bộ trạng thái quá hạn vào database.
      // Giám sát vẫn nhìn thấy trạng thái tính toán realtime nhưng không tự ghi dữ liệu nếu không phải Admin.
      if (isAdminProfile()) await syncOverdueTasksByAdmin();
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

  const workOrderSettingsRef = doc(db, "appSettings", WORK_ORDER_CONTROL_SETTINGS_DOC_ID);
  const unsubWorkOrderControlSettings = onSnapshot(
    workOrderSettingsRef,
    (snapshot) => {
      state.workOrderControlSettings = normalizeWorkOrderControlSettings(
        snapshot.exists() ? snapshot.data() : {}
      );
      state.workOrderControlSettingsReady = true;
      applyManagementPermissionUI();
      renderAdminTasks();
      updateExtendTimeLimitUI();
    },
    (error) => {
      console.error(error);
      state.workOrderControlSettingsReady = false;
      toast("Không đọc được Cài đặt Phiếu công việc. Hãy deploy Firestore Rules mới nhất.", "error");
    }
  );

  state.unsubs.push(
    unsubUsers,
    unsubTasks,
    unsubWorkOrders,
    unsubWorkTemplates,
    unsubTimeExtensionReasons,
    unsubHotelDailyReports,
    unsubWorkOrderControlSettings
  );
}

function handleSnapshotError(error) {
  console.error(error);
  toast("Không đọc được dữ liệu realtime. Kiểm tra Firestore Rules hoặc index.", "error");
}


const EMPLOYMENT_STATUS_WORKING = "working";
const EMPLOYMENT_STATUS_OFF = "off";

function normalizeEmploymentStatus(account) {
  return account?.employmentStatus === EMPLOYMENT_STATUS_OFF
    ? EMPLOYMENT_STATUS_OFF
    : EMPLOYMENT_STATUS_WORKING;
}

function isEmployeeWorking(employee) {
  return normalizeEmploymentStatus(employee) === EMPLOYMENT_STATUS_WORKING;
}

function getAssignableEmployees() {
  return state.employees.filter(isEmployeeWorking);
}

function getEmploymentStatusLabel(account) {
  return normalizeEmploymentStatus(account) === EMPLOYMENT_STATUS_OFF ? "Đang Off" : "Đang làm";
}

function ensureEmploymentStatusModal() {
  let modal = document.getElementById("employeeEmploymentStatusModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "employeeEmploymentStatusModal";
  modal.className = "employment-status-modal hidden";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="employment-status-backdrop" data-action="close-employment-status"></div>
    <section class="employment-status-dialog" role="dialog" aria-modal="true" aria-labelledby="employmentStatusTitle">
      <button class="employment-status-close" type="button" data-action="close-employment-status" aria-label="Đóng">×</button>
      <p class="eyebrow">TRẠNG THÁI NHÂN VIÊN</p>
      <h3 id="employmentStatusTitle">Cập nhật trạng thái</h3>
      <p id="employmentStatusEmployeeInfo" class="muted"></p>
      <div class="employment-status-options">
        <label class="employment-status-option is-working">
          <input type="radio" name="employeeEmploymentStatus" value="working" />
          <span><strong>Đang làm</strong><small>Có thể nhận công việc mới bình thường.</small></span>
        </label>
        <label class="employment-status-option is-off">
          <input type="radio" name="employeeEmploymentStatus" value="off" />
          <span><strong>Đang Off</strong><small>Không xuất hiện trong các danh sách giao hoặc đổi người.</small></span>
        </label>
      </div>
      <label class="employment-status-note-field">
        Ghi chú <span>(không bắt buộc)</span>
        <textarea id="employmentStatusNote" rows="3" placeholder="Ví dụ: Xin nghỉ việc gia đình"></textarea>
      </label>
      <div class="employment-status-actions">
        <button class="btn ghost" type="button" data-action="close-employment-status">Hủy</button>
        <button id="saveEmploymentStatusBtn" class="btn primary" type="button">Lưu trạng thái</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target.closest('[data-action="close-employment-status"]')) {
      closeEmploymentStatusModal();
    }
  });
  modal.querySelector("#saveEmploymentStatusBtn")?.addEventListener("click", saveEmploymentStatus);
  return modal;
}

function openEmploymentStatusModal(employeeUid) {
  if (!isAdminProfile()) return;
  const employee = state.employees.find((item) => item.uid === employeeUid);
  if (!employee) return;

  const modal = ensureEmploymentStatusModal();
  modal.dataset.employeeUid = employee.uid;
  modal.querySelector("#employmentStatusEmployeeInfo").textContent = `${employee.name || "Chưa đặt tên"} • ${employee.email || ""}`;
  const status = normalizeEmploymentStatus(employee);
  const radio = modal.querySelector(`input[name="employeeEmploymentStatus"][value="${status}"]`);
  if (radio) radio.checked = true;
  modal.querySelector("#employmentStatusNote").value = employee.employmentStatusNote || "";
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeEmploymentStatusModal() {
  const modal = document.getElementById("employeeEmploymentStatusModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  delete modal.dataset.employeeUid;
  document.body.classList.remove("modal-open");
}

async function saveEmploymentStatus() {
  const modal = document.getElementById("employeeEmploymentStatusModal");
  const employeeUid = modal?.dataset.employeeUid;
  const employee = state.employees.find((item) => item.uid === employeeUid);
  const selected = modal?.querySelector('input[name="employeeEmploymentStatus"]:checked')?.value;
  if (!modal || !employee || ![EMPLOYMENT_STATUS_WORKING, EMPLOYMENT_STATUS_OFF].includes(selected)) return;

  const button = modal.querySelector("#saveEmploymentStatusBtn");
  const previousStatus = normalizeEmploymentStatus(employee);
  const note = modal.querySelector("#employmentStatusNote")?.value.trim() || "";

  try {
    setButtonLoading(button, true);
    await updateDoc(doc(db, "users", employee.uid), {
      employmentStatus: selected,
      employmentStatusNote: note,
      employmentStatusUpdatedAt: serverTimestamp(),
      employmentStatusUpdatedBy: state.user.uid,
      employmentStatusUpdatedByName: state.profile?.name || state.profile?.email || "Admin",
      employmentStatusHistory: arrayUnion({
        from: previousStatus,
        to: selected,
        note,
        changedAt: Timestamp.now(),
        changedByUid: state.user.uid,
        changedByName: state.profile?.name || state.profile?.email || "Admin"
      })
    });
    closeEmploymentStatusModal();
    toast(`Đã chuyển ${employee.name || employee.email} sang trạng thái ${selected === EMPLOYMENT_STATUS_OFF ? "Đang Off" : "Đang làm"}.`, "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không cập nhật được trạng thái nhân viên.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function employeeHasCurrentAssignedWork() {
  return state.tasks.some((task) => (
    task.assignedToUid === state.user?.uid
    && isUnfinishedAssignedTask(task)
  ));
}

function renderEmployeeEmploymentStatusBanner() {
  if (!els.employeeView || !state.profile || state.profile.role !== "employee") return;

  // Hai ô trạng thái của nhân viên phải luôn nằm ngay dưới ô "Chưa giao việc"
  // và phía trên bảng "Danh sách việc cần làm" trên cả desktop lẫn mobile.
  const unassignedSummary = els.employeeView.querySelector(".employee-unassigned-work-order-summary");
  const employeeHero = els.employeeView.querySelector(".employee-hero");

  let banner = document.getElementById("employeeEmploymentStatusBanner");
  if (!banner) {
    banner = document.createElement("section");
    banner.id = "employeeEmploymentStatusBanner";
  }

  if (unassignedSummary) {
    unassignedSummary.insertAdjacentElement("afterend", banner);
  } else {
    employeeHero?.insertAdjacentElement("afterend", banner);
  }

  let assignmentBanner = document.getElementById("employeeAssignmentStatusBanner");
  const isOff = normalizeEmploymentStatus(state.profile) === EMPLOYMENT_STATUS_OFF;
  banner.className = `employee-employment-status-banner ${isOff ? "is-off" : "is-working"}`;
  banner.innerHTML = isOff
    ? `<strong>Trạng thái làm việc: Đang Off</strong><span>Bạn hiện không nhận công việc mới. Các công việc đã được giao trước đó vẫn được giữ nguyên.</span>`
    : `<strong>Trạng thái làm việc: Đang làm</strong><span>Bạn có thể nhận công việc mới bình thường.</span>`;

  if (isOff) {
    assignmentBanner?.remove();
    return;
  }

  if (!assignmentBanner) {
    assignmentBanner = document.createElement("section");
    assignmentBanner.id = "employeeAssignmentStatusBanner";
    assignmentBanner.setAttribute("role", "status");
    assignmentBanner.setAttribute("aria-live", "polite");
  }

  const hasAssignedWork = employeeHasCurrentAssignedWork();
  assignmentBanner.className = `employee-assignment-status-banner ${hasAssignedWork ? "has-assigned-work" : "has-no-assigned-work"}`;
  assignmentBanner.innerHTML = hasAssignedWork
    ? `<strong>Đã nhận công việc</strong>`
    : `<strong>Chưa có việc được giao:</strong><span>Xuống bán hàng nhận công việc mới</span>`;
  banner.insertAdjacentElement("afterend", assignmentBanner);
}

function renderEmployees() {
  if (!els.employeeList) return;

  const allAccounts = Array.isArray(state.staffAccounts) ? state.staffAccounts : [];
  const employeeCount = allAccounts.filter((account) => account.role !== "supervisor").length;
  const supervisorCount = allAccounts.filter((account) => account.role === "supervisor").length;

  if (els.employeeStats) {
    els.employeeStats.innerHTML = `
      <span class="employee-stat-pill">Tổng <strong>${allAccounts.length}</strong></span>
      <span class="employee-stat-pill">Nhân viên <strong>${employeeCount}</strong></span>
      <span class="employee-stat-pill is-supervisor">Giám sát <strong>${supervisorCount}</strong></span>
    `;
  }

  if (!allAccounts.length) {
    els.employeeList.innerHTML = "Chưa có tài khoản nhân viên hoặc giám sát.";
    els.employeeList.classList.add("empty");
    return;
  }

  const keyword = normalizeSearchText(els.employeeSearch?.value || "");
  const roleFilter = els.employeeRoleFilter?.value || "all";
  const visibleAccounts = allAccounts.filter((account) => {
    const roleMatches = roleFilter === "all" || account.role === roleFilter;
    const searchHaystack = normalizeSearchText(`${account.name || ""} ${account.email || ""}`);
    return roleMatches && (!keyword || searchHaystack.includes(keyword));
  });

  els.employeeList.classList.remove("empty");

  if (!visibleAccounts.length) {
    els.employeeList.innerHTML = '<div class="employee-list-no-results">Không tìm thấy tài khoản phù hợp.</div>';
    return;
  }

  els.employeeList.innerHTML = visibleAccounts
    .map((account) => {
      const isDeleting = state.deletingEmployeeUid === account.uid;
      const accountLabel = account.name || account.email || "tài khoản này";
      const isSupervisor = account.role === "supervisor";
      const canEditPermissions = isAdminProfile() && isSupervisor;
      const canDeleteAccount = isAdminProfile()
        || (hasPermission("manageEmployeeAccounts") && account.role === "employee");
      const grantedCount = isSupervisor ? getGrantedSupervisorPermissionCount(account) : 0;

      return `
        <div class="employee-item ${account.role === "employee" && isAdminProfile() ? "is-status-clickable" : ""}" data-employee-uid="${escapeHtml(account.uid)}">
          <div class="avatar">${escapeHtml(initials(account.name))}</div>
          <div class="employee-item-info">
            <strong title="${escapeHtml(account.name || "Chưa đặt tên")}">${escapeHtml(account.name || "Chưa đặt tên")}</strong>
            <span title="${escapeHtml(account.email || "")}">${escapeHtml(account.email || "")}</span>
            <div class="staff-account-meta">
              <span class="staff-role-badge ${isSupervisor ? "is-supervisor" : ""}">${isSupervisor ? "Giám sát" : "Nhân viên"}</span>
              ${!isSupervisor ? `<span class="employment-status-badge ${normalizeEmploymentStatus(account) === EMPLOYMENT_STATUS_OFF ? "is-off" : "is-working"}">${getEmploymentStatusLabel(account)}</span>` : ""}
              ${isSupervisor ? `<span class="staff-permission-count">${grantedCount}/${SUPERVISOR_PERMISSION_KEYS.length} quyền</span>` : ""}
            </div>
          </div>
          <div class="staff-account-actions">
            ${canEditPermissions ? `
              <button
                type="button"
                class="btn ghost small staff-permission-btn"
                data-action="edit-supervisor-permissions"
                data-supervisor-uid="${escapeHtml(account.uid)}"
                aria-label="Phân quyền cho ${escapeHtml(accountLabel)}"
                title="Phân quyền"
              >Phân quyền</button>
            ` : ""}
            ${canDeleteAccount ? `
              <button
                type="button"
                class="employee-delete-btn"
                data-action="delete-employee"
                data-employee-uid="${escapeHtml(account.uid)}"
                aria-label="Xóa toàn bộ dữ liệu của ${escapeHtml(accountLabel)}"
                title="Xóa toàn bộ dữ liệu tài khoản"
                ${isDeleting ? "disabled" : ""}
              >${isDeleting ? "…" : "×"}</button>
            ` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function getHotelReportTimeStatusText(report, totalActualMinutes) {
  const endPetCount = Number(report?.endPetCount || 0);
  const allowedMinutes = Number(report?.allowedMinutes || 0);

  if (!endPetCount) {
    return report?.timeStatusText || "Chưa nhập số lượng bé hotel cuối ngày";
  }

  const dateKey = String(report?.date || report?.id || "");
  const reportDayText = dateKey === todayInputValue()
    ? "hôm nay"
    : `ngày ${formatDateOnly(dateKey)}`;

  return Number(totalActualMinutes || 0) <= allowedMinutes
    ? `Các bạn ${reportDayText} làm đúng thời gian`
    : `Các bạn ${reportDayText} làm không đúng thời gian`;
}

function hotelReportEntryBelongsToEmployee(entry, employee) {
  if (!entry || !employee) return false;
  if (entry.uid && entry.uid === employee.uid) return true;

  // Một số báo cáo Hotel cũ có thể chưa lưu uid, chỉ lưu tên nhân viên.
  // Chỉ dùng tên làm phương án dự phòng khi dòng báo cáo không có uid.
  if (!entry.uid && employee.name) {
    return normalizeSearchText(entry.name || "") === normalizeSearchText(employee.name);
  }

  return false;
}

async function deleteEmployeeData(employeeUid) {
  if (!employeeUid) return;

  const employee = state.staffAccounts.find((item) => item.uid === employeeUid);
  if (!employee) {
    toast("Không tìm thấy tài khoản cần xóa.", "error");
    return;
  }

  const canDelete = isAdminProfile()
    || (hasPermission("manageEmployeeAccounts") && employee.role === "employee");

  if (!canDelete) {
    toast("Tài khoản của bạn chưa được cấp quyền xóa tài khoản này.", "error");
    return;
  }

  if (employeeUid === state.user?.uid) {
    toast("Bạn không thể tự xóa tài khoản đang đăng nhập.", "error");
    return;
  }

  const employeeName = employee.name || employee.email || "tài khoản này";
  const currentEmployeeTasks = state.tasks.filter((task) => task.assignedToUid === employeeUid);
  const currentPhotoCount = getTaskPhotoStoragePaths(currentEmployeeTasks).length;
  const affectedTicketCount = new Set(
    currentEmployeeTasks
      .map((task) => task.workOrderId)
      .filter(Boolean)
  ).size;

  const confirmed = window.confirm(
    `Bạn có chắc chắn muốn xóa toàn bộ dữ liệu của tài khoản “${employeeName}” không?\n\n`
    + `Hệ thống sẽ xóa hồ sơ tài khoản, ${currentEmployeeTasks.length} công việc được giao, dữ liệu trong ${affectedTicketCount} phiếu liên quan, ${currentPhotoCount} hình ảnh báo cáo, thông báo và phần thống kê Hotel có liên quan.\n\n`
    + "Các công việc của người khác trong cùng Phiếu công việc vẫn được giữ lại. Hành động này không thể hoàn tác."
  );

  if (!confirmed) return;

  state.deletingEmployeeUid = employeeUid;
  renderEmployees();

  try {
    // Đọc dữ liệu mới nhất trước khi xóa để không phụ thuộc vào snapshot đang hiển thị.
    const [tasksSnapshot, workOrdersSnapshot, notificationsSnapshot, hotelReportsSnapshot] = await Promise.all([
      getDocs(collection(db, "tasks")),
      getDocs(collection(db, "workOrders")),
      getDocs(collection(db, "notifications")),
      getDocs(collection(db, "hotelDailyReports"))
    ]);

    const allTasks = tasksSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const allWorkOrders = workOrdersSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const employeeTasks = allTasks.filter((task) => task.assignedToUid === employeeUid);
    const employeeTaskIds = new Set(employeeTasks.map((task) => task.id));
    const affectedWorkOrderIds = new Set(
      employeeTasks
        .map((task) => task.workOrderId)
        .filter(Boolean)
    );

    // Xóa file ảnh trước. Nếu Storage gặp lỗi thì dừng để tránh Firestore bị xóa dở.
    const deletedPhotos = await deleteTaskPhotosFromStorage(employeeTasks);
    const operations = [];

    employeeTasks.forEach((task) => {
      operations.push((batch) => batch.delete(doc(db, "tasks", task.id)));
    });

    // Phiếu chỉ có công việc của nhân viên bị xóa sẽ bị xóa theo.
    // Phiếu có công việc của người khác sẽ được giữ lại và cập nhật lại số lượng/thứ tự.
    affectedWorkOrderIds.forEach((workOrderId) => {
      const workOrder = allWorkOrders.find((item) => item.id === workOrderId);
      const remainingTasks = allTasks
        .filter((task) => task.workOrderId === workOrderId && task.assignedToUid !== employeeUid)
        .sort((a, b) => Number(a.rowIndex || 0) - Number(b.rowIndex || 0));

      if (!remainingTasks.length) {
        if (workOrder) {
          operations.push((batch) => batch.delete(doc(db, "workOrders", workOrderId)));
        }
        return;
      }

      if (workOrder) {
        operations.push((batch) => batch.update(doc(db, "workOrders", workOrderId), {
          taskCount: remainingTasks.length
        }));
      }

      remainingTasks.forEach((task, index) => {
        operations.push((batch) => batch.update(doc(db, "tasks", task.id), {
          rowIndex: index,
          workOrderTaskCount: remainingTasks.length
        }));
      });
    });

    // Xóa thông báo trực tiếp của nhân viên và mọi thông báo tham chiếu tới task đã xóa.
    notificationsSnapshot.docs.forEach((item) => {
      const notification = item.data();
      if (
        notification.recipientUid === employeeUid
        || notification.actorUid === employeeUid
        || employeeTaskIds.has(notification.taskId)
      ) {
        operations.push((batch) => batch.delete(doc(db, "notifications", item.id)));
      }
    });

    // Gỡ phần thống kê của nhân viên khỏi các báo cáo Hotel lịch sử,
    // đồng thời tính lại tổng thời gian và kết luận của ngày đó.
    hotelReportsSnapshot.docs.forEach((item) => {
      const report = { id: item.id, ...item.data() };
      const originalTotals = Array.isArray(report.employeeTotals) ? report.employeeTotals : [];
      const employeeTotals = originalTotals.filter((entry) => !hotelReportEntryBelongsToEmployee(entry, employee));

      if (employeeTotals.length === originalTotals.length) return;

      const totalActualMinutes = employeeTotals.reduce(
        (sum, entry) => sum + Number(entry?.minutes || 0),
        0
      );

      operations.push((batch) => batch.update(doc(db, "hotelDailyReports", item.id), {
        employeeTotals,
        totalActualMinutes,
        timeStatusText: getHotelReportTimeStatusText(report, totalActualMinutes),
        updatedAt: serverTimestamp()
      }));
    });

    // Xóa hồ sơ cuối cùng để tài khoản này mất quyền truy cập ứng dụng ngay sau khi dọn xong dữ liệu.
    operations.push((batch) => batch.delete(doc(db, "users", employeeUid)));

    await commitInChunks(operations);

    if (state.adminEmployeeFilter === employeeUid) {
      state.adminEmployeeFilter = "all";
      syncSelectValue(els.adminEmployeeFilter, "all");
    }

    toast(
      `Đã xóa dữ liệu của ${employeeName}: ${employeeTasks.length} công việc và ${deletedPhotos.deleted} hình ảnh báo cáo.`,
      "success"
    );
  } catch (error) {
    console.error(error);
    toast(error.message || `Không xóa được dữ liệu của ${employeeName}.`, "error");
  } finally {
    state.deletingEmployeeUid = null;
    renderEmployees();
  }
}

els.employeeSearch?.addEventListener("input", renderEmployees);
els.employeeRoleFilter?.addEventListener("change", renderEmployees);

els.employeeList?.addEventListener("click", (event) => {
  const permissionButton = event.target.closest('[data-action="edit-supervisor-permissions"]');
  if (permissionButton) {
    openSupervisorPermissionModal(permissionButton.dataset.supervisorUid);
    return;
  }

  const deleteButton = event.target.closest('[data-action="delete-employee"]');
  if (deleteButton) {
    if (!deleteButton.disabled) deleteEmployeeData(deleteButton.dataset.employeeUid);
    return;
  }

  const row = event.target.closest('.employee-item[data-employee-uid]');
  if (row && isAdminProfile()) {
    const account = state.employees.find((item) => item.uid === row.dataset.employeeUid);
    if (account) openEmploymentStatusModal(account.uid);
  }
});

function employeeOptionsHtml() {
  return getAssignableEmployees()
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

function getWorkOrderSearchScore(name, queryText) {
  const queryValue = normalizeSearchText(queryText);
  const nameValue = normalizeSearchText(name);

  if (!queryValue || !nameValue) return queryValue ? Number.POSITIVE_INFINITY : 0;
  if (nameValue === queryValue) return 0;

  if (nameValue.startsWith(queryValue)) {
    return 5 + Math.max(0, nameValue.length - queryValue.length) / 100;
  }

  const directIndex = nameValue.indexOf(queryValue);
  if (directIndex >= 0) {
    return 10 + directIndex + Math.max(0, nameValue.length - queryValue.length) / 100;
  }

  const queryWords = queryValue.split(" ").filter(Boolean);
  const nameWords = nameValue.split(" ").filter(Boolean);

  // Với nội dung rất ngắn, chỉ nhận kết quả chứa trực tiếp để tránh gợi ý sai quá nhiều.
  if (queryValue.length < 3) return Number.POSITIVE_INFINITY;

  let score = 30;

  for (const queryWord of queryWords) {
    if (nameWords.some((nameWord) => nameWord.startsWith(queryWord))) {
      score += 1;
      continue;
    }

    if (nameValue.includes(queryWord)) {
      score += 3;
      continue;
    }

    let closestDistance = Number.POSITIVE_INFINITY;

    nameWords.forEach((nameWord) => {
      closestDistance = Math.min(closestDistance, levenshteinDistance(queryWord, nameWord));
    });

    const allowedDistance = queryWord.length <= 4 ? 1 : 2;
    if (closestDistance > allowedDistance) return Number.POSITIVE_INFINITY;

    score += 8 + (closestDistance * 4);
  }

  return score + Math.abs(nameValue.length - queryValue.length) / 100;
}

function getAdminSearchStatusPriority(taskOrStatus) {
  const displayStatus = typeof taskOrStatus === "string"
    ? taskOrStatus
    : (taskOrStatus?.displayStatus || getDisplayStatus(taskOrStatus || {}));

  const priorities = {
    // Thứ tự ưu tiên chung khi xem "Tất cả trạng thái":
    // Chưa giao việc → Chờ Admin xác nhận → Quá hạn → Chờ chọn người
    // → Đang làm/đang chờ/Hotel/nghỉ trưa → Gần hết giờ
    // → Yêu cầu làm lại → Hoàn thành.
    //
    // Quá hạn phải luôn nằm phía trên các Phiếu đang làm, nhưng vẫn nằm
    // phía dưới Phiếu chưa giao việc. Hàm này được dùng chung cho Admin,
    // Giám sát, tìm kiếm và danh sách của tài khoản Nhân viên.
    draft: 0,
    submitted: 1,
    overdue: 2,
    waiting_assignee: 3,
    queued: 4,
    doing: 4,
    ship: 4,
    lunch_break: 4,
    hotel: 4,
    near_due: 5,
    redo: 6,
    completed: 7
  };

  return priorities[displayStatus] ?? 8;
}

function getAdminSearchGroupStatusPriority(group) {
  if (!group?.tasks?.length) return getAdminSearchStatusPriority("draft");

  return Math.min(
    ...group.tasks.map((task) => getAdminSearchStatusPriority(task))
  );
}

function getAdminDateScopedTasks(tasks = state.tasks) {
  return tasks.filter((task) => isTaskInDateFilter(task, state.adminDateFilter));
}

function getAdminWorkOrderSearchScopedTasks(tasks = state.tasks) {
  let scopedTasks = tasks.map((task) => (
    task.displayStatus
      ? task
      : { ...task, displayStatus: getDisplayStatus(task) }
  ));

  // Ô tìm kiếm luôn phải tuân theo phạm vi thời gian Admin đang chọn.
  scopedTasks = getAdminDateScopedTasks(scopedTasks);

  // Đồng thời phải tuân theo bộ lọc trạng thái chính.
  if (state.adminStatusFilter !== "all") {
    scopedTasks = scopedTasks.filter((task) => (
      taskMatchesStatusFilter(task, state.adminStatusFilter)
    ));
  }

  // Khi lọc "Đã hoàn thành", tiếp tục áp dụng nhóm công việc đã hoàn thành
  // như Công việc bình thường, Đã nghỉ trưa hoặc Hotel đã làm.
  if (
    state.adminStatusFilter === "completed"
    && state.adminCompletedTypeFilter !== "all"
  ) {
    scopedTasks = scopedTasks.filter((task) => (
      getCompletedTaskGroup(task) === state.adminCompletedTypeFilter
    ));
  }

  return scopedTasks;
}

function shouldIncludeEmptyDraftGroupsInAdminSearch() {
  return state.adminStatusFilter === "all" || state.adminStatusFilter === "draft";
}

function getAdminEmptyDraftGroupsInDateFilter() {
  const coveredWorkOrderIds = new Set(state.tasks.map((task) => task.workOrderId).filter(Boolean));

  return state.workOrders
    .filter((workOrder) => workOrder.status === "draft" && !coveredWorkOrderIds.has(workOrder.id))
    // Phiếu nháp 0 công việc chưa có taskDate, nên dùng ngày tạo phiếu để kết hợp với bộ lọc thời gian.
    .filter((workOrder) => isTaskInDateFilter({ createdAt: workOrder.createdAt }, state.adminDateFilter))
    .map((workOrder) => ({
      key: workOrder.id,
      name: workOrder.name,
      tasks: [],
      totalTaskCount: Number(workOrder.taskCount || 0),
      createdAtMs: timestampToDate(workOrder.createdAt)?.getTime() || 0
    }));
}

function getAdminWorkOrderSearchEntries() {
  const entries = new Map();

  // Gợi ý chỉ được tạo từ các công việc đồng thời phù hợp bộ lọc thời gian
  // và toàn bộ bộ lọc trạng thái Admin đang chọn.
  getAdminWorkOrderSearchScopedTasks().forEach((task) => {
    const id = task.workOrderId || "legacy";
    const workOrder = getWorkOrderMeta(id);
    const name = String(
      workOrder?.name
      || task.workOrderName
      || (id === "legacy" ? "Công việc lẻ (giao trước khi có Phiếu)" : "")
    ).trim();

    if (!name) return;

    const existing = entries.get(id);
    const taskCount = Number(workOrder?.taskCount || task.workOrderTaskCount || 0);

    const statusPriority = getAdminSearchStatusPriority(task);

    if (existing) {
      existing.taskCount = Math.max(existing.taskCount, taskCount);
      existing.statusPriority = Math.min(existing.statusPriority, statusPriority);
      return;
    }

    entries.set(id, {
      id,
      name,
      taskCount,
      statusPriority,
      createdAtMs: timestampToDate(workOrder?.createdAt)?.getTime()
        || timestampToDate(task.createdAt)?.getTime()
        || 0
    });
  });

  // Phiếu nháp 0 công việc chỉ được tham gia tìm kiếm khi trạng thái hiện tại
  // là "Tất cả trạng thái" hoặc "Chưa giao việc".
  if (shouldIncludeEmptyDraftGroupsInAdminSearch()) {
    getAdminEmptyDraftGroupsInDateFilter().forEach((group) => {
      entries.set(group.key, {
        id: group.key,
        name: String(group.name || "").trim(),
        taskCount: Number(group.totalTaskCount || 0),
        statusPriority: getAdminSearchStatusPriority("draft"),
        createdAtMs: Number(group.createdAtMs || 0)
      });
    });
  }

  return Array.from(entries.values()).filter((entry) => entry.name);
}

function getAdminWorkOrderSearchResults(queryText = state.adminWorkOrderSearch) {
  const queryValue = normalizeSearchText(queryText);
  if (!queryValue) return [];

  return getAdminWorkOrderSearchEntries()
    .map((entry) => ({
      ...entry,
      searchScore: getWorkOrderSearchScore(entry.name, queryValue)
    }))
    .filter((entry) => Number.isFinite(entry.searchScore))
    .sort((a, b) => (
      a.statusPriority - b.statusPriority
      || a.searchScore - b.searchScore
      || b.createdAtMs - a.createdAtMs
      || a.name.localeCompare(b.name, "vi")
    ));
}

function hideAdminWorkOrderSuggestions() {
  if (!els.adminWorkOrderSuggestions) return;
  els.adminWorkOrderSuggestions.classList.add("hidden");
  els.adminWorkOrderSuggestions.innerHTML = "";
  els.adminWorkOrderSearch?.setAttribute("aria-expanded", "false");
  state.adminWorkOrderSuggestionIndex = -1;
}

function updateAdminWorkOrderSuggestionActiveState() {
  const options = Array.from(els.adminWorkOrderSuggestions?.querySelectorAll?.("[data-work-order-search-value]") || []);

  options.forEach((option, index) => {
    const isActive = index === state.adminWorkOrderSuggestionIndex;
    option.classList.toggle("is-active", isActive);
    option.setAttribute("aria-selected", isActive ? "true" : "false");

    if (isActive) option.scrollIntoView({ block: "nearest" });
  });
}

function renderAdminWorkOrderSuggestions() {
  const box = els.adminWorkOrderSuggestions;
  const input = els.adminWorkOrderSearch;
  if (!box || !input) return;

  const queryText = input.value.trim();
  state.adminWorkOrderSearch = queryText;
  els.adminClearWorkOrderSearch?.classList.toggle("hidden", !queryText);

  if (!queryText || document.activeElement !== input) {
    hideAdminWorkOrderSuggestions();
    return;
  }

  const results = getAdminWorkOrderSearchResults(queryText);
  const uniqueNames = new Map();

  results.forEach((item) => {
    const key = normalizeSearchText(item.name);
    const current = uniqueNames.get(key);

    if (current) {
      current.ticketCount += 1;
      current.taskCount += Number(item.taskCount || 0);
      return;
    }

    uniqueNames.set(key, { ...item, ticketCount: 1 });
  });

  const suggestions = Array.from(uniqueNames.values()).slice(0, 8);
  state.adminWorkOrderSuggestionIndex = suggestions.length ? 0 : -1;
  box.classList.remove("hidden");
  input.setAttribute("aria-expanded", "true");

  if (!suggestions.length) {
    box.innerHTML = `<div class="admin-work-order-suggestion-empty">Không tìm thấy tên Phiếu công việc gần giống theo ${escapeHtml(getAdminWorkOrderSearchScopeLabel())}.</div>`;
    return;
  }

  box.innerHTML = suggestions
    .map((item, index) => `
      <button
        class="admin-work-order-suggestion${index === 0 ? " is-active" : ""}"
        type="button"
        role="option"
        aria-selected="${index === 0 ? "true" : "false"}"
        data-work-order-search-value="${escapeHtml(item.name)}"
      >
        <strong>${escapeHtml(item.name)}</strong>
        <span>${item.ticketCount > 1 ? `${item.ticketCount} phiếu • ` : ""}${Number(item.taskCount || 0)} công việc</span>
      </button>
    `)
    .join("");
}

function setAdminWorkOrderSearch(value) {
  const nextValue = String(value || "").trim();
  state.adminWorkOrderSearch = nextValue;
  state.adminWorkOrderSuggestionIndex = -1;

  if (els.adminWorkOrderSearch) els.adminWorkOrderSearch.value = nextValue;
  els.adminClearWorkOrderSearch?.classList.toggle("hidden", !nextValue);
  hideAdminWorkOrderSuggestions();
  renderAdminTasks();
}

function bindAdminWorkOrderSearch() {
  const input = els.adminWorkOrderSearch;
  const suggestionBox = els.adminWorkOrderSuggestions;
  if (!input || !suggestionBox) return;

  const handleInput = () => {
    state.adminWorkOrderSearch = input.value.trim();
    state.adminWorkOrderSuggestionIndex = -1;
    renderAdminTasks();
    renderAdminWorkOrderSuggestions();
  };

  input.addEventListener("input", handleInput);
  input.addEventListener("search", handleInput);
  input.addEventListener("focus", renderAdminWorkOrderSuggestions);

  input.addEventListener("keydown", (event) => {
    const options = Array.from(suggestionBox.querySelectorAll("[data-work-order-search-value]"));

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!options.length) {
        renderAdminWorkOrderSuggestions();
        return;
      }

      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const currentIndex = state.adminWorkOrderSuggestionIndex < 0 ? 0 : state.adminWorkOrderSuggestionIndex;
      state.adminWorkOrderSuggestionIndex = (currentIndex + direction + options.length) % options.length;
      updateAdminWorkOrderSuggestionActiveState();
      return;
    }

    if (event.key === "Enter" && options.length) {
      event.preventDefault();
      const selectedIndex = state.adminWorkOrderSuggestionIndex >= 0 ? state.adminWorkOrderSuggestionIndex : 0;
      const selected = options[selectedIndex];
      if (selected) setAdminWorkOrderSearch(selected.dataset.workOrderSearchValue || "");
      return;
    }

    if (event.key === "Escape") {
      hideAdminWorkOrderSuggestions();
    }
  });

  suggestionBox.addEventListener("pointerdown", (event) => {
    // Giữ focus ở ô nhập cho tới khi xử lý xong lựa chọn, đặc biệt trên iPhone/Safari.
    event.preventDefault();
  });

  suggestionBox.addEventListener("click", (event) => {
    const option = event.target.closest("[data-work-order-search-value]");
    if (!option) return;
    setAdminWorkOrderSearch(option.dataset.workOrderSearchValue || "");
    input.focus();
  });

  els.adminClearWorkOrderSearch?.addEventListener("click", () => {
    setAdminWorkOrderSearch("");
    input.focus();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".admin-work-order-search")) hideAdminWorkOrderSuggestions();
  });
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

  // Nếu Danh sách công việc thay đổi trong lúc modal đang mở, đồng bộ lại
  // trạng thái khóa thời gian của các công việc đang nhập.
  $$("#taskRowsContainer .task-row").forEach((row) => {
    syncWorkTemplateDurationLock(row, { applyDuration: true });
  });
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

  const canManageTemplates = hasPermission("manageWorkTemplates");

  els.workTemplateList.classList.remove("empty");
  els.workTemplateList.innerHTML = filteredTemplates
    .map((template) => {
      const minutes = Number(template.deadlineMinutes || 0);
      const createdAt = template.createdAt ? formatFullDateTime(template.createdAt) : "--";
      const tagName = canManageTemplates ? "button" : "div";
      const attributes = canManageTemplates
        ? `type="button" data-edit-template-id="${escapeHtml(template.id)}" aria-label="Chỉnh sửa công việc ${escapeHtml(template.name || "Không tên")}"`
        : `role="group" aria-label="Công việc ${escapeHtml(template.name || "Không tên")}"`;

      return `
        <${tagName} class="work-template-item" ${attributes}>
          <div>
            <strong>${escapeHtml(template.name || "Không tên")}</strong>
            <span>Thời gian phải hoàn thành: ${escapeHtml(formatMinutes(minutes))}</span>
            <span>Tạo lúc: ${escapeHtml(createdAt)}${template.createdByName ? ` • ${escapeHtml(template.createdByName)}` : ""}</span>
            <span class="work-template-hint">${canManageTemplates ? "Bấm vào dòng này để chỉnh sửa hoặc xoá" : "Tài khoản chỉ có quyền xem danh sách"}</span>
          </div>
          <div class="work-template-duration">${escapeHtml(formatMinutes(minutes))}</div>
        </${tagName}>
      `;
    })
    .join("");
}

function openWorkTemplatePage() {
  if (!requirePermission("accessWorkTemplates", "Tài khoản của bạn chưa được cấp quyền truy cập trang Danh sách công việc.")) return;

  els.adminView.classList.add("hidden");
  els.employeeManagerView?.classList.add("hidden");
  els.photoReportView?.classList.add("hidden");
  els.workTemplateView?.classList.remove("hidden");
  renderWorkTemplateList();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openEmployeeManagerPage() {
  if (!requirePermission("accessEmployeeManager", "Tài khoản của bạn chưa được cấp quyền truy cập trang Danh sách nhân viên.")) return;

  els.adminView.classList.add("hidden");
  els.workTemplateView?.classList.add("hidden");
  els.photoReportView?.classList.add("hidden");
  els.employeeManagerView?.classList.remove("hidden");
  renderEmployees();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function backToAdminDashboard() {
  els.workTemplateView?.classList.add("hidden");
  els.employeeManagerView?.classList.add("hidden");
  els.photoReportView?.classList.add("hidden");
  els.adminView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openWorkTemplateModal(templateId = null) {
  if (!requirePermission("manageWorkTemplates", "Tài khoản của bạn chỉ được xem Danh sách công việc, chưa được cấp quyền tạo hoặc chỉnh sửa.")) return;

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

function setTaskDurationInputsLocked(row, locked, template = null) {
  if (!row) return;

  const hoursInput = row.querySelector(".row-hours");
  const minutesInput = row.querySelector(".row-minutes");
  const isLocked = Boolean(locked && template);
  const templateName = isLocked ? String(template.name || "").trim() : "";
  const deadlineMinutes = isLocked ? Number(template.deadlineMinutes || 0) : 0;

  row.classList.toggle("is-template-duration-locked", isLocked);

  if (isLocked) {
    row.dataset.workTemplateId = String(template.id || "");
    row.dataset.workTemplateName = templateName;
    row.dataset.workTemplateDeadlineMinutes = String(deadlineMinutes);
  } else {
    delete row.dataset.workTemplateId;
    delete row.dataset.workTemplateName;
    delete row.dataset.workTemplateDeadlineMinutes;
  }

  [hoursInput, minutesInput].forEach((input) => {
    if (!input) return;

    input.readOnly = isLocked;
    input.setAttribute("aria-readonly", String(isLocked));
    input.classList.toggle("is-template-duration-locked", isLocked);

    if (isLocked) {
      input.dataset.templateLocked = "true";
      input.title = `Thời gian cố định theo công việc mẫu “${templateName}”.`;
    } else {
      delete input.dataset.templateLocked;
      input.removeAttribute("title");
    }
  });
}

function syncWorkTemplateDurationLock(row, { applyDuration = true } = {}) {
  if (!row) return null;

  const title = row.querySelector(".row-title")?.value || "";
  const template = findWorkTemplateByName(title);
  const deadlineMinutes = Number(template?.deadlineMinutes || 0);

  if (!template || deadlineMinutes <= 0) {
    setTaskDurationInputsLocked(row, false);
    return null;
  }

  if (applyDuration) applyWorkTemplateToRow(row, template);
  setTaskDurationInputsLocked(row, true, template);
  return template;
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
  if (!requirePermission("exportData", "Tài khoản của bạn chưa được cấp quyền Xuất dữ liệu.")) return;

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
  if (!requirePermission("importData", "Tài khoản của bạn chưa được cấp quyền Nhập dữ liệu.")) return;
  if (!file) return;

  try {
    setButtonLoading(els.importDataBtn, true, "Đang đọc...");

    const rawText = await readTextFile(file);
    const backup = JSON.parse(rawText);

    if (!backup || typeof backup !== "object" || !backup.collections || typeof backup.collections !== "object") {
      throw new Error("File JSON không đúng định dạng backup của hệ thống.");
    }

    const importCollections = isAdminProfile()
      ? BACKUP_COLLECTIONS
      : BACKUP_COLLECTIONS.filter((collectionName) => collectionName !== "users");
    const totalDocuments = importCollections.reduce((total, collectionName) => {
      const collectionData = normalizeBackupCollection(backup.collections[collectionName]);
      return total + Object.keys(collectionData).length;
    }, 0);
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

    for (const collectionName of importCollections) {
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
  if (!requirePermission("importData", "Tài khoản của bạn chưa được cấp quyền Nhập dữ liệu.")) return;
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

  if (!requirePermission("manageWorkTemplates", "Tài khoản của bạn chưa được cấp quyền quản lý công việc mẫu.")) return;

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
  if (!state.editingWorkTemplateId) return;
  if (!requirePermission("manageWorkTemplates", "Tài khoản của bạn chưa được cấp quyền xóa công việc mẫu.")) return;

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

  const canManageEmployeeAccounts = isAdminProfile() || hasPermission("manageEmployeeAccounts");
  if (!canManageEmployeeAccounts) {
    toast("Tài khoản của bạn chưa được cấp quyền tạo tài khoản nhân viên.", "error");
    return;
  }

  const button = $("#createEmployeeBtn");
  setButtonLoading(button, true, "Đang tạo...");

  const name = $("#employeeName").value.trim();
  const email = $("#employeeEmail").value.trim().toLowerCase();
  const password = $("#employeePassword").value;
  const requestedRole = els.staffAccountRole?.value || "employee";
  const role = isAdminProfile() && requestedRole === "supervisor" ? "supervisor" : "employee";
  const permissions = role === "supervisor"
    ? readSupervisorPermissionChecklist(els.createSupervisorPermissionList)
    : null;

  try {
    const sAuth = getSecondaryAuth();
    const credential = await createUserWithEmailAndPassword(sAuth, email, password);

    await updateProfile(credential.user, {
      displayName: name
    });

    const userData = {
      uid: credential.user.uid,
      name,
      email,
      role,
      createdByUid: state.user.uid,
      createdAt: serverTimestamp()
    };

    if (role === "supervisor") {
      userData.permissions = normalizeSupervisorPermissions(permissions);
      userData.permissionsUpdatedAt = serverTimestamp();
      userData.permissionsUpdatedByUid = state.user.uid;
      userData.permissionsUpdatedByName = state.profile?.name || state.user?.email || "Admin";
    }

    await setDoc(doc(db, "users", credential.user.uid), userData);
    await signOut(sAuth);

    els.createEmployeeForm.reset();
    renderSupervisorPermissionChecklist(els.createSupervisorPermissionList, {});
    updateCreateAccountRoleUI();

    toast(
      role === "supervisor"
        ? `Đã tạo Giám sát ${name} với ${getGrantedSupervisorPermissionCount({ role, permissions })} quyền.`
        : `Đã tạo Nhân viên ${name}.`,
      "success"
    );
  } catch (error) {
    console.error(error);
    toast(getFriendlyFirebaseError(error), "error");
  } finally {
    setButtonLoading(button, false);
    updateCreateAccountRoleUI();
  }
});

// =========================
// Quản lý các dòng công việc trong phiếu (task rows)
// =========================
let taskRowIdCounter = 0;
let photoRequirementTouched = false;
const taskRowWorkPhotos = new Map();

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
      <button type="button" class="task-row-toggle" data-action="toggle-task-row" aria-expanded="true" aria-label="Thu gọn công việc này">
        <strong>Công việc</strong>
        <span class="task-row-summary-title">Chưa đặt tên công việc</span>
        <span class="task-row-toggle-icon" aria-hidden="true">⌃</span>
      </button>
      <div class="task-row-head-actions">
        <span class="task-row-visual-badge" aria-hidden="true">Nội dung</span>
        <button type="button" class="icon-btn small task-row-remove-btn" data-action="remove-task-row" data-row-id="${rowId}" aria-label="Xóa công việc này" title="Xóa công việc này">×</button>
      </div>
    </div>
    <div class="task-work-photo-actions">
      <button type="button" class="btn success small" data-action="upload-work-photos" data-row-id="${rowId}">Đăng ảnh CV</button>
      <button type="button" class="btn ghost small work-photo-view-btn hidden" data-action="view-work-photos" data-row-id="${rowId}">Ảnh CV (0)</button>
      <span class="task-work-photo-note">Ảnh hướng dẫn, mẫu hoặc yêu cầu cần thực hiện.</span>
    </div>
    <label class="task-row-field task-row-title-field">
      <span class="task-field-label">Tên công việc</span>
      <input type="text" class="row-title" list="workTemplateOptions" placeholder="Ví dụ: Dọn phòng khách sạn mèo" required />
    </label>
    <label class="task-row-field task-row-description-field">
      <span class="task-field-label">Mô tả công việc <span class="optional-label">(không bắt buộc)</span></span>
      <textarea class="row-description" rows="3" placeholder="Có thể bỏ trống hoặc ghi rõ yêu cầu, tiêu chuẩn hoàn thành..."></textarea>
    </label>
    <div class="two-col task-row-schedule-grid">
      <label class="task-row-field">
        <span class="task-field-label">Ngày giao việc</span>
        <input type="date" class="row-date" required />
      </label>
      <label class="task-row-field">
        <span class="task-field-label">Người được giao <span class="optional-label">(có thể chọn sau)</span></span>
        <select class="row-assignee">
          <option value="">Chờ chọn người</option>
          ${employeeOptionsHtml()}
        </select>
      </label>
    </div>
    <div class="task-type-section">
      <span class="task-field-label">Loại công việc</span>
      <div class="task-type-options" role="group" aria-label="Loại công việc">
        <label class="checkbox-line lunch-break-line">
          <input type="checkbox" class="row-lunch-break" />
          <span>Nghỉ trưa</span>
        </label>
        <label class="checkbox-line hotel-line">
          <input type="checkbox" class="row-hotel" />
          <span>Hotel</span>
        </label>
        <label class="checkbox-line ship-line">
          <input type="checkbox" class="row-ship" />
          <span>Ship</span>
        </label>
        <label class="checkbox-line cleaning-line">
          <input type="checkbox" class="row-cleaning" />
          <span>Dọn dẹp vệ sinh</span>
        </label>
      </div>
    </div>
    <p class="small-note task-type-note lunch-break-note hidden">Phiếu Nghỉ trưa tối đa 30 phút. Mỗi nhân viên chỉ được có 1 phiếu Nghỉ trưa đang chạy.</p>
    <p class="small-note task-type-note hotel-note hidden">Phiếu Hotel sẽ áp dụng đúng cài đặt đăng hình của Admin ở bên dưới. <strong>10 bé</strong> ở hotel thì tổng thời gian cho ăn và dọn dẹp của các bạn chăm sóc trong 1 ngày sẽ là <strong>30 phút</strong>. Cứ <strong>mỗi 1 bé vào</strong> ở thêm thì sẽ cộng thêm thời gian cho <strong>2 phút</strong>.</p>
    <div class="two-col task-row-duration-grid">
      <label class="task-row-field">
        <span class="task-field-label">Số giờ</span>
        <div class="duration-input-shell">
          <input type="number" class="row-hours" min="0" max="168" value="0" required />
          <span aria-hidden="true">giờ</span>
        </div>
      </label>
      <label class="task-row-field">
        <span class="task-field-label">Số phút</span>
        <div class="duration-input-shell">
          <input type="number" class="row-minutes" min="0" max="59" value="30" required />
          <span aria-hidden="true">phút</span>
        </div>
      </label>
    </div>
  `;

  const dateInput = wrapper.querySelector(".row-date");
  // Không dùng valueAsDate vì input date đọc ngày theo UTC, dễ bị lùi 1 ngày
  // khi máy người dùng ở múi giờ Việt Nam và mở form sau nửa đêm.
  dateInput.value = prefill?.taskDate || todayInputValue();

  if (prefill) {
    taskRowWorkPhotos.set(rowId, Array.isArray(prefill.workPhotos) ? prefill.workPhotos.slice() : []);
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

    if (prefill.isShip) {
      wrapper.querySelector(".row-ship").checked = true;
    }
  }

  if (!taskRowWorkPhotos.has(rowId)) taskRowWorkPhotos.set(rowId, []);
  syncLunchBreakRowControls(wrapper);
  syncWorkTemplateDurationLock(wrapper, { applyDuration: true });
  syncTaskRowSummary(wrapper);
  syncTaskRowWorkPhotoButtons(wrapper);
  return wrapper;
}

function getTaskRowFallbackTitle(row) {
  const rowNumber = row?.querySelector(".task-row-head strong")?.textContent?.trim() || "Công việc";
  return `${rowNumber} (chưa đặt tên)`;
}

function syncTaskRowSummary(row) {
  if (!row) return;

  const title = row.querySelector(".row-title")?.value?.trim();
  const summary = row.querySelector(".task-row-summary-title");
  if (summary) summary.textContent = title || getTaskRowFallbackTitle(row);
}

function setTaskRowCollapsed(row, collapsed) {
  if (!row) return;

  const isCollapsed = Boolean(collapsed);
  row.classList.toggle("is-collapsed", isCollapsed);

  const toggle = row.querySelector('[data-action="toggle-task-row"]');
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    toggle.setAttribute("aria-label", isCollapsed ? "Mở công việc này để chỉnh sửa" : "Thu gọn công việc này");
  }

  const icon = row.querySelector(".task-row-toggle-icon");
  if (icon) icon.textContent = isCollapsed ? "⌄" : "⌃";

  syncTaskRowSummary(row);
}

function activateTaskRow(row, { focusTitle = false, scrollIntoView = false } = {}) {
  if (!row) return;

  $$("#taskRowsContainer .task-row").forEach((taskRow) => {
    setTaskRowCollapsed(taskRow, taskRow !== row);
  });

  if (scrollIntoView) {
    requestAnimationFrame(() => {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  if (focusTitle) {
    requestAnimationFrame(() => {
      row.querySelector(".row-title")?.focus({ preventScroll: true });
    });
  }
}

function addTaskRow({ focusTitle = false, scrollIntoView = false } = {}) {
  const row = createTaskRowElement();
  els.taskRowsContainer.appendChild(row);
  updateTaskRowHeadings();
  activateTaskRow(row, { focusTitle, scrollIntoView });
  syncPhotoRequirementDefaultFromTaskTypes();
  return row;
}

function removeTaskRow(rowId) {
  const rows = $$("#taskRowsContainer .task-row");
  if (rows.length <= 1) {
    toast("Phiếu cần có ít nhất 1 công việc.", "error");
    return;
  }

  const row = els.taskRowsContainer.querySelector(`[data-row-id="${rowId}"]`);
  const rowToActivate = row?.nextElementSibling || row?.previousElementSibling || null;
  row?.remove();
  taskRowWorkPhotos.delete(rowId);
  updateTaskRowHeadings();
  if (rowToActivate?.classList?.contains("task-row")) activateTaskRow(rowToActivate);
  syncPhotoRequirementDefaultFromTaskTypes();
}

function updateTaskRowHeadings() {
  const rows = $$("#taskRowsContainer .task-row");

  rows.forEach((row, index) => {
    row.querySelector(".task-row-head strong").textContent = `Công việc #${index + 1}`;
    syncTaskRowSummary(row);
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
  taskRowWorkPhotos.clear();
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

els.addTaskRowBtn.addEventListener("click", () => {
  addTaskRow({ focusTitle: true, scrollIntoView: true });
});

els.taskRowsContainer.addEventListener("click", async (event) => {
  const uploadWorkPhotoButton = event.target.closest('[data-action="upload-work-photos"]');
  if (uploadWorkPhotoButton) {
    await openWorkPhotoUploadPicker(uploadWorkPhotoButton.dataset.rowId, uploadWorkPhotoButton);
    return;
  }

  const viewWorkPhotoButton = event.target.closest('[data-action="view-work-photos"]');
  if (viewWorkPhotoButton) {
    openWorkPhotoManager({ rowId: viewWorkPhotoButton.dataset.rowId });
    return;
  }

  const removeButton = event.target.closest('[data-action="remove-task-row"]');
  if (removeButton) {
    removeTaskRow(removeButton.dataset.rowId);
    return;
  }

  const toggleButton = event.target.closest('[data-action="toggle-task-row"]');
  if (toggleButton) {
    const row = toggleButton.closest(".task-row");
    if (!row) return;

    if (row.classList.contains("is-collapsed")) {
      activateTaskRow(row, { scrollIntoView: true });
    } else {
      setTaskRowCollapsed(row, true);
    }
    return;
  }

  const collapsedRow = event.target.closest(".task-row.is-collapsed");
  if (collapsedRow) activateTaskRow(collapsedRow, { scrollIntoView: true });
});

els.taskRowsContainer.addEventListener("focusin", (event) => {
  const row = event.target.closest(".task-row");
  if (row) activateTaskRow(row);
});

els.taskRowsContainer.addEventListener("input", (event) => {
  const row = event.target.closest(".task-row");
  if (!row) return;

  if (event.target.matches(".row-title")) {
    syncTaskRowSummary(row);
    syncWorkTemplateDurationLock(row, { applyDuration: true });
  }
});

els.taskRowsContainer.addEventListener("change", (event) => {
  const row = event.target.closest(".task-row");
  if (!row) return;

  if (event.target.matches(".row-lunch-break, .row-hotel, .row-ship, .row-cleaning, .row-hours, .row-minutes")) {
    syncLunchBreakRowControls(row, event.target);
    syncWorkTemplateDurationLock(row, { applyDuration: true });
    syncTaskRowSummary(row);

    if (event.target.matches(".row-lunch-break, .row-hotel, .row-ship, .row-cleaning")) {
      syncPhotoRequirementDefaultFromTaskTypes();
    }
  }

  const titleInput = event.target.closest(".row-title");
  if (!titleInput) return;

  const template = syncWorkTemplateDurationLock(row, { applyDuration: true });
  syncLunchBreakRowControls(row);
  syncWorkTemplateDurationLock(row, { applyDuration: true });
  syncTaskRowSummary(row);

  if (template) {
    toast(
      `Đã áp dụng và khóa thời gian ${formatMinutes(Number(template.deadlineMinutes || 0))} theo Danh sách công việc “${template.name}”.`,
      "success"
    );
  }
});

function openCreateWorkOrderModal() {
  if (!requirePermission("createWorkOrder", "Tài khoản của bạn chưa được cấp quyền tạo Phiếu công việc.")) return;

  state.editingWorkOrderId = null;
  $("#taskModalTitle").textContent = "+ Tạo phiếu công việc";
  els.workOrderName.value = "";
  resetTaskRows();
  resetPhotoRequirementControls();

  // Khi Admin mở form tạo Phiếu mới, mặc định luôn yêu cầu ít nhất 1 ảnh báo cáo.
  // Admin vẫn có thể tự bỏ chọn hoặc thay đổi số lượng trước khi lưu Phiếu.
  if (isAdminProfile()) {
    if (els.requiredPhotoCount) els.requiredPhotoCount.value = 1;
    setPhotoRequirementChecked(true);
  }

  els.taskModal.classList.remove("hidden");
}

els.openTaskModalBtn?.addEventListener("click", openCreateWorkOrderModal);
els.floatingCreateTaskBtn?.addEventListener("click", openCreateWorkOrderModal);

function openEditWorkOrderModal(workOrderId) {
  if (!requirePermission("editWorkOrder", "Tài khoản của bạn chưa được cấp quyền sửa Phiếu chưa giao.")) return;

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
        isShip: Boolean(task.isShip),
        hotelPetCount: Number(task.hotelPetCount || 0),
        workPhotos: Array.isArray(task.workPhotos) ? task.workPhotos : [],
        hours: Math.floor(deadlineMinutes / 60),
        minutes: deadlineMinutes % 60
      }));
    });
  } else {
    // Phiếu nháp chưa có công việc nào: bắt đầu với 1 dòng trống để admin điền thêm.
    addTaskRow();
  }

  updateTaskRowHeadings();
  const firstTaskRow = els.taskRowsContainer.querySelector(".task-row");
  if (firstTaskRow) activateTaskRow(firstTaskRow);
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
    const isShip = Boolean(row.querySelector(".row-ship")?.checked);
    const hotelPetCount = 0;
    const hotelAllowedMinutes = 0;
    const hours = Number(row.querySelector(".row-hours").value || 0);
    const minutes = Number(row.querySelector(".row-minutes").value || 0);
    const matchedTemplate = findWorkTemplateByName(title);
    const templateDeadlineMinutes = Number(matchedTemplate?.deadlineMinutes || 0);
    // Bảo vệ lớp dữ liệu: nếu tên công việc khớp chính xác với Danh sách công việc,
    // luôn dùng thời gian của công việc mẫu kể cả khi DOM bị chỉnh thủ công.
    const deadlineMinutes = templateDeadlineMinutes > 0
      ? templateDeadlineMinutes
      : (hours * 60 + minutes);
    const assignedEmployee = state.employees.find((employee) => employee.uid === assignedToUid);

    return {
      index,
      rowId: row.dataset.rowId || "",
      workPhotos: (taskRowWorkPhotos.get(row.dataset.rowId || "") || []).slice(),
      title,
      description,
      taskDate,
      assignedToUid,
      assignedEmployee,
      deadlineMinutes,
      isLunchBreak,
      isHotel,
      isShip,
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
  const isEditing = Boolean(state.editingWorkOrderId);
  const basePermission = isEditing ? "editWorkOrder" : "createWorkOrder";
  const baseMessage = isEditing
    ? "Tài khoản của bạn chưa được cấp quyền sửa Phiếu chưa giao."
    : "Tài khoản của bạn chưa được cấp quyền tạo Phiếu công việc.";

  if (!requirePermission(basePermission, baseMessage)) return;
  if (dispatch && !requirePermission("dispatchWorkOrder", "Tài khoản của bạn chưa được cấp quyền giao Phiếu công việc.")) return;

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
        isShip: Boolean(row.isShip),
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
        workPhotos: Array.isArray(row.workPhotos) ? row.workPhotos : [],
        workPhotoCount: Array.isArray(row.workPhotos) ? row.workPhotos.length : 0,
        lastWorkPhotoUploadedAt: getLatestUploadedAtFromPhotos(row.workPhotos || []),
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
  await persistWorkOrder(true, $("#createTaskBtn"));
});

els.saveDraftBtn.addEventListener("click", async () => {
  await persistWorkOrder(false, els.saveDraftBtn);
});

async function dispatchWorkOrder(workOrderId, button) {
  if (!requirePermission("dispatchWorkOrder", "Tài khoản của bạn chưa được cấp quyền giao Phiếu công việc.")) return;

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
    isShip: Boolean(task.isShip),
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
    [...getTaskPhotos(task), ...getTaskWorkPhotos(task)].forEach((photo) => {
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
  if (!requirePermission("deleteWorkOrder", "Tài khoản của bạn chưa được cấp quyền xóa Phiếu công việc.")) return;

  if (isWorkOrderDeletionLocked()) {
    toast("Chức năng Xóa Phiếu đang bị khóa trong Cài đặt.", "error");
    return;
  }

  const tasksInGroup = state.tasks.filter((task) => (task.workOrderId || "legacy") === workOrderId);

  const workOrder = state.workOrders.find((item) => item.id === workOrderId);
  const workOrderName = String(workOrder?.name || tasksInGroup[0]?.workOrderName || "Phiếu công việc này").trim();
  const confirmed = await requestDestructiveConfirmation({
    title: "Xóa Phiếu công việc?",
    message: `Bạn có thực sự muốn xóa “${workOrderName}” cùng ${tasksInGroup.length} công việc bên trong không?`,
    details: "Toàn bộ ảnh báo cáo thuộc Phiếu cũng sẽ bị xóa khỏi Firebase Storage. Hành động này không thể hoàn tác.",
    confirmLabel: "Xóa Phiếu"
  });

  if (!confirmed) return;

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
  if (!requirePermission("deleteAllWorkOrders", "Tài khoản của bạn chưa được cấp quyền xóa toàn bộ Phiếu công việc.")) return;

  if (isWorkOrderDeletionLocked()) {
    toast("Chức năng Xóa Phiếu và Xóa toàn bộ Phiếu đang bị khóa trong Cài đặt.", "error");
    return;
  }

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

  const confirmed = await requestDestructiveConfirmation({
    title: "Xóa toàn bộ Phiếu công việc?",
    message: `Bạn có thực sự muốn xóa TOÀN BỘ ${ticketCount} Phiếu công việc cùng ${state.tasks.length} công việc bên trong không?`,
    details: `Hệ thống cũng sẽ xóa toàn bộ báo cáo Hotel, thống kê liên quan, thông báo cũ và ${photoCount} ảnh báo cáo trên Firebase Storage. Hành động này không thể hoàn tác.`,
    confirmLabel: "Xóa toàn bộ"
  });

  if (!confirmed) return;

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


function isMobileManagementViewport() {
  return window.matchMedia?.("(max-width: 768px)")?.matches === true;
}

// Popup Bộ lọc được bọc trong một modal root toàn màn hình. Khi mở trên mobile,
// root được đưa trực tiếp vào <body> để không chịu ảnh hưởng của sticky, transform
// hoặc backdrop-filter ở bất kỳ phần tử tổ tiên nào. Việc căn giữa do flexbox xử lý.
const adminMobileFilterPortal = {
  initialized: false,
  rootAnchor: null
};

function initializeAdminMobileFilterPortal() {
  if (adminMobileFilterPortal.initialized) return;

  const root = els.adminMobileFilterModalRoot;
  if (!root || !root.parentNode) return;

  adminMobileFilterPortal.rootAnchor = document.createComment("admin-mobile-filter-modal-root-anchor");
  root.parentNode.insertBefore(adminMobileFilterPortal.rootAnchor, root);
  adminMobileFilterPortal.initialized = true;
}

function portalAdminMobileFilterToBody() {
  initializeAdminMobileFilterPortal();
  const root = els.adminMobileFilterModalRoot;
  if (root && root.parentNode !== document.body) {
    document.body.appendChild(root);
  }
}

function restoreAdminMobileFilterFromBody() {
  const root = els.adminMobileFilterModalRoot;
  const anchor = adminMobileFilterPortal.rootAnchor;
  if (root && anchor?.parentNode) {
    anchor.parentNode.insertBefore(root, anchor.nextSibling);
  }
}

function syncMobileSheetBodyLock() {
  const hasOpenSheet = Boolean(
    state.adminMobileFilterSheetOpen
    || state.employeeMobileFilterSheetOpen
    || els.adminEmployeeStatusDetailSheet?.classList.contains("is-open")
  );
  document.body.classList.toggle("mobile-sheet-open", hasOpenSheet && isMobileManagementViewport());
}

function hasVisibleTaskPanelMenuAction() {
  return [els.deleteAllWorkOrdersBtn, els.openWorkOrderSettingsBtn, els.openGoogleCalendarImportMobileBtn]
    .some((button) => button && !button.classList.contains("hidden"));
}

function setMobileTaskPanelMenuOpen(open) {
  const canShow = hasVisibleTaskPanelMenuAction();
  const shouldOpen = Boolean(open && canShow && isMobileManagementViewport());

  els.mobileTaskPanelMenu?.classList.toggle("is-open", shouldOpen);
  els.mobileTaskPanelMenu?.setAttribute("aria-hidden", String(!shouldOpen));
  els.mobileTaskPanelMenuBtn?.setAttribute("aria-expanded", String(shouldOpen));
}

function updateMobileTaskPanelMenuAvailability() {
  if (!els.mobileTaskPanelMenuBtn) return;
  const canShow = hasVisibleTaskPanelMenuAction();
  els.mobileTaskPanelMenuBtn.classList.toggle("hidden", !canShow);
  if (!canShow) setMobileTaskPanelMenuOpen(false);
}

function setAdminMobileFilterSheetOpen(open) {
  const shouldOpen = Boolean(open && isMobileManagementViewport());
  const root = els.adminMobileFilterModalRoot;

  if (shouldOpen) {
    portalAdminMobileFilterToBody();
  }

  state.adminMobileFilterSheetOpen = shouldOpen;
  root?.classList.toggle("is-open", shouldOpen);
  root?.setAttribute("aria-hidden", String(!shouldOpen));
  els.adminMobileFilterSheet?.classList.toggle("is-open", shouldOpen);

  if (els.adminMobileFilterSheet) {
    if (isMobileManagementViewport()) {
      els.adminMobileFilterSheet.setAttribute("role", "dialog");
      els.adminMobileFilterSheet.setAttribute("aria-modal", "true");
      els.adminMobileFilterSheet.setAttribute("aria-hidden", String(!shouldOpen));
    } else {
      els.adminMobileFilterSheet.setAttribute("role", "group");
      els.adminMobileFilterSheet.removeAttribute("aria-modal");
      els.adminMobileFilterSheet.removeAttribute("aria-hidden");
    }
  }

  els.adminMobileFilterOpenBtn?.setAttribute("aria-expanded", String(shouldOpen));

  if (els.adminMobileFilterBackdrop) {
    els.adminMobileFilterBackdrop.classList.toggle("hidden", !shouldOpen);
    if (shouldOpen) {
      requestAnimationFrame(() => {
        els.adminMobileFilterBackdrop?.classList.add("is-open");
      });
    } else {
      els.adminMobileFilterBackdrop.classList.remove("is-open");
    }
  }

  syncMobileSheetBodyLock();

  if (shouldOpen) {
    // Luôn bắt đầu từ đầu nội dung để tiêu đề Popup không bao giờ bị khuất.
    if (els.adminMobileFilterSheet) els.adminMobileFilterSheet.scrollTop = 0;
  } else {
    // Chờ hiệu ứng đóng xong rồi đưa modal root về đúng vị trí desktop ban đầu.
    window.setTimeout(() => {
      if (!state.adminMobileFilterSheetOpen) restoreAdminMobileFilterFromBody();
    }, 220);
  }
}

function getSelectOptionText(selectEl, fallback = "") {
  return selectEl?.selectedOptions?.[0]?.textContent?.trim() || fallback;
}

function getAdminActiveMobileFilterDescriptors() {
  const filters = [];

  if (state.adminStatusFilter !== "all") {
    filters.push({
      key: "status",
      label: getSelectOptionText(els.adminStatusFilter, "Trạng thái")
    });
  }

  if (state.adminStatusFilter === "completed" && state.adminCompletedTypeFilter !== "all") {
    filters.push({
      key: "completedType",
      label: getSelectOptionText(els.adminCompletedTypeFilter, "Nhóm hoàn thành")
    });
  }

  if (state.adminEmployeeFilter !== "all") {
    filters.push({
      key: "employee",
      label: getSelectOptionText(els.adminEmployeeFilter, "Nhân viên")
    });
  }

  const dateFilter = state.adminDateFilter || { mode: "all" };
  if (dateFilter.mode !== "all") {
    let label = getSelectOptionText(els.adminDateMode, "Thời gian");

    if (dateFilter.mode === "single" && dateFilter.single) {
      label = formatDateOnly(dateFilter.single);
    } else if (dateFilter.mode === "range") {
      if (dateFilter.from && dateFilter.to) {
        label = `${formatDateOnly(dateFilter.from)} – ${formatDateOnly(dateFilter.to)}`;
      } else if (dateFilter.from) {
        label = `Từ ${formatDateOnly(dateFilter.from)}`;
      } else if (dateFilter.to) {
        label = `Đến ${formatDateOnly(dateFilter.to)}`;
      }
    }

    filters.push({ key: "date", label });
  }

  return filters;
}

function updateAdminMobileFilterUI() {
  const filters = getAdminActiveMobileFilterDescriptors();

  if (els.adminMobileFilterCount) {
    els.adminMobileFilterCount.textContent = String(filters.length);
    els.adminMobileFilterCount.classList.toggle("hidden", filters.length === 0);
  }

  if (els.adminActiveFilterChips) {
    els.adminActiveFilterChips.innerHTML = filters
      .map((filter) => `
        <span class="mobile-active-filter-chip">
          <span title="${escapeHtml(filter.label)}">${escapeHtml(filter.label)}</span>
          <button type="button" data-clear-mobile-filter="${escapeHtml(filter.key)}" aria-label="Bỏ lọc ${escapeHtml(filter.label)}">×</button>
        </span>
      `)
      .join("");
  }
}

function getAdminMobileResultScopeLabel() {
  const filter = state.adminDateFilter || { mode: "all" };

  if (filter.mode === "today") return formatDateOnly(todayInputValue());
  if (filter.mode === "yesterday") return formatDateOnly(yesterdayInputValue());
  if (filter.mode === "current_month") return "Tháng này";
  if (filter.mode === "previous_month") return "Tháng trước";
  if (filter.mode === "single") return filter.single ? formatDateOnly(filter.single) : "Ngày cụ thể";
  if (filter.mode === "range") {
    if (filter.from && filter.to) return `${formatDateOnly(filter.from)} – ${formatDateOnly(filter.to)}`;
    if (filter.from) return `Từ ${formatDateOnly(filter.from)}`;
    if (filter.to) return `Đến ${formatDateOnly(filter.to)}`;
    return "Khoảng ngày";
  }

  return "Toàn thời gian";
}

function updateAdminMobileResultSummary(groupCount = 0) {
  if (!els.adminMobileResultSummary) return;
  const count = Math.max(0, Number(groupCount || 0));
  const ticketLabel = count === 1 ? "Phiếu công việc" : "Phiếu công việc";
  els.adminMobileResultSummary.textContent = `▣ ${getAdminMobileResultScopeLabel()} • ${count} ${ticketLabel}`;
}

function resetAdminMobileFilters() {
  state.adminStatusFilter = "all";
  state.adminCompletedTypeFilter = "all";
  state.adminEmployeeFilter = "all";
  state.adminDateFilter = {
    mode: "today",
    single: todayInputValue(),
    from: "",
    to: ""
  };

  if (els.adminStatusFilter) els.adminStatusFilter.value = "all";
  if (els.adminCompletedTypeFilter) els.adminCompletedTypeFilter.value = "all";
  if (els.adminEmployeeFilter) els.adminEmployeeFilter.value = "all";
  if (els.adminDateMode) els.adminDateMode.value = "today";
  if (els.adminSingleDate) els.adminSingleDate.value = todayInputValue();
  if (els.adminDateFrom) els.adminDateFrom.value = "";
  if (els.adminDateTo) els.adminDateTo.value = "";

  updateCompletedTypeFilterVisibility("admin");
  refreshDateFilterVisibility("admin");
  renderAdminTasks();
  renderAdminWorkOrderSuggestions();
}

function clearAdminMobileFilter(key) {
  if (key === "status") {
    state.adminStatusFilter = "all";
    state.adminCompletedTypeFilter = "all";
    if (els.adminStatusFilter) els.adminStatusFilter.value = "all";
    if (els.adminCompletedTypeFilter) els.adminCompletedTypeFilter.value = "all";
  } else if (key === "completedType") {
    state.adminCompletedTypeFilter = "all";
    if (els.adminCompletedTypeFilter) els.adminCompletedTypeFilter.value = "all";
  } else if (key === "employee") {
    state.adminEmployeeFilter = "all";
    if (els.adminEmployeeFilter) els.adminEmployeeFilter.value = "all";
  } else if (key === "date") {
    state.adminDateFilter = { mode: "all", single: "", from: "", to: "" };
    if (els.adminDateMode) els.adminDateMode.value = "all";
    if (els.adminSingleDate) els.adminSingleDate.value = "";
    if (els.adminDateFrom) els.adminDateFrom.value = "";
    if (els.adminDateTo) els.adminDateTo.value = "";
  }

  updateCompletedTypeFilterVisibility("admin");
  refreshDateFilterVisibility("admin");
  renderAdminTasks();
  renderAdminWorkOrderSuggestions();
}

function getEmployeeInitials(employee) {
  const name = getEmployeeSummaryName(employee).trim();
  if (!name) return "NV";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "NV";
}

function setEmployeeStatusDetailSheetOpen(open, type = "free") {
  // Dùng chung cửa sổ danh sách nhân viên cho cả desktop và mobile.
  // Mobile hiển thị dạng bottom sheet, desktop hiển thị popup giữa màn hình.
  const shouldOpen = Boolean(open);

  if (shouldOpen) {
    const config = getEmployeeStatusGroupConfig(type);
    const employees = state.adminEmployeeStatusGroups?.[type] || [];

    if (els.adminEmployeeStatusDetailTitle) {
      els.adminEmployeeStatusDetailTitle.textContent = `${config.detailTitle} (${employees.length})`;
    }

    if (els.adminEmployeeStatusDetailList) {
      els.adminEmployeeStatusDetailList.innerHTML = employees.length
        ? employees.map((employee) => `
            <div class="mobile-status-detail-person">
              <span class="mobile-status-detail-avatar">${escapeHtml(getEmployeeInitials(employee))}</span>
              <span title="${escapeHtml(getEmployeeSummaryName(employee))}">${escapeHtml(getEmployeeSummaryName(employee))}</span>
            </div>
          `).join("")
        : '<div class="mobile-status-detail-empty">Không có nhân viên trong nhóm này.</div>';
    }
  }

  els.adminEmployeeStatusDetailSheet?.classList.toggle("is-open", shouldOpen);
  els.adminEmployeeStatusDetailSheet?.setAttribute("aria-hidden", String(!shouldOpen));

  if (els.adminEmployeeStatusDetailBackdrop) {
    els.adminEmployeeStatusDetailBackdrop.classList.toggle("hidden", !shouldOpen);
    requestAnimationFrame(() => {
      els.adminEmployeeStatusDetailBackdrop?.classList.toggle("is-open", shouldOpen);
    });
  }

  document.body.classList.toggle(
    "employee-status-dialog-open",
    shouldOpen && !isMobileManagementViewport()
  );

  syncMobileSheetBodyLock();
}

// =========================
// Xác thực & Popup Cài đặt Phiếu công việc
// =========================
function clearWorkOrderSettingsAuthorization() {
  state.workOrderSettingsAuthorizationToken = "";
  state.workOrderSettingsAuthorizationExpiresAt = 0;
}

function hasValidWorkOrderSettingsAuthorization() {
  return Boolean(
    state.workOrderSettingsAuthorizationToken
    && Number(state.workOrderSettingsAuthorizationExpiresAt) > Date.now() + 3000
  );
}

function setWorkOrderSettingsPasswordError(message = "") {
  if (!els.workOrderSettingsPasswordError) return;
  els.workOrderSettingsPasswordError.textContent = message;
  els.workOrderSettingsPasswordError.classList.toggle("hidden", !message);
}

function openWorkOrderSettingsPasswordModal() {
  if (!isAdminProfile()) {
    toast("Chỉ Admin được thay đổi Cài đặt Phiếu công việc.", "error");
    return;
  }

  clearWorkOrderSettingsAuthorization();
  setWorkOrderSettingsPasswordError("");

  if (els.workOrderSettingsPasswordInput) {
    els.workOrderSettingsPasswordInput.value = "";
    els.workOrderSettingsPasswordInput.type = "password";
  }
  if (els.toggleWorkOrderSettingsPasswordBtn) {
    els.toggleWorkOrderSettingsPasswordBtn.textContent = "Hiện";
    els.toggleWorkOrderSettingsPasswordBtn.setAttribute("aria-pressed", "false");
  }

  els.workOrderSettingsPasswordModal?.classList.remove("hidden");
  els.workOrderSettingsPasswordModal?.setAttribute("aria-hidden", "false");
  document.body.classList.add("work-order-settings-password-open");
  setMobileTaskPanelMenuOpen(false);

  requestAnimationFrame(() => {
    els.workOrderSettingsPasswordInput?.focus({ preventScroll: true });
  });
}

function closeWorkOrderSettingsPasswordModal({ preserveAuthorization = false } = {}) {
  els.workOrderSettingsPasswordModal?.classList.add("hidden");
  els.workOrderSettingsPasswordModal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("work-order-settings-password-open");
  setWorkOrderSettingsPasswordError("");

  if (els.workOrderSettingsPasswordInput) {
    els.workOrderSettingsPasswordInput.value = "";
    els.workOrderSettingsPasswordInput.type = "password";
  }

  if (!preserveAuthorization) clearWorkOrderSettingsAuthorization();
}

function getSettingsPasswordErrorMessage(error) {
  const code = String(error?.code || "");
  if (code.includes("resource-exhausted")) {
    return "Bạn đã nhập sai quá nhiều lần. Vui lòng chờ vài phút rồi thử lại.";
  }
  if (code.includes("unauthenticated")) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }
  if (code.includes("permission-denied")) {
    return "Mật khẩu không đúng hoặc tài khoản không có quyền Admin.";
  }
  if (code.includes("invalid-argument")) {
    return "Vui lòng nhập mật khẩu Cài đặt.";
  }
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) {
    return "Không kết nối được máy chủ xác thực. Vui lòng kiểm tra mạng và thử lại.";
  }
  return "Không xác thực được mật khẩu Cài đặt. Vui lòng thử lại.";
}

function syncWorkOrderSettingsLimitControls() {
  const enabled = els.enableMaxExtendMinutes?.checked === true;
  els.maxExtendMinutesOptions?.classList.toggle("is-disabled", !enabled);
  els.maxExtendMinutesOptions?.querySelectorAll('input[name="maxExtendMinutes"]').forEach((input) => {
    input.disabled = !enabled;
  });
}

function openWorkOrderSettingsModal() {
  if (!isAdminProfile()) {
    toast("Chỉ Admin được thay đổi Cài đặt Phiếu công việc.", "error");
    return;
  }

  if (!hasValidWorkOrderSettingsAuthorization()) {
    openWorkOrderSettingsPasswordModal();
    return;
  }

  const settings = getWorkOrderControlSettings();
  const hasLimit = Boolean(settings.maxExtendMinutes);
  if (els.enableMaxExtendMinutes) els.enableMaxExtendMinutes.checked = hasLimit;
  if (els.preventWorkOrderDeletion) {
    els.preventWorkOrderDeletion.checked = settings.preventWorkOrderDeletion;
  }
  if (els.allowOverdueTimeExtension) {
    els.allowOverdueTimeExtension.checked = settings.allowOverdueTimeExtension;
  }

  const selectedValue = String(settings.maxExtendMinutes || 20);
  els.maxExtendMinutesOptions?.querySelectorAll('input[name="maxExtendMinutes"]').forEach((input) => {
    input.checked = input.value === selectedValue;
  });

  syncWorkOrderSettingsLimitControls();
  els.workOrderSettingsModal?.classList.remove("hidden");
  els.workOrderSettingsModal?.setAttribute("aria-hidden", "false");
  document.body.classList.add("work-order-settings-open");
  setMobileTaskPanelMenuOpen(false);
}

function closeWorkOrderSettingsModal({ keepAuthorization = false } = {}) {
  els.workOrderSettingsModal?.classList.add("hidden");
  els.workOrderSettingsModal?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("work-order-settings-open");
  if (!keepAuthorization) clearWorkOrderSettingsAuthorization();
}

els.toggleWorkOrderSettingsPasswordBtn?.addEventListener("click", () => {
  const input = els.workOrderSettingsPasswordInput;
  if (!input) return;
  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  els.toggleWorkOrderSettingsPasswordBtn.textContent = shouldShow ? "Ẩn" : "Hiện";
  els.toggleWorkOrderSettingsPasswordBtn.setAttribute("aria-pressed", String(shouldShow));
  input.focus({ preventScroll: true });
});

els.workOrderSettingsPasswordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isAdminProfile()) {
    setWorkOrderSettingsPasswordError("Chỉ Admin được mở Cài đặt Phiếu công việc.");
    return;
  }

  const password = String(els.workOrderSettingsPasswordInput?.value || "");
  if (!password) {
    setWorkOrderSettingsPasswordError("Vui lòng nhập mật khẩu Cài đặt.");
    els.workOrderSettingsPasswordInput?.focus({ preventScroll: true });
    return;
  }

  setWorkOrderSettingsPasswordError("");
  setButtonLoading(els.verifyWorkOrderSettingsPasswordBtn, true, "Đang xác thực...");

  try {
    const result = await verifyWorkOrderSettingsPasswordCallable({ password });
    const data = result?.data || {};

    if (!data.authorized || !data.authorizationToken) {
      throw new Error("settings-authorization-failed");
    }

    state.workOrderSettingsAuthorizationToken = String(data.authorizationToken);
    state.workOrderSettingsAuthorizationExpiresAt = Number(data.expiresAt || 0);

    closeWorkOrderSettingsPasswordModal({ preserveAuthorization: true });
    openWorkOrderSettingsModal();
  } catch (error) {
    console.error("Không xác thực được mật khẩu Cài đặt:", error);
    clearWorkOrderSettingsAuthorization();
    setWorkOrderSettingsPasswordError(getSettingsPasswordErrorMessage(error));
    if (els.workOrderSettingsPasswordInput) {
      els.workOrderSettingsPasswordInput.value = "";
      els.workOrderSettingsPasswordInput.focus({ preventScroll: true });
    }
  } finally {
    setButtonLoading(els.verifyWorkOrderSettingsPasswordBtn, false);
  }
});

els.enableMaxExtendMinutes?.addEventListener("change", syncWorkOrderSettingsLimitControls);
els.openWorkOrderSettingsBtn?.addEventListener("click", openWorkOrderSettingsPasswordModal);

document.querySelectorAll("[data-close-work-order-settings-password]").forEach((button) => {
  button.addEventListener("click", () => closeWorkOrderSettingsPasswordModal());
});

document.querySelectorAll("[data-close-work-order-settings]").forEach((button) => {
  button.addEventListener("click", () => closeWorkOrderSettingsModal());
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (!els.workOrderSettingsPasswordModal?.classList.contains("hidden")) {
    event.preventDefault();
    closeWorkOrderSettingsPasswordModal();
    return;
  }

  if (!els.workOrderSettingsModal?.classList.contains("hidden")) {
    event.preventDefault();
    closeWorkOrderSettingsModal();
  }
});

els.workOrderSettingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isAdminProfile()) {
    toast("Chỉ Admin được lưu Cài đặt Phiếu công việc.", "error");
    return;
  }

  if (!hasValidWorkOrderSettingsAuthorization()) {
    closeWorkOrderSettingsModal();
    toast("Phiên xác thực Cài đặt đã hết hạn. Vui lòng nhập lại mật khẩu.", "error");
    openWorkOrderSettingsPasswordModal();
    return;
  }

  const limitEnabled = els.enableMaxExtendMinutes?.checked === true;
  const selectedLimit = Number(
    els.maxExtendMinutesOptions?.querySelector('input[name="maxExtendMinutes"]:checked')?.value
  );

  if (limitEnabled && !WORK_ORDER_EXTENSION_LIMIT_OPTIONS.includes(selectedLimit)) {
    toast("Vui lòng chọn giới hạn 10, 20 hoặc 30 phút.", "error");
    return;
  }

  setButtonLoading(els.saveWorkOrderSettingsBtn, true, "Đang lưu...");

  try {
    const result = await saveWorkOrderControlSettingsCallable({
      authorizationToken: state.workOrderSettingsAuthorizationToken,
      maxExtendMinutes: limitEnabled ? selectedLimit : null,
      preventWorkOrderDeletion: els.preventWorkOrderDeletion?.checked === true,
      allowOverdueTimeExtension: els.allowOverdueTimeExtension?.checked === true
    });

    const savedSettings = normalizeWorkOrderControlSettings(result?.data?.settings || {});
    state.workOrderControlSettings = savedSettings;
    state.workOrderControlSettingsReady = true;

    closeWorkOrderSettingsModal();
    toast("Đã lưu Cài đặt Phiếu công việc.", "success");
  } catch (error) {
    console.error("Không lưu được Cài đặt:", error);
    const code = String(error?.code || "");
    if (code.includes("unauthenticated") || code.includes("permission-denied")) {
      closeWorkOrderSettingsModal();
      toast("Phiên xác thực Cài đặt không còn hợp lệ. Vui lòng nhập lại mật khẩu.", "error");
      openWorkOrderSettingsPasswordModal();
    } else {
      toast("Không lưu được Cài đặt. Vui lòng kiểm tra kết nối và Cloud Functions.", "error");
    }
  } finally {
    setButtonLoading(els.saveWorkOrderSettingsBtn, false);
  }
});


const employeeMobileFilterPortal = { initialized: false, rootAnchor: null };

function initializeEmployeeMobileFilterPortal() {
  if (employeeMobileFilterPortal.initialized) return;
  const root = els.employeeMobileFilterModalRoot;
  if (!root || !root.parentNode) return;
  employeeMobileFilterPortal.rootAnchor = document.createComment("employee-mobile-filter-modal-root-anchor");
  root.parentNode.insertBefore(employeeMobileFilterPortal.rootAnchor, root);
  employeeMobileFilterPortal.initialized = true;
}

function portalEmployeeMobileFilterToBody() {
  initializeEmployeeMobileFilterPortal();
  const root = els.employeeMobileFilterModalRoot;
  if (root && root.parentNode !== document.body) document.body.appendChild(root);
}

function restoreEmployeeMobileFilterFromBody() {
  const root = els.employeeMobileFilterModalRoot;
  const anchor = employeeMobileFilterPortal.rootAnchor;
  if (root && anchor?.parentNode) anchor.parentNode.insertBefore(root, anchor.nextSibling);
}

function setEmployeeMobileFilterSheetOpen(open) {
  const shouldOpen = Boolean(open && isMobileManagementViewport());
  if (shouldOpen) portalEmployeeMobileFilterToBody();
  state.employeeMobileFilterSheetOpen = shouldOpen;
  const root = els.employeeMobileFilterModalRoot;
  root?.classList.toggle("is-open", shouldOpen);
  root?.setAttribute("aria-hidden", String(!shouldOpen));
  els.employeeMobileFilterSheet?.classList.toggle("is-open", shouldOpen);
  if (els.employeeMobileFilterSheet) {
    if (isMobileManagementViewport()) {
      els.employeeMobileFilterSheet.setAttribute("role", "dialog");
      els.employeeMobileFilterSheet.setAttribute("aria-modal", "true");
      els.employeeMobileFilterSheet.setAttribute("aria-hidden", String(!shouldOpen));
    } else {
      els.employeeMobileFilterSheet.setAttribute("role", "group");
      els.employeeMobileFilterSheet.removeAttribute("aria-modal");
      els.employeeMobileFilterSheet.removeAttribute("aria-hidden");
    }
  }
  els.employeeMobileFilterOpenBtn?.setAttribute("aria-expanded", String(shouldOpen));
  if (els.employeeMobileFilterBackdrop) {
    els.employeeMobileFilterBackdrop.classList.toggle("hidden", !shouldOpen);
    if (shouldOpen) requestAnimationFrame(() => els.employeeMobileFilterBackdrop?.classList.add("is-open"));
    else els.employeeMobileFilterBackdrop.classList.remove("is-open");
  }
  syncMobileSheetBodyLock();
  if (shouldOpen && els.employeeMobileFilterSheet) els.employeeMobileFilterSheet.scrollTop = 0;
  if (!shouldOpen) window.setTimeout(() => {
    if (!state.employeeMobileFilterSheetOpen) restoreEmployeeMobileFilterFromBody();
  }, 220);
}

function getEmployeeActiveMobileFilterDescriptors() {
  const filters = [];
  if (state.employeeStatusFilter !== "all") filters.push({ key: "status", label: getSelectOptionText(els.employeeStatusFilter, "Trạng thái") });
  if (state.employeeStatusFilter === "completed" && state.employeeCompletedTypeFilter !== "all") {
    filters.push({ key: "completedType", label: getSelectOptionText(els.employeeCompletedTypeFilter, "Nhóm hoàn thành") });
  }
  const dateFilter = state.employeeDateFilter || { mode: "all" };
  if (dateFilter.mode !== "all") {
    let label = getSelectOptionText(els.employeeDateMode, "Thời gian");
    if (dateFilter.mode === "single" && dateFilter.single) label = formatDateOnly(dateFilter.single);
    else if (dateFilter.mode === "range") {
      if (dateFilter.from && dateFilter.to) label = `${formatDateOnly(dateFilter.from)} – ${formatDateOnly(dateFilter.to)}`;
      else if (dateFilter.from) label = `Từ ${formatDateOnly(dateFilter.from)}`;
      else if (dateFilter.to) label = `Đến ${formatDateOnly(dateFilter.to)}`;
    }
    filters.push({ key: "date", label });
  }
  return filters;
}

function updateEmployeeMobileFilterUI() {
  const filters = getEmployeeActiveMobileFilterDescriptors();
  if (els.employeeMobileFilterCount) {
    els.employeeMobileFilterCount.textContent = String(filters.length);
    els.employeeMobileFilterCount.classList.toggle("hidden", filters.length === 0);
  }
  if (els.employeeActiveFilterChips) {
    els.employeeActiveFilterChips.innerHTML = filters.map((filter) => `
      <span class="mobile-active-filter-chip"><span title="${escapeHtml(filter.label)}">${escapeHtml(filter.label)}</span>
      <button type="button" data-clear-employee-mobile-filter="${escapeHtml(filter.key)}" aria-label="Bỏ lọc ${escapeHtml(filter.label)}">×</button></span>`).join("");
  }
}

function getEmployeeMobileResultScopeLabel() {
  const filter = state.employeeDateFilter || { mode: "all" };
  if (filter.mode === "today") return formatDateOnly(todayInputValue());
  if (filter.mode === "yesterday") return formatDateOnly(yesterdayInputValue());
  if (filter.mode === "current_month") return "Tháng này";
  if (filter.mode === "previous_month") return "Tháng trước";
  if (filter.mode === "single") return filter.single ? formatDateOnly(filter.single) : "Ngày cụ thể";
  if (filter.mode === "range") {
    if (filter.from && filter.to) return `${formatDateOnly(filter.from)} – ${formatDateOnly(filter.to)}`;
    if (filter.from) return `Từ ${formatDateOnly(filter.from)}`;
    if (filter.to) return `Đến ${formatDateOnly(filter.to)}`;
    return "Khoảng ngày";
  }
  return "Toàn thời gian";
}

function updateEmployeeMobileResultSummary(groupCount = 0) {
  if (!els.employeeMobileResultSummary) return;
  els.employeeMobileResultSummary.textContent = `▣ ${getEmployeeMobileResultScopeLabel()} • ${Math.max(0, Number(groupCount || 0))} Phiếu công việc`;
}

function resetEmployeeMobileFilters() {
  state.employeeStatusFilter = "all";
  state.employeeCompletedTypeFilter = "all";
  state.employeeDateFilter = { mode: "today", single: todayInputValue(), from: "", to: "" };
  if (els.employeeStatusFilter) els.employeeStatusFilter.value = "all";
  if (els.employeeCompletedTypeFilter) els.employeeCompletedTypeFilter.value = "all";
  if (els.employeeDateMode) els.employeeDateMode.value = "today";
  if (els.employeeSingleDate) els.employeeSingleDate.value = todayInputValue();
  if (els.employeeDateFrom) els.employeeDateFrom.value = "";
  if (els.employeeDateTo) els.employeeDateTo.value = "";
  updateCompletedTypeFilterVisibility("employee");
  refreshDateFilterVisibility("employee");
  renderEmployeeTasks();
  renderEmployeeWorkOrderSuggestions();
}

function clearEmployeeMobileFilter(key) {
  if (key === "status") {
    state.employeeStatusFilter = "all";
    state.employeeCompletedTypeFilter = "all";
    if (els.employeeStatusFilter) els.employeeStatusFilter.value = "all";
    if (els.employeeCompletedTypeFilter) els.employeeCompletedTypeFilter.value = "all";
  } else if (key === "completedType") {
    state.employeeCompletedTypeFilter = "all";
    if (els.employeeCompletedTypeFilter) els.employeeCompletedTypeFilter.value = "all";
  } else if (key === "date") {
    state.employeeDateFilter = { mode: "all", single: "", from: "", to: "" };
    if (els.employeeDateMode) els.employeeDateMode.value = "all";
    if (els.employeeSingleDate) els.employeeSingleDate.value = "";
    if (els.employeeDateFrom) els.employeeDateFrom.value = "";
    if (els.employeeDateTo) els.employeeDateTo.value = "";
  }
  updateCompletedTypeFilterVisibility("employee");
  refreshDateFilterVisibility("employee");
  renderEmployeeTasks();
  renderEmployeeWorkOrderSuggestions();
}

function getEmployeeSearchScopedTasks() {
  let tasks = state.tasks
    .filter((task) => isTaskInDateFilter(task, state.employeeDateFilter))
    .map((task) => ({ ...task, displayStatus: getDisplayStatus(task) }));
  if (state.employeeStatusFilter !== "all") tasks = tasks.filter((task) => taskMatchesStatusFilter(task, state.employeeStatusFilter));
  if (state.employeeStatusFilter === "completed" && state.employeeCompletedTypeFilter !== "all") {
    tasks = tasks.filter((task) => getCompletedTaskGroup(task) === state.employeeCompletedTypeFilter);
  }
  return tasks;
}

function getEmployeeWorkOrderSearchResults(queryText = state.employeeWorkOrderSearch) {
  const queryValue = normalizeSearchText(queryText);
  if (!queryValue) return [];
  return sortTicketGroupsForDisplay(groupTasksByWorkOrder(getEmployeeSearchScopedTasks()))
    .map((group) => ({ ...group, searchScore: getWorkOrderSearchScore(group.name, queryValue) }))
    .filter((group) => Number.isFinite(group.searchScore))
    .sort((a, b) => a.searchScore - b.searchScore || b.createdAtMs - a.createdAtMs || a.name.localeCompare(b.name, "vi"));
}

function hideEmployeeWorkOrderSuggestions() {
  if (!els.employeeWorkOrderSuggestions) return;
  els.employeeWorkOrderSuggestions.classList.add("hidden");
  els.employeeWorkOrderSuggestions.innerHTML = "";
  els.employeeWorkOrderSearch?.setAttribute("aria-expanded", "false");
  state.employeeWorkOrderSuggestionIndex = -1;
}

function updateEmployeeWorkOrderSuggestionActiveState() {
  const options = Array.from(els.employeeWorkOrderSuggestions?.querySelectorAll?.("[data-employee-work-order-search-value]") || []);
  options.forEach((option, index) => {
    const active = index === state.employeeWorkOrderSuggestionIndex;
    option.classList.toggle("is-active", active);
    option.setAttribute("aria-selected", active ? "true" : "false");
    if (active) option.scrollIntoView({ block: "nearest" });
  });
}

function renderEmployeeWorkOrderSuggestions() {
  const box = els.employeeWorkOrderSuggestions;
  const input = els.employeeWorkOrderSearch;
  if (!box || !input) return;
  const queryText = input.value.trim();
  state.employeeWorkOrderSearch = queryText;
  els.employeeClearWorkOrderSearch?.classList.toggle("hidden", !queryText);
  if (!queryText || document.activeElement !== input) return hideEmployeeWorkOrderSuggestions();
  const unique = new Map();
  getEmployeeWorkOrderSearchResults(queryText).forEach((item) => {
    const key = normalizeSearchText(item.name);
    const current = unique.get(key);
    if (current) { current.ticketCount += 1; current.taskCount += Number(item.totalTaskCount || item.tasks?.length || 0); }
    else unique.set(key, { ...item, ticketCount: 1, taskCount: Number(item.totalTaskCount || item.tasks?.length || 0) });
  });
  const suggestions = Array.from(unique.values()).slice(0, 8);
  state.employeeWorkOrderSuggestionIndex = suggestions.length ? 0 : -1;
  box.classList.remove("hidden");
  input.setAttribute("aria-expanded", "true");
  if (!suggestions.length) {
    box.innerHTML = '<div class="admin-work-order-suggestion-empty">Không tìm thấy tên Phiếu công việc gần giống theo bộ lọc hiện tại.</div>';
    return;
  }
  box.innerHTML = suggestions.map((item, index) => `
    <button class="admin-work-order-suggestion${index === 0 ? " is-active" : ""}" type="button" role="option"
      aria-selected="${index === 0 ? "true" : "false"}" data-employee-work-order-search-value="${escapeHtml(item.name)}">
      <strong>${escapeHtml(item.name)}</strong><span>${item.ticketCount > 1 ? `${item.ticketCount} phiếu • ` : ""}${item.taskCount} công việc</span>
    </button>`).join("");
}

function setEmployeeWorkOrderSearch(value) {
  const next = String(value || "").trim();
  state.employeeWorkOrderSearch = next;
  state.employeeWorkOrderSuggestionIndex = -1;
  if (els.employeeWorkOrderSearch) els.employeeWorkOrderSearch.value = next;
  els.employeeClearWorkOrderSearch?.classList.toggle("hidden", !next);
  hideEmployeeWorkOrderSuggestions();
  renderEmployeeTasks();
}

function bindEmployeeWorkOrderSearch() {
  const input = els.employeeWorkOrderSearch;
  const box = els.employeeWorkOrderSuggestions;
  if (!input || !box) return;
  const handle = () => {
    state.employeeWorkOrderSearch = input.value.trim();
    state.employeeWorkOrderSuggestionIndex = -1;
    renderEmployeeTasks();
    renderEmployeeWorkOrderSuggestions();
  };
  input.addEventListener("input", handle);
  input.addEventListener("search", handle);
  input.addEventListener("focus", renderEmployeeWorkOrderSuggestions);
  input.addEventListener("keydown", (event) => {
    const options = Array.from(box.querySelectorAll("[data-employee-work-order-search-value]"));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!options.length) return renderEmployeeWorkOrderSuggestions();
      event.preventDefault();
      const dir = event.key === "ArrowDown" ? 1 : -1;
      const current = state.employeeWorkOrderSuggestionIndex < 0 ? 0 : state.employeeWorkOrderSuggestionIndex;
      state.employeeWorkOrderSuggestionIndex = (current + dir + options.length) % options.length;
      updateEmployeeWorkOrderSuggestionActiveState();
    } else if (event.key === "Enter" && options.length) {
      event.preventDefault();
      const selected = options[state.employeeWorkOrderSuggestionIndex >= 0 ? state.employeeWorkOrderSuggestionIndex : 0];
      if (selected) setEmployeeWorkOrderSearch(selected.dataset.employeeWorkOrderSearchValue || "");
    } else if (event.key === "Escape") hideEmployeeWorkOrderSuggestions();
  });
  box.addEventListener("pointerdown", (event) => event.preventDefault());
  box.addEventListener("click", (event) => {
    const option = event.target.closest("[data-employee-work-order-search-value]");
    if (!option) return;
    setEmployeeWorkOrderSearch(option.dataset.employeeWorkOrderSearchValue || "");
    input.focus();
  });
  els.employeeClearWorkOrderSearch?.addEventListener("click", () => { setEmployeeWorkOrderSearch(""); input.focus(); });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".employee-work-order-search")) hideEmployeeWorkOrderSuggestions();
  });
}

function renderEmployeeWorkOrderSearchSummary(resultCount = 0) {
  const el = els.employeeWorkOrderSearchSummary;
  if (!el) return;
  const query = String(state.employeeWorkOrderSearch || "").trim();
  els.employeeClearWorkOrderSearch?.classList.toggle("hidden", !query);
  if (!query) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.classList.remove("hidden");
  el.textContent = `Đang tìm trong công việc của bạn: ${resultCount} kết quả gần giống “${query}”.`;
}

function setupMobileAdminCompactControls() {
  try {
    state.mobileEmployeeStatusExpanded = localStorage.getItem("quanlynhansu-mobile-employee-status") !== "collapsed";
  } catch (_) {
    state.mobileEmployeeStatusExpanded = true;
  }
  applyMobileEmployeeStatusExpanded();

  els.adminMobileEmployeeStatusToggle?.addEventListener("click", () => {
    state.mobileEmployeeStatusExpanded = !state.mobileEmployeeStatusExpanded;
    try {
      localStorage.setItem(
        "quanlynhansu-mobile-employee-status",
        state.mobileEmployeeStatusExpanded ? "expanded" : "collapsed"
      );
    } catch (_) {
      // LocalStorage có thể bị chặn ở chế độ riêng tư; giao diện vẫn hoạt động trong phiên hiện tại.
    }
    applyMobileEmployeeStatusExpanded();
  });

  els.adminEmployeeStatusSummary?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-employee-status-type]");
    if (!card) return;
    setEmployeeStatusDetailSheetOpen(true, card.dataset.employeeStatusType || "free");
  });

  els.mobileTaskPanelMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    setMobileTaskPanelMenuOpen(!els.mobileTaskPanelMenu?.classList.contains("is-open"));
  });

  els.mobileTaskPanelMenu?.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", () => setMobileTaskPanelMenuOpen(false));

  els.adminMobileFilterOpenBtn?.addEventListener("click", () => setAdminMobileFilterSheetOpen(true));
  els.adminMobileFilterCloseBtn?.addEventListener("click", () => setAdminMobileFilterSheetOpen(false));
  els.adminMobileFilterBackdrop?.addEventListener("click", () => setAdminMobileFilterSheetOpen(false));
  els.adminMobileFilterModalRoot?.addEventListener("click", (event) => {
    if (event.target === els.adminMobileFilterModalRoot) setAdminMobileFilterSheetOpen(false);
  });
  els.adminMobileFilterApplyBtn?.addEventListener("click", () => setAdminMobileFilterSheetOpen(false));
  els.adminMobileFilterResetBtn?.addEventListener("click", resetAdminMobileFilters);

  els.employeeMobileFilterOpenBtn?.addEventListener("click", () => setEmployeeMobileFilterSheetOpen(true));
  els.employeeMobileFilterCloseBtn?.addEventListener("click", () => setEmployeeMobileFilterSheetOpen(false));
  els.employeeMobileFilterBackdrop?.addEventListener("click", () => setEmployeeMobileFilterSheetOpen(false));
  els.employeeMobileFilterModalRoot?.addEventListener("click", (event) => {
    if (event.target === els.employeeMobileFilterModalRoot) setEmployeeMobileFilterSheetOpen(false);
  });
  els.employeeMobileFilterApplyBtn?.addEventListener("click", () => setEmployeeMobileFilterSheetOpen(false));
  els.employeeMobileFilterResetBtn?.addEventListener("click", resetEmployeeMobileFilters);
  els.employeeActiveFilterChips?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-clear-employee-mobile-filter]");
    if (!button) return;
    clearEmployeeMobileFilter(button.dataset.clearEmployeeMobileFilter || "");
  });

  els.adminActiveFilterChips?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-clear-mobile-filter]");
    if (!button) return;
    clearAdminMobileFilter(button.dataset.clearMobileFilter || "");
  });

  els.adminEmployeeStatusDetailCloseBtn?.addEventListener("click", () => setEmployeeStatusDetailSheetOpen(false));
  els.adminEmployeeStatusDetailBackdrop?.addEventListener("click", () => setEmployeeStatusDetailSheetOpen(false));

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    setMobileTaskPanelMenuOpen(false);
    setAdminMobileFilterSheetOpen(false);
    setEmployeeMobileFilterSheetOpen(false);
    setEmployeeStatusDetailSheetOpen(false);
    closeWorkOrderSettingsModal();
  });

  window.addEventListener("resize", () => {
    if (!isMobileManagementViewport()) {
      setMobileTaskPanelMenuOpen(false);
      setAdminMobileFilterSheetOpen(false);
    }

    // Nếu cửa sổ danh sách nhân viên đang mở, giữ nguyên và để CSS
    // tự chuyển giữa popup desktop và bottom sheet mobile.
    if (els.adminEmployeeStatusDetailSheet?.classList.contains("is-open")) {
      document.body.classList.toggle(
        "employee-status-dialog-open",
        !isMobileManagementViewport()
      );
      syncMobileSheetBodyLock();
    }
  });

  updateMobileTaskPanelMenuAvailability();
  updateAdminMobileFilterUI();
}

setupMobileAdminCompactControls();

els.deleteAllWorkOrdersBtn?.addEventListener("click", () => {
  setMobileTaskPanelMenuOpen(false);
  deleteAllWorkOrders(els.deleteAllWorkOrdersBtn);
});

els.adminStatusFilter.addEventListener("change", (event) => {
  state.adminStatusFilter = event.target.value;

  if (state.adminStatusFilter !== "completed") {
    state.adminCompletedTypeFilter = "all";
  }

  renderAdminTasks();
  renderAdminWorkOrderSuggestions();
});

document.querySelectorAll("[data-dashboard-stat-filter]").forEach((card) => {
  card.addEventListener("click", () => {
    const statusFilter = card.dataset.dashboardStatFilter || "all";
    if (!els.adminStatusFilter) return;

    state.adminCompletedTypeFilter = "all";
    if (els.adminCompletedTypeFilter) els.adminCompletedTypeFilter.value = "all";
    els.adminStatusFilter.value = statusFilter;
    els.adminStatusFilter.dispatchEvent(new Event("change", { bubbles: true }));

    requestAnimationFrame(() => {
      document.querySelector("#adminView .task-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  });
});

function setupFloatingCreateTaskVisibility() {
  const primaryButton = els.openTaskModalBtn;
  const floatingButton = els.floatingCreateTaskBtn;
  if (!primaryButton || !floatingButton || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver((entries) => {
    const primaryVisible = entries.some((entry) => entry.isIntersecting);
    floatingButton.classList.toggle("is-near-primary-action", primaryVisible);
  }, {
    threshold: 0.25
  });

  observer.observe(primaryButton);
}

setupFloatingCreateTaskVisibility();

els.adminCompletedTypeFilter?.addEventListener("change", (event) => {
  state.adminCompletedTypeFilter = event.target.value;
  renderAdminTasks();
  renderAdminWorkOrderSuggestions();
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
  if (!requirePermission("manageHotelReports", "Tài khoản của bạn chưa được cấp quyền lưu Tổng kết Hotel.")) return;

  const dateKey = getAdminHotelReportDateKey();

  if (!dateKey) {
    toast("Vui lòng chọn Hôm nay, Hôm qua hoặc Chọn 1 ngày trước khi lưu tổng kết Hotel.", "error");
    return;
  }

  if (dateKey > todayInputValue()) {
    toast("Chỉ có thể lưu tổng kết Hotel cho hôm nay hoặc một ngày trong quá khứ.", "error");
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
    toast(`Đã lưu tổng kết Hotel ngày ${formatDateOnly(dateKey)}.`, "success");
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
  if (!isAdminProfile()) return;

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
  els.photoReportView?.classList.add("hidden");
  els.employeeView.classList.remove("hidden");
  renderEmployeeEmploymentStatusBanner();

  const unsubOwnProfile = onSnapshot(
    doc(db, "users", state.user.uid),
    (snapshot) => {
      if (snapshot.exists()) {
        state.profile = { id: snapshot.id, ...snapshot.data() };
        renderEmployeeEmploymentStatusBanner();
      }
    },
    handleSnapshotError
  );

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

      renderEmployeeEmploymentStatusBanner();
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

  state.unsubs.push(unsubOwnProfile, unsubTasks, unsubEmployeeWorkOrders);
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
  if (isShipTask(task)) return "ship";
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
    hotel: "Hotel đã làm",
    ship: "Đã ship"
  };

  return labels[value] || "";
}

function getCompletedReportTitle(filterValue) {
  if (filterValue === "normal") {
    return "Báo cáo tổng kết các task Công việc bình thường đã hoàn thành";
  }

  if (filterValue === "lunch_break") {
    return "Báo cáo tổng thời gian các task Nghỉ trưa đã hoàn thành";
  }

  if (filterValue === "ship") {
    return "Báo cáo tổng thời gian các task Ship đã hoàn thành";
  }

  return "Báo cáo tổng thời gian các task Hotel đã hoàn thành";
}

function hasTaskTimeExtensions(task) {
  const extensions = Array.isArray(task.timeExtensions) ? task.timeExtensions : [];

  return Number(task.timeExtensionTotalMinutes || 0) > 0
    || Number(task.timeExtensionCount || 0) > 0
    || extensions.some((item) => Number(item?.minutes || 0) > 0);
}

function shouldCountExtendedTaskAsOnTime(task, actualMinutes, deadlineMinutes) {
  return hasTaskTimeExtensions(task)
    && Number(actualMinutes || 0) > 0
    && Number(deadlineMinutes || 0) > 0
    && Number(actualMinutes || 0) <= Number(deadlineMinutes || 0);
}

function getCompletedNormalTaskStats(task) {
  const deadlineMinutes = Number(task.deadlineMinutes || 0);
  const rawActualMinutes = Number(task.actualMinutes || 0) > 0
    ? Number(task.actualMinutes || 0)
    : getCompletedTaskActualMinutes(task);

  // Nếu task đã được ghi nhận là đúng thời gian, báo cáo năng lực tổng hợp cũng phải tính là 100%.
  // Trường hợp thường gặp: Admin đã “Thêm giờ”, nhân viên hoàn thành trước hạn mới.
  // Khi đó resultType của task là on_time, nên không được cộng thành năng lực >100% theo thời gian thực tế ngắn hơn hạn mới.
  const isStoredOnTime = task.resultType === "on_time";
  const isExtendedOnTime = shouldCountExtendedTaskAsOnTime(task, rawActualMinutes, deadlineMinutes);
  const actualMinutes = (isStoredOnTime || isExtendedOnTime)
    ? deadlineMinutes
    : rawActualMinutes;

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

  // Tổng kết Hotel là báo cáo theo từng ngày. Cho phép Admin lưu cho hôm nay,
  // hôm qua hoặc một ngày cụ thể trong quá khứ nếu trước đó bị quên chưa lưu.
  if (filter.mode === "today") return todayInputValue();
  if (filter.mode === "yesterday") return yesterdayInputValue();
  if (filter.mode === "single") return filter.single || "";

  // Các bộ lọc nhiều ngày như Toàn thời gian/Tháng/Khoảng ngày không xác định
  // được duy nhất một ngày để làm mã tài liệu hotelDailyReports.
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
    const reportDayText = dateKey === todayInputValue()
      ? "hôm nay"
      : `ngày ${formatDateOnly(dateKey)}`;

    timeStatusText = totalActualMinutes <= allowedMinutes
      ? `Các bạn ${reportDayText} làm đúng thời gian`
      : `Các bạn ${reportDayText} làm không đúng thời gian`;
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
  if (!hasPermission("manageHotelReports")) return;

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
  const canManageHotelReport = hasPermission("manageHotelReports");
  const disabledAttribute = canManageHotelReport ? "" : " disabled";
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
      <select data-admin-hotel-hygiene${disabledAttribute}>
        <option value="pending" ${hygieneValue === "pending" ? "selected" : ""}>Chưa đánh giá</option>
        <option value="pass" ${hygieneValue === "pass" ? "selected" : ""}>Đạt</option>
        <option value="fail" ${hygieneValue === "fail" ? "selected" : ""}>Không đạt</option>
      </select>
    </label>
    <label class="hotel-report-control hotel-report-pet-control">
      <span>Số lượng bé ở hotel khi cho ăn và vệ sinh</span>
      <input data-admin-hotel-end-pet-count type="number" min="1" max="500" step="1" value="${escapeHtml(endPetCountRaw)}" placeholder="Nhập số bé"${disabledAttribute} />
    </label>
    <button type="button" class="hotel-report-ok-btn" data-admin-hotel-report-ok${disabledAttribute}>OK</button>
    ${canManageHotelReport ? "" : '<span class="small-note">Chỉ xem • Chưa được cấp quyền lưu Tổng kết Hotel</span>'}
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
    ["normal", "lunch_break", "hotel", "ship"].includes(completedTypeFilter);

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

  if (scope === "admin") {
    document.querySelector(".mobile-completed-filter-label")?.classList.toggle("hidden", !show);
  }

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

  if (statusFilter === "ship") {
    const displayStatus = task.displayStatus || getDisplayStatus(task);
    return isShipTask(task) && !["draft", "waiting_assignee", "queued", "submitted", "completed", "overdue"].includes(displayStatus);
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

function isActiveShipTaskForEmployeeSummary(task) {
  if (!task?.assignedToUid || !isShipTask(task)) return false;

  const displayStatus = task.displayStatus || getDisplayStatus(task);

  // Chỉ tính những công việc đang thực sự ở trạng thái "Đang ship".
  // Không tính Phiếu chưa giao, đang chờ đến lượt, chờ duyệt, đã xong hoặc quá hạn.
  return ![
    "draft",
    "waiting_assignee",
    "queued",
    "submitted",
    "completed",
    "overdue"
  ].includes(displayStatus);
}

function isTaskBlockingEmployeeForSummary(task) {
  if (!task?.assignedToUid) return false;

  const displayStatus = task.displayStatus || getDisplayStatus(task);

  // Nhân viên đang “Chờ đến lượt” vẫn được xem là chưa được giao việc
  // trong phần tổng kết nhân viên, vì task đó chưa bắt đầu chiếm thời gian làm thực tế.
  if (isActiveHotelTaskForEmployeeSummary(task)) return true;

  // Công việc Ship đang hoạt động cũng đồng nghĩa nhân viên đã được giao việc.
  // Giữ nguyên quy tắc: Ship chưa bắt đầu (queued), chờ duyệt, hoàn thành hoặc quá hạn
  // không được tính là "Đang ship" theo ô thống kê chuyên biệt.
  if (isActiveShipTaskForEmployeeSummary(task)) return true;

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

  const chips = employees
    .map((employee) => `<span class="employee-status-chip">${escapeHtml(getEmployeeSummaryName(employee))}</span>`)
    .join("");
  const overflowCount = Math.max(0, employees.length - 3);
  const moreChip = overflowCount
    ? `<span class="employee-status-more" aria-hidden="true">+${overflowCount}</span>`
    : "";

  return `${chips}${moreChip}`;
}

function getEmployeeStatusGroupConfig(type) {
  const configs = {
    free: {
      cardClass: "is-free",
      icon: "♙",
      longLabel: "Tổng số bạn nhân viên đang chưa được giao việc:",
      shortLabel: "Chưa có việc",
      detailTitle: "Nhân viên chưa được giao việc"
    },
    assigned: {
      cardClass: "is-assigned",
      icon: "♟",
      longLabel: "Tổng số bạn nhân viên đã được giao việc:",
      shortLabel: "Đã có việc",
      detailTitle: "Nhân viên đã được giao việc"
    },
    hotel: {
      cardClass: "is-hotel",
      icon: "▤",
      longLabel: "Tổng số bạn nhân viên đang làm hotel:",
      shortLabel: "Hotel",
      detailTitle: "Nhân viên đang làm Hotel"
    },
    ship: {
      cardClass: "is-ship",
      icon: "🚚",
      longLabel: "Tổng số bạn nhân viên Đang ship:",
      shortLabel: "Đang ship",
      detailTitle: "Nhân viên đang ship"
    },
    lunch: {
      cardClass: "is-lunch",
      icon: "☕",
      longLabel: "Tổng số bạn nhân viên đang nghỉ trưa:",
      shortLabel: "Nghỉ trưa",
      detailTitle: "Nhân viên đang nghỉ trưa"
    },
    off: {
      cardClass: "is-off",
      icon: "◷",
      longLabel: "Tổng số bạn nhân viên Đang Off:",
      shortLabel: "Đang Off",
      detailTitle: "Nhân viên Đang Off"
    }
  };

  return configs[type] || configs.free;
}

function renderEmployeeStatusCard(type, employees) {
  const config = getEmployeeStatusGroupConfig(type);
  const count = employees.length;

  return `
    <button class="employee-status-card ${config.cardClass}" type="button" data-employee-status-type="${escapeHtml(type)}" aria-label="${escapeHtml(config.detailTitle)}: ${count}">
      <span class="employee-status-card-icon" aria-hidden="true">${config.icon}</span>
      <strong>
        <span class="employee-status-long-label">${escapeHtml(config.longLabel)}</span>
        <span class="employee-status-short-label">${escapeHtml(config.shortLabel)}</span>
        <span class="employee-status-count">${count}</span>
      </strong>
      <div class="employee-status-names">${renderEmployeeStatusNameChips(employees)}</div>
    </button>
  `;
}

function updateMobileEmployeeStatusOverview() {
  if (!els.adminMobileEmployeeStatusOverview) return;

  const groups = state.adminEmployeeStatusGroups || {};
  const freeCount = groups.free?.length || 0;
  const assignedCount = groups.assigned?.length || 0;
  const hotelCount = groups.hotel?.length || 0;
  const shipCount = groups.ship?.length || 0;
  const lunchCount = groups.lunch?.length || 0;
  const offCount = groups.off?.length || 0;

  els.adminMobileEmployeeStatusOverview.textContent = `Chưa ${freeCount} • Đã ${assignedCount} • Hotel ${hotelCount} • Ship ${shipCount} • Nghỉ ${lunchCount} • Off ${offCount}`;
}

function applyMobileEmployeeStatusExpanded() {
  const expanded = state.mobileEmployeeStatusExpanded !== false;
  els.adminMobileEmployeeStatusToggle?.setAttribute("aria-expanded", String(expanded));
  els.adminEmployeeStatusSummary?.classList.toggle("is-mobile-collapsed", !expanded);
}

function renderAdminEmployeeStatusSummary(computedTasks = []) {
  const summaryEl = els.adminEmployeeStatusSummary;
  if (!summaryEl) return;

  const allEmployees = [...state.employees].sort((a, b) => getEmployeeSummaryName(a).localeCompare(getEmployeeSummaryName(b), "vi"));
  const offEmployees = allEmployees.filter((employee) => !isEmployeeWorking(employee));
  const employees = allEmployees.filter(isEmployeeWorking);
  const busyEmployeeUids = new Set();
  const hotelEmployeeUids = new Set();
  const shipEmployeeUids = new Set();
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

    if (isActiveShipTaskForEmployeeSummary(task)) {
      shipEmployeeUids.add(task.assignedToUid);
    }

    if (displayStatus === "lunch_break") {
      lunchEmployeeUids.add(task.assignedToUid);
    }
  });

  const freeEmployees = employees.filter((employee) => !busyEmployeeUids.has(employee.uid));
  const assignedEmployees = employees.filter((employee) => busyEmployeeUids.has(employee.uid));
  const hotelEmployees = employees.filter((employee) => hotelEmployeeUids.has(employee.uid));
  const shipEmployees = employees.filter((employee) => shipEmployeeUids.has(employee.uid));
  const lunchEmployees = employees.filter((employee) => lunchEmployeeUids.has(employee.uid));

  state.adminEmployeeStatusGroups = {
    free: freeEmployees,
    assigned: assignedEmployees,
    hotel: hotelEmployees,
    ship: shipEmployees,
    lunch: lunchEmployees,
    off: offEmployees
  };

  summaryEl.classList.remove("hidden");
  summaryEl.innerHTML = [
    renderEmployeeStatusCard("free", freeEmployees),
    renderEmployeeStatusCard("assigned", assignedEmployees),
    renderEmployeeStatusCard("hotel", hotelEmployees),
    renderEmployeeStatusCard("ship", shipEmployees),
    renderEmployeeStatusCard("lunch", lunchEmployees),
    renderEmployeeStatusCard("off", offEmployees)
  ].join("");

  updateMobileEmployeeStatusOverview();
  applyMobileEmployeeStatusExpanded();
}

function getAdminWorkOrderSearchDateScopeLabel() {
  const filter = state.adminDateFilter || { mode: "all" };

  if (filter.mode === "today") return `hôm nay (${formatDateOnly(todayInputValue())})`;
  if (filter.mode === "yesterday") return `hôm qua (${formatDateOnly(yesterdayInputValue())})`;

  if (filter.mode === "current_month") {
    const range = getMonthDateRange(0);
    return `trong tháng này (${formatDateOnly(range.from)} đến ${formatDateOnly(range.to)})`;
  }

  if (filter.mode === "previous_month") {
    const range = getMonthDateRange(-1);
    return `trong tháng trước (${formatDateOnly(range.from)} đến ${formatDateOnly(range.to)})`;
  }

  if (filter.mode === "single") {
    return filter.single ? `trong ngày ${formatDateOnly(filter.single)}` : "trong ngày đang chọn";
  }

  if (filter.mode === "range") {
    if (filter.from && filter.to) {
      return `từ ${formatDateOnly(filter.from)} đến ${formatDateOnly(filter.to)}`;
    }
    if (filter.from) return `từ ${formatDateOnly(filter.from)} trở đi`;
    if (filter.to) return `đến ${formatDateOnly(filter.to)}`;
    return "trong khoảng thời gian đang chọn";
  }

  return "trong toàn thời gian";
}

function getAdminWorkOrderSearchStatusScopeLabel() {
  const statusLabels = {
    all: "tất cả trạng thái",
    draft: "Chưa giao việc",
    waiting_assignee: "Chờ chọn người",
    lunch_break: "Nghỉ trưa",
    hotel: "Hotel",
    ship: "Đang ship",
    doing: "Đang làm",
    near_due: "Gần hết giờ",
    overdue: "Quá hạn",
    submitted: "Chờ xác nhận",
    completed: "Đã hoàn thành",
    redo: "Yêu cầu làm lại"
  };

  const statusLabel = statusLabels[state.adminStatusFilter] || "tất cả trạng thái";

  if (
    state.adminStatusFilter === "completed"
    && state.adminCompletedTypeFilter !== "all"
  ) {
    return `${statusLabel} • ${getCompletedTypeFilterLabel(state.adminCompletedTypeFilter)}`;
  }

  return statusLabel;
}

function getAdminWorkOrderSearchScopeLabel() {
  return `${getAdminWorkOrderSearchStatusScopeLabel()}, ${getAdminWorkOrderSearchDateScopeLabel()}`;
}

function renderAdminWorkOrderSearchSummary(resultCount = 0) {
  const summaryEl = els.adminWorkOrderSearchSummary;
  if (!summaryEl) return;

  const queryText = String(state.adminWorkOrderSearch || "").trim();
  els.adminClearWorkOrderSearch?.classList.toggle("hidden", !queryText);

  if (!queryText) {
    summaryEl.classList.add("hidden");
    summaryEl.textContent = "";
    return;
  }

  summaryEl.classList.remove("hidden");
  summaryEl.textContent = `Đang tìm Phiếu công việc theo ${getAdminWorkOrderSearchScopeLabel()}: ${resultCount} kết quả gần giống “${queryText}”.`;
}

function getAdminSearchedTicketGroups(computedTasks) {
  const queryText = String(state.adminWorkOrderSearch || "").trim();
  if (!queryText) return [];

  // Bắt buộc kết hợp tìm kiếm với bộ lọc thời gian, trạng thái chính
  // và bộ lọc loại công việc đã hoàn thành hiện tại.
  const scopedGroups = groupTasksByWorkOrder(
    getAdminWorkOrderSearchScopedTasks(computedTasks)
  );
  const emptyDraftGroups = shouldIncludeEmptyDraftGroupsInAdminSearch()
    ? getAdminEmptyDraftGroupsInDateFilter()
    : [];
  const groupsWithEmptyDrafts = sortTicketGroupsForDisplay([
    ...scopedGroups,
    ...emptyDraftGroups
  ]);

  return groupsWithEmptyDrafts
    .map((group) => ({
      ...group,
      statusPriority: getAdminSearchGroupStatusPriority(group),
      searchScore: getWorkOrderSearchScore(group.name, queryText)
    }))
    .filter((group) => Number.isFinite(group.searchScore))
    .sort((a, b) => (
      a.statusPriority - b.statusPriority
      || a.searchScore - b.searchScore
      || b.createdAtMs - a.createdAtMs
      || a.name.localeCompare(b.name, "vi")
    ));
}

function renderAdminTasks() {
  const computed = state.tasks.map((task) => ({
    ...task,
    displayStatus: getDisplayStatus(task)
  }));

  renderAdminEmployeeStatusSummary(computed);
  updateAdminMobileFilterUI();

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

  const searchQuery = String(state.adminWorkOrderSearch || "").trim();

  if (searchQuery) {
    // Tìm kiếm tên Phiếu công việc bắt buộc theo bộ lọc thời gian,
    // trạng thái và nhóm công việc đã hoàn thành hiện tại.
    const searchedGroups = getAdminSearchedTicketGroups(computed);
    renderAdminWorkOrderSearchSummary(searchedGroups.length);
    els.adminCompletedTypeReport?.classList.add("hidden");

    if (!searchedGroups.length) {
      updateAdminMobileResultSummary(0);
      els.adminTaskList.innerHTML = `Không tìm thấy Phiếu công việc có tên gần giống “${escapeHtml(searchQuery)}” theo ${escapeHtml(getAdminWorkOrderSearchScopeLabel())}.`;
      els.adminTaskList.classList.add("empty");
      return;
    }

    updateAdminMobileResultSummary(searchedGroups.length);
    els.adminTaskList.classList.remove("empty");
    els.adminTaskList.innerHTML = searchedGroups
      .map((group) => renderTicketGroup(group))
      .join("");

    updateCountdowns();
    refreshPhotoReportPageIfOpen();
    return;
  }

  renderAdminWorkOrderSearchSummary(0);

  // Chỉ chèn thêm phiếu nháp trống (0 công việc) khi không có bộ lọc nào khác đang áp dụng,
  // vì các phiếu này chưa có nhân viên/ngày để so khớp với bộ lọc.
  const showEmptyDrafts =
    (state.adminStatusFilter === "all" || state.adminStatusFilter === "draft") &&
    state.adminEmployeeFilter === "all" &&
    state.adminDateFilter.mode === "all";

  const groups = withEmptyDraftGroups(groupTasksByWorkOrder(filtered), showEmptyDrafts);

  if (!groups.length) {
    updateAdminMobileResultSummary(0);
    els.adminTaskList.innerHTML = "Không có công việc phù hợp bộ lọc.";
    els.adminTaskList.classList.add("empty");
    return;
  }

  updateAdminMobileResultSummary(groups.length);
  els.adminTaskList.classList.remove("empty");

  els.adminTaskList.innerHTML = groups
    .map((group) => renderTicketGroup(group))
    .join("");

  updateCountdowns();
  refreshPhotoReportPageIfOpen();
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
function sortTicketGroupsForDisplay(groups) {
  return groups.sort((a, b) => {
    // Khi Admin xem "Tất cả trạng thái", sắp xếp Phiếu công việc theo đúng
    // thứ tự xử lý ưu tiên. Việc sắp xếp này được thực hiện sau khi đã áp dụng
    // bộ lọc ngày và nhân viên, nên vẫn giữ nguyên khi Admin chọn từng nhân viên:
    // Chưa giao việc → Chờ Admin xác nhận → Quá hạn → Chờ chọn người
    // → Đang làm → Gần hết giờ → Yêu cầu làm lại → Hoàn thành.
    //
    // Một Phiếu có nhiều công việc ở các trạng thái khác nhau sẽ nhận mức ưu tiên
    // cao nhất trong số các công việc còn hiển thị của Phiếu đó. Ví dụ Phiếu có
    // một công việc Đang làm và một công việc Hoàn thành vẫn nằm trong nhóm Đang làm.
    const statusPriorityDifference = (
      getAdminSearchGroupStatusPriority(a) - getAdminSearchGroupStatusPriority(b)
    );

    if (statusPriorityDifference !== 0) return statusPriorityDifference;

    // Các Phiếu cùng mức ưu tiên tiếp tục hiển thị Phiếu tạo gần đây trước.
    return (
      Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0)
      || String(a.name || "").localeCompare(String(b.name || ""), "vi")
    );
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
  const hasSubmittedTask = mode === "admin" && group.tasks.some((task) => task.status === "submitted");
  // Admin có thể thấy toàn bộ task trong phiếu, nhưng Nhân viên chỉ đọc được task của chính mình.
  // Vì vậy tiêu đề phiếu phải dùng tổng số công việc lưu ở workOrders.taskCount, không dùng số task đang hiển thị.
  const taskCount = Number(group.totalTaskCount || group.tasks.length || 0);
  const ticketTitle = `${group.name} - ${taskCount} công việc`;
  const actionButtons = [];

  if (mode === "admin" && isDraft) {
    if (hasPermission("editWorkOrder")) {
      actionButtons.push(`<button class="btn ghost small" data-action="edit-work-order" data-work-order-id="${escapeHtml(group.key)}" type="button">✏️ Sửa phiếu</button>`);
    }

    if (group.tasks.length && hasPermission("dispatchWorkOrder")) {
      actionButtons.push(`<button class="btn secondary small" data-action="dispatch-work-order" data-work-order-id="${escapeHtml(group.key)}" type="button">🚀 Giao việc</button>`);
    }
  }

  if (mode === "admin" && hasPermission("deleteWorkOrder") && !isWorkOrderDeletionLocked()) {
    actionButtons.push(`<button class="btn danger small" data-action="delete-work-order" data-work-order-id="${escapeHtml(group.key)}" type="button">🗑 Xoá phiếu</button>`);
  }

  const headerActions = actionButtons.length ? `<div class="ticket-actions">${actionButtons.join("")}</div>` : "";

  const ticketClasses = [
    "ticket-group",
    isDraft ? "is-draft-ticket" : "",
    hasSubmittedTask ? "is-awaiting-admin-confirmation" : ""
  ].filter(Boolean).join(" ");

  return `
    <section class="${ticketClasses}" data-work-order-id="${escapeHtml(group.key)}">
      <div class="ticket-group-toolbar">
        <div class="ticket-group-header">
          <div>
            <span class="ticket-badge ${isDraft ? "is-draft-badge" : ""}">${isDraft ? "Chưa giao việc" : "Phiếu công việc"}</span>
            <h4 title="${escapeHtml(ticketTitle)}">${escapeHtml(ticketTitle)}</h4>
            ${hasSubmittedTask ? '<span class="admin-confirm-attention-badge">Chờ xác nhận hoàn thành</span>' : ""}
          </div>
        </div>
        ${headerActions}
      </div>
      <div class="ticket-tasks">
        ${group.tasks.map((task) => renderTaskCard(task, mode)).join("")}
      </div>
    </section>
  `;
}


function getEmployeeUnassignedWorkOrderCount() {
  return state.workOrders.filter((workOrder) => (
    String(workOrder?.status || "").trim().toLowerCase() === "draft"
  )).length;
}

function renderEmployeeUnassignedWorkOrderSummary() {
  const count = getEmployeeUnassignedWorkOrderCount();

  if (els.employeeUnassignedWorkOrderCount) {
    els.employeeUnassignedWorkOrderCount.textContent = String(count);
  }

  if (els.employeeUnassignedWorkOrderCard) {
    els.employeeUnassignedWorkOrderCard.setAttribute(
      "aria-label",
      `Hiện còn ${count} Phiếu công việc chưa được giao`
    );
  }
}

function renderEmployeeTasks() {
  renderEmployeeUnassignedWorkOrderSummary();

  let filtered = state.tasks
    .filter((task) => isTaskInDateFilter(task, state.employeeDateFilter))
    .map((task) => ({
      ...task,
      displayStatus: getDisplayStatus(task)
    }));

  updateEmployeeMobileFilterUI();

  if (state.employeeStatusFilter !== "all") {
    filtered = filtered.filter((task) => taskMatchesStatusFilter(task, state.employeeStatusFilter));
  }

  updateCompletedTypeFilterVisibility("employee");

  if (state.employeeStatusFilter === "completed" && state.employeeCompletedTypeFilter !== "all") {
    filtered = filtered.filter((task) => getCompletedTaskGroup(task) === state.employeeCompletedTypeFilter);
  }

  renderCompletedTypeReport(filtered, "employee");
  refreshDateFilterVisibility("employee");

  const searchQuery = String(state.employeeWorkOrderSearch || "").trim();
  if (searchQuery) {
    const groups = getEmployeeWorkOrderSearchResults(searchQuery);
    renderEmployeeWorkOrderSearchSummary(groups.length);
    updateEmployeeMobileResultSummary(groups.length);
    els.employeeCompletedTypeReport?.classList.add("hidden");
    if (!groups.length) {
      els.employeeTaskList.innerHTML = `Không tìm thấy Phiếu công việc có tên gần giống “${escapeHtml(searchQuery)}” theo bộ lọc hiện tại.`;
      els.employeeTaskList.classList.add("empty");
      return;
    }
    els.employeeTaskList.classList.remove("empty");
    els.employeeTaskList.innerHTML = groups.map((group) => renderTicketGroup(group, "employee")).join("");
    updateCountdowns();
    refreshPhotoReportPageIfOpen();
    return;
  }

  renderEmployeeWorkOrderSearchSummary(0);

  if (!filtered.length) {
    updateEmployeeMobileResultSummary(0);
    els.employeeTaskList.innerHTML = "Không có công việc phù hợp bộ lọc.";
    els.employeeTaskList.classList.add("empty");
    return;
  }

  els.employeeTaskList.classList.remove("empty");

  const employeeGroups = sortTicketGroupsForDisplay(groupTasksByWorkOrder(filtered));
  updateEmployeeMobileResultSummary(employeeGroups.length);

  // Tài khoản Nhân viên cũng dùng cùng thứ tự ưu tiên như Admin/Giám sát.
  // Đặc biệt khi chọn "Tất cả trạng thái", Phiếu quá hạn luôn nằm trên
  // Phiếu đang làm, nhưng vẫn ở dưới Phiếu chưa giao việc/chờ xác nhận.
  els.employeeTaskList.innerHTML = employeeGroups
    .map((group) => renderTicketGroup(group, "employee"))
    .join("");

  updateCountdowns();
  refreshPhotoReportPageIfOpen();
}

function canAdminReassignTask(task, mode, displayStatus = null) {
  if (mode !== "admin" || !hasPermission("reassignTasks")) return false;
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


function isDesktopViewport() {
  return window.matchMedia("(min-width: 769px)").matches;
}

function isTaskExpandedOnDesktop(task) {
  const override = state.desktopTaskDetailOverrides.get(task?.id);
  return typeof override === "boolean" ? override : false;
}

function readSavedDesktopTaskViewMode() {
  try {
    return localStorage.getItem("quanlynhansuDesktopTaskViewMode") === "detail"
      ? "detail"
      : "compact";
  } catch (error) {
    return "compact";
  }
}

function applyDesktopTaskViewMode(mode = state.desktopTaskViewMode) {
  state.desktopTaskViewMode = mode === "detail" ? "detail" : "compact";

  document.documentElement.classList.toggle(
    "desktop-task-detail-mode",
    state.desktopTaskViewMode === "detail"
  );

  els.desktopCompactViewBtn?.classList.toggle("is-active", state.desktopTaskViewMode === "compact");
  els.desktopDetailedViewBtn?.classList.toggle("is-active", state.desktopTaskViewMode === "detail");
  els.desktopCompactViewBtn?.setAttribute("aria-pressed", String(state.desktopTaskViewMode === "compact"));
  els.desktopDetailedViewBtn?.setAttribute("aria-pressed", String(state.desktopTaskViewMode === "detail"));

  try {
    localStorage.setItem("quanlynhansuDesktopTaskViewMode", state.desktopTaskViewMode);
  } catch (error) {
    // Trình duyệt có thể chặn localStorage ở chế độ riêng tư; giao diện vẫn hoạt động.
  }

  updateTaskDetailToggleLabels();
}

function updateTaskDetailToggleLabels() {
  const desktop = isDesktopViewport();
  document.querySelectorAll('[data-action="toggle-task-mobile-details"]').forEach((button) => {
    const card = button.closest("[data-task-card]");
    if (!card) return;

    const expanded = desktop
      ? (state.desktopTaskViewMode === "detail" || card.classList.contains("is-desktop-expanded"))
      : card.classList.contains("is-mobile-expanded");
    const label = button.querySelector("[data-mobile-toggle-label]");

    button.setAttribute("aria-expanded", String(expanded));
    if (label) label.textContent = expanded ? "Thu gọn" : "Chi tiết";
  });
}

function shouldExpandTaskOnMobileByDefault() {
  // Trên iPhone/iOS và Android, mọi Phiếu công việc luôn khởi tạo ở
  // chế độ thu gọn để tiết kiệm không gian hiển thị. Người dùng vẫn có
  // thể bấm “Chi tiết” để mở riêng Phiếu cần xem.
  return false;
}

function isTaskExpandedOnMobile(task, displayStatus = null) {
  const override = state.mobileTaskDetailOverrides.get(task?.id);

  if (typeof override === "boolean") return override;

  return shouldExpandTaskOnMobileByDefault(task, displayStatus);
}

function toggleTaskMobileDetails(button) {
  const card = button?.closest?.("[data-task-card]");
  if (!card) return;

  const taskId = button.dataset.taskId || card.dataset.taskId;
  const desktop = isDesktopViewport();
  const className = desktop ? "is-desktop-expanded" : "is-mobile-expanded";
  const nextExpanded = !card.classList.contains(className);

  card.classList.toggle(className, nextExpanded);

  if (taskId) {
    if (desktop) {
      state.desktopTaskDetailOverrides.set(taskId, nextExpanded);
    } else {
      state.mobileTaskDetailOverrides.set(taskId, nextExpanded);
    }
  }

  updateTaskDetailToggleLabels();
}

function renderDesktopTaskSummary(task, mode, employeeName, initialCountdownText) {
  const photoCount = getTaskPhotoCount(task);
  const requiredPhotoCount = getTaskRequiredPhotoCount(task);
  const photoText = taskRequiresPhotos(task)
    ? `${photoCount}/${requiredPhotoCount} hình`
    : `${photoCount} hình`;

  return `
    <div class="task-desktop-summary" aria-label="Tóm tắt công việc trên desktop">
      <div class="task-desktop-summary-item is-employee">
        <span>Nhân viên</span>
        <strong title="${escapeHtml(employeeName)}">${escapeHtml(employeeName)}</strong>
      </div>
      <div class="task-desktop-summary-item is-date">
        <span>Ngày giao</span>
        <strong title="${escapeHtml(formatDateOnly(getTaskDateValue(task)))}">${escapeHtml(formatDateOnly(getTaskDateValue(task)))}</strong>
      </div>
      <div class="task-desktop-summary-item is-countdown">
        <span>Đếm ngược</span>
        <strong data-countdown title="${escapeHtml(initialCountdownText)}">${initialCountdownText}</strong>
      </div>
      <div class="task-desktop-summary-item is-duration">
        <span>Quy định</span>
        <strong title="${escapeHtml(formatMinutes(task.deadlineMinutes))}">${formatMinutes(task.deadlineMinutes)}</strong>
      </div>
      <div class="task-desktop-summary-item is-photos">
        <span>Ảnh báo cáo</span>
        <strong title="${escapeHtml(photoText)}">${escapeHtml(photoText)}</strong>
      </div>
    </div>
  `;
}

function renderDesktopTaskQuickActions(task, mode) {
  const buttons = [];
  const workPhotoCount = getTaskWorkPhotos(task).length;
  const photoCount = getTaskPhotoCount(task);
  const canViewPhotos = photoCount > 0 && (mode === "admin" || mode === "employee");
  const canEditPhotoRequirement = mode === "admin"
    && hasPermission("managePhotoRequirements")
    && task.status !== "completed";

  // Ảnh CV là ảnh hướng dẫn/mẫu của công việc, vì vậy mọi tài khoản có thể
  // nhìn thấy công việc đều được mở xem ngay cả khi thẻ đang Thu gọn trên desktop.
  if (workPhotoCount > 0) {
    buttons.push(`
      <button class="btn ghost small task-desktop-work-photo-action" data-action="view-work-photos" data-task-id="${escapeHtml(task.id)}" type="button">
        Ảnh CV (${workPhotoCount})
      </button>
    `);
  }

  if (canViewPhotos) {
    buttons.push(`
      <button class="btn ghost small" data-action="view-task-photos" data-task-id="${escapeHtml(task.id)}" type="button">
        Ảnh (${photoCount})
      </button>
    `);
  }

  if (canEditPhotoRequirement) {
    buttons.push(`
      <button class="btn ghost small" data-action="edit-photo-requirement" data-task-id="${escapeHtml(task.id)}" type="button">
        Chỉnh ảnh
      </button>
    `);
  }

  if (!buttons.length) return "";
  return `<div class="task-desktop-quick-actions">${buttons.join("")}</div>`;
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
    hasPermission("reviewTasks") &&
    task.status === "submitted";

  const attentionClass = mode === "admin" && task.status === "submitted"
    ? "is-awaiting-admin-confirmation"
    : "";

  const mobileExpanded = isTaskExpandedOnMobile(task, displayStatus);
  const desktopExpanded = isTaskExpandedOnDesktop(task);
  const mobileExpandedClass = mobileExpanded ? "is-mobile-expanded" : "";
  const desktopExpandedClass = desktopExpanded ? "is-desktop-expanded" : "";
  const activeExpanded = isDesktopViewport()
    ? (state.desktopTaskViewMode === "detail" || desktopExpanded)
    : mobileExpanded;
  const mobileToggleText = activeExpanded ? "Thu gọn" : "Chi tiết";
  const mobileDetailsId = `task-mobile-details-${String(task.id || "task").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const employeeName = getEmployeeDisplayNameByUid(task.assignedToUid, task.assignedToName);
  const initialCountdownText = getInitialCountdownText(task);
  const mobilePhotoCount = getTaskPhotoCount(task);
  const canViewMobilePhotos = mobilePhotoCount > 0 && (mode === "admin" || mode === "employee");
  const mobilePhotoQuickAction = canViewMobilePhotos
    ? `
      <button
        class="task-mobile-photo-action"
        data-action="view-task-photos"
        data-task-id="${escapeHtml(task.id)}"
        type="button"
      >
        Xem hình (${mobilePhotoCount})
      </button>
    `
    : "";

  const mobileWorkPhotoCount = getTaskWorkPhotos(task).length;
  const mobileWorkPhotoQuickAction = mobileWorkPhotoCount > 0
    ? `
      <button
        class="task-mobile-photo-action task-mobile-work-photo-action"
        data-action="view-work-photos"
        data-task-id="${escapeHtml(task.id)}"
        type="button"
      >
        Ảnh CV (${mobileWorkPhotoCount})
      </button>
    `
    : "";

  const taskActions = renderTaskActions(task, {
    canEmployeeSubmit,
    canAdminReview,
    canAdminEndLunchBreak: canAdminEndLunchBreak(task, mode),
    canAdminExtendTime: canAdminExtendTaskTime(task, mode),
    canEmployeeUploadPhotos: canEmployeeUploadTaskPhotos(task, mode, displayStatus),
    submitPhotoReady: hasEnoughRequiredPhotos(task)
  });

  return `
    <article class="task-card ${taskCardClass(displayStatus)} ${attentionClass} ${mobileExpandedClass} ${desktopExpandedClass}" data-task-card data-task-id="${escapeHtml(task.id)}" data-work-order-id="${escapeHtml(task.workOrderId || "legacy")}" data-deadline-ms="${deadlineMs}" data-deadline-minutes="${Number(task.deadlineMinutes || 0)}" data-queue-start-ms="${queueStartMs}" data-remaining-pause-ms="${remainingPauseMs}" data-raw-status="${escapeHtml(task.status)}" data-display-status="${escapeHtml(displayStatus)}">
      <div class="task-top">
        <div class="task-heading-copy">
          <h4 class="task-title" title="${escapeHtml(task.title) || "(Chưa đặt tên công việc)"}">${escapeHtml(task.title) || "(Chưa đặt tên công việc)"}</h4>
          <p class="task-desc" title="${escapeHtml(task.description)}">${escapeHtml(task.description)}</p>
        </div>
        <span class="status-pill status-${displayStatus}">${statusLabel(displayStatus)}</span>
      </div>

      <div class="task-mobile-summary" aria-label="Tóm tắt công việc">
        <div class="task-mobile-summary-item">
          <span>Nhân viên</span>
          <strong>${escapeHtml(employeeName)}</strong>
        </div>
        <div class="task-mobile-summary-item is-countdown">
          <span>Đếm ngược</span>
          <strong data-countdown>${initialCountdownText}</strong>
        </div>
        <div class="task-mobile-summary-item">
          <span>Hạn lúc</span>
          <strong>${formatDateTime(task.deadlineAt)}</strong>
        </div>
        ${mobileWorkPhotoQuickAction}
        ${mobilePhotoQuickAction}
      </div>

      ${renderDesktopTaskSummary(task, mode, employeeName, initialCountdownText)}

      <div class="task-compact-actions">
        ${renderDesktopTaskQuickActions(task, mode)}
        ${taskActions}
        <button
          class="task-mobile-details-toggle"
          type="button"
          data-action="toggle-task-mobile-details"
          data-task-id="${escapeHtml(task.id)}"
          aria-expanded="${activeExpanded ? "true" : "false"}"
          aria-controls="${escapeHtml(mobileDetailsId)}"
        >
          <span data-mobile-toggle-label>${mobileToggleText}</span>
          <span class="task-mobile-toggle-icon" aria-hidden="true">⌄</span>
        </button>
      </div>

      <div class="task-mobile-details" id="${escapeHtml(mobileDetailsId)}">
        <div class="task-meta task-meta-primary">
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
            <strong class="countdown-text" data-countdown>${initialCountdownText}</strong>
          </div>
        </div>

        <div class="task-meta task-meta-secondary">
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

        ${renderWorkPhotoBox(task, mode)}
        ${renderPhotoReportBox(task, mode)}
        ${renderPhotoRequirementHistoryBox(task)}
        ${renderRedoRequestHistoryBox(task)}
        ${renderHotelInfoBox(task)}
        ${renderTimeExtensionBox(task)}
        ${renderAssigneeHistoryBox(task)}
        ${renderLunchBreakHistoryBox(task)}
        ${renderResultBox(task)}
      </div>
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
  const editableByAdmin = hasPermission("managePhotoRequirements") && !["completed"].includes(task.status);
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
        ${editableByAdmin ? `<small class="photo-report-hint">Admin bấm vào ô này hoặc nút “Chỉnh số ảnh” để sửa số lượng ảnh bắt buộc.</small>` : ""}
      </div>
      ${(editableByAdmin || canView) ? `
        <div class="photo-report-actions">
          ${editableByAdmin ? `
            <button class="btn secondary small photo-requirement-edit-btn" data-action="edit-photo-requirement" data-task-id="${escapeHtml(task.id)}" type="button">
              Chỉnh số ảnh
            </button>
          ` : ""}
          ${canView ? `
            <button class="btn ghost small" data-action="view-task-photos" data-task-id="${escapeHtml(task.id)}" type="button">
              Xem hình (${photoCount})
            </button>
          ` : ""}
        </div>
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
  if (!hasPermission("managePhotoRequirements")) {
    showToast("Tài khoản của bạn chưa được cấp quyền chỉnh số lượng ảnh báo cáo.");
    return;
  }

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

  const previousRequired = currentRequired;
  const previousCount = currentRequired ? currentCount : 0;
  const appliedCount = nextRequired ? nextCount : 0;
  const changedAt = Timestamp.now();
  const historyRecord = {
    previousRequired,
    previousCount,
    nextRequired,
    nextCount: appliedCount,
    changedAt,
    changedByUid: state.user?.uid || "",
    changedByName: state.profile?.name || state.user?.email || "Admin"
  };

  await updateDoc(doc(db, "tasks", task.id), {
    photoRequired: nextRequired,
    requiredPhotoCount: appliedCount,
    photoRequirementHistory: arrayUnion(historyRecord),
    photoRequirementChangeCount: increment(1),
    lastPhotoRequirementChangedAt: changedAt,
    lastPhotoRequirementChangedByUid: historyRecord.changedByUid,
    lastPhotoRequirementChangedByName: historyRecord.changedByName
  });

  showToast(
    nextRequired
      ? `Đã cập nhật yêu cầu ảnh báo cáo thành ${nextCount} hình.`
      : "Đã tắt bắt buộc đăng hình cho task này."
  );
}

function renderPhotoRequirementHistoryBox(task) {
  const history = Array.isArray(task?.photoRequirementHistory)
    ? task.photoRequirementHistory.filter((item) => item && typeof item === "object")
    : [];
  const count = Number(task?.photoRequirementChangeCount || history.length || 0);

  if (!count && !history.length) return "";

  const rows = history
    .slice()
    .sort((a, b) => (timestampToDate(b.changedAt)?.getTime() || 0) - (timestampToDate(a.changedAt)?.getTime() || 0))
    .map((item, index) => {
      const previousText = item.previousRequired
        ? `${Number(item.previousCount || 0)} hình`
        : "Không bắt buộc";
      const nextText = item.nextRequired
        ? `${Number(item.nextCount || 0)} hình`
        : "Không bắt buộc";
      return `
        <li>
          <strong>Lần ${history.length - index}: ${escapeHtml(previousText)} → ${escapeHtml(nextText)}</strong>
          <span>${formatDateTime(item.changedAt)} • ${escapeHtml(item.changedByName || "Admin")}</span>
        </li>
      `;
    })
    .join("");

  return `
    <div class="extension-box photo-requirement-history-box">
      <div class="extension-box-head">
        <strong>Đã điều chỉnh số ảnh ${count} lần</strong>
        <span>Lịch sử yêu cầu ảnh báo cáo</span>
      </div>
      ${rows ? `<ul class="extension-list">${rows}</ul>` : ""}
    </div>
  `;
}

function renderRedoRequestHistoryBox(task) {
  const history = Array.isArray(task?.redoRequestHistory)
    ? task.redoRequestHistory.filter((item) => item && typeof item === "object")
    : [];
  const count = Number(task?.redoRequestCount || history.length || 0);

  if (!count && !history.length) return "";

  const rows = history
    .slice()
    .sort((a, b) => (timestampToDate(b.requestedAt)?.getTime() || 0) - (timestampToDate(a.requestedAt)?.getTime() || 0))
    .map((item, index) => `
      <li>
        <strong>Lần ${history.length - index}: Yêu cầu làm lại</strong>
        <span>${formatDateTime(item.requestedAt)} • ${escapeHtml(item.requestedByName || "Admin")}</span>
      </li>
    `)
    .join("");

  return `
    <div class="extension-box redo-history-box">
      <div class="extension-box-head">
        <strong>Đã yêu cầu làm lại ${count} lần</strong>
        <span>Lịch sử yêu cầu làm lại</span>
      </div>
      ${rows ? `<ul class="extension-list">${rows}</ul>` : ""}
    </div>
  `;
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

  const displayResult = normalizeTaskResultForDisplay(task);
  let summary = "Hoàn thành đúng thời gian quy định.";
  let className = "result-box";

  if (displayResult.resultType === "faster") {
    summary = `Nhanh hơn ${displayResult.differenceMinutes} phút (${formatPercent(displayResult.differencePercent)}%).`;
  } else if (displayResult.resultType === "slower") {
    summary = `Chậm hơn ${displayResult.differenceMinutes} phút (${formatPercent(displayResult.differencePercent)}%).`;
    className = "result-box slower";
  }

  return `
    <div class="${className}">
      <strong>Kết quả: ${summary}</strong>
      <span>Thời gian thực tế: ${formatMinutes(displayResult.actualMinutes)} • Thời gian quy định: ${formatMinutes(displayResult.deadlineMinutes)}</span>
    </div>
  `;
}

function normalizeTaskResultForDisplay(task) {
  const deadlineMinutes = Number(task.deadlineMinutes || 0);
  const actualMinutes = Number(task.actualMinutes || 0);

  if (shouldCountExtendedTaskAsOnTime(task, actualMinutes, deadlineMinutes)) {
    return {
      actualMinutes,
      deadlineMinutes,
      resultType: "on_time",
      differenceMinutes: 0,
      differencePercent: 0
    };
  }

  const resultType = task.resultType || "on_time";
  const differenceMinutes = Number(task.differenceMinutes || 0);

  return {
    actualMinutes,
    deadlineMinutes,
    resultType,
    differenceMinutes,
    differencePercent: calculateResultDifferencePercent(resultType, differenceMinutes, deadlineMinutes, actualMinutes)
  };
}

function canAdminEndLunchBreak(task, mode) {
  return mode === "admin"
    && hasPermission("reviewTasks")
    && isLunchBreakTask(task)
    && task.status === "lunch_break";
}

function isTaskOverdueForTimeExtension(task, nowMs = Date.now()) {
  if (!task) return false;
  if (task.status === "overdue") return true;

  const deadline = timestampToDate(task.deadlineAt);
  return Boolean(deadline && deadline.getTime() <= nowMs);
}

function canAdminExtendTaskTime(task, mode) {
  if (mode !== "admin" || !hasPermission("extendTaskTime") || !task) return false;

  const isOverdue = isTaskOverdueForTimeExtension(task);
  if (isOverdue && !isOverdueTimeExtensionAllowed()) return false;

  return ["doing", "hotel", "redo", "overdue"].includes(task.status);
}

function canEmployeeUploadTaskPhotos(task, mode, displayStatus = null) {
  if (mode !== "employee") return false;
  if (!task?.id || task.assignedToUid !== state.user?.uid) return false;
  const visibleStatus = displayStatus || getDisplayStatus(task);
  return ["doing", "ship", "lunch_break", "hotel", "redo", "overdue", "near_due"].includes(visibleStatus)
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

els.desktopCompactViewBtn?.addEventListener("click", () => applyDesktopTaskViewMode("compact"));
els.desktopDetailedViewBtn?.addEventListener("click", () => applyDesktopTaskViewMode("detail"));

state.desktopTaskViewMode = readSavedDesktopTaskViewMode();
applyDesktopTaskViewMode(state.desktopTaskViewMode);

window.addEventListener("resize", () => {
  window.clearTimeout(window.__taskDetailLabelResizeTimer);
  window.__taskDetailLabelResizeTimer = window.setTimeout(updateTaskDetailToggleLabels, 120);
});

// Bắt riêng thao tác bấm vào toàn bộ ô “Ảnh báo cáo” của Admin.
// Dùng capture để tránh bị các listener khác nuốt sự kiện trên desktop/mobile.
document.addEventListener("click", async (event) => {
  const targetEl = event.target instanceof Element ? event.target : event.target?.parentElement;
  const photoRequirementTarget = targetEl?.closest?.('[data-action="edit-photo-requirement"]');

  if (!photoRequirementTarget) return;
  if (targetEl?.closest?.('[data-action="view-task-photos"]')) return;

  event.preventDefault();
  event.stopPropagation();
  event.__photoRequirementHandled = true;
  await editTaskPhotoRequirement(photoRequirementTarget.dataset.taskId);
}, true);

// Event delegation cho các nút trong task card, ticket-group và notification list.
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) return;

  const action = button.dataset.action;
  const taskId = button.dataset.taskId;

  if (action === "toggle-task-mobile-details") {
    toggleTaskMobileDetails(button);
    return;
  }

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
    openPhotoReportPage(taskId);
  }

  if (action === "view-work-photos") {
    openWorkPhotoManager({ taskId });
  }

  if (action === "upload-task-work-photos") {
    await openTaskWorkPhotoUploadPicker(taskId, button);
  }

  if (action === "edit-photo-requirement") {
    if (event.__photoRequirementHandled) return;
    event.preventDefault();
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

  const keyTargetEl = event.target instanceof Element ? event.target : event.target?.parentElement;
  const photoRequirementTarget = keyTargetEl?.closest?.('[data-action="edit-photo-requirement"]');
  if (photoRequirementTarget) {
    event.preventDefault();
    await editTaskPhotoRequirement(photoRequirementTarget.dataset.taskId);
  }
});



// =========================
// Ảnh công việc (Ảnh CV)
// =========================
function getTaskWorkPhotos(task) {
  return Array.isArray(task?.workPhotos) ? task.workPhotos.filter((item) => item?.url) : [];
}

function syncTaskRowWorkPhotoButtons(row) {
  if (!row) return;
  const rowId = row.dataset.rowId || "";
  const count = (taskRowWorkPhotos.get(rowId) || []).length;
  const button = row.querySelector('[data-action="view-work-photos"]');
  if (!button) return;
  button.textContent = `Ảnh CV (${count})`;
  button.classList.toggle("hidden", count === 0);
}

function getWorkPhotoManagerSource() {
  if (state.workPhotoManagerRowId) {
    return {
      type: "row",
      id: state.workPhotoManagerRowId,
      photos: (taskRowWorkPhotos.get(state.workPhotoManagerRowId) || []).slice(),
      title: "Ảnh công việc đang chuẩn bị"
    };
  }
  const task = state.tasks.find((item) => item.id === state.workPhotoManagerTaskId);
  return {
    type: "task",
    id: task?.id || "",
    task,
    photos: getTaskWorkPhotos(task).slice(),
    title: task?.title || "Ảnh công việc"
  };
}

function closeWorkPhotoManager() {
  document.querySelector(".work-photo-manager-backdrop")?.remove();
  state.workPhotoManagerRowId = null;
  state.workPhotoManagerTaskId = null;
  state.workPhotoManagerSelectedKeys = new Set();
}

async function deleteWorkPhotoFiles(photos) {
  for (const photo of photos) {
    const path = getStoragePathFromPhoto(photo);
    if (!path) continue;
    try { await deleteObject(storageRef(storage, path)); } catch (error) {
      if (error?.code !== "storage/object-not-found") console.warn("Không xóa được ảnh CV", error);
    }
  }
}

async function saveWorkPhotoManagerPhotos(source, nextPhotos) {
  if (source.type === "row") {
    taskRowWorkPhotos.set(source.id, nextPhotos);
    const row = els.taskRowsContainer.querySelector(`[data-row-id="${getSafeSelectorValue(source.id)}"]`);
    syncTaskRowWorkPhotoButtons(row);
    return;
  }
  if (!source.task) return;
  await updateDoc(doc(db, "tasks", source.task.id), {
    workPhotos: nextPhotos,
    workPhotoCount: nextPhotos.length,
    lastWorkPhotoUploadedAt: getLatestUploadedAtFromPhotos(nextPhotos)
  });
}

function renderWorkPhotoManager() {
  const source = getWorkPhotoManagerSource();
  const photos = source.photos;
  const selected = state.workPhotoManagerSelectedKeys;
  const isManager = isManagementProfile();
  const old = document.querySelector(".work-photo-manager-backdrop");
  old?.remove();
  const el = document.createElement("div");
  el.className = "work-photo-manager-backdrop";
  el.innerHTML = `
    <section class="work-photo-manager-card" role="dialog" aria-modal="true" aria-label="Quản lý ảnh công việc">
      <header class="work-photo-manager-head">
        <div><span class="work-photo-manager-eyebrow">ẢNH CÔNG VIỆC</span><h3>${escapeHtml(source.title)}</h3><p>${photos.length} ảnh đã đăng</p></div>
        <button type="button" class="icon-btn" data-work-photo-close aria-label="Đóng">×</button>
      </header>
      <div class="work-photo-manager-toolbar ${isManager ? "" : "is-view-only"}">
        <strong>${isManager ? `Đã chọn ${selected.size}/${photos.length} ảnh` : `${photos.length} ảnh công việc`}</strong>
        ${isManager ? `<div>
          <button class="btn ghost small" type="button" data-work-photo-select-all>Chọn tất cả</button>
          <button class="btn ghost small" type="button" data-work-photo-clear>Bỏ chọn</button>
          <button class="btn primary small" type="button" data-work-photo-download ${selected.size ? "" : "disabled"}>Tải đã chọn</button>
          <button class="btn secondary small" type="button" data-work-photo-share ${selected.size ? "" : "disabled"}>Chia sẻ</button>
          <button class="btn danger small" type="button" data-work-photo-delete ${selected.size ? "" : "disabled"}>Xóa ảnh</button>
        </div>` : ""}
      </div>
      <div class="work-photo-manager-grid ${photos.length ? "" : "empty-box"}">
        ${photos.length ? photos.map((photo,index)=>{
          const key=getPhotoStableKey(photo,index); const checked=selected.has(key);
          return `<article class="work-photo-manager-item ${checked?"is-selected":""}">
            <button type="button" class="work-photo-open" data-work-photo-index="${index}">
              <img src="${escapeHtml(photo.url)}" alt="Ảnh công việc ${index+1}" loading="lazy" />
              <strong>${escapeHtml(photo.name || `Ảnh ${index+1}`)}</strong>
              <span>${formatFullDateTime(photo.uploadedAt)} • ${formatFileSize(photo.size)}</span>
            </button>
            ${isManager ? `<label class="work-photo-select"><input type="checkbox" data-work-photo-key="${escapeHtml(key)}" ${checked?"checked":""}/><span>✓</span></label>` : ""}
          </article>`;
        }).join("") : "Chưa có ảnh công việc."}
      </div>
    </section>`;
  document.body.appendChild(el);
  el.querySelectorAll("[data-work-photo-close]").forEach(btn=>btn.addEventListener("click",closeWorkPhotoManager));
  el.addEventListener("click", async (event)=>{
    if (event.target === el) { closeWorkPhotoManager(); return; }
    const open=event.target.closest("[data-work-photo-index]");
    if (open) { state.photoViewerPhotos=photos; openPhotoViewer(Number(open.dataset.workPhotoIndex)); return; }
    if (event.target.closest("[data-work-photo-select-all]")) {
      state.workPhotoManagerSelectedKeys=new Set(photos.map((p,i)=>getPhotoStableKey(p,i))); renderWorkPhotoManager(); return;
    }
    if (event.target.closest("[data-work-photo-clear]")) { state.workPhotoManagerSelectedKeys=new Set(); renderWorkPhotoManager(); return; }
    const selectedPhotos=photos.filter((p,i)=>state.workPhotoManagerSelectedKeys.has(getPhotoStableKey(p,i)));
    const downloadBtn=event.target.closest("[data-work-photo-download]");
    if (downloadBtn) {
      if (selectedPhotos.length===1) {
        const blob=await getPhotoBlobForZip(selectedPhotos[0]); downloadBlobFile(blob,getSinglePhotoDownloadName(selectedPhotos[0]));
      } else if (selectedPhotos.length>1) {
        setButtonLoading(downloadBtn,true,"Đang tạo ZIP...");
        try { const result=await createPhotoReportZipBlob({id:source.id,title:source.title,workOrderName:"Ảnh CV"},selectedPhotos); downloadBlobFile(result.zipBlob,result.fileName); }
        finally { setButtonLoading(downloadBtn,false); }
      }
      return;
    }
    const shareBtn=event.target.closest("[data-work-photo-share]");
    if (shareBtn) { await sharePhotoReportCollection({task:{id:`work-${source.id}`,title:source.title,workOrderName:"Ảnh CV"},photos:selectedPhotos,button:shareBtn,cacheScope:"work-selected",emptyMessage:"Vui lòng chọn ảnh CV để chia sẻ."}); return; }
    const deleteBtn=event.target.closest("[data-work-photo-delete]");
    if (deleteBtn) {
      if (!selectedPhotos.length || !window.confirm(`Xóa vĩnh viễn ${selectedPhotos.length} ảnh CV đã chọn?`)) return;
      setButtonLoading(deleteBtn,true,"Đang xóa...");
      try {
        await deleteWorkPhotoFiles(selectedPhotos);
        const keys=new Set(selectedPhotos.map((p,i)=>getPhotoStableKey(p,i)));
        const next=photos.filter((p,i)=>!state.workPhotoManagerSelectedKeys.has(getPhotoStableKey(p,i)));
        await saveWorkPhotoManagerPhotos(source,next);
        state.workPhotoManagerSelectedKeys=new Set();
        toast(`Đã xóa ${selectedPhotos.length} ảnh CV.`,"success"); renderWorkPhotoManager();
      } catch(error) { console.error(error); toast(error.message||"Không xóa được ảnh CV.","error"); setButtonLoading(deleteBtn,false); }
    }
  });
  el.addEventListener("change",event=>{
    const checkbox=event.target.closest("[data-work-photo-key]"); if(!checkbox)return;
    const next=new Set(state.workPhotoManagerSelectedKeys); checkbox.checked?next.add(checkbox.dataset.workPhotoKey):next.delete(checkbox.dataset.workPhotoKey);
    state.workPhotoManagerSelectedKeys=next; renderWorkPhotoManager();
  });
}

function openWorkPhotoManager({ rowId = null, taskId = null } = {}) {
  state.workPhotoManagerRowId = rowId || null;
  state.workPhotoManagerTaskId = taskId || null;
  state.workPhotoManagerSelectedKeys = new Set();
  renderWorkPhotoManager();
}

async function openWorkPhotoUploadPicker(rowId, button) {
  const row = els.taskRowsContainer.querySelector(`[data-row-id="${getSafeSelectorValue(rowId)}"]`);
  if (!row) return;
  const input=document.createElement("input"); input.type="file"; input.accept="image/*"; input.multiple=true; input.hidden=true; document.body.appendChild(input);
  input.addEventListener("change",async()=>{
    const files=Array.from(input.files||[]); input.remove();
    const error=validateSelectedPhotoFiles(files); if(error){toast(error,"error");return;}
    setButtonLoading(button,true,"Đang đăng...");
    try {
      const current=(taskRowWorkPhotos.get(rowId)||[]).slice();
      for(let i=0;i<files.length;i+=1){
        if(button) button.textContent=`Đang đăng ${i+1}/${files.length}...`;
        const item=await optimizePhotoFileForUpload(files[i]); const file=item.file;
        const id=makeId("work-photo"); const safe=sanitizeStorageFileName(file.name||item.originalName);
        const path=`task-work-photos/${state.user.uid}/${rowId}/${Date.now()}-${id}-${safe}`; const ref=storageRef(storage,path);
        await uploadBytes(ref,file,{contentType:file.type||"image/jpeg",customMetadata:{uploadedByUid:state.user.uid,kind:"work-instruction"}});
        const url=await getDownloadURL(ref); const now=Timestamp.fromDate(new Date());
        current.push({id,name:file.name||safe,originalName:item.originalName||file.name||safe,url,storagePath:path,contentType:file.type||"image/jpeg",size:Number(file.size||0),originalSize:Number(item.originalSize||file.size||0),optimized:Boolean(item.optimized),width:Number(item.width||0),height:Number(item.height||0),uploadedAt:now,uploadedByUid:state.user.uid,uploadedByName:state.profile?.name||state.user.email||"Admin"});
      }
      taskRowWorkPhotos.set(rowId,current); syncTaskRowWorkPhotoButtons(row); toast(`Đã đăng thành công ${files.length} ảnh CV.`,"success");
    }catch(error){console.error(error);toast(error.message||"Không đăng được ảnh CV.","error");}
    finally{setButtonLoading(button,false);}
  });
  input.click();
}

async function openTaskWorkPhotoUploadPicker(taskId, button) {
  if (!isAdminProfile()) {
    toast("Chỉ Admin được phép đăng thêm Ảnh CV sau khi Phiếu đã được tạo.", "error");
    return;
  }

  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    toast("Không tìm thấy công việc để đăng Ảnh CV.", "error");
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.hidden = true;
  document.body.appendChild(input);

  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    input.remove();
    if (!files.length) return;

    const error = validateSelectedPhotoFiles(files);
    if (error) {
      toast(error, "error");
      return;
    }

    setButtonLoading(button, true, "Đang đăng...");
    try {
      const current = getTaskWorkPhotos(task).slice();
      if (current.length + files.length > 100) {
        throw new Error(`Mỗi công việc chỉ được lưu tối đa 100 Ảnh CV. Hiện đã có ${current.length} ảnh.`);
      }

      for (let index = 0; index < files.length; index += 1) {
        if (button) button.textContent = `Đang đăng ${index + 1}/${files.length}...`;
        const item = await optimizePhotoFileForUpload(files[index]);
        const file = item.file;
        const id = makeId("work-photo");
        const safeName = sanitizeStorageFileName(file.name || item.originalName);
        const path = `task-work-photos/${state.user.uid}/${taskId}/${Date.now()}-${id}-${safeName}`;
        const ref = storageRef(storage, path);

        await uploadBytes(ref, file, {
          contentType: file.type || "image/jpeg",
          customMetadata: {
            uploadedByUid: state.user.uid,
            kind: "work-instruction",
            taskId
          }
        });

        const url = await getDownloadURL(ref);
        current.push({
          id,
          name: file.name || safeName,
          originalName: item.originalName || file.name || safeName,
          url,
          storagePath: path,
          contentType: file.type || "image/jpeg",
          size: Number(file.size || 0),
          originalSize: Number(item.originalSize || file.size || 0),
          optimized: Boolean(item.optimized),
          width: Number(item.width || 0),
          height: Number(item.height || 0),
          uploadedAt: Timestamp.fromDate(new Date()),
          uploadedByUid: state.user.uid,
          uploadedByName: state.profile?.name || state.user.email || "Admin"
        });
      }

      await updateDoc(doc(db, "tasks", taskId), {
        workPhotos: current,
        workPhotoCount: current.length,
        lastWorkPhotoUploadedAt: getLatestUploadedAtFromPhotos(current)
      });

      toast(`Đã đăng thêm thành công ${files.length} Ảnh CV.`, "success");
    } catch (uploadError) {
      console.error(uploadError);
      toast(uploadError.message || "Không đăng thêm được Ảnh CV.", "error");
    } finally {
      setButtonLoading(button, false);
    }
  }, { once: true });

  input.click();
}

function renderWorkPhotoBox(task, mode) {
  const count = getTaskWorkPhotos(task).length;
  const canUploadMore = isAdminProfile();
  if (!count && !canUploadMore) return "";

  return `<div class="work-photo-box">
    <div>
      <strong>Ảnh công việc</strong>
      <span>${count ? `${count} ảnh hướng dẫn/mẫu` : "Chưa có ảnh hướng dẫn/mẫu"}</span>
    </div>
    <div class="work-photo-box-actions">
      ${canUploadMore ? `<button class="btn success small work-photo-upload-more-btn" type="button" data-action="upload-task-work-photos" data-task-id="${escapeHtml(task.id)}"><span class="work-photo-label-desktop">+ Đăng thêm ảnh CV</span><span class="work-photo-label-mobile">+ Đăng ảnh CV</span></button>` : ""}
      ${count ? `<button class="btn ghost small work-photo-view-saved-btn" type="button" data-action="view-work-photos" data-task-id="${escapeHtml(task.id)}">Ảnh CV (${count})</button>` : ""}
    </div>
  </div>`;
}

// =========================
// Ảnh báo cáo công việc
// =========================
function resetPreparedPhotoShare() {
  state.photoShareFile = null;
  state.photoShareTaskId = null;
  state.photoShareFileName = "";
  state.photoShareCacheKey = "";
}

function getPhotoStableKey(photo, index = 0) {
  const uploadedAt = timestampToDate(photo?.uploadedAt)?.getTime() || "";
  return String(
    photo?.id
    || getStoragePathFromPhoto(photo)
    || photo?.url
    || `${photo?.name || "photo"}|${photo?.size || 0}|${uploadedAt}|${index}`
  );
}

function getSortedTaskPhotos(task) {
  return getTaskPhotos(task)
    .slice()
    .sort((a, b) => (timestampToDate(b.uploadedAt)?.getTime() || 0) - (timestampToDate(a.uploadedAt)?.getTime() || 0));
}

function syncPhotoReportSelection(photos = []) {
  const validKeys = new Set(photos.map((photo, index) => getPhotoStableKey(photo, index)));

  Array.from(state.photoReportSelectedKeys).forEach((key) => {
    if (!validKeys.has(key)) state.photoReportSelectedKeys.delete(key);
  });
}

function getSelectedPhotoReportPhotos(task) {
  const photos = getSortedTaskPhotos(task);
  return photos.filter((photo, index) => state.photoReportSelectedKeys.has(getPhotoStableKey(photo, index)));
}

function getPhotoShareCacheKey(task, photos, scope = "all") {
  const keys = photos
    .map((photo, index) => getPhotoStableKey(photo, index))
    .sort();

  return `${task?.id || "task"}::${scope}::${keys.join("|")}`;
}

function updatePhotoSelectionToolbar(task, photos = getSortedTaskPhotos(task)) {
  if (!els.photoSelectionToolbar) return;

  const isManager = isManagementProfile();
  const selectedPhotos = isManager ? getSelectedPhotoReportPhotos(task) : [];
  const selectedCount = selectedPhotos.length;
  const totalCount = photos.length;
  const canManage = isManager && totalCount > 0;
  const canDeletePhotos = hasPermission("deleteReportPhotos");

  els.photoSelectionToolbar.classList.toggle("hidden", !canManage);

  if (els.photoSelectionCount) {
    els.photoSelectionCount.textContent = selectedCount
      ? `Đã chọn ${selectedCount}/${totalCount} ảnh`
      : `Chưa chọn ảnh • Có ${totalCount} ảnh`;
  }

  if (els.photoSelectAllBtn) {
    els.photoSelectAllBtn.disabled = !canManage || selectedCount === totalCount;
  }

  if (els.photoClearSelectionBtn) {
    els.photoClearSelectionBtn.disabled = selectedCount === 0;
  }

  if (els.downloadSelectedPhotosBtn) {
    els.downloadSelectedPhotosBtn.disabled = selectedCount === 0;
  }

  if (els.shareSelectedPhotosBtn) {
    els.shareSelectedPhotosBtn.disabled = selectedCount === 0;
  }

  if (els.deleteSelectedPhotosBtn) {
    els.deleteSelectedPhotosBtn.classList.toggle("hidden", !canDeletePhotos);
    els.deleteSelectedPhotosBtn.disabled = !canDeletePhotos || selectedCount === 0;
  }
}

function setPhotoReportSelection(keys) {
  state.photoReportSelectedKeys = new Set(keys);
  resetPreparedPhotoShare();

  els.photoReportGrid?.querySelectorAll("[data-photo-key]").forEach((card) => {
    const key = String(card.dataset.photoKey || "");
    const checked = state.photoReportSelectedKeys.has(key);
    card.classList.toggle("is-selected", checked);

    const checkbox = card.querySelector("[data-photo-select-key]");
    if (checkbox) checkbox.checked = checked;

    const label = card.querySelector(".photo-report-select");
    label?.classList.toggle("is-checked", checked);
  });

  const task = state.tasks.find((item) => item.id === state.photoReportTaskId);
  updatePhotoSelectionToolbar(task);
}

function clearPhotoReportSelection() {
  setPhotoReportSelection([]);
}

function hideMainContentForPhotoReport() {
  els.adminView?.classList.add("hidden");
  els.employeeView?.classList.add("hidden");
  els.workTemplateView?.classList.add("hidden");
  els.employeeManagerView?.classList.add("hidden");
}

function closePhotoReportModal() {
  backFromPhotoReportPage();
}

function getPhotoReportReturnButton(taskId) {
  if (!taskId) return null;

  const safeTaskId = getSafeSelectorValue(taskId);
  return document.querySelector(
    `[data-action="view-task-photos"][data-task-id="${safeTaskId}"]`
  );
}

function restorePhotoReportOrigin(taskId, savedScrollY) {
  const fallbackScrollY = Math.max(0, Number(savedScrollY) || 0);

  // Khôi phục ngay đúng vị trí cuộn trước khi mở trang ảnh.
  window.scrollTo({ top: fallbackScrollY, left: 0, behavior: "auto" });

  // Chờ dashboard hiện lại và trình duyệt hoàn tất bố cục. Nếu dữ liệu vừa
  // cập nhật làm vị trí thay đổi, ưu tiên đưa đúng nút “Xem hình” trở lại màn hình.
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const returnButton = getPhotoReportReturnButton(taskId);
      const returnCard = returnButton?.closest?.("[data-task-card]");
      const returnTarget = returnCard || returnButton;

      if (!returnTarget) {
        window.scrollTo({ top: fallbackScrollY, left: 0, behavior: "auto" });
        return;
      }

      const rect = returnTarget.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const isVisible = rect.bottom > 0 && rect.top < viewportHeight;

      if (!isVisible) {
        returnTarget.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }

      returnCard?.classList.add("notification-jump-highlight");
      window.setTimeout(() => {
        returnCard?.classList.remove("notification-jump-highlight");
      }, 2200);

      returnButton?.focus?.({ preventScroll: true });
    });
  });
}

function backFromPhotoReportPage() {
  const returnView = state.photoReportReturnView;
  const returnTaskId = state.photoReportReturnTaskId || state.photoReportTaskId;
  const returnScrollY = state.photoReportReturnScrollY;

  closePhotoViewer({ restoreFocus: false });
  clearPhotoReportSelection();
  state.photoReportTaskId = null;
  state.photoViewerPhotos = [];
  state.photoViewerIndex = -1;
  if (els.photoReportGrid) els.photoReportGrid.innerHTML = "";
  resetPreparedPhotoShare();
  els.photoSelectionToolbar?.classList.add("hidden");
  els.downloadPhotoZipBtn?.classList.add("hidden");
  if (els.downloadPhotoZipBtn) els.downloadPhotoZipBtn.disabled = false;
  els.sharePhotoReportBtn?.classList.add("hidden");
  if (els.sharePhotoReportBtn) els.sharePhotoReportBtn.disabled = false;
  els.photoReportView?.classList.add("hidden");
  els.photoReportModal?.classList.add("hidden");

  if (returnView === "employee") {
    els.employeeView?.classList.remove("hidden");
  } else {
    els.adminView?.classList.remove("hidden");
  }

  state.photoReportReturnView = null;
  state.photoReportReturnTaskId = null;
  state.photoReportReturnScrollY = 0;

  restorePhotoReportOrigin(returnTaskId, returnScrollY);
}

$$('[data-close-photo-modal]').forEach((button) => {
  button.addEventListener("click", closePhotoReportModal);
});

els.backFromPhotoReportBtn?.addEventListener("click", backFromPhotoReportPage);
els.downloadPhotoZipBtn?.addEventListener("click", async () => {
  await downloadCurrentPhotoReportZip();
});

els.sharePhotoReportBtn?.addEventListener("click", async () => {
  await shareCurrentPhotoReport();
});

els.photoSelectAllBtn?.addEventListener("click", () => {
  const task = state.tasks.find((item) => item.id === state.photoReportTaskId);
  const photos = getSortedTaskPhotos(task);
  setPhotoReportSelection(photos.map((photo, index) => getPhotoStableKey(photo, index)));
});

els.photoClearSelectionBtn?.addEventListener("click", clearPhotoReportSelection);

els.downloadSelectedPhotosBtn?.addEventListener("click", async () => {
  await downloadSelectedPhotoReportPhotos();
});

els.shareSelectedPhotosBtn?.addEventListener("click", async () => {
  await shareSelectedPhotoReportPhotos();
});

els.deleteSelectedPhotosBtn?.addEventListener("click", async () => {
  await deleteSelectedPhotoReportPhotos();
});

// Trình xem ảnh toàn màn hình (Lightbox/Gallery)
let photoViewerPreviousFocus = null;
let photoViewerTouchStart = null;
let photoViewerPendingSlideDirection = 0;
let photoViewerTransitionLocked = false;
let photoViewerTransitionTimer = null;
let photoViewerViewportRefreshTimer = null;

const PHOTO_VIEWER_ENTER_NEXT_CLASS = "is-entering-next";
const PHOTO_VIEWER_ENTER_PREVIOUS_CLASS = "is-entering-previous";
const PHOTO_VIEWER_GHOST_CLASS = "photo-viewer-image-ghost";
const PHOTO_VIEWER_TRANSITION_MS = 320;

function isPhotoViewerOpen() {
  return Boolean(els.photoViewer && !els.photoViewer.classList.contains("hidden"));
}

function getCurrentPhotoViewerPhoto() {
  return state.photoViewerPhotos[state.photoViewerIndex] || null;
}

function shouldReducePhotoViewerMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function removePhotoViewerGhosts() {
  els.photoViewerStage
    ?.querySelectorAll(`.${PHOTO_VIEWER_GHOST_CLASS}`)
    .forEach((ghost) => ghost.remove());
}

function clearPhotoViewerIncomingClasses() {
  els.photoViewerImage?.classList.remove(
    PHOTO_VIEWER_ENTER_NEXT_CLASS,
    PHOTO_VIEWER_ENTER_PREVIOUS_CLASS
  );
}

function unlockPhotoViewerTransition() {
  if (photoViewerTransitionTimer) {
    window.clearTimeout(photoViewerTransitionTimer);
    photoViewerTransitionTimer = null;
  }

  photoViewerTransitionLocked = false;
  clearPhotoViewerIncomingClasses();
  removePhotoViewerGhosts();
}

function resetPhotoViewerTransition() {
  photoViewerPendingSlideDirection = 0;
  unlockPhotoViewerTransition();
}

function refreshPhotoViewerAfterViewportChange() {
  if (!isPhotoViewerOpen()) return;

  if (photoViewerViewportRefreshTimer) {
    window.clearTimeout(photoViewerViewportRefreshTimer);
  }

  photoViewerViewportRefreshTimer = window.setTimeout(() => {
    photoViewerViewportRefreshTimer = null;
    photoViewerTouchStart = null;
    resetPhotoViewerTransition();

    // Buộc trình duyệt tính lại kích thước vùng ảnh sau khi xoay màn hình.
    // Hữu ích với Safari iOS và một số WebView Android có Visual Viewport cập nhật chậm.
    if (els.photoViewerStage) {
      void els.photoViewerStage.offsetHeight;
    }
  }, 80);
}

function createPhotoViewerOutgoingGhost(direction) {
  const image = els.photoViewerImage;
  const wrap = image?.parentElement;

  if (!image || !wrap || !image.currentSrc || !image.complete || !image.naturalWidth) return;

  removePhotoViewerGhosts();

  const imageRect = image.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  if (!imageRect.width || !imageRect.height) return;

  const ghost = image.cloneNode(false);
  ghost.removeAttribute("id");
  ghost.removeAttribute("aria-describedby");
  ghost.classList.remove(PHOTO_VIEWER_ENTER_NEXT_CLASS, PHOTO_VIEWER_ENTER_PREVIOUS_CLASS);
  ghost.classList.add(
    PHOTO_VIEWER_GHOST_CLASS,
    direction > 0 ? "is-leaving-next" : "is-leaving-previous"
  );
  ghost.setAttribute("aria-hidden", "true");

  Object.assign(ghost.style, {
    left: `${imageRect.left - wrapRect.left}px`,
    top: `${imageRect.top - wrapRect.top}px`,
    width: `${imageRect.width}px`,
    height: `${imageRect.height}px`
  });

  wrap.appendChild(ghost);
  ghost.addEventListener("animationend", () => ghost.remove(), { once: true });
  window.setTimeout(() => ghost.remove(), PHOTO_VIEWER_TRANSITION_MS + 180);
}

function runPhotoViewerIncomingAnimation(direction) {
  const image = els.photoViewerImage;
  if (!image || !direction || shouldReducePhotoViewerMotion()) {
    unlockPhotoViewerTransition();
    return;
  }

  clearPhotoViewerIncomingClasses();
  // Buộc trình duyệt ghi nhận trạng thái ban đầu trước khi thêm animation mới.
  void image.offsetWidth;

  const animationClass = direction > 0
    ? PHOTO_VIEWER_ENTER_NEXT_CLASS
    : PHOTO_VIEWER_ENTER_PREVIOUS_CLASS;

  image.classList.add(animationClass);
  image.addEventListener("animationend", unlockPhotoViewerTransition, { once: true });

  photoViewerTransitionTimer = window.setTimeout(
    unlockPhotoViewerTransition,
    PHOTO_VIEWER_TRANSITION_MS + 180
  );
}

function preloadPhotoViewerNeighbors() {
  const neighborIndexes = [state.photoViewerIndex - 1, state.photoViewerIndex + 1];

  neighborIndexes.forEach((index) => {
    const photo = state.photoViewerPhotos[index];
    if (!photo?.url) return;
    const image = new Image();
    image.src = photo.url;
  });
}

function updatePhotoViewerContent(options = {}) {
  const { slideDirection = 0 } = options;
  const photo = getCurrentPhotoViewerPhoto();
  const total = state.photoViewerPhotos.length;

  if (!photo || !total) {
    closePhotoViewer();
    return;
  }

  const displayName = photo.name || `Ảnh ${state.photoViewerIndex + 1}`;
  const uploader = photo.uploadedByName || "Nhân viên";
  const uploadedAt = formatFullDateTime(photo.uploadedAt);
  const sizeText = formatFileSize(photo.size);

  if (els.photoViewerCounter) {
    els.photoViewerCounter.textContent = `Ảnh ${state.photoViewerIndex + 1} / ${total}`;
  }

  if (els.photoViewerName) {
    els.photoViewerName.textContent = displayName;
  }

  const capturedBeforeAssignment = isPreAssignmentPhoto(photo);
  const capturedAtText = photo.capturedAt ? formatFullDateTime(photo.capturedAt) : "";

  if (els.photoViewerMeta) {
    const captureText = capturedAtText ? ` • Chụp lúc ${capturedAtText}` : "";
    els.photoViewerMeta.textContent = `${uploader} • ${uploadedAt} • ${sizeText}${captureText}`;
  }

  els.photoViewerStage?.classList.toggle("is-pre-assignment-photo", capturedBeforeAssignment);

  if (els.photoViewerOpenOriginal) {
    els.photoViewerOpenOriginal.href = photo.url;
    els.photoViewerOpenOriginal.setAttribute("aria-label", `Mở ảnh gốc ${displayName} trong tab mới`);
  }

  if (els.photoViewerImage) {
    clearPhotoViewerIncomingClasses();
    photoViewerPendingSlideDirection = slideDirection;
    els.photoViewerStage?.classList.add("is-loading");
    els.photoViewerImage.removeAttribute("src");
    els.photoViewerImage.alt = displayName;
    els.photoViewerImage.src = photo.url;
  }

  if (els.photoViewerPrevBtn) {
    const isFirst = state.photoViewerIndex <= 0;
    els.photoViewerPrevBtn.disabled = isFirst;
    els.photoViewerPrevBtn.setAttribute("aria-disabled", String(isFirst));
  }

  if (els.photoViewerNextBtn) {
    const isLast = state.photoViewerIndex >= total - 1;
    els.photoViewerNextBtn.disabled = isLast;
    els.photoViewerNextBtn.setAttribute("aria-disabled", String(isLast));
  }

  preloadPhotoViewerNeighbors();
}

function navigatePhotoViewerTo(targetIndex, direction = 0) {
  const nextIndex = Number(targetIndex);
  const total = state.photoViewerPhotos.length;

  if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= total) return;
  if (nextIndex === state.photoViewerIndex || photoViewerTransitionLocked) return;

  const resolvedDirection = direction || (nextIndex > state.photoViewerIndex ? 1 : -1);
  const useAnimation = !shouldReducePhotoViewerMotion();

  if (useAnimation) {
    photoViewerTransitionLocked = true;
    createPhotoViewerOutgoingGhost(resolvedDirection);
  } else {
    resetPhotoViewerTransition();
  }

  state.photoViewerIndex = nextIndex;
  updatePhotoViewerContent({ slideDirection: useAnimation ? resolvedDirection : 0 });
}

function openPhotoViewer(index) {
  const nextIndex = Number(index);
  if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= state.photoViewerPhotos.length) return;

  if (!isPhotoViewerOpen()) {
    photoViewerPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  resetPhotoViewerTransition();
  state.photoViewerIndex = nextIndex;
  els.photoViewer?.classList.remove("hidden");
  els.photoViewer?.setAttribute("aria-hidden", "false");
  document.documentElement.classList.add("photo-viewer-open");
  document.body.classList.add("photo-viewer-open");
  updatePhotoViewerContent();

  window.requestAnimationFrame(() => {
    els.photoViewerCloseBtn?.focus({ preventScroll: true });
  });
}

function closePhotoViewer(options = {}) {
  const { restoreFocus = true } = options;
  if (!els.photoViewer) return;

  const wasOpen = isPhotoViewerOpen();
  els.photoViewer.classList.add("hidden");
  els.photoViewer.setAttribute("aria-hidden", "true");
  document.documentElement.classList.remove("photo-viewer-open");
  document.body.classList.remove("photo-viewer-open");
  els.photoViewerStage?.classList.remove("is-loading");
  els.photoViewerImage?.removeAttribute("src");
  photoViewerTouchStart = null;

  if (photoViewerViewportRefreshTimer) {
    window.clearTimeout(photoViewerViewportRefreshTimer);
    photoViewerViewportRefreshTimer = null;
  }

  resetPhotoViewerTransition();

  if (wasOpen && restoreFocus && photoViewerPreviousFocus?.isConnected) {
    photoViewerPreviousFocus.focus({ preventScroll: true });
  }

  photoViewerPreviousFocus = null;
}

function showPreviousPhotoViewerImage() {
  navigatePhotoViewerTo(state.photoViewerIndex - 1, -1);
}

function showNextPhotoViewerImage() {
  navigatePhotoViewerTo(state.photoViewerIndex + 1, 1);
}

els.photoReportGrid?.addEventListener("click", (event) => {
  const target = event.target instanceof Element
    ? event.target.closest("[data-photo-viewer-index]")
    : null;
  if (!target) return;

  event.preventDefault();
  openPhotoViewer(Number(target.dataset.photoViewerIndex));
});

els.photoReportGrid?.addEventListener("change", (event) => {
  const checkbox = event.target instanceof HTMLInputElement
    ? event.target.closest("[data-photo-select-key]")
    : null;

  if (!checkbox || !isManagementProfile()) return;

  const key = String(checkbox.dataset.photoSelectKey || "");
  if (!key) return;

  const nextKeys = new Set(state.photoReportSelectedKeys);
  if (checkbox.checked) {
    nextKeys.add(key);
  } else {
    nextKeys.delete(key);
  }

  setPhotoReportSelection(nextKeys);
});

els.photoViewerPrevBtn?.addEventListener("click", showPreviousPhotoViewerImage);
els.photoViewerNextBtn?.addEventListener("click", showNextPhotoViewerImage);

$$('[data-close-photo-viewer]').forEach((button) => {
  button.addEventListener("click", () => closePhotoViewer());
});

els.photoViewerImage?.addEventListener("load", () => {
  els.photoViewerStage?.classList.remove("is-loading");

  const direction = photoViewerPendingSlideDirection;
  photoViewerPendingSlideDirection = 0;

  if (direction) {
    window.requestAnimationFrame(() => runPhotoViewerIncomingAnimation(direction));
  } else {
    unlockPhotoViewerTransition();
  }
});

els.photoViewerImage?.addEventListener("error", () => {
  els.photoViewerStage?.classList.remove("is-loading");
  resetPhotoViewerTransition();
  toast("Không tải được ảnh này. Bạn có thể bấm “Mở ảnh gốc” để thử lại.", "error");
});

els.photoViewerStage?.addEventListener("touchstart", (event) => {
  if (event.touches.length !== 1 || photoViewerTransitionLocked) {
    photoViewerTouchStart = null;
    return;
  }

  const touch = event.touches[0];
  photoViewerTouchStart = {
    x: touch.clientX,
    y: touch.clientY,
    time: Date.now()
  };
}, { passive: true });

els.photoViewerStage?.addEventListener("touchend", (event) => {
  if (!photoViewerTouchStart || event.changedTouches.length !== 1) return;

  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - photoViewerTouchStart.x;
  const deltaY = touch.clientY - photoViewerTouchStart.y;
  const elapsed = Date.now() - photoViewerTouchStart.time;
  photoViewerTouchStart = null;

  const isHorizontalSwipe = Math.abs(deltaX) >= 48
    && Math.abs(deltaX) > Math.abs(deltaY) * 1.2
    && elapsed <= 900;

  if (!isHorizontalSwipe) return;
  if (deltaX < 0) {
    showNextPhotoViewerImage();
  } else {
    showPreviousPhotoViewerImage();
  }
}, { passive: true });

els.photoViewerStage?.addEventListener("touchcancel", () => {
  photoViewerTouchStart = null;
}, { passive: true });

window.addEventListener("resize", refreshPhotoViewerAfterViewportChange, { passive: true });
window.addEventListener("orientationchange", refreshPhotoViewerAfterViewportChange, { passive: true });
window.visualViewport?.addEventListener("resize", refreshPhotoViewerAfterViewportChange, { passive: true });

document.addEventListener("keydown", (event) => {
  if (!isPhotoViewerOpen()) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closePhotoViewer();
    return;
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showPreviousPhotoViewerImage();
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    showNextPhotoViewerImage();
    return;
  }

  if (event.key === "Home") {
    event.preventDefault();
    navigatePhotoViewerTo(0, -1);
    return;
  }

  if (event.key === "End") {
    event.preventDefault();
    navigatePhotoViewerTo(Math.max(0, state.photoViewerPhotos.length - 1), 1);
  }
});

const PHOTO_ZIP_DOWNLOAD_TIMEOUT_MS = 20000;
const PHOTO_ZIP_FAST_PARALLEL_LIMIT = 6;

function withPhotoDownloadTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message || "Tải ảnh quá lâu, hệ thống sẽ thử cách khác."));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function assertUsablePhotoBlob(blob) {
  if (!(blob instanceof Blob)) {
    throw new Error("Dữ liệu tải về không phải file ảnh.");
  }

  if (Number(blob.size || 0) <= 0) {
    throw new Error("File ảnh tải về bị rỗng.");
  }

  return blob;
}

function extractDownloadTokenFromUrl(url) {
  try {
    return new URL(String(url || "")).searchParams.get("token") || "";
  } catch (_) {
    return "";
  }
}

function ensureFirebaseMediaUrl(url) {
  if (!url) return "";

  try {
    const parsed = new URL(String(url));

    // Link Firebase Storage chuẩn cần alt=media để trả về nội dung ảnh thay vì metadata.
    if (parsed.hostname.includes("firebasestorage.googleapis.com") && !parsed.searchParams.has("alt")) {
      parsed.searchParams.set("alt", "media");
    }

    return parsed.toString();
  } catch (_) {
    return String(url || "");
  }
}

function getStorageBucketName() {
  return firebaseConfig.storageBucket || app?.options?.storageBucket || "";
}

function buildFirebaseStorageMediaUrl(storagePath, token = "") {
  const bucket = getStorageBucketName();
  if (!bucket || !storagePath) return "";

  const url = new URL(`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}`);
  url.searchParams.set("alt", "media");
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

async function fetchPhotoBlobByUrl(url, options = {}) {
  const finalUrl = ensureFirebaseMediaUrl(url);
  if (!finalUrl) throw new Error("Ảnh không có link tải.");

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PHOTO_ZIP_DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(finalUrl, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: options.headers || undefined
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = assertUsablePhotoBlob(await response.blob());
    const type = String(blob.type || "").toLowerCase();
    if (type && !type.startsWith("image/") && !type.includes("octet-stream")) {
      console.warn("File tải về không có content-type ảnh:", type);
    }
    return blob;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function xhrPhotoBlobByUrl(url) {
  const finalUrl = ensureFirebaseMediaUrl(url);
  if (!finalUrl) throw new Error("Ảnh không có link tải.");

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", finalUrl, true);
    xhr.responseType = "blob";
    xhr.timeout = PHOTO_ZIP_DOWNLOAD_TIMEOUT_MS;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(assertUsablePhotoBlob(xhr.response));
        } catch (error) {
          reject(error);
        }
      } else {
        reject(new Error(`XHR HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("XHR bị trình duyệt chặn hoặc lỗi mạng."));
    xhr.ontimeout = () => reject(new Error("XHR tải ảnh quá lâu."));
    xhr.send();
  });
}

async function imageElementToBlobByUrl(url) {
  const finalUrl = ensureFirebaseMediaUrl(url);
  if (!finalUrl) throw new Error("Ảnh không có link tải.");

  return await new Promise((resolve, reject) => {
    const img = new Image();
    const timeoutId = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error("Image tải ảnh quá lâu."));
    }, PHOTO_ZIP_DOWNLOAD_TIMEOUT_MS);

    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      try {
        window.clearTimeout(timeoutId);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx || !canvas.width || !canvas.height) {
          throw new Error("Không tạo được canvas ảnh.");
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          try {
            resolve(assertUsablePhotoBlob(blob));
          } catch (error) {
            reject(error);
          }
        }, "image/jpeg", 0.95);
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error("Image không tải được ảnh."));
    };
    img.src = finalUrl;
  });
}


async function getPhotoBlobByStorageGetBytes(storagePath) {
  if (!storagePath) throw new Error("Ảnh không có storagePath.");

  const bytes = await withPhotoDownloadTimeout(
    getBytes(storageRef(storage, storagePath), 50 * 1024 * 1024),
    PHOTO_ZIP_DOWNLOAD_TIMEOUT_MS,
    "Firebase Storage getBytes tải ảnh quá lâu."
  );

  if (!bytes || !bytes.byteLength) {
    throw new Error("Firebase Storage getBytes trả về dữ liệu rỗng.");
  }

  return assertUsablePhotoBlob(new Blob([bytes], { type: "image/jpeg" }));
}

async function getPhotoBlobByStorageSdk(storagePath) {
  if (!storagePath) throw new Error("Ảnh không có storagePath.");

  return assertUsablePhotoBlob(await withPhotoDownloadTimeout(
    getBlob(storageRef(storage, storagePath)),
    PHOTO_ZIP_DOWNLOAD_TIMEOUT_MS,
    "Firebase Storage SDK tải ảnh quá lâu."
  ));
}

async function getFreshPhotoUrlFromStorage(storagePath) {
  if (!storagePath) throw new Error("Ảnh không có storagePath.");

  return await withPhotoDownloadTimeout(
    getDownloadURL(storageRef(storage, storagePath)),
    PHOTO_ZIP_DOWNLOAD_TIMEOUT_MS,
    "Không lấy được link ảnh mới từ Firebase Storage."
  );
}

async function getCurrentFirebaseIdToken() {
  try {
    return await withPhotoDownloadTimeout(
      auth.currentUser?.getIdToken?.() || Promise.resolve(""),
      8000,
      "Không lấy được token đăng nhập để tải ảnh."
    );
  } catch (error) {
    console.warn("Không lấy được Firebase ID token", error);
    return "";
  }
}

async function firstSuccessfulPhotoDownload(attempts) {
  const errors = [];

  for (const attempt of attempts) {
    try {
      const blob = await attempt.run();
      return assertUsablePhotoBlob(blob);
    } catch (error) {
      const message = `${attempt.name}: ${error?.message || String(error)}`;
      errors.push(message);
      console.warn("Một cách tải ảnh bị lỗi, thử cách tiếp theo:", message, error);
    }
  }

  throw new Error(errors.join(" | ") || "Không tải được ảnh.");
}

async function getPhotoBlobForZip(photo) {
  const storagePath = getStoragePathFromPhoto(photo);
  const url = ensureFirebaseMediaUrl(String(photo?.url || ""));
  const token = extractDownloadTokenFromUrl(url);
  const mediaUrlFromPath = storagePath ? buildFirebaseStorageMediaUrl(storagePath, token) : "";
  const errors = [];

  const tryDownload = async (label, runner) => {
    try {
      return assertUsablePhotoBlob(await runner());
    } catch (error) {
      const message = `${label}: ${error?.message || String(error)}`;
      errors.push(message);
      console.warn("Một cách tải ảnh bị lỗi, thử cách tiếp theo:", message, error);
      return null;
    }
  };

  // Sau khi bucket đã cấu hình CORS, cách nhanh nhất là tải trực tiếp URL đã lưu.
  // Chỉ khi URL lỗi mới thử các cách dự phòng để không làm chậm toàn bộ quá trình tạo ZIP.
  if (url) {
    const blob = await tryDownload("URL ảnh đã lưu", () => fetchPhotoBlobByUrl(url));
    if (blob) return blob;
  }

  if (mediaUrlFromPath && mediaUrlFromPath !== url) {
    const blob = await tryDownload("URL tạo từ storagePath", () => fetchPhotoBlobByUrl(mediaUrlFromPath));
    if (blob) return blob;
  }

  if (storagePath) {
    const bytesBlob = await tryDownload("Firebase Storage SDK getBytes", () => getPhotoBlobByStorageGetBytes(storagePath));
    if (bytesBlob) return bytesBlob;

    const sdkBlob = await tryDownload("Firebase Storage SDK getBlob", () => getPhotoBlobByStorageSdk(storagePath));
    if (sdkBlob) return sdkBlob;

    const freshUrl = await getFreshPhotoUrlFromStorage(storagePath).catch((error) => {
      errors.push(`Không lấy được URL mới: ${error?.message || String(error)}`);
      return "";
    });

    if (freshUrl && freshUrl !== url && freshUrl !== mediaUrlFromPath) {
      const blob = await tryDownload("URL mới từ Firebase", () => fetchPhotoBlobByUrl(freshUrl));
      if (blob) return blob;

      const xhrBlob = await tryDownload("URL mới từ Firebase bằng XHR", () => xhrPhotoBlobByUrl(freshUrl));
      if (xhrBlob) return xhrBlob;
    }
  }

  throw new Error(errors.join(" | ") || "Không tải được ảnh.");
}
function getPhotoReportZipMeta(task) {
  const folderName = sanitizeStorageFileName(`anh-bao-cao-${task?.title || task?.id || "cong-viec"}`);
  const fileName = sanitizeStorageFileName(`${folderName}-${new Date().toISOString().slice(0, 10)}.zip`);
  return { folderName, fileName };
}

async function createPhotoReportZipBlob(task, photos, onProgress = null) {
  if (!window.JSZip) {
    throw new Error("Chưa tải được thư viện tạo file ZIP. Vui lòng tải lại trang rồi thử lại.");
  }

  const zip = new window.JSZip();
  const { folderName, fileName } = getPhotoReportZipMeta(task);
  const folder = zip.folder(folderName) || zip;
  const usedNames = new Set();
  const failedPhotos = [];
  const downloadedFiles = new Array(photos.length);
  let nextIndex = 0;
  let finishedCount = 0;
  let successCount = 0;
  const parallelLimit = Math.max(1, Math.min(PHOTO_ZIP_FAST_PARALLEL_LIMIT, photos.length));

  const updateProgress = (message) => {
    if (typeof onProgress === "function") onProgress(message);
  };

  const worker = async () => {
    while (nextIndex < photos.length) {
      const index = nextIndex;
      nextIndex += 1;
      const photo = photos[index];

      try {
        const blob = await getPhotoBlobForZip(photo);
        const photoName = photo.name || `anh-bao-cao-${index + 1}.jpg`;
        const fileNameInZip = makeUniqueZipFileName(usedNames, `${String(index + 1).padStart(2, "0")}-${photoName}`);
        downloadedFiles[index] = { fileName: fileNameInZip, blob };
        successCount += 1;
      } catch (error) {
        console.error("Không tải được ảnh để nén ZIP", photo, error);
        failedPhotos.push(`${photo.name || `Ảnh ${index + 1}`}: ${error?.message || "Không rõ lỗi"}`);
      } finally {
        finishedCount += 1;
        updateProgress(`Đang tải ${finishedCount}/${photos.length}...`);
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
      }
    }
  };

  updateProgress(`Đang tải 0/${photos.length}...`);
  await Promise.all(Array.from({ length: parallelLimit }, () => worker()));

  if (!successCount) {
    throw new Error("Không tải được ảnh nào để tạo file ZIP. Hãy kiểm tra CORS của bucket và Storage Rules.");
  }

  downloadedFiles.forEach((file) => {
    if (!file) return;
    // Ảnh JPG/PNG đã được nén sẵn, dùng STORE để gom file nhanh hơn thay vì nén lại.
    folder.file(file.fileName, file.blob, { binary: true, compression: "STORE" });
  });

  if (failedPhotos.length) {
    folder.file("anh-khong-tai-duoc.txt", failedPhotos.join("\n"), { compression: "STORE" });
  }

  updateProgress("Đang tạo ZIP 0%...");
  const zipBlob = await zip.generateAsync(
    { type: "blob", compression: "STORE", streamFiles: true },
    (metadata) => {
      updateProgress(`Đang tạo ZIP ${Math.round(metadata.percent || 0)}%...`);
    }
  );

  return {
    zipBlob,
    fileName,
    successCount,
    totalCount: photos.length,
    failedPhotos
  };
}

async function downloadCurrentPhotoReportZip() {
  if (!isManagementProfile()) {
    toast("Tài khoản này không được tải toàn bộ ảnh báo cáo.", "error");
    return;
  }

  const task = state.tasks.find((item) => item.id === state.photoReportTaskId);
  const photos = getTaskPhotos(task);

  if (!task || !photos.length) {
    toast("Không có ảnh báo cáo để tải.", "error");
    return;
  }

  const button = els.downloadPhotoZipBtn;
  setButtonLoading(button, true, "Đang chuẩn bị...");

  try {
    const result = await createPhotoReportZipBlob(task, photos, (message) => {
      if (button) button.textContent = message;
    });

    downloadBlobFile(result.zipBlob, result.fileName);
    toast(`Đã tạo file ZIP với ${result.successCount}/${result.totalCount} hình.`, result.failedPhotos.length ? "warning" : "success");
  } catch (error) {
    console.error(error);
    toast(error.message || "Không tạo được file ZIP ảnh báo cáo.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function getSinglePhotoDownloadName(photo, index = 0) {
  const rawName = sanitizeStorageFileName(photo?.name || `anh-bao-cao-${index + 1}.jpg`);
  if (/\.[a-zA-Z0-9]{2,5}$/.test(rawName)) return rawName;

  const type = String(photo?.contentType || "").toLowerCase();
  if (type.includes("png")) return `${rawName}.png`;
  if (type.includes("webp")) return `${rawName}.webp`;
  if (type.includes("heic") || type.includes("heif")) return `${rawName}.heic`;
  return `${rawName}.jpg`;
}

async function downloadSelectedPhotoReportPhotos() {
  if (!isManagementProfile()) {
    toast("Tài khoản này không được tải các ảnh đã chọn.", "error");
    return;
  }

  const task = state.tasks.find((item) => item.id === state.photoReportTaskId);
  const photos = getSelectedPhotoReportPhotos(task);

  if (!task || !photos.length) {
    toast("Vui lòng chọn ít nhất một ảnh để tải.", "error");
    return;
  }

  const button = els.downloadSelectedPhotosBtn;
  setButtonLoading(button, true, "Đang chuẩn bị...");

  try {
    if (photos.length === 1) {
      const blob = await getPhotoBlobForZip(photos[0]);
      downloadBlobFile(blob, getSinglePhotoDownloadName(photos[0]));
      toast("Đã tải ảnh được chọn.", "success");
      return;
    }

    const result = await createPhotoReportZipBlob(task, photos, (message) => {
      if (button) button.textContent = message;
    });

    downloadBlobFile(result.zipBlob, result.fileName);
    toast(
      `Đã tải ${result.successCount}/${result.totalCount} ảnh được chọn trong file ZIP.`,
      result.failedPhotos.length ? "warning" : "success"
    );
  } catch (error) {
    console.error(error);
    toast(error.message || "Không tải được các ảnh đã chọn.", "error");
  } finally {
    setButtonLoading(button, false);
    updatePhotoSelectionToolbar(task);
  }
}

function getLatestUploadedAtFromPhotos(photos = []) {
  return photos.reduce((latest, photo) => {
    const currentMs = timestampToDate(photo?.uploadedAt)?.getTime() || 0;
    const latestMs = timestampToDate(latest)?.getTime() || 0;
    return currentMs > latestMs ? photo.uploadedAt : latest;
  }, null);
}

async function deleteSelectedPhotoReportPhotos() {
  if (!requirePermission("deleteReportPhotos", "Tài khoản của bạn chưa được cấp quyền xóa ảnh báo cáo.")) return;

  const task = state.tasks.find((item) => item.id === state.photoReportTaskId);
  const selectedPhotos = getSelectedPhotoReportPhotos(task);

  if (!task || !selectedPhotos.length) {
    toast("Vui lòng chọn ít nhất một ảnh để xóa.", "error");
    return;
  }

  const confirmed = window.confirm(
    `Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedPhotos.length} ảnh đã chọn?\n\n`
    + "Ảnh sẽ bị xóa khỏi Phiếu công việc và xóa luôn trên Firebase Storage. Hành động này không thể hoàn tác."
  );

  if (!confirmed) return;

  const button = els.deleteSelectedPhotosBtn;
  setButtonLoading(button, true, "Đang xóa...");

  try {
    const taskRef = doc(db, "tasks", task.id);
    const latestSnapshot = await getDoc(taskRef);

    if (!latestSnapshot.exists()) {
      throw new Error("Công việc không còn tồn tại.");
    }

    const latestTask = latestSnapshot.data() || {};
    const latestPhotos = Array.isArray(latestTask.photos)
      ? latestTask.photos.filter((photo) => photo?.url)
      : [];
    const selectedKeys = new Set(state.photoReportSelectedKeys);
    const targets = latestPhotos
      .map((photo, index) => ({
        photo,
        key: getPhotoStableKey(photo, index)
      }))
      .filter((item) => selectedKeys.has(item.key));

    if (!targets.length) {
      clearPhotoReportSelection();
      toast("Các ảnh đã chọn không còn tồn tại. Danh sách đã được cập nhật.", "warning");
      return;
    }

    const deletedKeys = new Set();
    const failedPhotos = [];

    for (let index = 0; index < targets.length; index += 1) {
      const { photo, key } = targets[index];
      const path = getStoragePathFromPhoto(photo);

      if (!path) {
        failedPhotos.push({
          photo,
          error: new Error("Không xác định được đường dẫn ảnh trên Firebase Storage.")
        });
        continue;
      }

      if (button) button.textContent = `Đang xóa ${index + 1}/${targets.length}...`;

      try {
        await deleteObject(storageRef(storage, path));
        deletedKeys.add(key);
      } catch (error) {
        if (isStorageObjectNotFound(error)) {
          // File đã không còn trên Storage: vẫn xóa dữ liệu tham chiếu trong Firestore.
          deletedKeys.add(key);
        } else {
          console.error("Không xóa được ảnh báo cáo trên Storage", photo, error);
          failedPhotos.push({ photo, error });
        }
      }
    }

    if (!deletedKeys.size) {
      throw new Error(
        failedPhotos[0]?.error?.message
        || "Không xóa được ảnh nào trên Firebase Storage."
      );
    }

    const remainingPhotos = latestPhotos.filter(
      (photo, index) => !deletedKeys.has(getPhotoStableKey(photo, index))
    );

    await updateDoc(taskRef, {
      photos: remainingPhotos,
      photoCount: remainingPhotos.length,
      lastPhotoUploadedAt: getLatestUploadedAtFromPhotos(remainingPhotos)
    });

    task.photos = remainingPhotos;
    task.photoCount = remainingPhotos.length;
    task.lastPhotoUploadedAt = getLatestUploadedAtFromPhotos(remainingPhotos);

    const nextSelection = new Set(state.photoReportSelectedKeys);
    deletedKeys.forEach((key) => nextSelection.delete(key));
    state.photoReportSelectedKeys = nextSelection;
    resetPreparedPhotoShare();
    renderPhotoReportPageContent(task);

    if (failedPhotos.length) {
      toast(
        `Đã xóa ${deletedKeys.size} ảnh. Còn ${failedPhotos.length} ảnh chưa xóa được trên Storage, vui lòng thử lại.`,
        "warning"
      );
    } else {
      toast(`Đã xóa vĩnh viễn ${deletedKeys.size} ảnh khỏi Phiếu và Firebase Storage.`, "success");
    }
  } catch (error) {
    console.error(error);
    toast(error.message || "Không xóa được các ảnh đã chọn.", "error");
  } finally {
    setButtonLoading(button, false);
    const currentTask = state.tasks.find((item) => item.id === state.photoReportTaskId);
    updatePhotoSelectionToolbar(currentTask);
  }
}

function isSharePermissionDeniedError(error) {
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || error || "").toLowerCase();
  return name.includes("notallowed")
    || name.includes("security")
    || message.includes("permission denied")
    || message.includes("not allowed")
    || message.includes("permissions policy")
    || message.includes("disallowed");
}

function getPreparedShareFileLabel(file) {
  return String(file?.type || "").toLowerCase().includes("zip") ? "file ZIP" : "ảnh";
}

async function sharePreparedPhotoZipFile(file, task, photos) {
  const safeFileName = file?.name || makePhotoZipFileName(task || {}, photos || []);
  const shareTitle = `Ảnh báo cáo - ${task?.title || "Công việc"}`;
  const shareText = `${task?.title || "Công việc"} • ${photos.length} hình báo cáo`;
  const firstPhotoUrl = photos.find((photo) => photo?.url)?.url || window.location.href;

  const downloadInsteadOfShare = () => {
    downloadBlobFile(file, safeFileName);
    return "download";
  };

  if (!navigator.share) {
    return downloadInsteadOfShare();
  }

  const fileShareData = {
    title: shareTitle,
    text: shareText,
    files: [file]
  };

  const canTryFileShare = Boolean(navigator.canShare && navigator.canShare(fileShareData));
  if (canTryFileShare) {
    try {
      await navigator.share(fileShareData);
      return "file";
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      console.warn("Không chia sẻ được file đã chuẩn bị, sẽ thử chia sẻ link hoặc tải xuống.", error);
      if (isSharePermissionDeniedError(error)) {
        return downloadInsteadOfShare();
      }
    }
  }

  try {
    await navigator.share({
      title: shareTitle,
      text: `${shareText}
${firstPhotoUrl}`,
      url: firstPhotoUrl
    });
    return "link";
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    console.warn("Không chia sẻ được link ảnh, sẽ tải file đã chuẩn bị xuống để gửi thủ công.", error);
    return downloadInsteadOfShare();
  }
}

async function sharePhotoReportCollection({
  task,
  photos,
  button,
  cacheScope = "all",
  emptyMessage = "Không có ảnh báo cáo để chia sẻ."
}) {
  if (!task || !photos.length) {
    toast(emptyMessage, "error");
    return;
  }

  const cacheKey = getPhotoShareCacheKey(task, photos, cacheScope);

  const notifyShareMode = (mode, file) => {
    const fileLabel = getPreparedShareFileLabel(file);
    if (mode === "file") {
      toast(`Đã mở bảng chia sẻ ${fileLabel}.`, "success");
    } else if (mode === "link") {
      toast(`Thiết bị không chia sẻ được ${fileLabel}, đã mở chia sẻ link ảnh.`, "warning");
    } else if (mode === "download") {
      toast(`Trình duyệt không cho chia sẻ trực tiếp. Đã tải ${fileLabel} để bạn gửi thủ công.`, "warning");
    }
  };

  // Nếu file đúng với bộ ảnh hiện tại đã được chuẩn bị sẵn, lần bấm này sẽ mở
  // bảng chia sẻ ngay. Cách này tránh lỗi mất quyền thao tác người dùng trên iOS/Android.
  if (
    state.photoShareFile
    && state.photoShareTaskId === task.id
    && state.photoShareCacheKey === cacheKey
  ) {
    setButtonLoading(button, true, "Đang mở chia sẻ...");

    try {
      const mode = await sharePreparedPhotoZipFile(state.photoShareFile, task, photos);
      notifyShareMode(mode, state.photoShareFile);
    } catch (error) {
      console.error(error);
      if (error?.name !== "AbortError") {
        toast(error.message || "Không mở được bảng chia sẻ.", "error");
      }
    } finally {
      setButtonLoading(button, false);
      updatePhotoSelectionToolbar(task);
    }

    return;
  }

  resetPreparedPhotoShare();
  setButtonLoading(button, true, "Đang chuẩn bị...");

  try {
    let file;

    // Khi chỉ chọn 1 ảnh, chia sẻ trực tiếp file ảnh để Zalo/ứng dụng khác
    // nhận đúng hình. Từ 2 ảnh trở lên sẽ gom thành ZIP để giữ đủ toàn bộ ảnh.
    if (cacheScope === "selected" && photos.length === 1) {
      if (button) button.textContent = "Đang tải ảnh...";
      const photoBlob = await getPhotoBlobForZip(photos[0]);
      file = new File(
        [photoBlob],
        getSinglePhotoDownloadName(photos[0]),
        { type: photoBlob.type || photos[0]?.contentType || "image/jpeg" }
      );
    } else {
      const result = await createPhotoReportZipBlob(task, photos, (message) => {
        if (button) button.textContent = message;
      });
      file = new File([result.zipBlob], result.fileName, { type: "application/zip" });
    }

    state.photoShareFile = file;
    state.photoShareTaskId = task.id;
    state.photoShareFileName = file.name;
    state.photoShareCacheKey = cacheKey;

    try {
      const mode = await sharePreparedPhotoZipFile(file, task, photos);
      notifyShareMode(mode, file);
    } catch (shareError) {
      console.error(shareError);
      if (shareError?.name === "AbortError") return;

      const fileLabel = getPreparedShareFileLabel(file);
      // Một số trình duyệt mobile chỉ cho mở bảng chia sẻ ở lần bấm tiếp theo,
      // sau khi file đã được chuẩn bị hoàn tất.
      toast(`Đã chuẩn bị xong ${fileLabel}. Bấm nút Chia sẻ thêm một lần nữa để mở Zalo hoặc ứng dụng khác.`, "warning");
    }
  } catch (error) {
    console.error(error);
    resetPreparedPhotoShare();
    toast(error.message || "Không chuẩn bị được file chia sẻ.", "error");
  } finally {
    setButtonLoading(button, false);
    updatePhotoSelectionToolbar(task);
  }
}

async function shareCurrentPhotoReport() {
  const task = state.tasks.find((item) => item.id === state.photoReportTaskId);
  const photos = getSortedTaskPhotos(task);

  await sharePhotoReportCollection({
    task,
    photos,
    button: els.sharePhotoReportBtn,
    cacheScope: "all",
    emptyMessage: "Không có ảnh báo cáo để chia sẻ."
  });
}

async function shareSelectedPhotoReportPhotos() {
  if (!isManagementProfile()) {
    toast("Tài khoản này không được chia sẻ các ảnh đã chọn.", "error");
    return;
  }

  const task = state.tasks.find((item) => item.id === state.photoReportTaskId);
  const photos = getSelectedPhotoReportPhotos(task);

  await sharePhotoReportCollection({
    task,
    photos,
    button: els.shareSelectedPhotosBtn,
    cacheScope: "selected",
    emptyMessage: "Vui lòng chọn ít nhất một ảnh để chia sẻ."
  });
}

function renderPhotoReportPageContent(task) {
  if (!task) return;

  const photos = getSortedTaskPhotos(task);
  syncPhotoReportSelection(photos);

  state.photoViewerPhotos = photos;
  if (isPhotoViewerOpen()) {
    if (!photos.length) {
      closePhotoViewer();
    } else {
      state.photoViewerIndex = Math.min(Math.max(0, state.photoViewerIndex), photos.length - 1);
      updatePhotoViewerContent();
    }
  }

  if (els.photoReportTaskTitle) {
    els.photoReportTaskTitle.textContent = task.title || "Công việc";
  }

  if (els.photoReportSummary) {
    const employeeName = task.assignedToName || getEmployeeDisplayNameByUid(task.assignedToUid, "Nhân viên");
    const requiredCount = getTaskRequiredPhotoCount(task);
    const requiresPhotos = taskRequiresPhotos(task);
    const hasEnoughPhotos = !requiresPhotos || photos.length >= requiredCount;
    const requirementText = requiresPhotos
      ? `${photos.length}/${requiredCount} ảnh`
      : "Không bắt buộc";
    const statusText = requiresPhotos
      ? (hasEnoughPhotos ? "Đã đủ ảnh" : "Còn thiếu ảnh")
      : "Ảnh tự chọn";
    const statusClass = requiresPhotos
      ? (hasEnoughPhotos ? "is-success" : "is-warning")
      : "is-neutral";

    els.photoReportSummary.innerHTML = `
      <span class="photo-report-meta-chip">👤 ${escapeHtml(employeeName)}</span>
      <span class="photo-report-meta-chip">📸 ${photos.length} ảnh đã đăng</span>
      <span class="photo-report-meta-chip ${statusClass}">${escapeHtml(statusText)} · ${escapeHtml(requirementText)}</span>
    `;
  }

  if (els.photoReportGrid) {
    const isManager = isManagementProfile();

    els.photoReportGrid.classList.toggle("empty-box", photos.length === 0);
    els.photoReportGrid.innerHTML = photos.length
      ? photos.map((photo, index) => {
        const photoKey = getPhotoStableKey(photo, index);
        const selected = isManager && state.photoReportSelectedKeys.has(photoKey);
        const displayName = photo.name || `Ảnh ${index + 1}`;
        const capturedBeforeAssignment = isPreAssignmentPhoto(photo);

        return `
          <article
            class="photo-report-item ${selected ? "is-selected" : ""} ${capturedBeforeAssignment ? "is-pre-assignment-photo" : ""}"
            data-photo-key="${escapeHtml(photoKey)}"
          >
            <button
              class="photo-report-open"
              type="button"
              data-photo-viewer-index="${index}"
              aria-label="Xem ${escapeHtml(displayName)}"
            >
              <span class="photo-report-image-wrap">
                <img src="${escapeHtml(photo.url)}" alt="Ảnh báo cáo ${index + 1}" loading="lazy" />
                ${capturedBeforeAssignment ? `<span class="photo-capture-warning">Ảnh chụp trước khi giao việc</span>` : ""}
              </span>
              <div>
                <strong>${escapeHtml(displayName)}</strong>
                <span>${escapeHtml(photo.uploadedByName || "Nhân viên")} • ${formatFullDateTime(photo.uploadedAt)} • ${formatFileSize(photo.size)}</span>
              </div>
            </button>

            ${isManager ? `
              <label
                class="photo-report-select ${selected ? "is-checked" : ""}"
                title="${selected ? "Bỏ chọn ảnh" : "Chọn ảnh"}"
              >
                <input
                  type="checkbox"
                  data-photo-select-key="${escapeHtml(photoKey)}"
                  aria-label="${selected ? "Bỏ chọn" : "Chọn"} ${escapeHtml(displayName)}"
                  ${selected ? "checked" : ""}
                />
                <span class="photo-report-select-mark" aria-hidden="true">✓</span>
              </label>
            ` : ""}
          </article>
        `;
      }).join("")
      : `Chưa có hình báo cáo.`;
  }

  updatePhotoSelectionToolbar(task, photos);

  if (els.downloadPhotoZipBtn) {
    const canDownload = isManagementProfile() && photos.length > 0;
    els.downloadPhotoZipBtn.classList.toggle("hidden", !canDownload);
    els.downloadPhotoZipBtn.disabled = !canDownload;
  }

  if (els.sharePhotoReportBtn) {
    const canShare = Boolean(navigator.share) && photos.length > 0;
    els.sharePhotoReportBtn.classList.toggle("hidden", !canShare);
    els.sharePhotoReportBtn.disabled = !canShare;
    if (!canShare) {
      resetPreparedPhotoShare();
    }
  }
}

function refreshPhotoReportPageIfOpen() {
  if (!state.photoReportTaskId || els.photoReportView?.classList.contains("hidden")) return;
  const task = state.tasks.find((item) => item.id === state.photoReportTaskId);
  if (!task) return;
  renderPhotoReportPageContent(task);
}

function openPhotoReportPage(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    toast("Không tìm thấy công việc cần xem hình.", "error");
    return;
  }

  state.photoReportTaskId = taskId;
  state.photoReportSelectedKeys = new Set();
  resetPreparedPhotoShare();
  state.photoReportReturnView = isManagementProfile() ? "admin" : "employee";
  state.photoReportReturnTaskId = taskId;
  state.photoReportReturnScrollY = window.scrollY
    || document.documentElement.scrollTop
    || document.body.scrollTop
    || 0;

  hideMainContentForPhotoReport();
  renderPhotoReportPageContent(task);
  els.photoReportView?.classList.remove("hidden");
  els.photoReportModal?.classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openPhotoReportModal(taskId) {
  openPhotoReportPage(taskId);
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

    setButtonLoading(button, true, "Đang tối ưu hình...");

    try {
      const now = new Date();
      const uploadedPhotos = [];
      const optimizedResults = [];

      for (let index = 0; index < files.length; index += 1) {
        if (button) button.textContent = `Đang kiểm tra ${index + 1}/${files.length}...`;
        const captureInfo = await readPhotoCapturedAt(files[index]);
        if (button) button.textContent = `Đang tối ưu ${index + 1}/${files.length}...`;
        const optimizedItem = await optimizePhotoFileForUpload(files[index]);
        optimizedResults.push({
          ...optimizedItem,
          capturedAtDate: captureInfo.date,
          captureTimeSource: captureInfo.source,
          capturedBeforeAssignment: isPhotoCapturedBeforeTaskAssignment(captureInfo.date, task)
        });
      }

      const optimizationSummary = getOptimizationSummary(optimizedResults);

      for (let index = 0; index < optimizedResults.length; index += 1) {
        const item = optimizedResults[index];
        const file = item.file;
        if (button) button.textContent = `Đang đăng ${index + 1}/${optimizedResults.length}...`;

        const photoId = makeId("photo");
        const safeName = sanitizeStorageFileName(file.name || item.originalName);
        const path = `task-photos/${task.id}/${Date.now()}-${photoId}-${safeName}`;
        const fileRef = storageRef(storage, path);

        await uploadBytes(fileRef, file, {
          contentType: file.type || "image/jpeg",
          customMetadata: {
            taskId: task.id,
            uploadedByUid: state.user.uid,
            optimized: item.optimized ? "true" : "false",
            originalName: item.originalName || file.name || safeName,
            originalSize: String(item.originalSize || file.size || 0),
            capturedAt: item.capturedAtDate?.toISOString?.() || "",
            captureTimeSource: item.captureTimeSource || "unavailable",
            capturedBeforeAssignment: item.capturedBeforeAssignment ? "true" : "false"
          }
        });

        const url = await getDownloadURL(fileRef);

        uploadedPhotos.push({
          id: photoId,
          name: file.name || safeName,
          originalName: item.originalName || file.name || safeName,
          url,
          storagePath: path,
          contentType: file.type || "image/jpeg",
          size: Number(file.size || 0),
          originalSize: Number(item.originalSize || file.size || 0),
          optimized: Boolean(item.optimized),
          width: Number(item.width || 0),
          height: Number(item.height || 0),
          uploadedAt: Timestamp.fromDate(now),
          capturedAt: item.capturedAtDate ? Timestamp.fromDate(item.capturedAtDate) : null,
          captureTimeSource: item.captureTimeSource || "unavailable",
          capturedBeforeAssignment: Boolean(item.capturedBeforeAssignment),
          assignmentAtSnapshot: getTaskAssignmentDate(task) ? Timestamp.fromDate(getTaskAssignmentDate(task)) : null,
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

      const savedText = optimizationSummary.savedBytes > 0
        ? ` Đã tối ưu giảm khoảng ${formatFileSize(optimizationSummary.savedBytes)}.`
        : "";
      const preAssignmentCount = uploadedPhotos.filter((photo) => photo.capturedBeforeAssignment).length;
      const warningText = preAssignmentCount > 0
        ? ` Có ${preAssignmentCount} ảnh được phát hiện chụp trước khi giao việc và đã được đánh dấu.`
        : "";
      toast(`Đã đăng thành công ${uploadedPhotos.length} hình.${savedText}${warningText}`, preAssignmentCount > 0 ? "warning" : "success");
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
  if (!requirePermission("reassignTasks", "Tài khoản của bạn chưa được cấp quyền đổi nhân viên phụ trách.")) return;

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

  if (!requirePermission("reassignTasks", "Tài khoản của bạn chưa được cấp quyền đổi nhân viên phụ trách.")) return;

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

function setExtendReasonListExpanded(expanded) {
  state.extendReasonListExpanded = Boolean(expanded);

  const list = els.extendReasonList;
  const toggle = els.extendReasonListToggle;

  if (!list) return;

  list.classList.toggle("is-expanded", state.extendReasonListExpanded);

  const extraItems = Array.from(list.querySelectorAll(".reason-item-extra"));

  extraItems.forEach((item) => {
    const isHidden = !state.extendReasonListExpanded;
    item.setAttribute("aria-hidden", String(isHidden));

    item.querySelectorAll("button, input, select, textarea, a[href]").forEach((control) => {
      if (isHidden) {
        control.setAttribute("tabindex", "-1");
      } else {
        control.removeAttribute("tabindex");
      }
    });
  });

  if (toggle) {
    toggle.setAttribute("aria-expanded", String(state.extendReasonListExpanded));
    toggle.innerHTML = state.extendReasonListExpanded
      ? 'Thu gọn <span aria-hidden="true">⌃</span>'
      : 'Chi tiết <span aria-hidden="true">⌄</span>';
  }
}

function renderCustomExtendReasonList() {
  if (!els.extendReasonList) return;

  const customReasons = state.timeExtensionReasons || [];

  if (els.extendReasonCount) {
    els.extendReasonCount.textContent = `${customReasons.length} mục đích`;
  }

  if (els.extendReasonListToggle) {
    els.extendReasonListToggle.hidden = customReasons.length <= 1;
  }

  if (!customReasons.length) {
    els.extendReasonList.innerHTML = `<p class="small-note">Chưa có mục đích nào do Admin tự tạo.</p>`;
    setExtendReasonListExpanded(false);
    return;
  }

  els.extendReasonList.innerHTML = customReasons
    .map((reason, index) => `
      <div class="reason-item${index > 0 ? " reason-item-extra" : ""}"${index > 0 ? ' aria-hidden="true"' : ""}>
        <span>${escapeHtml(reason.name || "Không tên")}</span>
        <button class="btn danger tiny" type="button" data-delete-extend-reason-id="${escapeHtml(reason.id)}" data-delete-extend-reason-name="${escapeHtml(reason.name || "")}">
          Xoá
        </button>
      </div>
    `)
    .join("");

  setExtendReasonListExpanded(state.extendReasonListExpanded && customReasons.length > 1);
}

function updateExtendTimeLimitUI(task = null) {
  if (!els.extendMinutes || !els.extendTimeLimitNote) return;

  const activeTask = task || state.tasks.find((item) => item.id === state.extendTimeTaskId);
  const maxMinutes = getConfiguredMaxExtendMinutes();

  if (!maxMinutes) {
    els.extendMinutes.max = "1440";
    els.extendTimeLimitNote.textContent = "Cài đặt hiện không giới hạn tổng số phút được thêm cho mỗi công việc.";
    els.extendTimeLimitNote.classList.remove("is-limited", "is-exhausted");
    return;
  }

  const usedMinutes = activeTask ? getTaskExtensionTotalMinutes(activeTask) : 0;
  const remainingMinutes = Math.max(0, maxMinutes - usedMinutes);
  els.extendMinutes.max = String(Math.max(1, remainingMinutes));
  els.extendTimeLimitNote.textContent = remainingMinutes > 0
    ? `Cài đặt giới hạn tối đa ${maxMinutes} phút cho mỗi công việc. Đã dùng ${usedMinutes} phút, còn được thêm ${remainingMinutes} phút.`
    : `Công việc này đã dùng đủ giới hạn ${maxMinutes} phút và không thể thêm giờ tiếp.`;
  els.extendTimeLimitNote.classList.add("is-limited");
  els.extendTimeLimitNote.classList.toggle("is-exhausted", remainingMinutes <= 0);
}

function openExtendTimeModal(taskId) {
  if (!requirePermission("extendTaskTime", "Tài khoản của bạn chưa được cấp quyền thêm giờ công việc.")) return;

  const task = state.tasks.find((item) => item.id === taskId);

  if (!task) {
    toast("Không tìm thấy công việc cần thêm giờ.", "error");
    return;
  }

  if (isTaskOverdueForTimeExtension(task) && !isOverdueTimeExtensionAllowed()) {
    toast("Quá hạn thời gian không thể thêm giờ", "error");
    return;
  }

  if (!canAdminExtendTaskTime(task, "admin")) {
    toast("Chỉ có thể thêm giờ cho công việc đang làm hoặc đang yêu cầu làm lại.", "error");
    return;
  }

  const remainingMinutes = getRemainingExtendMinutes(task);
  if (remainingMinutes !== null && remainingMinutes <= 0) {
    toast(`Công việc này đã dùng đủ giới hạn ${getConfiguredMaxExtendMinutes()} phút.`, "error");
    return;
  }

  state.extendTimeTaskId = taskId;
  els.extendTimeTaskTitle.textContent = task.title || "Công việc";
  els.extendMinutes.value = String(remainingMinutes === null ? 15 : Math.min(15, remainingMinutes));
  updateExtendTimeLimitUI(task);
  els.newExtendReason.value = "";
  state.extendReasonListExpanded = false;
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
  if (!requirePermission("extendTaskTime", "Tài khoản của bạn chưa được cấp quyền quản lý mục đích thêm giờ.")) return;

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

els.extendReasonListToggle?.addEventListener("click", () => {
  setExtendReasonListExpanded(!state.extendReasonListExpanded);
});

els.extendReasonList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-extend-reason-id]");

  if (!button || !hasPermission("extendTaskTime")) return;

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

  if (!cleanName || !hasPermission("extendTaskTime")) return;

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

  if (!requirePermission("extendTaskTime", "Tài khoản của bạn chưa được cấp quyền thêm giờ công việc.")) return;

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

  const currentTask = state.tasks.find((item) => item.id === taskId);
  const remainingBeforeSubmit = currentTask ? getRemainingExtendMinutes(currentTask) : null;
  if (remainingBeforeSubmit !== null && minutes > remainingBeforeSubmit) {
    toast(`Chỉ còn được thêm tối đa ${remainingBeforeSubmit} phút cho công việc này.`, "error");
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

      if (isTaskOverdueForTimeExtension(task) && !isOverdueTimeExtensionAllowed()) {
        throw new Error("Quá hạn thời gian không thể thêm giờ");
      }

      if (!canAdminExtendTaskTime(task, "admin")) {
        throw new Error("Chỉ có thể thêm giờ cho công việc đang làm hoặc đang yêu cầu làm lại.");
      }

      const configuredMaxMinutes = getConfiguredMaxExtendMinutes();
      const usedExtensionMinutes = getTaskExtensionTotalMinutes(task);
      if (configuredMaxMinutes && usedExtensionMinutes + minutes > configuredMaxMinutes) {
        const remaining = Math.max(0, configuredMaxMinutes - usedExtensionMinutes);
        throw new Error(`Cài đặt chỉ cho phép thêm tối đa ${configuredMaxMinutes} phút cho mỗi công việc. Công việc này còn ${remaining} phút.`);
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
  if (!requirePermission("reviewTasks", "Tài khoản của bạn chưa được cấp quyền duyệt kết quả công việc.")) return;
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

    // Tính kết quả tại thời điểm Admin bấm duyệt, không lấy thời điểm nhân viên bấm "Hoàn thành".
    // Như vậy khi task đang ở trạng thái "Chờ Admin xác nhận", đồng hồ vẫn chạy bình thường
    // cho đến lúc Admin duyệt và kết quả nhanh/chậm phản ánh đúng thời gian duyệt thực tế.
    const approvedDate = new Date();
    const result = calculateResultAt(task, approvedDate);

    await updateDoc(doc(db, "tasks", taskId), {
      status: "completed",
      approvedAt: Timestamp.fromDate(approvedDate),
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
  if (!requirePermission("reviewTasks", "Tài khoản của bạn chưa được cấp quyền kết thúc Phiếu nghỉ trưa.")) return;
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

function formatPercent(value) {
  const numberValue = Number(value || 0);

  if (!Number.isFinite(numberValue)) return "0";

  return Number.isInteger(numberValue)
    ? String(numberValue)
    : String(Number(numberValue.toFixed(1)));
}

function calculateResultDifferencePercent(resultType, differenceMinutes, deadlineMinutes, actualMinutes) {
  const diff = Number(differenceMinutes || 0);
  const deadline = Number(deadlineMinutes || 0);
  const actual = Number(actualMinutes || 0);

  if (!diff || resultType === "on_time") return 0;

  // Với công việc làm chậm, phần trăm hiển thị phải tính theo tổng thời gian thực tế,
  // để trường hợp quy định 4 phút nhưng làm 8 phút sẽ hiển thị chậm hơn 4 phút (50%),
  // không còn nhảy thành 100% gây hiểu nhầm.
  const baseMinutes = resultType === "slower" ? actual : deadline;

  if (baseMinutes <= 0) return 0;

  return Number(((diff / baseMinutes) * 100).toFixed(1));
}

function taskResultShortText(result) {
  const percent = formatPercent(result.differencePercent);

  if (result.resultType === "faster") return `nhanh hơn ${result.differenceMinutes} phút (${percent}%)`;
  if (result.resultType === "slower") return `chậm hơn ${result.differenceMinutes} phút (${percent}%)`;
  return "đúng thời gian";
}

async function requestRedo(taskId, button) {
  if (!requirePermission("reviewTasks", "Tài khoản của bạn chưa được cấp quyền yêu cầu làm lại.")) return;
  setButtonLoading(button, true, "Đang cập nhật...");

  try {
    const task = state.tasks.find((item) => item.id === taskId);
    const requestedAt = Timestamp.now();
    const requestedByUid = state.user?.uid || "";
    const requestedByName = state.profile?.name || state.user?.email || "Admin";
    const historyRecord = {
      requestedAt,
      requestedByUid,
      requestedByName,
      previousStatus: task?.status || "submitted"
    };

    await updateDoc(doc(db, "tasks", taskId), {
      status: "redo",
      submittedAt: null,
      redoRequestHistory: arrayUnion(historyRecord),
      redoRequestCount: increment(1),
      lastRedoRequestedAt: requestedAt,
      lastRedoRequestedByUid: requestedByUid,
      lastRedoRequestedByName: requestedByName
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

    toast("Đã yêu cầu nhân viên làm lại và lưu lịch sử.", "success");
  } catch (error) {
    console.error(error);
    toast("Không cập nhật được yêu cầu làm lại.", "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function calculateResult(task) {
  const completedAt = timestampToDate(task.approvedAt) || timestampToDate(task.submittedAt);

  if (!completedAt) {
    throw new Error("Thiếu thời gian hoàn thành.");
  }

  return calculateResultAt(task, completedAt);
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

  let resultType = "on_time";

  // Nếu task đã được Admin “Thêm giờ”, thời gian quy định mới là tổng thời gian sau khi cộng thêm.
  // Nhân viên hoàn thành trong hoặc trước hạn mới sẽ được ghi nhận là đúng giờ,
  // không tính là nhanh hơn theo mốc thời gian cũ trước khi được thêm giờ.
  if (actualMinutes > deadlineMinutes) {
    resultType = "slower";
  } else if (actualMinutes < deadlineMinutes && !hasTaskTimeExtensions(task)) {
    resultType = "faster";
  }

  const differenceMinutes = resultType === "on_time"
    ? 0
    : Math.abs(deadlineMinutes - actualMinutes);
  const differencePercent = calculateResultDifferencePercent(resultType, differenceMinutes, deadlineMinutes, actualMinutes);

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
  $$('[data-task-card]').forEach((card) => {
    const rawStatus = card.dataset.rawStatus;
    const countdowns = Array.from(card.querySelectorAll('[data-countdown]'));

    if (!countdowns.length) return;

    const setCountdownText = (text) => {
      countdowns.forEach((countdown) => {
        countdown.textContent = text;
      });
    };

    if (rawStatus === "draft") {
      setCountdownText("Chưa giao việc");
      return;
    }

    if (rawStatus === "waiting_assignee") {
      const remainingPauseMs = Number(card.dataset.remainingPauseMs || 0);
      setCountdownText(remainingPauseMs > 0
        ? `Tạm dừng - còn ${formatCountdown(remainingPauseMs)}`
        : "Chờ chọn người - chưa bắt đầu");
      card.classList.remove("is-overdue", "is-near-due", "is-queued");
      return;
    }

    if (rawStatus === "completed") {
      setCountdownText("Đã hoàn thành");
      return;
    }

    const queueStartMs = Number(card.dataset.queueStartMs || 0);

    if (queueStartMs && Date.now() < queueStartMs) {
      setCountdownText(`Chờ đến lượt (bắt đầu ${formatDateTime(new Date(queueStartMs))})`);
      card.classList.add("is-queued");
      card.classList.remove("is-overdue", "is-near-due");
      return;
    }

    card.classList.remove("is-queued");

    const deadlineMs = Number(card.dataset.deadlineMs || 0);

    if (!deadlineMs) {
      setCountdownText("--");
      return;
    }

    const remainingMs = deadlineMs - Date.now();

    setCountdownText(remainingMs >= 0
      ? `Còn ${formatCountdown(remainingMs)}`
      : `Quá hạn ${formatCountdown(remainingMs)}`);

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


// =========================
// Nạp sự kiện Google Calendar thành Phiếu công việc nháp
// Calendar ID và API Key được lưu phía máy chủ qua Cloud Function.
// API Key không được trả ngược về frontend; khi đã lưu, Admin có thể để trống ô API Key.
// =========================
function getLocalIsoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addLocalDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getGoogleCalendarSuggestedRange(mode) {
  const now = new Date();
  if (mode === "today") {
    const day = getLocalIsoDate(now);
    return { from: day, to: day };
  }
  if (mode === "week") {
    const day = now.getDay() || 7;
    const monday = addLocalDays(now, 1 - day);
    return { from: getLocalIsoDate(monday), to: getLocalIsoDate(addLocalDays(monday, 6)) };
  }
  if (mode === "month") {
    return {
      from: getLocalIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: getLocalIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    };
  }
  return {
    from: els.googleCalendarFromDate?.value || getLocalIsoDate(now),
    to: els.googleCalendarToDate?.value || getLocalIsoDate(now)
  };
}

function syncGoogleCalendarRangeUI() {
  const mode = els.googleCalendarRangeMode?.value || "month";
  const isCustom = mode === "custom";
  els.googleCalendarCustomRange?.classList.toggle("hidden", !isCustom);
  if (!isCustom) {
    const range = getGoogleCalendarSuggestedRange(mode);
    if (els.googleCalendarFromDate) els.googleCalendarFromDate.value = range.from;
    if (els.googleCalendarToDate) els.googleCalendarToDate.value = range.to;
  }
}

function setGoogleCalendarSavedStatus({ hasApiKey = false, calendarId = "" } = {}) {
  const status = els.googleCalendarSavedStatus;
  if (!status) return;
  if (calendarId || hasApiKey) {
    status.textContent = hasApiKey
      ? "Đã lưu Calendar ID và API Key. Chỉ nhập lại khi muốn thay đổi."
      : "Đã lưu Calendar ID. Hãy nhập API Key để hoàn tất cấu hình.";
    status.classList.add("is-saved");
  } else {
    status.textContent = "Chưa có cấu hình đã lưu.";
    status.classList.remove("is-saved");
  }
}

async function loadGoogleCalendarImportSettings() {
  setGoogleCalendarSavedStatus();
  try {
    const response = await getGoogleCalendarImportSettingsCallable({});
    const settings = response?.data || {};
    if (els.googleCalendarIdInput) {
      els.googleCalendarIdInput.value = String(settings.calendarId || "");
    }
    if (els.googleCalendarApiKeyInput) {
      els.googleCalendarApiKeyInput.value = "";
      els.googleCalendarApiKeyInput.placeholder = settings.hasApiKey
        ? "Đã lưu API Key — để trống nếu không thay đổi"
        : "Nhập API Key";
    }
    setGoogleCalendarSavedStatus(settings);
  } catch (error) {
    console.error("Không thể tải cấu hình Google Calendar:", error);
    setGoogleCalendarSavedStatus();
  }
}

function closeGoogleCalendarImportModal() {
  els.googleCalendarImportModal?.classList.add("hidden");
  document.body.classList.remove("google-calendar-import-open");
  if (els.googleCalendarApiKeyInput) els.googleCalendarApiKeyInput.value = "";
}

function openGoogleCalendarImportModal() {
  if (!isAdminProfile()) {
    toast("Chỉ Admin được phép Nạp lịch Google Calendar.", "error");
    return;
  }

  const modal = els.googleCalendarImportModal;
  if (!modal) {
    toast("Không tìm thấy cửa sổ Nạp lịch. Vui lòng tải lại trang.", "error");
    return;
  }

  // Đưa modal trực tiếp vào body để tránh bị che/chặn bởi menu, transform,
  // overflow hoặc stacking context trên Safari iOS và Chrome Android.
  if (modal.parentNode !== document.body) document.body.appendChild(modal);

  if (els.googleCalendarRangeMode) els.googleCalendarRangeMode.value = "month";
  syncGoogleCalendarRangeUI();
  setMobileTaskPanelMenuOpen(false);
  modal.classList.remove("hidden");
  document.body.classList.add("google-calendar-import-open");
  loadGoogleCalendarImportSettings().finally(() => {
    window.setTimeout(() => els.googleCalendarIdInput?.focus({ preventScroll: true }), 120);
  });
}

els.openGoogleCalendarImportBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  openGoogleCalendarImportModal();
});
els.openGoogleCalendarImportMobileBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setMobileTaskPanelMenuOpen(false);
  // Chờ menu hoàn tất ẩn trước khi mở modal, tránh Safari iOS giữ lớp bấm cũ.
  window.setTimeout(openGoogleCalendarImportModal, 0);
});
els.googleCalendarRangeMode?.addEventListener("change", syncGoogleCalendarRangeUI);
els.googleCalendarImportModal?.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-google-calendar-import], .google-calendar-import-backdrop")) {
    closeGoogleCalendarImportModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.googleCalendarImportModal?.classList.contains("hidden")) {
    closeGoogleCalendarImportModal();
  }
});

els.googleCalendarImportForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isAdminProfile()) {
    toast("Chỉ Admin được phép Nạp lịch Google Calendar.", "error");
    return;
  }

  const calendarId = String(els.googleCalendarIdInput?.value || "").trim();
  const apiKey = String(els.googleCalendarApiKeyInput?.value || "").trim();
  const mode = els.googleCalendarRangeMode?.value || "month";
  const range = getGoogleCalendarSuggestedRange(mode);

  // Có thể để trống khi Cloud Function đã lưu cấu hình từ lần trước.
  // Nếu nhập giá trị mới, Cloud Function sẽ cập nhật cấu hình mới nhất trong Firestore.
  if (!range.from || !range.to || range.from > range.to) {
    toast("Khoảng ngày nạp lịch không hợp lệ.", "error");
    return;
  }

  setButtonLoading(els.syncGoogleCalendarBtn, true, "Đang nạp lịch...");
  try {
    const response = await importGoogleCalendarEventsCallable({
      calendarId,
      apiKey,
      fromDate: range.from,
      toDate: range.to,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh"
    });
    const result = response?.data || {};
    closeGoogleCalendarImportModal();
    toast(
      `Nạp lịch hoàn tất: ${Number(result.created || 0)} Phiếu mới, ${Number(result.updated || 0)} Phiếu cập nhật, ${Number(result.cancelled || 0)} Phiếu được đánh dấu khách hủy, ${Number(result.skipped || 0)} sự kiện bỏ qua.`,
      "success",
      8500
    );
  } catch (error) {
    console.error("Google Calendar import failed:", error);
    const message = String(error?.message || "Không thể nạp Google Calendar.")
      .replace(/^FirebaseError:\s*/i, "");
    toast(message, "error", 9000);
  } finally {
    // Không giữ API Key trong DOM sau khi yêu cầu kết thúc.
    if (els.googleCalendarApiKeyInput) els.googleCalendarApiKeyInput.value = "";
    setButtonLoading(els.syncGoogleCalendarBtn, false);
  }
});
