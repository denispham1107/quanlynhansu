import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "app.js"), "utf8");
const settings = source.match(/const PHOTO_UPLOAD_MAX_DIMENSION = \d+;\s*const PHOTO_UPLOAD_JPEG_QUALITY = [\d.]+;\s*const PHOTO_UPLOAD_MIN_OPTIMIZE_BYTES = \d+ \* 1024;/)?.[0];
const functionStart = source.indexOf("async function optimizePhotoFileForUpload(file) {");
const functionEnd = source.indexOf("\nfunction getOptimizationSummary(", functionStart);
assert.ok(settings && functionStart >= 0 && functionEnd > functionStart);

const drawn = [];
let encodedSize = 300 * 1024;
let encodedQuality = 0;
const context = vm.createContext({
  document: {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            fillStyle: "",
            fillRect() {},
            drawImage(_image, _x, _y, width, height) { drawn.push([width, height]); }
          };
        }
      };
    }
  },
  loadImageElementFromFile: async () => ({ naturalWidth: 4000, naturalHeight: 3000 }),
  canvasToBlob: async (_canvas, _type, quality) => {
    encodedQuality = quality;
    return { size: encodedSize };
  },
  getOptimizedImageFileName: (name) => `${name}.jpg`,
  File: class {
    constructor(parts, name, options) {
      this.size = parts[0].size;
      this.name = name;
      this.type = options.type;
    }
  }
});
vm.runInContext(`${settings}\n${source.slice(functionStart, functionEnd)}`, context);

const original = { name: "photo.png", type: "image/png", size: 1000 * 1024 };
const optimized = await context.optimizePhotoFileForUpload(original);
assert.equal(optimized.optimized, true);
assert.equal(optimized.file.size, 300 * 1024);
assert.equal(optimized.width, 1280);
assert.equal(optimized.height, 960);
assert.equal(encodedQuality, 0.72);
assert.deepEqual(drawn, [[1280, 960]]);

encodedSize = original.size;
const unchanged = await context.optimizePhotoFileForUpload(original);
assert.equal(unchanged.optimized, false);
assert.equal(unchanged.file, original);

const small = { name: "small.jpg", type: "image/jpeg", size: 199 * 1024 };
const skipped = await context.optimizePhotoFileForUpload(small);
assert.equal(skipped.file, small);
assert.equal(skipped.optimized, false);

const animated = { name: "animated.gif", type: "image/gif", size: 1000 * 1024 };
const preserved = await context.optimizePhotoFileForUpload(animated);
assert.equal(preserved.file, animated);
assert.equal(preserved.optimized, false);

console.log("PASS | Ảnh lớn được thu nhỏ và nén mạnh hơn; bản gốc được giữ khi nén không hiệu quả hoặc không phù hợp.");
