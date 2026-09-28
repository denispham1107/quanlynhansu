"use strict";

const assert = require("node:assert/strict");
const {
  storagePathFromGalleryPhoto,
  galleryPhotoKey,
  isAllowedGalleryPhotoPath
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
console.log("PASS | Chỉ đường dẫn ảnh thuộc loại hợp lệ và đúng Firebase bucket mới được xóa.");
