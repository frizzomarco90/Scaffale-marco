const CACHE = "scaffale-v3";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("scaffale", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("apps")) d.createObjectStore("apps", { keyPath: "id" });
      if (!d.objectStoreNames.contains("inbox")) d.createObjectStore("inbox", { autoIncrement: true });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function handleShare(req) {
  try {
    const form = await req.formData();
    const files = form.getAll("file");
    const db = await openDB();
    for (const f of files) {
      if (!f || typeof f.text !== "function") continue;
      const html = await f.text();
      await new Promise((res, rej) => {
        const t = db.transaction("inbox", "readwrite");
        t.objectStore("inbox").add({ name: f.name || "tool.html", html });
        t.oncomplete = res; t.onerror = () => rej(t.error);
      });
    }
  } catch (e) {}
  return Response.redirect("./?condiviso=1", 303);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === "POST" && url.pathname.endsWith("/condividi")) {
    e.respondWith(handleShare(req));
    return;
  }
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put("./index.html", copy)); return r;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
