import Dexie from 'dexie';
import { jsPDF } from "jspdf";

const db = new Dexie('ChronologySamajhDB');
db.version(1).stores({ events: '++id, eventType, timestamp' });

let view = 'form';
let activeEventType = '';

const app = {
  init() {
     this.populateDigits(); // This fills the 0-9 dropdowns
    this.bindEvents();
    this.handleDateTypeChange('date'); // Sets the initial state to "Date"
    this.render();
    this.setupPWA();
    this.render();
  },

  bindEvents() {
     const dateTypeSelect = document.getElementById('dateType');

    // TRIGGER THE CHANGE LOGIC
      dateTypeSelect.addEventListener('change', (e) => {
      this.handleDateTypeChange(e.target.value);
    });

    document.getElementById('eventForm').onsubmit = (e) => this.handleSave(e);
    document.getElementById('navBtn').onclick = () => {
      if (view === 'form') view = 'library';
      else if (view === 'library') view = 'form';
      else if (view === 'timeline') view = 'library';
      this.render();
    };

    document.getElementById('exportBtn').onclick = () => this.exportPDF();

    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('view-chrono')) {
        activeEventType = e.target.dataset.type;
        view = 'timeline';
        this.render();
      }
      if (e.target.classList.contains('del-chrono')) {
        this.deleteChronology(e.target.dataset.type);
      }
      if (e.target.classList.contains('delete-event')) {
        this.deleteEvent(e.target.dataset.id);
      }
    });
  },

  handleDateTypeChange(type) {
    const dateInput = document.getElementById('dateVal');
    const yearContainer = document.getElementById('yearInputs');
    const centuryContainer = document.getElementById('centuryInputs');

    // Hide everything first
    dateInput.classList.add('hidden');
    yearContainer.classList.add('hidden');
    centuryContainer.classList.add('hidden');

    // Show only the selected one
    if (type === 'date') {
      dateInput.classList.remove('hidden');
    } else if (type === 'year') {
      yearContainer.classList.remove('hidden');
    } else if (type === 'century') {
      centuryContainer.classList.remove('hidden');
    }
  },
  populateDigits() {
    const years = ['y1', 'y2', 'y3', 'y4'];
    const centuries = ['c1', 'c2'];
    
    const createOptions = (elId, max = 9) => {
        const select = document.getElementById(elId);
        for (let i = 0; i <= max; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = i;
            select.appendChild(opt);
        }
    };

    years.forEach(id => createOptions(id));
    centuries.forEach(id => createOptions(id));
  },

  async handleSave(e) {
    e.preventDefault();
    const eventType = document.getElementById('eventTypeInput').value.trim();
    const dateType = document.getElementById('dateType').value;
    const era = document.getElementById('era').value; // New Era dropdown
    const desc = document.getElementById('notes').value;

    let displayDate = "";
    let sortScore = 0;

    if (dateType === 'date') {
        const val = document.getElementById('dateVal').value;
        displayDate = `${val} ${era}`;
        sortScore = new Date(val).getTime() * (era === 'BCE' ? -1 : 1);
    } 
    else if (dateType === 'year') {
        const year = ['y1','y2','y3','y4'].map(id => document.getElementById(id).value).join('');
        displayDate = `${parseInt(year)} ${era}`;
        sortScore = parseInt(year) * (era === 'BCE' ? -1 : 1);
    } 
    else if (dateType === 'century') {
        const century = ['c1','c2'].map(id => document.getElementById(id).value).join('');
        displayDate = `${parseInt(century)}th Century ${era}`;
        // Logic: 5th Century BCE is further back than 1st Century BCE
        sortScore = (parseInt(century) * 100) * (era === 'BCE' ? -1 : 1);
    }

    await db.events.add({
        eventType,
        val: displayDate,
        desc,
        timestamp: sortScore
    });

    document.getElementById('eventForm').reset();
    // alert("Event saved to chronology!");
  },

  async render() {
    const allEvents = await db.events.toArray();
    const eventTypes = [...new Set(allEvents.map(e => e.eventType))];

    const pages = {
      form: document.getElementById('pageForm'),
      library: document.getElementById('pageLibrary'),
      timeline: document.getElementById('pageTimeline')
    };

    const navBtn = document.getElementById('navBtn');

    Object.values(pages).forEach(p => p.classList.add('hidden'));

    if (view === 'form') {
      pages.form.classList.remove('hidden');
      navBtn.textContent = "📁 Library";
    } else if (view === 'library') {
      pages.library.classList.remove('hidden');
      navBtn.textContent = "➕ Add New";
      this.renderLibrary(eventTypes, allEvents);
    } else if (view === 'timeline') {
      pages.timeline.classList.remove('hidden');
      navBtn.textContent = "⬅ Back to Library";
      this.renderTimeline();
    }
  },

  renderLibrary(eventTypes, allEvents) {
    const grid = document.getElementById('libraryGrid');
    grid.innerHTML = '';

    if (eventTypes.length === 0) {
      grid.innerHTML = '<p class="section-label">No collections yet. Add your first event from the form.</p>';
      return;
    }

    eventTypes.forEach(et => {
      const count = allEvents.filter(e => e.eventType === et).length;
      const card = document.createElement('div');
      card.className = 'chrono-card';
      card.innerHTML = `
        <div class="card-info">
          <h3>${et}</h3>
          <p>${count} events</p>
        </div>
        <div class="card-actions">
          <button class="view-chrono btn-s" data-type="${et}">Expand</button>
          <button class="del-chrono btn-del" data-type="${et}">Delete</button>
        </div>
      `;
      grid.appendChild(card);
    });
  },

  async renderTimeline() {
    const events = await db.events
      .where('eventType').equals(activeEventType)
      .sortBy('timestamp');

    document.getElementById('displayTitle').textContent = activeEventType;

    const container = document.getElementById('timelineContent');
    container.innerHTML = '<div id="watermark">CHRONOLOGY SAMAJH</div>';

    events.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      item.innerHTML = `
        <div class="dot"></div>
        <small>${ev.val}</small>
        <h4>${ev.eventType}</h4>
        <p>${ev.desc || ''}</p>
        <button class="delete-event text-red" data-id="${ev.id}">Remove</button>
      `;
      container.appendChild(item);
    });
  },

  async deleteChronology(eventType) {
    if (confirm(`Delete entire "${eventType}" chronology?`)) {
      await db.events.where('eventType').equals(eventType).delete();
      if (view === 'timeline') view = 'library';
      this.render();
    }
  },

  async deleteEvent(id) {
    await db.events.delete(Number(id));
    this.render();
  },

  // NEW CUSTOM TIMELINE PDF EXPORT
  async exportPDF() {
    const events = await db.events
      .where('eventType').equals(activeEventType)
      .sortBy('timestamp');

    if (events.length === 0) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const centerX = pageWidth / 2;
    let y = 35;

    // --- 1. TITLE SECTION ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(79, 70, 229); // Indigo
    doc.text(activeEventType.toUpperCase(), centerX, y - 10, { align: 'center' });
    
    doc.setDrawColor(79, 70, 229);
    doc.setLineWidth(1);
    doc.line(centerX - 20, y - 5, centerX + 20, y - 5); // Accent line under title

    // --- 2. DRAW CENTRAL AXIS ---
    const drawSpine = (startY, endY) => {
        doc.setDrawColor(226, 232, 240); // Soft Slate Gray
        doc.setLineWidth(2);
        doc.line(centerX, startY, centerX, endY);
    };

    drawSpine(y, pageHeight - 20);

    // --- 3. RENDER EVENTS ---
    events.forEach((ev, index) => {
        const isLeft = index % 2 === 0;
        const xOffset = 12; // Distance from center line
        const textWidth = 75; // Max width of text block
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        
        // Prepare Wrapped Text
        const notes = ev.desc || "";
        const wrappedNotes = doc.splitTextToSize(notes, textWidth);
        const textHeight = (wrappedNotes.length * 5) + 10; // 10 is padding for date/spacing
        
        // Page Break Logic
        if (y + textHeight > pageHeight - 30) {
            doc.addPage();
            y = 30;
            drawSpine(y - 10, pageHeight - 20);
        }

        // --- DRAW DOT ---
        doc.setDrawColor(79, 70, 229);
        doc.setFillColor(255, 255, 255); // White inner
        doc.setLineWidth(1.5);
        doc.circle(centerX, y + 2, 3, 'FD'); // Outer Ring
        doc.setFillColor(79, 70, 229);
        doc.circle(centerX, y + 2, 1.5, 'F'); // Inner Dot

        // --- DRAW CONTENT ---
        const align = isLeft ? 'right' : 'left';
        const textX = isLeft ? centerX - xOffset : centerX + xOffset;

        // Date Label
        doc.setTextColor(79, 70, 229);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text(ev.val || '', textX, y + 2.5, { align });

        // Notes Paragraph
        doc.setTextColor(30, 41, 59); // Dark Slate
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        
        // Logic for Justification Emulation:
        // Standard splitTextToSize + the 'align' flag creates a clean "Justified-to-Axis" look
        doc.text(wrappedNotes, textX, y + 10, { align, maxWidth: textWidth });

        // Move Y pointer down for next event
        y += textHeight + 15; 
    });

    // --- 4. FOOTER ---
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`Chronology Samajh - Page ${i} of ${totalPages}`, centerX, pageHeight - 10, { align: 'center' });
    }

    doc.save(`${activeEventType.replace(/\s+/g, '_')}_Chronology.pdf`);
},

  async setupPWA() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (err) {
        console.log('Service Worker registration failed:', err);
      }
    }
  }
};

app.init();