"use strict";

const crypto = require("node:crypto");

// Một lịch có thể được sửa/dời rồi tạo lại Phiếu. Mỗi lần tạo phải dùng mã
// Nghỉ trưa riêng để không ghi đè Phiếu đã phát sinh từ lần trước.
function scheduledLunchDocumentId(scheduleId, generatedAt, employeeUid) {
  const generation = `${Number(generatedAt?.seconds || 0)}:${Number(generatedAt?.nanoseconds || 0)}`;
  const generationHash = crypto.createHash("sha256").update(generation).digest("hex").slice(0, 12);
  const employeeHash = crypto.createHash("sha256").update(String(employeeUid)).digest("hex").slice(0, 18);
  return `scheduledGroupLunch_${String(scheduleId).slice(0, 100)}_${generationHash}_${employeeHash}`;
}

function employeesWithoutActiveScheduledLunch(employees, activeTasks, workOrderId) {
  const employeesAlreadyOnLunch = new Set(activeTasks
    .filter((task) => task.autoCreatedByScheduledGroupTimeout === true
      && task.sourceScheduledWorkOrderId === workOrderId
      && ["lunch_break", "overdue"].includes(task.status))
    .map((task) => String(task.assignedToUid || "")));
  return employees.filter((employee) => !employeesAlreadyOnLunch.has(String(employee.uid || "")));
}

module.exports = { scheduledLunchDocumentId, employeesWithoutActiveScheduledLunch };
