/* Culao Task PWA + Web Push service worker */
const CACHE_NAME = "culao-task-shell-v20260930-scheduled-list-order-v115";
const APP_SHELL_NETWORK_TIMEOUT_MS = 1800;
const APP_SHELL_BACKGROUND_TIMEOUT_MS = 15000;
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js?v=20260930-scheduled-list-order-v115",
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
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

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
