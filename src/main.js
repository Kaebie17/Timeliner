import './style.css';
import Dexie from 'dexie';
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const db = new Dexie('ChronologySamajhDB');
db.version(3).stores({ events: '++id, topic, timestamp' });

// State Management
let currentView = 'library'; // 'library' or 'timeline'
let activeTopic = '';

const app = {
  init() {
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    document.getElementById('eventForm').onsubmit = (e) => this.saveEvent(e);
    document.getElementById('backBtn').onclick = () => { currentView = 'library'; this.render(); };
    document.getElementById('exportBtn').onclick = () => this.exportPDF();
    
    // Listen for clicks on the Library or Timeline
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('view-chrono')) {
        activeTopic = e.target.dataset.topic;
        currentView = 'timeline';
        this.render();
      }
      if (e.target.classList.contains('del-chrono')) {
        this.deleteChronology(e.target.dataset.topic);
      }
      if (e.target.classList.contains('delete-event')) {
        this.deleteEvent(e.target.dataset.id);
      }
    });
  },

  async saveEvent(e) {
    e.preventDefault();
    const topic = document.getElementById('topicInput').value.trim();
    const title = document.getElementById('eventTitle').value.trim();
    const type = document.getElementById('dateType').value;
    const val = document.getElementById('dateVal').value;
    const desc = document.getElementById('desc').value;

    let ts = 0;
    if (type === 'date') ts = new Date(val).getTime();
    else if (type === 'year') ts = new Date(val, 0, 1).getTime();
    else ts = (parseInt(val) - 1) * 100 * 31536000000;

    await db.events.add({ topic, title, type, val, desc, timestamp: ts });
    
    document.getElementById('eventForm').reset();
    currentView = 'timeline';
    activeTopic = topic;
    this.render();
  },

  async deleteChronology(topic) {
    if (confirm(`Delete entire "${topic}" chronology?`)) {
      await db.events.where('topic').equals(topic).delete();
      this.render();
    }
  },

  async deleteEvent(id) {
    await db.events.delete(Number(id));
    this.render();
  },

  async render() {
    const allEvents = await db.events.toArray();
    const topics = [...new Set(allEvents.map(e => e.topic))];

    // Update Topic Memory (Datalist)
    document.getElementById('topicList').innerHTML = topics.map(t => `<option value="${t}">`).join('');

    const librarySection = document.getElementById('librarySection');
    const timelineSection = document.getElementById('timelineSection');

    if (currentView === 'library') {
      librarySection.classList.remove('hidden');
      timelineSection.classList.add('hidden');
      this.renderLibrary(topics, allEvents);
    } else {
      librarySection.classList.add('hidden');
      timelineSection.classList.remove('hidden');
      this.renderTimeline();
    }
  },

  renderLibrary(topics, allEvents) {
    const container = document.getElementById('libraryGrid');
    container.innerHTML = topics.length ? '' : '<p class="empty">No chronologies built yet.</p>';

    topics.forEach(topic => {
      const count = allEvents.filter(e => e.topic === topic).length;
      const card = document.createElement('div');
      card.className = 'chrono-card';
      card.innerHTML = `
        <div class="card-info">
          <h3>${topic}</h3>
          <p>${count} Events recorded</p>
        </div>
        <div class="card-actions">
          <button class="view-chrono btn-s" data-topic="${topic}">Expand</button>
          <button class="del-chrono btn-del" data-topic="${topic}">Delete</button>
        </div>
      `;
      container.appendChild(card);
    });
  },

  async renderTimeline() {
    const events = await db.events.where('topic').equals(activeTopic).sortBy('timestamp');
    document.getElementById('timelineTitle').innerText = activeTopic;
    const container = document.getElementById('timelineDisplay');
    container.innerHTML = '<div id="watermark">CHRONOLOGY SAMAJH</div>';

    events.forEach(ev => {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      item.innerHTML = `
        <div class="dot"></div>
        <div class="content">
          <small>${ev.val}</small>
          <h4>${ev.title}</h4>
          <p>${ev.desc}</p>
          <button class="delete-event text-red" data-id="${ev.id}">Remove</button>
        </div>
      `;
      container.appendChild(item);
    });
  },

  async exportPDF() {
    const el = document.getElementById('timelineDisplay');
    document.getElementById('watermark').style.opacity = '0.08';
    const canvas = await html2canvas(el, { scale: 2 });
    document.getElementById('watermark').style.opacity = '0';
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(imgData, 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width);
    pdf.save(`${activeTopic}-Timeline.pdf`);
  }
};

app.init();