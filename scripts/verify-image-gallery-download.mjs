import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "app.js"), "utf8");
const start = source.indexOf("async function downloadSelectedImageGalleryPhotos() {");
const end = source.indexOf("\nels.openImageGalleryBtn?.addEventListener", start);
assert.ok(start >= 0 && end > start, "Không tìm thấy hàm tải ảnh thư viện");
const functionSource = source.slice(start, end);
const label = { textContent: "Tải" };
const attributes = new Map();
const button = {
  querySelector(selector) { return selector === ".image-gallery-download-label" ? label : null; },
  setAttribute(name, value) { attributes.set(name, value); },
  removeAttribute(name) { attributes.delete(name); }
};
const entries = [
  { key: "visible", photo: { name: "a.jpg" } },
  { key: "hidden-by-filter", photo: { name: "b.jpg" } },
  { key: "not-selected", photo: { name: "c.jpg" } }
];
const state = { imageGalleryDeleting: false, imageGalleryDownloading: false, imageGallerySelectedKeys: new Set(["visible", "hidden-by-filter"]) };
let zipCall;
let downloaded;
const notices = [];
const context = vm.createContext({
  state,
  els: { imageGalleryDownloadBtn: button },
  isAdminProfile: () => true,
  getImageGalleryEntries: () => entries,
  renderImageGalleryIfOpen() {},
  async createPhotoReportZipBlob(task, photos, onProgress, zipBaseName) {
    zipCall = { task, photos, zipBaseName };
    onProgress("Đang tạo ZIP...");
    return { zipBlob: { size: 123 }, fileName: "hinh-anh-da-chon.zip", successCount: 2, totalCount: 2, failedPhotos: [] };
  },
  downloadBlobFile(blob, fileName) { downloaded = { blob, fileName }; },
  toast(message, type) { notices.push({ message, type }); },
  console
});
vm.runInContext(functionSource, context);
await context.downloadSelectedImageGalleryPhotos();
assert.deepEqual(zipCall.photos.map((photo) => photo.name), ["a.jpg", "b.jpg"]);
assert.equal(zipCall.zipBaseName, "hinh-anh-da-chon");
assert.equal(downloaded.fileName, "hinh-anh-da-chon.zip");
assert.equal(notices.at(-1).type, "success");
assert.equal(state.imageGalleryDownloading, false);
assert.equal(label.textContent, "Tải");
assert.equal(attributes.has("aria-busy"), false);

state.imageGallerySelectedKeys.clear();
zipCall = null;
await context.downloadSelectedImageGalleryPhotos();
assert.equal(zipCall, null);
assert.equal(notices.at(-1).type, "error");

console.log("PASS | Tải ZIP gồm mọi ảnh đã chọn kể cả ngoài bộ lọc hiện tại, không tải khi chưa chọn ảnh.");
