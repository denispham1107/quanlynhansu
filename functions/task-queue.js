"use strict";

const BLOCKING_STATUSES = new Set(["doing", "lunch_break", "hotel", "redo", "overdue"]);

function millis(value) {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function blocksQueue(task) {
  return Boolean(task?.assignedToUid) && BLOCKING_STATUSES.has(String(task.status || ""));
}

function compareQueueOrder(left, right) {
  const leftStart = millis(left.queueStartAt) || millis(left.dispatchedAt);
  const rightStart = millis(right.queueStartAt) || millis(right.dispatchedAt);
  if (leftStart !== rightStart) return leftStart - rightStart;
  const dispatchDifference = millis(left.dispatchedAt) - millis(right.dispatchedAt);
  if (dispatchDifference) return dispatchDifference;
  const rowDifference = Number(left.rowIndex || 0) - Number(right.rowIndex || 0);
  return rowDifference || String(left.id || "").localeCompare(String(right.id || ""));
}

function planTaskQueue(tasks, nowMs, releasedTask = null) {
  const ordered = tasks.filter(blocksQueue).sort(compareQueueOrder);
  const updates = [];
  if (!ordered.length) return updates;

  const first = ordered[0];
  const firstStart = millis(first.queueStartAt) || millis(first.dispatchedAt);
  const releasedBeforeFirst = releasedTask && blocksQueue(releasedTask)
    && compareQueueOrder(releasedTask, first) < 0;
  const restartFirst = releasedBeforeFirst || !firstStart || firstStart > nowMs;
  let cursor = restartFirst
    ? nowMs
    : (millis(first.deadlineAt) || firstStart + Number(first.deadlineMinutes || 0) * 60000);
  const firstOverdueAndUnfinished = !restartFirst && cursor <= nowMs;

  ordered.forEach((task, index) => {
    if (index === 0 && !restartFirst) return;
    // Hạn của việc trước đã qua nhưng nhân viên chưa hoàn thành: thời điểm bắt đầu
    // việc sau chưa thể biết, nên không cho đồng hồ việc sau chạy tiếp.
    if (index > 0 && firstOverdueAndUnfinished) return;
    const minutes = Number(task.deadlineMinutes || 0);
    if (!(minutes > 0)) return;
    const start = cursor;
    const end = start + Math.round(minutes * 60000);
    cursor = end;
    if (Math.abs(millis(task.queueStartAt) - start) < 1000
      && Math.abs(millis(task.deadlineAt) - end) < 1000) return;
    updates.push({ id: task.id, start, end });
  });
  return updates;
}

module.exports = { blocksQueue, compareQueueOrder, planTaskQueue };
