/* Culao Task PWA + Web Push service worker */
const CACHE_NAME = "culao-task-shell-v20260720-notification-badge-1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./notification-badge.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
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

  // Luôn ưu tiên mạng cho HTML/JS để bản cập nhật GitHub Pages được nhận sớm.
  if (event.request.mode === "navigate" || /\.(?:js|html)$/.test(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
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
  const notificationId = data.notificationId || "";
  const fallbackUrl = taskId
    ? `./?taskId=${encodeURIComponent(taskId)}&notificationId=${encodeURIComponent(notificationId)}`
    : "./";
  const url = data.url || notification?.data?.url || fallbackUrl;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "./icon-192.png",
      badge: "./notification-badge.png",
      tag: notificationId || taskId || `culao-task-${Date.now()}`,
      renotify: false,
      data: {
        url,
        taskId,
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
            notificationId: event.notification?.data?.notificationId || ""
          });
          return;
        }
      }

      if (self.clients.openWindow) await self.clients.openWindow(absoluteUrl);
    })
  );
});
