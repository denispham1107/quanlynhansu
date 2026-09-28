"use strict";

const { isDeepStrictEqual } = require("node:util");

const PHOTO_METADATA_FIELDS = new Set([
  "photos", "photoCount", "lastPhotoUploadedAt",
  "workPhotos", "workPhotoCount", "lastWorkPhotoUploadedAt"
]);

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

function isPhotoMetadataOnlyUpdate(before, after) {
  if (!before || !after) return false;
  let photoMetadataChanged = false;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (isDeepStrictEqual(before[key], after[key])) continue;
    if (!PHOTO_METADATA_FIELDS.has(key)) return false;
    photoMetadataChanged = true;
  }
  return photoMetadataChanged;
}

function photoWasRemoved(before, after) {
  return (Array.isArray(before?.photos) ? before.photos.length : 0)
    > (Array.isArray(after?.photos) ? after.photos.length : 0);
}

function reportPhotosChanged(before, after) {
  return !isDeepStrictEqual(before?.photos || [], after?.photos || []);
}

function taskPhotoUpdateAction(before, after) {
  if (!isPhotoMetadataOnlyUpdate(before, after)) return "normal";
  if (before.isHotel === true && after.isHotel === true && reportPhotosChanged(before, after)) {
    return photoWasRemoved(before, after) ? "count_only" : "reconcile_photos";
  }
  return "skip";
}

module.exports = {
  storagePathFromGalleryPhoto,
  galleryPhotoKey,
  isAllowedGalleryPhotoPath,
  isPhotoMetadataOnlyUpdate,
  photoWasRemoved,
  reportPhotosChanged,
  taskPhotoUpdateAction
};
