// public/sw.js
self.addEventListener('install', () => self.skipWaiting());

// Listen for the "Daily Check" signal
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'daily-anniversary-check') {
    event.waitUntil(checkDatesAndNotify());
  }
});

async function checkDatesAndNotify() {
  const dbRequest = indexedDB.open("TimelinerDB");

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
            self.registration.showNotification("Timeliner: On This Day", {
              body: `Anniversary of: ${item.title}`,
              icon: "/icon-192.png", // Must be in the public folder
              badge: "/icon-192.png" 
            });
          }
        }
      });
    };
  };
}