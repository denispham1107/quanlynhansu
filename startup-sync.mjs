// Tải các truy vấn nhỏ trước, rồi chuyển sang danh sách đầy đủ ở nền.
// Chỉ snapshot máy chủ của truy vấn đầy đủ được coi là đủ dữ liệu để dọn dữ liệu cũ.
export function subscribeProgressively({ listen, primaryQueries, fullQuery, next, error,
  setTimer = setTimeout, clearTimer = clearTimeout, delayMs = 1500 }) {
  let stopped = false;
  let fullReady = false;
  let fullStarted = false;
  let timer = null;
  const snapshots = new Map();
  const primaryUnsubs = [];
  let fullUnsub = null;

  function startFull() {
    if (stopped || fullStarted) return;
    fullStarted = true;
    fullUnsub = listen(fullQuery, { includeMetadataChanges: true }, (snapshot) => {
      if (stopped) return;
      if (!snapshot.metadata.fromCache) {
        fullReady = true;
        primaryUnsubs.splice(0).forEach((unsubscribe) => unsubscribe());
        snapshots.clear();
      }
      if (fullReady) next(snapshot);
      else { snapshots.set("full", snapshot); emitPrimary(); }
    }, (failure) => { if (!stopped) error(failure); });
  }

  function emitPrimary() {
    if (stopped || fullReady) return;
    const primary = primaryQueries.map((_, index) => snapshots.get(index));
    const serverReady = primary.every((snapshot) => snapshot && !snapshot.metadata.fromCache);
    const startupReady = primary.every((snapshot) => snapshot
      && (!snapshot.metadata.fromCache || snapshot.docs.length > 0));
    const docsById = new Map();
    const origins = new Map();
    for (const snapshot of snapshots.values()) {
      for (const item of snapshot.docs) {
        const existing = docsById.get(item.id);
        // Một snapshot cũ của truy vấn khác không được làm Phiếu đã duyệt chạy lại.
        const previous = existing?.data();
        const candidate = item.data();
        if (existing && origins.get(item.id) === false && snapshot.metadata.fromCache
          && candidate.status !== "completed") continue;
        if ((previous?.approvedAt || previous?.status === "completed") && candidate.status !== "completed") continue;
        if (previous?.status === "submitted" && ["doing", "hotel", "overdue", "waiting_assignee"].includes(candidate.status)) continue;
        docsById.set(item.id, item);
        origins.set(item.id, snapshot.metadata.fromCache);
      }
    }
    const docs = [...docsById.values()].sort((left, right) =>
      (right.data()?.createdAt?.toMillis?.() || 0) - (left.data()?.createdAt?.toMillis?.() || 0));
    next({ docs,
      metadata: { fromCache: !serverReady, partial: true, startupReady,
        hasPendingWrites: [...snapshots.values()].some((snapshot) => snapshot.metadata.hasPendingWrites) },
      docChanges: () => []
    });
    if (serverReady && !fullStarted && timer === null) {
      timer = setTimer(() => { timer = null; startFull(); }, delayMs);
    }
  }

  primaryQueries.forEach((ref, index) => {
    primaryUnsubs.push(listen(ref, { includeMetadataChanges: true }, (snapshot) => {
      if (stopped || fullReady) return;
      snapshots.set(index, snapshot);
      emitPrimary();
    }, (failure) => {
      if (stopped) return;
      error(failure);
      startFull();
    }));
  });
  return () => {
    stopped = true;
    if (timer !== null) clearTimer(timer);
    primaryUnsubs.splice(0).forEach((unsubscribe) => unsubscribe());
    fullUnsub?.();
    snapshots.clear();
  };
}

// Một vòng phục hồi có giới hạn: không nạp lại trang, không bỏ các ghi đang chờ.
export function createSyncRecovery({ required, reconnect, notify, online = () => true,
  setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = 8000 }) {
  let stopped = false;
  let attempt = 0;
  let timer = null;
  let inFlight = null;
  const ready = new Set();
  const complete = () => required.every((key) => ready.has(key));
  const clear = () => { if (timer !== null) clearTimer(timer); timer = null; };

  function arm() {
    clear();
    if (stopped || complete()) return;
    timer = setTimer(() => {
      timer = null;
      if (stopped || complete()) return;
      notify(online() ? "slow" : "offline");
      if (online() && attempt < 2) void retry();
    }, timeoutMs);
  }
  async function retry() {
    if (stopped || inFlight) return inFlight;
    if (!online()) { notify("offline"); return; }
    attempt += 1;
    notify("reconnecting");
    inFlight = Promise.resolve().then(reconnect).catch(() => {
      if (!stopped) notify("slow");
    }).finally(() => {
      inFlight = null;
      if (!stopped) { if (complete()) notify("ready"); else arm(); }
    });
    return inFlight;
  }
  arm();
  return {
    received(key, metadata) {
      if (stopped || metadata.fromCache) return;
      ready.add(key);
      if (complete()) { clear(); notify("ready"); }
    },
    retry,
    resume() { if (stopped) return; ready.clear(); attempt = 0; arm(); void retry(); },
    stop() { stopped = true; clear(); }
  };
}
