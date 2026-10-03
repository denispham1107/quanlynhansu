"use strict";

const assert = require("node:assert/strict");
const { planTaskQueue } = require("./task-queue");

const minute = 60000;
const now = 100 * minute;
const first = {
  id: "CV1", assignedToUid: "AI", status: "doing", rowIndex: 0,
  dispatchedAt: 90 * minute, queueStartAt: 90 * minute,
  deadlineAt: 97 * minute, deadlineMinutes: 7
};
const second = {
  id: "CV2", assignedToUid: "AI", status: "doing", rowIndex: 1,
  dispatchedAt: 90 * minute, queueStartAt: 96 * minute,
  deadlineAt: 101 * minute, deadlineMinutes: 5
};
const third = {
  id: "CV3", assignedToUid: "AI", status: "doing", rowIndex: 2,
  dispatchedAt: 90 * minute, queueStartAt: 101 * minute,
  deadlineAt: 106 * minute, deadlineMinutes: 5
};

// CV1 đã quá hạn nhưng chưa xong: không cho CV2/CV3 chạy hoặc tự gia hạn đồng hồ.
assert.deepEqual(planTaskQueue([first, second, third], now), []);

// Admin thêm giờ CV1: cả hai việc phía sau dời theo đúng thời lượng mới.
const extended = { ...first, deadlineAt: 103 * minute, deadlineMinutes: 13 };
assert.deepEqual(planTaskQueue([extended, second, third], now), [
  { id: "CV2", start: 103 * minute, end: 108 * minute },
  { id: "CV3", start: 108 * minute, end: 113 * minute }
]);

// CV1 hoàn thành muộn: CV2 chỉ bắt đầu lúc hoàn thành và nhận đủ 5 phút.
assert.deepEqual(planTaskQueue([second, third], now, extended), [
  { id: "CV2", start: now, end: 105 * minute },
  { id: "CV3", start: 105 * minute, end: 110 * minute }
]);

// Duyệt CV1 sau khi đã báo hoàn thành không được khởi động lại CV2.
const runningSecond = { ...second, queueStartAt: now, deadlineAt: 105 * minute };
assert.deepEqual(planTaskQueue([runningSecond, { ...third, queueStartAt: 105 * minute, deadlineAt: 110 * minute }], now + minute), []);

// Phiếu từ lịch dùng cùng các trường queueStartAt/rowIndex nên tuân theo cùng quy tắc.
const scheduled = [first, second, third].map((task) => ({
  ...task, workOrderId: "scheduled-work-order", sourceScheduleId: "schedule-1"
}));
assert.deepEqual(planTaskQueue(scheduled.slice(1), now, scheduled[0]), [
  { id: "CV2", start: now, end: 105 * minute },
  { id: "CV3", start: 105 * minute, end: 110 * minute }
]);

console.log("Task queue: extension, overdue, release and scheduled work order OK");
