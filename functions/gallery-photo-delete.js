"use strict";

function storagePathFromGalleryPhoto(photo, bucketName) {
  const direct = [photo?.storagePath, photo?.fullPath, photo?.path]
    .find((value) => typeof value === "string" && value.trim());
  if (direct) return direct.trim();

  try {
    const url = new URL(String(photo?.url || ""));
    if (url.hostname !== "firebasestorage.googleapis.com") return "";
    const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match || decodeURIComponent(match[1]) !== bucketName) return "";
    return decodeURIComponent(match[2]);
  } catch {
    return "";
  }
}

function galleryPhotoKey(photo, bucketName) {
  return String(photo?.id || storagePathFromGalleryPhoto(photo, bucketName) || photo?.url || "");
}

function isAllowedGalleryPhotoPath(path, taskId, kind) {
  if (!path || path.includes("..") || path.includes("\\") || path.startsWith("/")) return false;
  if (kind === "report") return path.startsWith(`task-photos/${taskId}/`)
    && path.length > `task-photos/${taskId}/`.length;
  if (kind === "work") return /^task-work-photos\/[^/]+\/[^/]+\/[^/]+$/.test(path);
  return false;
}

module.exports = { storagePathFromGalleryPhoto, galleryPhotoKey, isAllowedGalleryPhotoPath };
