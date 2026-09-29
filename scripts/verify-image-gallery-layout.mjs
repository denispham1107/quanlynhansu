import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browserPath = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].find(existsSync);
if (!browserPath) throw new Error("Không tìm thấy Chrome hoặc Edge.");
const profiles = [[320, 700], [375, 812], [390, 844], [430, 932], [844, 390], [932, 430], [1600, 900]];
const port = 20000 + Math.floor(Math.random() * 20000);
const profileDir = mkdtempSync(join(tmpdir(), "quanlynhansu-gallery-layout-"));
const browser = spawn(browserPath, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--allow-file-access-from-files", `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`, "about:blank"
], { stdio: "ignore" });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let socket;
try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) { ready = true; break; }
    } catch { /* Browser is starting. */ }
    await delay(100);
  }
  if (!ready) throw new Error("Không kết nối được Chrome DevTools.");
  const url = pathToFileURL(join(root, "index.html")).href;
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const target = await response.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const call = pending.get(message.id);
    if (!call) return;
    pending.delete(message.id);
    if (message.error) call.reject(new Error(message.error.message));
    else call.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((done, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve: done, reject });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["*app.js*", "*firebase*", "*jszip*"] });
  await send("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    platform: "iPhone"
  });
  await send("Page.navigate", { url });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
    if (result.result.value === "complete") break;
    await delay(100);
  }
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: 1600, screenHeight: 900
  });
  const menuCheck = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    document.getElementById("appView").classList.remove("hidden");
    document.getElementById("adminView").classList.remove("hidden");
    for (const id of ["openScheduledWorkOrderBtn", "openGoogleCalendarImportBtn", "openImageGalleryBtn", "openWorkOrderSettingsBtn"]) document.getElementById(id).classList.remove("hidden");
    const ids = ["openGoogleCalendarImportBtn", "openImageGalleryBtn", "openWorkOrderSettingsBtn"];
    const buttons = ids.map((id) => document.getElementById(id));
    const boxes = buttons.map((button) => button.getBoundingClientRect());
    return { order: buttons.every((button,index) => index === 0 || Boolean(buttons[index-1].compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)),
      tops: boxes.map((box) => box.top), widths: boxes.map((box) => box.width),
      sameRow: boxes.every((box) => Math.abs(box.top - boxes[0].top) <= 1.5),
      separated: boxes[0].right <= boxes[1].left && boxes[1].right <= boxes[2].left,
      inside: boxes[2].right <= innerWidth };
  })()` });
  const menu = menuCheck.result.value;
  const menuPassed = menu.order && menu.sameRow && menu.separated && menu.inside;
  console.log(`${menuPassed ? "PASS" : "FAIL"} | Desktop Hình ảnh giữa Nạp lịch và Cài đặt | ${JSON.stringify(menu)}`);
  if (!menuPassed) process.exitCode = 1;
  const desktopActionsCheck = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    const ids = ["deleteAllWorkOrdersBtn", "openScheduledWorkOrderBtn", "openGoogleCalendarImportBtn", "openImageGalleryBtn", "openWorkOrderSettingsBtn"];
    const buttons = ids.map((id) => document.getElementById(id));
    const boxes = buttons.map((button) => button.getBoundingClientRect());
    const icon = document.querySelector("#openImageGalleryBtn .image-gallery-icon svg");
    const iconBox = icon.getBoundingClientRect();
    return { heights:boxes.map((box)=>box.height), tops:boxes.map((box)=>box.top),
      allVisible:buttons.every((button)=>getComputedStyle(button).display!=="none"),
      iconInside:iconBox.left>=boxes[3].left && iconBox.right<=boxes[3].right && iconBox.top>=boxes[3].top && iconBox.bottom<=boxes[3].bottom,
      pageWidth:document.documentElement.scrollWidth };
  })()` });
  const desktopActions = desktopActionsCheck.result.value;
  const desktopActionsPassed = desktopActions.allVisible && desktopActions.iconInside
    && Math.max(...desktopActions.heights) - Math.min(...desktopActions.heights) <= 1
    && Math.max(...desktopActions.tops) - Math.min(...desktopActions.tops) <= 1.5
    && desktopActions.pageWidth <= 1600;
  console.log(`${desktopActionsPassed ? "PASS" : "FAIL"} | Nút thao tác desktop đều chiều cao, icon Hình ảnh nằm trong nút | ${JSON.stringify(desktopActions)}`);
  if (!desktopActionsPassed) process.exitCode = 1;
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  const filterColorsCheck = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    const select = document.getElementById("adminDateMode");
    const option = select.querySelector("option");
    return {
      scheme: getComputedStyle(select).colorScheme,
      background: getComputedStyle(option).backgroundColor,
      foreground: getComputedStyle(option).color
    };
  })()` });
  const filterColors = filterColorsCheck.result.value;
  const filterColorsPassed = filterColors.scheme.includes("light")
    && filterColors.background === "rgb(255, 255, 255)"
    && filterColors.foreground === "rgb(15, 23, 42)";
  console.log(`${filterColorsPassed ? "PASS" : "FAIL"} | Menu lọc sáng trong chế độ tối | ${JSON.stringify(filterColors)}`);
  if (!filterColorsPassed) process.exitCode = 1;
  await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    const summary = document.getElementById("adminEmployeeStatusSummary");
    summary.classList.remove("hidden");
    summary.innerHTML = ["free", "assigned", "hotel", "ship", "lunch", "off"].map((type) =>
      '<button class="employee-status-card is-' + type + '" type="button"><strong><span class="employee-status-short-label">'
      + (type === "off" ? "Đang Off" : "Trạng thái nhân viên") + '</span><span class="employee-status-count">'
      + (type === "off" ? "9" : "…") + '</span></strong><div class="employee-status-names">'
      + (type === "off" ? '<span class="employee-status-chip">Ngọc</span>' : '<span class="employee-status-empty">Đang đồng bộ...</span>')
      + '</div></button>').join("");
  })()` });
  for (const [width, height] of profiles) {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: width < 1025 ? 3 : 1,
      mobile: width < 1025, screenWidth: width, screenHeight: height
    });
    const adminFilterCheck = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const root = document.getElementById("adminMobileFilterModalRoot");
      const sheet = document.getElementById("adminMobileFilterSheet");
      root.classList.toggle("is-open", innerWidth <= 768);
      sheet.classList.toggle("is-open", innerWidth <= 768);
      const parent = sheet.getBoundingClientRect();
      const ids = ["adminStatusFilter", "adminEmployeeFilter", "adminDateMode"];
      const boxes = ids.map((id) => document.getElementById(id).getBoundingClientRect());
      const inside = boxes.every((box) => box.left >= parent.left - 1 && box.right <= parent.right + 1);
      const overlap = boxes.some((a, i) => boxes.some((b, j) => j > i
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
        && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1));
      const summary = document.getElementById("adminEmployeeStatusSummary").getBoundingClientRect();
      const cards = [...document.querySelectorAll("#adminEmployeeStatusSummary > .employee-status-card")]
        .map((card) => card.getBoundingClientRect());
      const cardsInside = cards.length === 6 && cards.every((card) => card.left >= summary.left - 1 && card.right <= summary.right + 1);
      const cardsOverlap = cards.some((a, i) => cards.some((b, j) => j > i
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
        && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1));
      return { inside, overlap, cardsInside, cardsOverlap, scrollWidth: document.documentElement.scrollWidth };
    })()` });
    const result = adminFilterCheck.result.value;
    const passed = result.inside && !result.overlap && result.cardsInside && !result.cardsOverlap
      && result.scrollWidth <= width;
    console.log(`${passed ? "PASS" : "FAIL"} | Bộ lọc công việc ${width}x${height} | ${JSON.stringify(result)}`);
    if (!passed) process.exitCode = 1;
    if (width <= 768) {
      const actionCheck = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
        document.getElementById("adminMobileFilterModalRoot").classList.remove("is-open");
        document.getElementById("adminMobileFilterSheet").classList.remove("is-open");
        const menu = document.getElementById("mobileTaskPanelMenu");
        menu.classList.add("is-open");
        document.getElementById("openGoogleCalendarImportMobileBtn").classList.remove("hidden");
        const panel = menu.getBoundingClientRect();
        const ids = ["deleteAllWorkOrdersBtn", "openScheduledWorkOrderBtn", "openGoogleCalendarImportMobileBtn", "openImageGalleryBtn", "openWorkOrderSettingsBtn"];
        const buttons = ids.map((id) => document.getElementById(id));
        const boxes = buttons.map((button) => button.getBoundingClientRect());
        const icon = document.querySelector("#openImageGalleryBtn .image-gallery-icon svg").getBoundingClientRect();
        return { visible:buttons.every((button)=>getComputedStyle(button).display!=="none"),
          inside:boxes.every((box)=>box.left>=panel.left-1 && box.right<=panel.right+1),
          ordered:boxes.every((box,index)=>index===0 || boxes[index-1].bottom<=box.top),
          iconInside:icon.left>=boxes[3].left && icon.right<=boxes[3].right && icon.top>=boxes[3].top && icon.bottom<=boxes[3].bottom,
          pageWidth:document.documentElement.scrollWidth };
      })()` });
      const actions = actionCheck.result.value;
      const actionPassed = actions.visible && actions.inside && actions.ordered && actions.iconInside && actions.pageWidth <= width;
      console.log(`${actionPassed ? "PASS" : "FAIL"} | Menu nút & icon ${width}x${height} | ${JSON.stringify(actions)}`);
      if (!actionPassed) process.exitCode = 1;
    }
  }
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844
  });
  const mobileMenuCheck = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    const menu = document.getElementById("mobileTaskPanelMenu");
    menu.classList.add("is-open");
    document.getElementById("openGoogleCalendarImportMobileBtn").classList.remove("hidden");
    const ids = ["openGoogleCalendarImportMobileBtn", "openImageGalleryBtn", "openWorkOrderSettingsBtn"];
    const buttons = ids.map((id) => document.getElementById(id));
    const boxes = buttons.map((button) => button.getBoundingClientRect());
    const panel = menu.getBoundingClientRect();
    return { visible:buttons.every((button)=>getComputedStyle(button).display !== "none"),
      order:boxes[0].top < boxes[1].top && boxes[1].top < boxes[2].top,
      inside:boxes.every((box)=>box.left >= panel.left - 1 && box.right <= panel.right + 1),
      pageWidth:document.documentElement.scrollWidth };
  })()` });
  const mobileMenu = mobileMenuCheck.result.value;
  const mobileMenuPassed = mobileMenu.visible && mobileMenu.order && mobileMenu.inside && mobileMenu.pageWidth <= 390;
  console.log(`${mobileMenuPassed ? "PASS" : "FAIL"} | Mobile Nạp lịch → Hình ảnh → Cài đặt | ${JSON.stringify(mobileMenu)}`);
  if (!mobileMenuPassed) process.exitCode = 1;
  const defaultDateMode = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: 'document.getElementById("imageGalleryDateMode").value'
  });
  const defaultDatePassed = defaultDateMode.result.value === "today";
  console.log(`${defaultDatePassed ? "PASS" : "FAIL"} | Mở Hình ảnh mặc định Hôm nay`);
  if (!defaultDatePassed) process.exitCode = 1;
  await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    document.getElementById("appView").classList.remove("hidden");
    document.getElementById("adminView").classList.add("hidden");
    document.getElementById("imageGalleryView").classList.remove("hidden");
    for (const id of ["imageGalleryDateFromField", "imageGalleryDateToField"]) document.getElementById(id).classList.remove("hidden");
    const card = '<article class="image-gallery-card"><button class="image-gallery-card-open" type="button">'
      + '<img alt="Ảnh kiểm tra" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" />'
      + '<span class="image-gallery-card-info"><strong>Ảnh báo cáo · Tên hình rất dài</strong>'
      + '<span>Người đăng: Nhân viên có tên rất dài</span><span>Công việc: Dọn dẹp vệ sinh khu vực chó mèo</span>'
      + '<span>Phiếu: Phiếu công việc cho khu vực khách sạn</span><span>Đăng lúc: 29/09/2026</span></span>'
      + '</button><label class="image-gallery-card-select"><input type="checkbox" /><span>Chọn</span></label></article>';
    document.getElementById("imageGalleryGrid").innerHTML = card.repeat(4);
  })()` });
  const failures = [];
  for (const [width, height] of profiles) {
    await send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: width < 1025 ? 3 : 1,
      mobile: width < 1025, screenWidth: width, screenHeight: height
    });
    await delay(90);
    const measured = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const box = (element) => {
        const r = element.getBoundingClientRect();
        return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
      };
      const within = (child, parent) => child.left >= parent.left - 1 && child.right <= parent.right + 1;
      const panel = box(document.querySelector(".image-gallery-panel"));
      const shells = [...document.querySelectorAll(".image-gallery-filter-field:not(.hidden) .image-gallery-native-shell")].map(box);
      const controls = [...document.querySelectorAll(".image-gallery-filter-field:not(.hidden) select, .image-gallery-filter-field:not(.hidden) input")].map(box);
      const cards = [...document.querySelectorAll(".image-gallery-card")].map(box);
      const selections = [...document.querySelectorAll(".image-gallery-card-select")].map(box);
      const actions = [...document.querySelectorAll(".image-gallery-actions .btn")].map(box);
      const downloadButton = box(document.getElementById("imageGalleryDownloadBtn"));
      const downloadIcon = box(document.querySelector("#imageGalleryDownloadBtn .image-gallery-download-icon svg"));
      const toolbar = box(document.querySelector(".image-gallery-toolbar"));
      const overlap = shells.some((a,i) => shells.some((b,j) => j>i && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1 && Math.min(a.right,b.right)-Math.max(a.left,b.left)>1));
      const actionsOverlap = actions.some((a,i) => actions.some((b,j) => j>i && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1 && Math.min(a.right,b.right)-Math.max(a.left,b.left)>1));
      return {
        viewport:document.documentElement.clientWidth, scrollWidth:document.documentElement.scrollWidth,
        panel, shells, controls, cards, selections, actions, toolbar, overlap, actionsOverlap,
        shellsInside:shells.every((item)=>within(item,panel)),
        controlsInside:controls.every((item,i)=>within(item,shells[i])),
        cardsInside:cards.every((item)=>within(item,panel)),
        selectionsInside:selections.every((item,i)=>within(item,cards[i])),
        actionsInside:actions.every((item)=>within(item,toolbar)),
        downloadIconInside:within(downloadIcon,downloadButton) && downloadIcon.top>=downloadButton.top-1 && downloadIcon.bottom<=downloadButton.bottom+1
      };
    })()` });
    const result = measured.result.value;
    const pass = result.scrollWidth <= width && result.shells.length === 5
      && result.controlsInside && result.shellsInside && !result.overlap
      && result.cardsInside && result.selectionsInside && result.actionsInside
      && result.actions.length === 4 && !result.actionsOverlap && result.downloadIconInside;
    console.log(`${pass ? "PASS" : "FAIL"} | ${width}x${height} | scroll ${result.scrollWidth}/${width}`);
    if (!pass) failures.push({ width, height, result });
  }
  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
} finally {
  socket?.close();
  browser.kill();
  await Promise.race([new Promise((done) => browser.once("exit", done)), delay(1500)]);
  const resolved = resolve(profileDir);
  if (resolved.startsWith(resolve(tmpdir()) + sep)) {
    try { rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
    catch { /* Browser may still be releasing cache files. */ }
  }
}
