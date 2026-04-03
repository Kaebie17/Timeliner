const CACHE_NAME = 'ChronologySamajh-v1'; // Change this to 'v2' when you update the app!
const ASSETS = [
  '/',
  '/index.html',
  '/src/main.js',
  '/src/style.css',
  '/icon.svg',
  '/icon-192.png',
  '/manifest.json'
];

// 1. Install Event: Saves the app files to the phone's memory
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Deletes old versions of the app
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// 3. Fetch Event: Makes the app work OFFLINE
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// 4. Background Anniversary Logic (Keep this from before)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-anniversary-check') {
    event.waitUntil(checkDatesAndNotify());
  }
});

async function checkDatesAndNotify() {
  const dbRequest = indexedDB.open("ChronologySamajhDB");
  dbRequest.onsuccess = (event) => {
    const db = event.target.result;
    if (!db.objectStoreNames.contains('events')) return;
    const transaction = db.transaction("events", "readonly");
    const store = transaction.objectStore("events");
    const getAllReq = store.getAll();

    getAllReq.onsuccess = () => {
      const events = getAllReq.result;
      const today = new Date();
      const todayMatch = `${today.getMonth() + 1}-${today.getDate()}`;

      events.forEach(item => {
        if (item.type === 'date' && item.val) {
          const eDate = new Date(item.val);
          const eMatch = `${eDate.getMonth() + 1}-${eDate.getDate()}`;
          if (todayMatch === eMatch) {
            self.registration.showNotification("ChronologySamajh: On This Day", {
              body: `Anniversary of: ${item.title}`,
              icon: "/icon-192.png"
            });
          }
        }
      });
    };
  };
}