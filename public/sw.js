// sw.js
const CACHE_NAME = 'ChronologySamajh-v4.2'; // Change this string!

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force the waiting service worker to become active
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/', '/index.html']); // Add your actual file paths here
    })
  );
});

self.addEventListener('activate', (event) => {
  // Take control of all pages immediately
  event.waitUntil(clients.claim()); 
  
  // Delete old caches
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy (Recommended during development to avoid cache traps)
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// 4. Background Anniversary Logic
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-anniversary-check') {
    event.waitUntil(checkDatesAndNotify());
  }
});

async function checkDatesAndNotify() {
  // CRITICAL FIX 1: Must match the DB name in your main script!
  const dbRequest = indexedDB.open("ChronologySamajhDB_v1"); 

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
        // CRITICAL FIX 2: Check for 'eventType' instead of 'title'
        if (item.type === 'date' && item.val) {
          const eDate = new Date(item.val);
          const eMatch = `${eDate.getMonth() + 1}-${eDate.getDate()}`;
          
          if (todayMatch === eMatch) {
            self.registration.showNotification("ChronologySamajh: On This Day", {
              body: `Anniversary of: ${item.eventType}`, // Changed from item.title
              icon: "/icon-192.png"
            });
          }
        }
      });
    };
  };
}