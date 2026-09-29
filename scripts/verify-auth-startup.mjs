import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");

function sourceOf(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Thiếu hàm ${name}`);
  let parameters = 0;
  let opening = -1;
  for (let index = app.indexOf("(", start); index < app.length; index += 1) {
    if (app[index] === "(") parameters += 1;
    if (app[index] === ")") parameters -= 1;
    if (parameters === 0) { opening = app.indexOf("{", index); break; }
  }
  assert.ok(opening > start);
  let depth = 0;
  for (let index = opening; index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    if (app[index] === "}") depth -= 1;
    if (depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`${name} chưa đóng ngoặc`);
}

assert.ok(html.indexOf('id="startupView"') < html.indexOf('id="loginView"'));
assert.match(html, /id="loginView" class="login-view hidden"/);
assert.doesNotMatch(html, /<script[^>]+src="[^"]*jszip/i);
assert.match(app, /const cachedProfile = readStartupProfile\(user\.uid\)/);
assert.match(app, /const profileRequest = cachedProfile \? getDocFromServer\(profileRef\) : getDoc\(profileRef\)/);
assert.match(app, /if \(cachedProfile\) \{[\s\S]*?activateAuthenticatedDashboard\(cachedProfile\)/);
assert.match(app, /showStartup\("Không tải được hồ sơ\.[^\n]+true\)/);

const values = new Map();
const storage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); },
  removeItem(key) { values.delete(key); }
};
const profileContext = vm.createContext({
  localStorage: storage,
  STARTUP_PROFILE_CACHE_PREFIX: "test-profile:",
  STARTUP_PROFILE_MAX_AGE_MS: 86400000,
  SUPERVISOR_PERMISSION_KEYS: ["createWorkOrder"],
  Date,
  JSON
});
vm.runInContext([
  sourceOf("normalizeSupervisorPermissions"),
  sourceOf("readStartupProfile"),
  sourceOf("saveStartupProfile"),
  sourceOf("clearStartupProfile")
].join("\n"), profileContext);
vm.runInContext('saveStartupProfile("uid-1", { role: "admin", name: "Admin shop", email: "admin@shop.com" })', profileContext);
assert.equal(profileContext.readStartupProfile("uid-1").name, "Admin shop");
assert.equal(profileContext.readStartupProfile("uid-2"), null);
values.set("test-profile:uid-1", JSON.stringify({ uid: "uid-1", savedAt: Date.now() - 90000000, profile: { role: "admin" } }));
assert.equal(profileContext.readStartupProfile("uid-1"), null);
profileContext.clearStartupProfile("uid-1");
assert.equal(values.has("test-profile:uid-1"), false);

const calls = [];
const dashboardContext = vm.createContext({
  state: { profile: null, tasks: [], workOrders: [], employees: [], supervisors: [], staffAccounts: [] },
  activeDashboardRole: "",
  isManagementProfile: (profile) => profile.role === "admin" || profile.role === "supervisor",
  showApp: () => calls.push("show"),
  setupAdminDashboard: () => calls.push("admin"),
  setupEmployeeDashboard: () => calls.push("employee"),
  applyManagementPermissionUI: () => calls.push("permissions"),
  renderEmployeeEmploymentStatusBanner: () => calls.push("employee-status"),
  cleanupSubscriptions: () => calls.push("cleanup")
});
vm.runInContext(sourceOf("activateAuthenticatedDashboard"), dashboardContext);
dashboardContext.activateAuthenticatedDashboard({ role: "admin" });
dashboardContext.activateAuthenticatedDashboard({ role: "admin", name: "Updated" });
dashboardContext.activateAuthenticatedDashboard({ role: "employee" });
assert.deepEqual(calls, ["show", "admin", "show", "permissions", "cleanup", "show", "employee"]);

let appended = 0;
let currentScript;
const zipWindow = { JSZip: null, setTimeout: () => 1, clearTimeout() {} };
const zipContext = vm.createContext({
  window: zipWindow,
  document: {
    createElement() { return currentScript = { remove() {}, onload: null, onerror: null }; },
    head: { appendChild() { appended += 1; } }
  },
  jsZipLoadPromise: null,
  Promise,
  Error
});
vm.runInContext(sourceOf("loadJsZipWhenNeeded"), zipContext);
assert.equal(appended, 0, "ZIP không được tải ngay khi mở ứng dụng");
const zipPromise = zipContext.loadJsZipWhenNeeded();
assert.equal(appended, 1);
function FakeZip() {}
zipWindow.JSZip = FakeZip;
currentScript.onload();
assert.equal(await zipPromise, FakeZip);
assert.equal(await zipContext.loadJsZipWhenNeeded(), FakeZip);
assert.equal(appended, 1);
zipWindow.JSZip = null;
vm.runInContext("jsZipLoadPromise = null", zipContext);
const failedZip = zipContext.loadJsZipWhenNeeded();
currentScript.onerror();
await assert.rejects(failedZip, /Không tải được thư viện ZIP/);
const retriedZip = zipContext.loadJsZipWhenNeeded();
assert.equal(appended, 3, "Có thể thử tải ZIP lại sau lỗi mạng");
zipWindow.JSZip = FakeZip;
currentScript.onload();
assert.equal(await retriedZip, FakeZip);

console.log("PASS | Không hiện form đăng nhập khi khôi phục phiên; hồ sơ cache mở dashboard sớm, ZIP chỉ tải khi cần.");
