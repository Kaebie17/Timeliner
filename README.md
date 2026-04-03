# ⏳ Timeliner

**Timeliner** is a sleek, "Privacy-First" progressive web application (PWA) designed to help students, researchers, and individuals track chronological events. Whether you are documenting the French Revolution for a thesis or keeping a log of personal family milestones, Timeliner organizes your data into a beautiful, exportable timeline.

---

## ✨ Key Features

-   **Flexible Chronology:** Input dates by specific day, month/year, year, or even by century. The app intelligently sorts them in perfect order.
-   **Local-First Storage:** Uses **IndexedDB (via Dexie.js)** to store all your data directly on your device. No accounts, no servers, and 100% privacy.
-   **Academic PDF Export:** Generate a clean, professional PDF of your timeline with a subtle "Timeliner" watermark—perfect for printing or attaching to assignments.
-   **Mobile PWA:** Install Timeliner on your iPhone or Android home screen. It works offline and feels like a native app.
-   **Smart Anniversaries:** Receive background notifications when a historical or personal event reaches its anniversary on the current date.
-   **Premium UI:** A modern, minimal interface built with custom CSS, featuring glassmorphism effects and smooth entrance animations.

---

## 🛠️ Tech Stack

-   **Frontend:** Vanilla JavaScript (ES6+), HTML5, Custom CSS3
-   **Build Tool:** [Vite](https://vitejs.dev/)
-   **Database:** [Dexie.js](https://dexie.org/) (Wrapper for IndexedDB)
-   **PDF Generation:** [jsPDF](https://github.com/parallax/jsPDF) & [html2canvas](https://html2canvas.hertzen.com/)
-   **Icons:** Custom SVG Branding

---

## 🚀 Getting Started

### Prerequisites
-   [Node.js](https://nodejs.org/) (LTS version recommended)

### Installation
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/timeliner.git
    cd timeliner
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` in your browser.

---

## 📱 Mobile Installation

1.  Host the app on an HTTPS-enabled server (like Vercel or GitHub Pages).
2.  Open the link in your mobile browser.
3.  Tap **"Add to Home Screen"** (iOS: Share Button | Android: Three Dots).
4.  Launch **Timeliner** from your app drawer.

---

## 📄 Academic Use & Export

To export your timeline:
1.  Click the **"Download PDF"** button at the top right.
2.  The app will capture your current timeline view, apply the "Timeliner" watermark, and generate a high-resolution A4 document.

---

## 🔒 Privacy & Security

Timeliner does not collect, track, or sell your data. Because it uses IndexedDB, your information never leaves your device. Clearing your browser cache/site data will delete your timeline, so be sure to use the PDF export feature to keep permanent records.

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.