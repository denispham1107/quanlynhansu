/* Culao Task PWA + Web Push service worker */
const CACHE_NAME = "culao-task-shell-v20261002-task-status-repair-v147";
const APP_SHELL_NETWORK_TIMEOUT_MS = 1800;
const APP_SHELL_BACKGROUND_TIMEOUT_MS = 15000;
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js?v=20261002-task-status-repair-v147",
  "./styles.css"
];
const OPTIONAL_SHELL = [
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./notification-badge.png",
  "./task-review-alert-max.wav",
  "./scheduled-work-order-alert-max.wav"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        // Không kích hoạt phiên bản mới nếu HTML/JS/CSS cốt lõi chưa cache xong.
        // Ảnh/chuông là tùy chọn để một tệp lỗi không làm chậm cả bản cập nhật.
        await cache.addAll(APP_SHELL);
        await Promise.allSettled(OPTIONAL_SHELL.map((path) => cache.add(path)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const replacingOldApp = keys.some((key) => key.startsWith("culao-task-shell-") && key !== CACHE_NAME);
      await Promise.all(keys.filter((key) => key.startsWith("culao-task-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
      if (!replacingOldApp) return;

      // Trang cũ đang mở vẫn chạy JavaScript cũ dù service worker đã đổi.
      // Nạp lại mỗi tab cùng scope đúng một lần để nhận giao diện và luồng camera mới.
      const scope = new URL(self.registration.scope);
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.allSettled(windows.map(async (client) => {
        const url = new URL(client.url);
        if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
        url.searchParams.set("_appVersion", CACHE_NAME);
        await client.navigate(url.href);
      }));
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    // Firebase được ghim phiên bản. Cache các mô-đun đã tải thành công để lần
    // mở PWA sau không phải chờ CDN khi kết nối di động chập chờn.
    if (url.origin !== "https://www.gstatic.com" || !url.pathname.startsWith("/firebasejs/10.12.5/") || !url.pathname.endsWith(".js")) return;
    let cacheCopy = null;
    const responsePromise = (async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cacheCopy = response.clone();
      return response;
    })();
    event.respondWith(responsePromise);
    event.waitUntil(responsePromise.then(async () => {
      if (cacheCopy) await (await caches.open(CACHE_NAME)).put(event.request, cacheCopy);
    }).catch(() => undefined));
    return;
  }

  // Lần nạp lại bắt buộc phải lấy đúng HTML đã đóng gói cùng worker mới,
  // kể cả khi CDN còn trả bản HTML cũ trong ít phút đầu sau triển khai.
  if (event.request.mode === "navigate" && url.searchParams.get("_appVersion") === CACHE_NAME) {
    event.respondWith(caches.match("./index.html").then((cached) => cached || fetch(event.request)));
    return;
  }

  // Ưu tiên bản mới, nhưng không để mạng treo giữ trang trắng nhiều phút.
  // Khi có cache, giới hạn thời gian chờ và cập nhật cache ở nền.
  if (event.request.mode === "navigate" || /\.(?:js|html|css)$/.test(url.pathname)) {
    let backgroundUpdate = Promise.resolve();
    const responsePromise = (async () => {
      const cached = await caches.match(event.request)
        || (event.request.mode === "navigate" ? await caches.match("./index.html") : null);
      const controller = cached ? new AbortController() : null;
      const backgroundTimeoutId = controller
        ? setTimeout(() => controller.abort(), APP_SHELL_BACKGROUND_TIMEOUT_MS)
        : null;
      const network = fetch(event.request, controller ? { signal: controller.signal } : undefined)
        .then((response) => {
          const copy = response.ok ? response.clone() : null;
          const cacheUpdate = copy
            ? caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy))
              .catch(() => undefined)
            : Promise.resolve();
          return { response, cacheUpdate };
        })
        .catch(() => ({ response: null, cacheUpdate: Promise.resolve() }))
        .finally(() => {
          if (backgroundTimeoutId) clearTimeout(backgroundTimeoutId);
        });
      backgroundUpdate = network
        .then(({ cacheUpdate }) => cacheUpdate)
        .catch(() => undefined);
      if (!cached) return (await network).response || Response.error();

      let timeoutId;
      const first = await Promise.race([
        network,
        new Promise((resolve) => {
          timeoutId = setTimeout(() => resolve(null), APP_SHELL_NETWORK_TIMEOUT_MS);
        })
      ]);
      clearTimeout(timeoutId);
      if (first?.response?.ok) return first.response;
      return cached;
    })();
    event.waitUntil(responsePromise.then(() => backgroundUpdate).catch(() => undefined));
    event.respondWith(responsePromise);
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

function readPushPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json() || {};
  } catch (_) {
    try {
      return { data: { body: event.data.text() } };
    } catch (_) {
      return {};
    }
  }
}

self.addEventListener("push", (event) => {
  const payload = readPushPayload(event);
  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const notification = payload.notification && typeof payload.notification === "object"
    ? payload.notification
    : {};

  const title = data.title || notification.title || "Culao Task";
  const body = data.body || data.message || notification.body || "Bạn có thông báo mới.";
  const taskId = data.taskId || "";
  const chatConversationId = data.chatConversationId || "";
  const chatPartnerUid = data.chatPartnerUid || "";
  const notificationId = data.notificationId || "";
  const fallbackUrl = chatConversationId
    ? `./?chatId=${encodeURIComponent(chatConversationId)}&chatWith=${encodeURIComponent(chatPartnerUid)}&notificationId=${encodeURIComponent(notificationId)}`
    : taskId
      ? `./?taskId=${encodeURIComponent(taskId)}&notificationId=${encodeURIComponent(notificationId)}`
      : "./";
  const url = data.url || notification?.data?.url || fallbackUrl;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "./icon-192.png",
      badge: "./notification-badge.png",
      tag: notificationId || chatConversationId || taskId || `culao-task-${Date.now()}`,
      renotify: false,
      data: {
        url,
        taskId,
        chatConversationId,
        chatPartnerUid,
        notificationId
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "./";
  const absoluteUrl = new URL(targetUrl, self.registration.scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        const clientUrl = new URL(client.url);
        const target = new URL(absoluteUrl);
        if (clientUrl.origin === target.origin && clientUrl.pathname === target.pathname) {
          await client.focus();
          client.postMessage({
            type: "SHOP_TASK_PUSH_OPEN",
            taskId: event.notification?.data?.taskId || "",
            chatConversationId: event.notification?.data?.chatConversationId || "",
            chatPartnerUid: event.notification?.data?.chatPartnerUid || "",
            notificationId: event.notification?.data?.notificationId || ""
          });
          return;
        }
      }

      if (self.clients.openWindow) await self.clients.openWindow(absoluteUrl);
    })
  );
});
