"use strict";

const assert = require("node:assert/strict");
const {
  storagePathFromGalleryPhoto,
  galleryPhotoKey,
  isAllowedGalleryPhotoPath,
  isPhotoMetadataOnlyUpdate,
  photoWasRemoved,
  reportPhotosChanged,
  taskPhotoUpdateAction
} = require("./gallery-photo-delete");

const bucket = "quanlynhansu-6e63b.firebasestorage.app";
const reportPath = "task-photos/task-123/photo.jpg";
const workPath = "task-work-photos/admin-1/row-99/photo.jpg";
assert.equal(storagePathFromGalleryPhoto({ storagePath: reportPath }, bucket), reportPath);
assert.equal(storagePathFromGalleryPhoto({
  url: `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(reportPath)}?alt=media`
}, bucket), reportPath);
assert.equal(storagePathFromGalleryPhoto({
  url: `https://firebasestorage.googleapis.com/v0/b/other-bucket/o/${encodeURIComponent(reportPath)}`
}, bucket), "");
assert.equal(galleryPhotoKey({ id: "photo-id", storagePath: reportPath }, bucket), "photo-id");
assert.equal(isAllowedGalleryPhotoPath(reportPath, "task-123", "report"), true);
assert.equal(isAllowedGalleryPhotoPath(reportPath, "task-456", "report"), false);
assert.equal(isAllowedGalleryPhotoPath(workPath, "task-123", "work"), true);
assert.equal(isAllowedGalleryPhotoPath("task-work-photos/admin/../secret/file.jpg", "task-123", "work"), false);
assert.equal(isAllowedGalleryPhotoPath("chat-media/secret.jpg", "task-123", "work"), false);
const completedTask = {
  status: "completed", isHotel: true, deadlineMinutes: 45,
  photos: [{ id: "photo-1" }, { id: "photo-2" }], photoCount: 2,
  workPhotos: [{ id: "work-1" }], workPhotoCount: 1
};
const afterReportDeletion = {
  ...completedTask, photos: [{ id: "photo-2" }], photoCount: 1
};
assert.equal(isPhotoMetadataOnlyUpdate(completedTask, afterReportDeletion), true);
assert.equal(photoWasRemoved(completedTask, afterReportDeletion), true);
assert.equal(reportPhotosChanged(completedTask, afterReportDeletion), true);
assert.equal(taskPhotoUpdateAction(completedTask, afterReportDeletion), "count_only");
assert.equal(isPhotoMetadataOnlyUpdate(completedTask, {
  ...afterReportDeletion, status: "submitted"
}), false);
assert.equal(taskPhotoUpdateAction(completedTask, {
  ...afterReportDeletion, status: "submitted"
}), "normal");
assert.equal(isPhotoMetadataOnlyUpdate(completedTask, {
  ...completedTask, workPhotos: [], workPhotoCount: 0
}), true);
assert.equal(photoWasRemoved(completedTask, {
  ...completedTask, photos: [...completedTask.photos, { id: "photo-3" }], photoCount: 3
}), false);
assert.equal(reportPhotosChanged(completedTask, {
  ...completedTask, workPhotos: [], workPhotoCount: 0
}), false);
assert.equal(taskPhotoUpdateAction(completedTask, {
  ...completedTask, workPhotos: [], workPhotoCount: 0
}), "skip");
assert.equal(taskPhotoUpdateAction(completedTask, {
  ...completedTask, photos: [...completedTask.photos, { id: "photo-3" }], photoCount: 3
}), "reconcile_photos");
console.log("PASS | Chỉ đường dẫn ảnh thuộc loại hợp lệ và đúng Firebase bucket mới được xóa.");
console.log("PASS | Cập nhật/xóa ảnh không bị nhận nhầm là thay đổi trạng thái hoặc thời gian Phiếu.");
