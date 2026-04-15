import Dexie from 'dexie';
import { jsPDF } from "jspdf";

// Initialize Database
const db = new Dexie('ChronologySamajhDB');
db.version(1.4).stores({
  events: '++id, eventType, timestamp, isSynced'
});

// Make db available for repair scripts in the console
window.db = db;

// App State
let view = 'form';
let activeEventType = '';
let isSelectionMode = false;
let selectedTopics = [];
let isBulkMode = false;

const app = {
  // ---------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------
  async init() {
    // 1. Register Service Worker for Offline capability
    this.setupPWA();

    // 2. Build the 0-9 buttons for the hanging digit pickers
    this.setupPickers();

    // 3. Populate the search suggestions from existing data
    await this.updateTypeSuggestions();

    // 4. Attach all event listeners
    this.bindEvents();

    // 5. Initialize the date input view (default to Exact Date)
    this.handleDateTypeChange('date');

    // 6. Perform initial UI render
    this.render();
  },

  // ---------------------------------------------------------
  // EVENT BINDING
  // ---------------------------------------------------------
  bindEvents() {
    // --- NEW: Date Masking (DD-MM-YYYY) ---
    const dateInput = document.getElementById('dateVal');
    dateInput.addEventListener('input', (e) => this.formatDateInput(e));

    // --- NEW: Topic Suggestions Focus ---
    const typeInput = document.getElementById('eventTypeInput');
    typeInput.addEventListener('blur', (e) => this.checkSmartDefault(e.target.value.trim()));
    const suggestBox = document.getElementById('topicSuggestions');
    typeInput.onfocus = async () => {
      // 1. Fetch the latest topics from the DB first
      await this.updateTopicSuggestions();

      // 2. Now that the box is full, show it
      if (suggestBox.innerHTML.trim() !== "") {
        suggestBox.style.display = 'block';
      }
    };

    document.getElementById('bulkToggleBtn').onclick = () => {
      isBulkMode = !isBulkMode;
      const bulkBtn = document.getElementById('bulkToggleBtn');
      const singleUi = document.getElementById('singleEntryUi');
      const bulkUi = document.getElementById('bulkEntryUi');
      const notesArea = document.getElementById('notes');
      const bulkContainer = document.getElementById('bulkRowContainer');

      bulkBtn.textContent = isBulkMode ? "Single Mode" : "Bulk Mode";

      if (isBulkMode) {
        // 1. Switching to Bulk: Clear Single data and remove 'required'
        notesArea.value = "";
        notesArea.required = false;
        document.getElementById('dateVal').value = "";
        ['y1', 'y2', 'y3', 'y4', 'c1', 'c2'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = "";
        });

        singleUi.classList.add('hidden');
        bulkUi.classList.remove('hidden');
        if (bulkContainer.children.length === 0) this.addBulkRow();
      } else {
        // 2. Switching to Single: Delete all bulk rows and restore 'required'
        bulkContainer.innerHTML = "";
        notesArea.required = true;

        bulkUi.classList.add('hidden');
        singleUi.classList.remove('hidden');
      }
      document.getElementById('submitBtn').textContent = isBulkMode ? "Save All Entries" : "Add to Chronology";
    };

    document.getElementById('addBulkRowBtn').onclick = () => this.addBulkRow();

    // Mode Selector (Date/Year/Century)
    const dateTypeSelect = document.getElementById('dateType');
    dateTypeSelect.addEventListener('change', (e) => {
      this.handleDateTypeChange(e.target.value);
    });

    // Form Submission
    const eventForm = document.getElementById('eventForm');
    eventForm.onsubmit = (e) => {
      this.handleSave(e);
    };

    // Navigation Button (Library/Add New toggle)
    const navBtn = document.getElementById('navBtn');
    navBtn.onclick = () => {
      if (view === 'form') {
        view = 'library';
      } else if (view === 'library') {
        view = 'form';
      } else if (view === 'timeline') {
        view = 'library';
      }
      this.render();
    };

    // Toggle Merge Selection Mode
    document.addEventListener('click', (e) => {
      if (e.target.id === 'mergeToggleBtn') {
        isSelectionMode = !isSelectionMode;
        selectedTopics = []; // Reset selections
        this.render();
      }

      // Handle Checkbox Selections
      if (e.target.classList.contains('merge-checkbox')) {
        const topic = e.target.dataset.topic;
        if (e.target.checked) {
          selectedTopics.push(topic);
        } else {
          selectedTopics = selectedTopics.filter(t => t !== topic);
        }
        // Update the "Confirm" button text dynamically
        const confirmBtn = document.getElementById('confirmMergeBtn');
        if (confirmBtn) confirmBtn.textContent = `Merge Selected (${selectedTopics.length})`;
      }

      // Trigger the Merge Action
      if (e.target.id === 'confirmMergeBtn') {
        if (selectedTopics.length < 2) return alert("Select at least 2 timelines to merge.");
        this.handleMergeAction();
      }
    });

    // PDF Export Button
    const exportBtn = document.getElementById('exportBtn');
    exportBtn.onclick = () => {
      this.exportPDF();
    };

    // Dynamic Click Delegation
    document.addEventListener('click', (e) => {
      // Hide suggestions when clicking outside
      if (!e.target.closest('.topic-wrapper')) {
        const suggestBox = document.getElementById('topicSuggestions');
        if (suggestBox) suggestBox.style.display = 'none';
      }

      // Expand a collection
      if (e.target.classList.contains('view-chrono')) {
        activeEventType = e.target.dataset.type;
        view = 'timeline';
        this.render();
      }
      // Delete a whole collection
      if (e.target.classList.contains('del-chrono')) {
        this.deleteChronology(e.target.dataset.type);
      }
      // Delete a single event
      if (e.target.classList.contains('delete-event')) {
        this.deleteEvent(e.target.dataset.id);
      }
    });
  },
  // Function to handle Smart Default checkbox
  async checkSmartDefault(topic) {
    const lastEntry = await db.events
      .where('eventType').equals(topic)
      .filter(e => e.whenVal.includes('-')) // Only check dated events
      .reverse()
      .first();

    const syncCheckbox = document.getElementById('syncToCalendar');
    if (lastEntry) {
      syncCheckbox.checked = lastEntry.isSynced || false;
    }
  },
  // ---------------------------------------------------------
  // FORM LOGIC
  // ---------------------------------------------------------
  handleDateTypeChange(type) {
    const dateInput = document.getElementById('dateVal');
    const yearContainer = document.getElementById('yearInputs');
    const centuryContainer = document.getElementById('centuryInputs');

    // Hide all input areas initially
    dateInput.classList.add('hidden');
    yearContainer.classList.add('hidden');
    centuryContainer.classList.add('hidden');

    // Show the one requested by the dropdown
    if (type === 'date') {
      dateInput.classList.remove('hidden');
    } else if (type === 'year') {
      yearContainer.classList.remove('hidden');
      yearContainer.style.display = 'flex';
    } else if (type === 'century') {
      centuryContainer.classList.remove('hidden');
      centuryContainer.style.display = 'flex';
    }

    const syncRow = document.getElementById('syncRow');
    if (type === 'date') {
      syncRow.classList.remove('hidden');
    } else {
      syncRow.classList.add('hidden');
    }
  },

  async handleSave(e) {
    e.preventDefault();
    const topic = document.getElementById('eventTypeInput').value.trim();
    if (!topic) return alert("Please enter a collection name.");

    let newEntries = [];
    let shouldTriggerDownload = false;

    if (!isBulkMode) {
      // --- SINGLE MODE LOGIC ---
      const dateType = document.getElementById('dateType').value;

      // Manual Date Validation
      if (dateType === 'date' && !document.getElementById('dateVal').value) {
        return alert("Please enter a valid date (DD-MM-YYYY)");
      }
      if (dateType === 'year') {
        const yearCheck = ['y1', 'y2', 'y3', 'y4'].map(id => document.getElementById(id).value).join('');
        if (yearCheck.length < 4) return alert("Please fill all 4 year boxes.");
      }
      if (dateType === 'century') {
        const centCheck = ['c1', 'c2'].map(id => document.getElementById(id).value).join('');
        if (centCheck.length < 2) return alert("Please fill both century boxes.");
      }

      const era = document.getElementById('era').value;
      const desc = document.getElementById('notes').value.trim();
      const isSynced = document.getElementById('syncToCalendar').checked;
      let whenVal = "", sortScore = 0;

      if (dateType === 'date') {
        const v = document.getElementById('dateVal').value;
        const p = v.split('-');
        if (p.length === 3) {
          const dObj = new Date(`${p[2]}-${p[1]}-${p[0]}`);
          sortScore = (dObj.getTime() || 0) * (era === 'BCE' ? -1 : 1);
          whenVal = `${v} ${era}`;
        }
        if (isSynced) shouldTriggerDownload = true;
      }
      else if (dateType === 'year') {
        const y = ['y1', 'y2', 'y3', 'y4'].map(id => document.getElementById(id).value).join('') || "0";
        whenVal = `${parseInt(y)} ${era}`;
        sortScore = parseInt(y) * (era === 'BCE' ? -1 : 1);
      }
      else {
        const c = ['c1', 'c2'].map(id => document.getElementById(id).value).join('') || "0";
        whenVal = `${parseInt(c)}th Century ${era}`;
        sortScore = (parseInt(c) * 100) * (era === 'BCE' ? -1 : 1);
      }

      newEntries.push({ eventType: topic, whenVal, desc, timestamp: sortScore, isSynced: dateType === 'date' ? isSynced : false });

    } else {
      // --- BULK MODE LOGIC (All-or-Nothing) ---
      const rows = document.querySelectorAll('.bulk-row');
      if (rows.length === 0) return alert("No entries to save. Add a row first.");

      for (const row of rows) {
        const dVal = row.querySelector('.b-date').value;
        const era = row.querySelector('.b-era').value;
        const sync = row.querySelector('.b-sync').checked;
        const rowDesc = row.querySelector('.b-notes').value.trim();
        const p = this.parseSmartDate(dVal, era);

        // If even one row is invalid, stop everything
        if (!p.isValid || !rowDesc) {
          row.querySelector('.b-date').classList.toggle('invalid', !p.isValid);
          return alert("Some entries have errors or missing notes. Fix highlighted rows to proceed.");
        }

        newEntries.push({ eventType: topic, whenVal: p.whenVal, desc: rowDesc, timestamp: p.timestamp, isSynced: sync });
        if (sync) shouldTriggerDownload = true;
      }
    }

    // --- FINAL EXECUTION (Only reached if validations pass) ---
    await db.events.bulkAdd(newEntries);

    if (shouldTriggerDownload) this.downloadTimelineICS(topic);

    await this.updateTopicSuggestions();
    document.getElementById('eventForm').reset();

    if (isBulkMode) {
      document.getElementById('bulkRowContainer').innerHTML = "";
      this.addBulkRow(); // Reset with one empty row
    }

    this.handleDateTypeChange('date');
    this.render();
    alert(`Successfully saved ${newEntries.length} entries to ${topic}`);
  },

  // Custom HTML rendering for the hanging suggestions
  async updateTopicSuggestions() {
    const all = await db.events.toArray();

    // This part is the most common failure point. 
    // It tries to find the collection name in 'eventType' OR 'topic'.
    const topics = [...new Set(all.map(e => e.eventType || e.topic))].filter(Boolean);

    const box = document.getElementById('topicSuggestions');
    if (!box) return;

    if (topics.length === 0) {
      box.innerHTML = "";
      box.style.display = "none";
      return;
    }

    // Populate the box
    box.innerHTML = topics.map(t => `<div class="suggestion-item">${t}</div>`).join('');

    // Attach clicks to the new items
    box.querySelectorAll('.suggestion-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation(); // Prevents the 'click outside' logic from hiding it too early
        document.getElementById('eventTypeInput').value = item.textContent;
        box.style.display = 'none';
      };
    });
  },

  // Auto-inserts '-' and restricts to DD-MM-YYYY
  formatDateInput(e) {
    // 1. Prevent adding dash if the user is deleting
    if (e.inputType && e.inputType.includes('delete')) return;

    // 2. Get only the numbers
    let v = e.target.value.replace(/\D/g, '');

    // 3. Immediate trigger for dashes
    if (v.length === 2) {
      e.target.value = v + '-';
    } else if (v.length === 4) {
      e.target.value = v.slice(0, 2) + '-' + v.slice(2, 4) + '-';
    } else if (v.length > 4) {
      // Handle pasting or long strings
      e.target.value = v.slice(0, 2) + '-' + v.slice(2, 4) + '-' + v.slice(4, 8);
    }
  },
  // ---------------------------------------------------------
  // RENDERING LOGIC
  // ---------------------------------------------------------
  async render() {
    const allEvents = await db.events.toArray() || [];

    // Filter out any broken data to avoid "Unnamed" categories
    const validEvents = allEvents.filter(e => e.eventType && e.eventType !== "");
    const eventTypes = [...new Set(validEvents.map(e => e.eventType))];

    const pages = {
      form: document.getElementById('pageForm') || document.getElementById('eventForm'),
      library: document.getElementById('pageLibrary'),
      timeline: document.getElementById('pageTimeline')
    };

    const navBtn = document.getElementById('navBtn');

    // Hide all pages first
    Object.values(pages).forEach(page => {
      if (page === pages.form) page.parentElement.classList.add('hidden');
      else page.classList.add('hidden');
    });

    // Display current active page
    if (view === 'form' && pages.form) {
      pages.form.parentElement.classList.remove('hidden');
      navBtn.textContent = "📁 Library";
    }
    else if (view === 'library' && pages.library) {
      pages.library.classList.remove('hidden');
      navBtn.textContent = "➕ Add New";
      this.renderLibrary(eventTypes, allEvents);
    }
    else if (view === 'timeline' && pages.timeline) {
      pages.timeline.classList.remove('hidden');
      navBtn.textContent = "⬅ Back to Library";
      this.renderTimeline();
    }
  },

  renderLibrary(eventTypes, allEvents) {
    const grid = document.getElementById('libraryGrid');

    // Create Header for Merge Options
    const headerHtml = `
      <div style="display:flex; justify-content:end; align-items:center; margin-bottom:10px;">
        <button id="mergeToggleBtn" class="btn-s">${isSelectionMode ? 'Cancel Selection' : 'Merge Timelines'}</button>
        ${isSelectionMode ? `<button id="confirmMergeBtn" class="btn-primary btn-s">Merge Selected (0)</button>` : ''}
      </div>
    `;

    grid.innerHTML = headerHtml;

    if (eventTypes.length === 0) {
      grid.innerHTML += '<p class="section-label">No collections yet.</p>';
      return;
    }

    eventTypes.forEach(et => {
      const count = allEvents.filter(e => e.eventType === et).length;
      const card = document.createElement('div');
      card.className = 'chrono-card';
      card.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          ${isSelectionMode ? `<input type="checkbox" class="merge-checkbox" data-topic="${et}">` : ''}
          <div class="card-info">
            <h3>${et}</h3>
            <p>${count} events</p>
          </div>
        </div>
        <div class="card-actions">
          ${!isSelectionMode ? `
            <button class="view-chrono btn-s" data-type="${et}">Expand</button>
            <button class="del-chrono btn-del btn-s" data-type="${et}">Delete</button>
            <button class="btn-sync btn-s" onclick="app.downloadTimelineICS('${et}')">📅 Sync</button>
          ` : ''}
        </div>
      `;
      grid.appendChild(card);
    });
  },

  async downloadTimelineICS(topic) {
    // 1. SILENT REPAIR: Update old entries for THIS TOPIC only
    // This finds dated events where 'isSynced' was never set and marks them true
    await db.events
      .where('eventType').equals(topic)
      .filter(e => e.whenVal.includes('-') && e.isSynced === undefined)
      .modify({ isSynced: true });

    // 2. FETCH: Get all events for this topic marked for sync
    const events = await db.events
      .where('eventType').equals(topic)
      .filter(e => e.isSynced === true && e.whenVal.includes('-'))
      .toArray();

    if (events.length === 0) {
      alert("No dated events found to sync in this timeline.");
      return;
    }

    // 3. GENERATE: Standard ICS file building
    let icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Chronology Samajh//Calendar Sync//EN"
    ];

    const appUrl = window.location.href;

    events.forEach(ev => {
      const parts = ev.whenVal.split(' ')[0].split('-');
      if (parts.length !== 3) return;

      const dateStr = `${parts[2]}${parts[1]}${parts[0]}`; // YYYYMMDD
      const cleanDesc = ev.desc.replace(/\n/g, " ").slice(0, 50);

      icsContent.push(
        "BEGIN:VEVENT",
        `UID:chrono-${ev.id}@samajh.app`,
        `DTSTAMP:${dateStr}T090000Z`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `RRULE:FREQ=YEARLY`,
        `SUMMARY:[Chrono] ${topic} - ${cleanDesc}`,
        `DESCRIPTION:${ev.desc}\\n\\nView in App: ${appUrl}`,
        `URL:${appUrl}`,
        "BEGIN:VALARM",
        "TRIGGER:-PT9H", // 9 AM Local Time
        "ACTION:DISPLAY",
        `DESCRIPTION:Anniversary: ${topic}`,
        "END:VALARM",
        "END:VEVENT"
      );
    });

    icsContent.push("END:VCALENDAR");

    // 4. TRIGGER DOWNLOAD
    const blob = new Blob([icsContent.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.download = `${topic.replace(/\s+/g, '_')}_Anniversaries.ics`;
    link.click();

    // 5. NOTIFY USER
    setTimeout(() => {
      alert(`Synced ${events.length} events to Calendar! 📅\n\nTo remove these alerts later:\n1. Open your Calendar App.\n2. Search for "[Chrono] ${topic}"\n3. Delete the matching entries.`);
    }, 500);
  },

  async handleMergeAction() {
    const newName = prompt("Enter a name for the new merged timeline:");
    if (!newName || newName.trim() === "") return;

    // 1. Fetch all events from selected topics
    const allEventsToMerge = await db.events
      .where('eventType')
      .anyOf(selectedTopics)
      .toArray();

    // 2. Remove Duplicates (Strict fingerprint check: timestamp + desc)
    const seen = new Set();
    const uniqueEvents = [];

    allEventsToMerge.forEach(ev => {
      const fingerprint = `${ev.timestamp}|${ev.desc.trim()}`;
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        // Create a new copy of the event for the new collection
        uniqueEvents.push({
          eventType: newName.trim(),
          whenVal: ev.whenVal,
          desc: ev.desc,
          timestamp: ev.timestamp
        });
      }
    });

    // 3. Bulk Add to Database
    await db.events.bulkAdd(uniqueEvents);

    // 4. Reset UI
    alert(`Successfully merged ${selectedTopics.length} timelines into "${newName}"`);
    isSelectionMode = false;
    selectedTopics = [];
    this.updateTopicSuggestions(); // Refresh the suggestions box
    this.render();
  },

  async renderTimeline() {
    // Fetch specific data
    const raw = await db.events.where('eventType').equals(activeEventType).toArray();

    // Sort based on the calculated timestamp
    const sorted = raw.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Group simultaneous events
    const events = this.getGroupedEvents(sorted);

    document.getElementById('displayTitle').textContent = activeEventType;
    const container = document.getElementById('timelineContent');

    // Watermark reset
    container.innerHTML = '<div id="watermark">CHRONOLOGY SAMAJH</div>';

    events.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'timeline-item';

      // Note: using whenVal and desc keys
      const dateDisplay = ev.whenVal || "No Date";
      const noteDisplay = ev.desc || "(No description)";

      item.innerHTML = `
                <div class="dot"></div>
                <small><strong>${dateDisplay}</strong></small>
                <p style="white-space: pre-wrap;">${noteDisplay}</p>
                <button class="delete-event btn-del btn-s" data-id="${ev.id}">Remove</button>
            `;
      container.appendChild(item);
    });
  },

  // ---------------------------------------------------------
  // DATABASE ACTIONS
  // ---------------------------------------------------------
  async deleteChronology(eventType) {
    if (confirm(`Delete entire "${eventType}" chronology?`)) {
      await db.events.where('eventType').equals(eventType).delete();
      if (view === 'timeline') {
        view = 'library';
      }
      this.render();
    }
  },

  async deleteEvent(id) {
    await db.events.delete(Number(id));
    this.render();
  },

  // ---------------------------------------------------------
  // PDF EXPORT (AESTHETIC INDIGO/SLATE DESIGN)
  // ---------------------------------------------------------
  async exportPDF() {
    const raw = await db.events.where('eventType').equals(activeEventType).toArray();
    const sorted = raw.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const events = this.getGroupedEvents(sorted);

    if (events.length === 0) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const centerX = pageWidth / 2;
    let y = 35;

    // 1. Header Section
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229); // Indigo
    doc.text(activeEventType.toUpperCase(), centerX, y - 10, { align: 'center' });

    // 2. Draw Central Axis (The Spine)
    const drawSpine = (startY, endY) => {
      doc.setDrawColor(226, 232, 240); // Soft Gray
      doc.setLineWidth(1.5);
      doc.line(centerX, startY, centerX, endY);
    };
    drawSpine(y, pageHeight - 20);

    // 3. Render Items
    events.forEach((ev, index) => {
      const isLeft = index % 2 === 0;
      const textWidth = 70;
      const xOffset = 10;

      // Handle Description Text Wrapping
      const wrappedDesc = doc.splitTextToSize(ev.desc, textWidth);
      const textHeight = (wrappedDesc.length * 5) + 12;

      // Page Management
      if (y + textHeight > pageHeight - 25) {
        doc.addPage();
        y = 25;
        drawSpine(y - 5, pageHeight - 20);
      }

      // Draw Node Dot
      doc.setDrawColor(79, 70, 229);
      doc.setFillColor(255, 255, 255);
      doc.circle(centerX, y + 2, 2.5, 'FD');

      const align = isLeft ? 'right' : 'left';
      const textX = isLeft ? centerX - xOffset : centerX + xOffset;

      // Render Date
      doc.setTextColor(79, 70, 229);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(ev.whenVal || '', textX, y + 2.5, { align });

      // Render Note Block
      doc.setTextColor(30, 41, 59); // Slate Dark
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(wrappedDesc, textX, y + 9, { align, maxWidth: textWidth });

      // Advance Y pointer
      y += textHeight + 10;
    });

    // 4. Pagination Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${totalPages} | Generated by Chronology Samajh`, centerX, pageHeight - 10, { align: 'center' });
    }

    doc.save(`${activeEventType.replace(/\s+/g, '_')}_Chronology.pdf`);
  },

  // ---------------------------------------------------------
  // UTILITIES & HELPERS
  // ---------------------------------------------------------
  // 1. The Smart Parser Logic
  parseSmartDate(input, era) {
    const v = input.trim();
    let result = { isValid: false, timestamp: 0, whenVal: "" };

    if (/^\d{1,2}$/.test(v)) { // Century (1-2 digits)
      const c = parseInt(v);
      result.isValid = true;
      result.whenVal = `${c}th Century ${era}`;
      result.timestamp = (c * 100) * (era === 'BCE' ? -1 : 1);
    }
    else if (/^\d{4}$/.test(v)) { // Year (4 digits)
      const y = parseInt(v);
      result.isValid = true;
      result.whenVal = `${y} ${era}`;
      result.timestamp = y * (era === 'BCE' ? -1 : 1);
    }
    else if (/^\d{2}-\d{2}-\d{4}$/.test(v)) { // Date (DD-MM-YYYY)
      const [d, m, y] = v.split('-');
      const dateObj = new Date(`${y}-${m}-${d}`);
      if (!isNaN(dateObj.getTime())) {
        result.isValid = true;
        result.whenVal = `${v} ${era}`;
        result.timestamp = dateObj.getTime() * (era === 'BCE' ? -1 : 1);
      }
    }
    return result;
  },

  // 2. Bulk Row Generator
  addBulkRow() {
    const container = document.getElementById('bulkRowContainer');
    const row = document.createElement('div');
    row.className = 'bulk-row';

    // Check if the overall collection was synced before for smart default
    const shouldSync = document.getElementById('syncToCalendar').checked;

    row.innerHTML = `
        <input type="text" class="b-date" placeholder="Ex: 5, 1526, 02-04-2026" style="flex: 2;">
        <select class="b-era" style="flex: 1;"><option value="CE">CE</option><option value="BCE">BCE</option></select>
        <input type="checkbox" class="b-sync" style="flex: 0.5;" ${shouldSync ? 'checked' : ''}>
        <input type="text" class="b-notes" placeholder="Notes..." style="flex: 4;" required>
        <p class="row-remover" style="flex: 0.5;">×</p>
    `;

    const dInput = row.querySelector('.b-date');
    dInput.oninput = () => {
      const era = row.querySelector('.b-era').value;
      const check = this.parseSmartDate(dInput.value, era);
      dInput.classList.toggle('invalid', !check.isValid && dInput.value !== "");
    };

    row.querySelector('.row-remover').onclick = () => row.remove();
    container.appendChild(row);
  },
  async setupPWA() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
        // console.log("Service Worker Active");
      } catch (err) {
        console.log("Service Worker Error", err);
      }
    }
  },

  getGroupedEvents(events) {
    if (!events || events.length === 0) return [];

    return events.reduce((acc, curr) => {
      const last = acc[acc.length - 1];
      // Format current description with a bullet
      const currentDesc = curr.desc ? `${curr.desc}` : "(No notes)";

      if (last && last.timestamp === curr.timestamp) {
        // If timestamps match, append to the existing group
        last.desc += `\n\n• ${currentDesc}`;
      } else {
        // Otherwise, create a new timeline entry
        acc.push({
          ...curr,
          desc: `• ${currentDesc}`
        });
      }
      return acc;
    }, []);
  },

  setupPickers() {
    // 1. Build 0-9 Buttons for every hanging picker
    document.querySelectorAll('.picker').forEach(picker => {
      picker.innerHTML = '';
      for (let i = 0; i <= 9; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.type = "button"; // Important: prevent form submission
        btn.onclick = () => {
          const input = picker.previousElementSibling;
          input.value = i;
          // Move focus to next input box automatically
          const nextWrapper = picker.parentElement.nextElementSibling;
          if (nextWrapper && nextWrapper.querySelector('input')) {
            nextWrapper.querySelector('input').focus();
          }
        };
        picker.appendChild(btn);
      }
    });

    // 2. Typing Behavior: Jump to next square on keystroke
    document.querySelectorAll('.digit-wrapper input').forEach(input => {
      input.addEventListener('input', (e) => {
        if (e.target.value.length === 1) {
          const nextWrapper = e.target.parentElement.nextElementSibling;
          if (nextWrapper && nextWrapper.querySelector('input')) {
            nextWrapper.querySelector('input').focus();
          }
        }
      });
      // Clear box on focus for easier re-entry
      input.addEventListener('focus', (e) => {
        e.target.value = '';
      });
    });
  },

  async updateTypeSuggestions() {
    const allEvents = await db.events.toArray();
    const types = [...new Set(allEvents.map(e => e.eventType))];
    const datalist = document.getElementById('topicOptions');
    if (datalist) {
      datalist.innerHTML = types.map(t => `<option value="${t}">`).join('');
    }
  }
};

// Allows the 'onclick' in the HTML to find the function
window.app = app;
// Start the Application
app.init();