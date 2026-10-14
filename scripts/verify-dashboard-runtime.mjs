import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const sdkNames = [...new Set([...app.matchAll(/import\s*\{([^}]+)\}\s*from\s*"https:\/\/www\.gstatic\.com[^"\n]+"/g)]
  .flatMap((match) => match[1].split(",").map((name) => name.trim().split(/\s+as\s+/)[0]).filter(Boolean)))];
const sdk = `
const test = window.__SDK_TEST__;
class TestTimestamp {
  constructor(date) { this.date = date; }
  toDate() { return this.date; }
  toMillis() { return this.date.getTime(); }
  static fromDate(date) { return new TestTimestamp(date); }
  static now() { return TestTimestamp.fromDate(new Date()); }
}
const now = TestTimestamp.now();
const day = new Date();
const dateKey = [day.getFullYear(), String(day.getMonth()+1).padStart(2,'0'), String(day.getDate()).padStart(2,'0')].join('-');
const documents = (values) => values.map((value) => ({ id: value.id, data: () => value, exists: () => true }));
const users = documents([
  { id: 'admin-test', uid: 'admin-test', role: 'admin', name: 'Admin test' },
  { id: 'employee-one', uid: 'employee-one', role: 'employee', employmentStatus: 'working', name: 'Nhân viên 1' },
  { id: 'employee-two', uid: 'employee-two', role: 'employee', employmentStatus: 'working', name: 'Nhân viên 2' }
]);
const completed = Array.from({ length: 22 }, (_, index) => ({ id: 'done-'+index, title: 'Công việc '+index,
  status: 'completed', approvedAt: now, createdAt: now, taskDate: dateKey,
  assignedToUid: 'employee-one', assignedToName: 'Nhân viên 1', workOrderId: 'order-'+index,
  workOrderName: 'Phiếu '+index, workOrderTaskCount: 1, deadlineMinutes: 30 }));
const active = { id: 'active', title: 'Việc còn đang làm từ hôm trước', status: 'doing', taskDate: '2020-01-01',
  assignedToUid: 'employee-two', assignedToName: 'Nhân viên 2', createdAt: now,
  deadlineAt: TestTimestamp.fromDate(new Date(Date.now()+300000)), deadlineMinutes: 30 };
const orders = documents(completed.map((task) => ({ id: task.workOrderId, name: task.workOrderName, status: 'dispatched', createdAt: now, taskCount: 1 })));
const snap = (docs, cache=false) => ({ docs, size: docs.length, empty: !docs.length,
  metadata: { fromCache: cache, hasPendingWrites: false }, docChanges: () => docs.map((doc) => ({ type: 'added', doc })) });
function dataFor(ref) {
  if (ref.name === 'users') return users;
  if (ref.name === 'tasks') {
    const status = ref.constraints?.find((value) => value.field === 'status');
    return documents(status ? [active] : completed);
  }
  if (ref.name === 'workOrders') return ref.constraints?.some((value) => value.field === 'status') ? [] : orders;
  return [];
}
const impl = {
  initializeApp: () => ({}), getApps: () => [], getApp: () => ({}), getAuth: () => ({}),
  onAuthStateChanged: (_auth, next) => { setTimeout(() => next({ uid: 'admin-test', email: 'admin@test.local' }), 20); return () => {}; },
  initializeFirestore: () => ({}), getFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
  collection: (_db, name) => ({ name }), doc: (_db, name, id) => ({ name, id }),
  query: (ref, ...constraints) => ({ ...ref, constraints: [...(ref.constraints || []), ...constraints] }),
  where: (field, op, value) => ({ field, op, value }), orderBy: (field) => ({ order: field }), limit: (value) => ({ limit: value }),
  onSnapshot: (ref, ...args) => {
    const next = args.find((value) => typeof value === 'function');
    let stopped = false;
    const isHeavy = ['tasks','workOrders'].includes(ref.name) && ref.constraints?.some((value) => value.order === 'createdAt')
      && !ref.constraints.some((value) => value.limit || value.field);
    const emit = (cache=false) => { if (!stopped && !isHeavy) next(ref.id ? { ...snap([],cache), exists: () => false } : snap(dataFor(ref),cache)); };
    test.callbacks.push(emit);
    if (test.warm) setTimeout(() => emit(true), 5);
    setTimeout(() => { if (!test.stalled || test.reconnects) emit(); }, 150);
    return () => { stopped = true; };
  },
  getDoc: async (ref) => ({ id: ref.id, exists: () => ref.name === 'users', data: () => ({ role: 'admin', name: 'Admin test' }) }),
  getDocFromServer: async (ref) => impl.getDoc(ref), getDocs: async (ref) => snap(dataFor(ref)), getDocsFromServer: async (ref) => snap(dataFor(ref)),
  disableNetwork: async () => {}, enableNetwork: async () => { test.reconnects += 1; test.callbacks.forEach((emit) => emit()); },
  Timestamp: TestTimestamp, serverTimestamp: () => TestTimestamp.now(),
  httpsCallable: () => async () => ({ data: {} }), isSupported: async () => false,
  writeBatch: () => ({ update() {}, delete() {}, set() {}, commit: async () => {} })
};
${sdkNames.map((name) => `export const ${name} = impl.${name} || (() => ({}));`).join("\n")}
`;
const server = createServer((request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === "/sdk.mjs") { response.setHeader("Content-Type", "text/javascript"); response.end(sdk); return; }
  if (path === "/sw.js") { response.writeHead(404); response.end(); return; }
  const file = path === "/" ? "index.html" : path.slice(1);
  if (file.includes("..") || !existsSync(join(root, file))) { response.writeHead(404); response.end(); return; }
  let content = readFileSync(join(root, file));
  if (file === "app.js") content = Buffer.from(content.toString().replace(/https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.5\/firebase-[a-z]+\.js/g, "/sdk.mjs"));
  if (file === "startup-sync.mjs") content = Buffer.from(content.toString().replace("timeoutMs = 8000", "timeoutMs = 500"));
  response.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : /\.(?:js|mjs)$/.test(file) ? "text/javascript" : "application/octet-stream");
  response.end(content);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/`;
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
assert.ok(chrome);
const profile = mkdtempSync(join(tmpdir(), "culao-runtime-"));
const port = 20000 + Math.floor(Math.random()*20000);
const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let socket;
try {
  let target;
  for (let index=0; index<50; index++) {
    try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json(); break; } catch { await delay(100); }
  }
  assert.ok(target);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener("open",done,{once:true}); socket.addEventListener("error",reject,{once:true}); });
  let id=0; const pending=new Map(); const errors=[];
  socket.addEventListener("message", (event) => { const message=JSON.parse(event.data); if(message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text); const call=pending.get(message.id); if(call) { pending.delete(message.id); message.error ? call.reject(message.error) : call.resolve(message.result); } });
  const send=(method,params={})=>new Promise((done,reject)=>{ pending.set(++id,{resolve:done,reject}); socket.send(JSON.stringify({id,method,params})); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:true});
  for (const scenario of [{name:"cold",warm:false,stalled:false},{name:"warm",warm:true,stalled:false},{name:"stalled",warm:false,stalled:true}]) {
    const initializer=await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__SDK_TEST__=${JSON.stringify({...scenario,callbacks:[],reconnects:0})}; localStorage.clear(); ${scenario.warm ? "localStorage.setItem('culao-startup-profile-v1:admin-test',JSON.stringify({uid:'admin-test',savedAt:Date.now(),profile:{role:'admin',name:'Admin test'}}));" : ""}` });
    const start=Date.now();
    await send("Page.navigate",{url});
    let measurement;
    for(let index=0;index<60;index++) {
      measurement=(await send("Runtime.evaluate",{expression:`({completed:document.getElementById('statCompleted')?.textContent,reconnects:window.__SDK_TEST__?.reconnects,loaded:!document.getElementById('appView')?.classList.contains('hidden')})`,returnByValue:true})).result.value;
      if(measurement?.completed==="22" && measurement.loaded) break;
      await delay(100);
    }
    assert.equal(measurement.completed,"22",`${scenario.name}: công việc hiện tại phải tải trước kho lịch sử bị treo; ${errors.join("; ")}`);
    assert.ok(Date.now()-start<4000,`${scenario.name}: màn hình chính chờ quá lâu`);
    if(scenario.stalled) assert.equal(measurement.reconnects,1);
    assert.deepEqual(errors, [], `${scenario.name}: lỗi khi khởi động ứng dụng`);
    console.log(`PASS | Runtime ${scenario.name} | dữ liệu chính ${Date.now()-start}ms; lịch sử lớn chưa trả về`);
    await send("Page.removeScriptToEvaluateOnNewDocument",{identifier:initializer.identifier});
  }
  const realSdk = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const f = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const app = initializeApp({projectId:'startup-runtime-test',apiKey:'test',appId:'test'}, 'startup-runtime-test');
    const db = f.initializeFirestore(app, {localCache:f.persistentLocalCache({tabManager:f.persistentMultipleTabManager()}),
      experimentalForceLongPolling:true,experimentalLongPollingOptions:{timeoutSeconds:10},useFetchStreams:false});
    await f.disableNetwork(db);
    const snapshot = await f.getDocsFromCache(f.collection(db,'startup-test'));
    await f.terminate(db);
    return {cacheReady:true,size:snapshot.size};
  })()` });
  assert.equal(realSdk.result.value?.cacheReady, true, JSON.stringify(realSdk.exceptionDetails));
  console.log("PASS | SDK Firebase thật khởi tạo cache IndexedDB và cấu hình kết nối iOS; không ghi dữ liệu máy chủ.");
} finally {
  socket?.close(); browser.kill(); server.close(); await delay(300);
  if(resolve(profile).startsWith(resolve(tmpdir())+"\\")) {
    try { rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100}); } catch {}
  }
}
