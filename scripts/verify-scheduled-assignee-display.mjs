import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appSource = readFileSync(resolve(projectRoot, "app.js"), "utf8");
const functionsSource = readFileSync(resolve(projectRoot, "functions/index.js"), "utf8");
const pageSource = readFileSync(resolve(projectRoot, "index.html"), "utf8");

const functionStart = appSource.indexOf("function renderScheduledWorkOrderAssigneeBadge(");
const listStart = appSource.indexOf("function renderScheduledWorkOrderList(");
assert.ok(functionStart >= 0 && listStart > functionStart);
const helperSource = appSource.slice(functionStart, listStart);
const renderBadge = new Function("escapeHtml", `${helperSource}; return renderScheduledWorkOrderAssigneeBadge;`)(
  (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
);

assert.equal(renderBadge({ status: "assigned", assignedToName: "Nguyễn Văn A" }),
  '<span class="scheduled-work-order-assignee-badge">Nhân viên: Nguyễn Văn A</span>');
assert.equal(renderBadge({ status: "pending", assignedToName: "Nguyễn Văn A" }), "");
assert.equal(renderBadge({ status: "assigned", hotelDelivered: true, assignedToName: "Nguyễn Văn A" }), "");
assert.equal(renderBadge({ status: "assigned", assignedToName: "  " }), "");
assert.equal(renderBadge({ status: "converted", assignedToNames: [] }), "");
assert.equal(renderBadge({ status: "converted", assignedToNames: ["An", "Bình"] }),
  '<span class="scheduled-work-order-assignee-badge">Nhân viên: An, Bình</span>');
assert.equal(renderBadge({ status: "converted", hotelDelivered: true, assignedToNames: ["An"] }), "");
assert.ok(renderBadge({ status: "assigned", assignedToName: "<script>" }).includes("&lt;script&gt;"));
assert.ok(renderBadge({ status: "converted", assignedToNames: ["<script>"] }).includes("&lt;script&gt;"));
assert.match(appSource.slice(listStart), /\$\{renderScheduledWorkOrderAssigneeBadge\(schedule\)\}/);
assert.match(functionsSource, /assignedToName: String\(item\.assignedToName \|\| ""\)\.trim\(\)\.slice\(0, 120\)/);
assert.match(functionsSource, /assignedToNames: item\.status === "converted"[\s\S]*?convertedAssignees\.get\(/);
assert.match(functionsSource, /transaction\.update\(scheduleRef, \{\s*status: "assigned",[\s\S]*?assignedToName: employeeName/);
assert.match(functionsSource, /exports\.getConvertedScheduledDraftLink = onCall\(/);
assert.match(functionsSource, /\.where\("convertedWorkOrderId", "==", workOrderId\)/);
assert.match(appSource, /getConvertedScheduledDraftLinkCallable\(\{ workOrderId: previousWorkOrderId \}\)/);
assert.match(appSource, /previousWorkOrderId !== "legacy" && !preserveConvertedWorkOrderId/);
assert.match(appSource, /const workOrderRef = preserveConvertedWorkOrderId\s*\? doc\(db, "workOrders", previousWorkOrderId\)/);
assert.match(pageSource, /\.scheduled-work-order-list-meta \.scheduled-work-order-assignee-badge/);

console.log("PASS | Tên nhân viên hiển thị an toàn trên lịch đã giao việc và lịch chuyển thành Phiếu Spa.");
