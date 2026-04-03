import Dexie from 'dexie';
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

// 1. Database Setup
const db = new Dexie('ChronologySamajhDB');
db.version(1).stores({ events: '++id, timestamp' });

const form = document.getElementById('eventForm');
const timeline = document.getElementById('timeline');
const dateType = document.getElementById('dateType');
const dateInput = document.getElementById('dateInput');

// 2. Handle Date Input Changes
dateType.addEventListener('change', () => {
  dateInput.type = dateType.value === 'date' ? 'date' : 'number';
  dateInput.placeholder = dateType.value === 'year' ? 'YYYY' : 'Century (e.g. 21)';
});

// 3. Save Data
form.onsubmit = async (e) => {
  e.preventDefault();
  const val = dateInput.value;
  
  // Create a timestamp for sorting
  let ts = 0;
  if (dateType.value === 'date') ts = new Date(val).getTime();
  else if (dateType.value === 'year') ts = new Date(val, 0, 1).getTime();
  else ts = (parseInt(val) - 1) * 100 * 31536000000;

  await db.events.add({
    title: document.getElementById('title').value,
    type: dateType.value,
    val: val,
    desc: document.getElementById('desc').value,
    timestamp: ts
  });
  
  form.reset();
  render();
};

// 4. Render UI
async function render() {
  const events = await db.events.orderBy('timestamp').toArray();
  const watermark = document.getElementById('watermark');
  timeline.innerHTML = '';
  timeline.appendChild(watermark);

  events.forEach(event => {
    const card = document.createElement('div');
    card.className = 'event-card';
    card.innerHTML = `
      <small style="color: var(--primary); font-weight: bold">${event.val}</small>
      <h3 style="margin: 5px 0">${event.title}</h3>
      <p style="font-size: 14px; color: #64748b">${event.desc}</p>
      <button class="delete-btn" data-id="${event.id}">Remove</button>
    `;
    timeline.appendChild(card);
  });
}

// 5. Delete & PDF Logic
timeline.addEventListener('click', async (e) => {
  if (e.target.classList.contains('delete-btn')) {
    await db.events.delete(Number(e.target.dataset.id));
    render();
  }
});

document.getElementById('exportBtn').onclick = async () => {
  const timeline = document.getElementById('timeline');
  const watermark = document.getElementById('watermark');

  // 1. "Flash" the watermark on for the capture
  // 0.08 is subtle but readable in a printed PDF
  watermark.style.opacity = '0.08'; 

  // 2. Capture the timeline with High Quality settings
  const canvas = await html2canvas(timeline, {
    scale: 2, // Doubles the resolution (Retina quality)
    backgroundColor: '#f8fafc', // Matches your new CSS --bg
    useCORS: true, // Helps if you ever add external images
    logging: false
  });

  // 3. Hide the watermark again immediately
  watermark.style.opacity = '0';

  // 4. Create the PDF
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
  
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save('ChronologySamajh-Export.pdf');
};

// 6. Notifications
async function setupPWA() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      
      // 1. Request Permission
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      // 2. Register Background Check
      if ('periodicSync' in registration) {
        const status = await navigator.permissions.query({
          name: 'periodic-background-sync',
        });

        if (status.state === 'granted') {
          await registration.periodicSync.register('daily-anniversary-check', {
            minInterval: 24 * 60 * 60 * 1000, // Check once a day
          });
        }
      }
    } catch (err) {
      console.log('PWA Setup failed:', err);
    }
  }
}

setupPWA();

render();