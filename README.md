# 🌱 The Habit Map

> *Build streaks. Track progress. One day at a time.*

A fully client-side habit tracking web application built with pure **HTML, CSS, and Vanilla JavaScript** — no frameworks, no backend, no installation required. Just open `index.html` in a browser and start building better habits.

---

## 📁 Project Structure

```
habit-map/
├── index.html    — App structure and markup
├── styles.css    — All styling and responsive layout
├── script.js     — All application logic
└── README.md     — This file
```

---

## 🚀 Getting Started

### Option A — Open directly (quickest)

1. Download or clone all three files into the same folder.
2. Double-click `index.html` to open it in your browser.
3. That's it — the app runs entirely in your browser.

### Option B — VS Code with Live Server (recommended for development)

1. Open VS Code and go to **File → Open Folder**, then select your `habit-map` folder.
2. Install the **Live Server** extension (search for it in the Extensions tab on the left sidebar).
3. Right-click `index.html` in the Explorer panel and choose **Open with Live Server**.
4. The app opens at `http://127.0.0.1:5500` and auto-refreshes when you save changes.

> **No npm, no build step, no terminal commands required.**

---

## ✨ Features

### 📋 Dashboard

The main view for managing your daily habits.

| Feature | Description |
|---|---|
| **Add habits** | Name, weekly target (1–7 days), and category |
| **Mark complete** | Circular checkbox — tap to log today's completion |
| **Streak counter** | 🔥 Increments on check, decrements on uncheck (never below 0) |
| **Mini progress bar** | Visual streak progress relative to your monthly target |
| **Delete habits** | Remove a habit and all its scheduled sessions |
| **Filter by category** | Show only habits from one category |
| **Sort by streak** | Toggle to rank habits from highest to lowest streak |
| **Summary dashboard** | Live cards showing total habits, done today, and % completion |
| **Auto-save** | All data saved to `localStorage` — survives page refreshes |

**Categories available:**
- Health
- Fitness
- Learning
- Productivity
- Personal Development

---

### 🕐 Live Clock

A real-time clock is displayed in the top-right corner of the header at all times, showing:

- Current time in **HH:MM:SS** format
- Current day, date, and month

The clock updates every second and is visible across all tabs.

---

### 📅 Weekly Planner

Plan specific sessions for each habit across the week.

- Navigate between weeks using the **← Prev** and **Next →** buttons.
- Each day column shows the date and any scheduled sessions.
- **Today's column** is highlighted with an orange border.
- Click **+ Add** on any day to open the scheduling modal.

**Scheduling a session:**

1. Select the habit from the dropdown.
2. Set the time using the time picker.
3. Add an optional note (e.g. "20 min run", "Chapter 3").
4. Click **Save session** — the chip appears on the calendar instantly.

Sessions are colour-coded chips showing the time and habit name. Click the **✕** on any chip to remove it.

---

### 🔔 Habit Reminders (Browser Notifications)

When you schedule a session, the app can send you a browser notification at the exact time you set — even if you're on a different tab.

**How to enable:**

1. On first load, a banner appears at the top of the page.
2. Click **Allow notifications**.
3. Your browser will ask for permission — click **Allow**.

**How it works:**

- Sessions scheduled for **today** are queued with `setTimeout` on page load.
- The live clock also checks every minute for due sessions as a backup.
- Notifications include the habit name and your optional note.
- A notification fires only once per session per minute.

> **Note:** Notifications require the browser tab to remain open. They will not work if the browser is fully closed. For best results, keep the tab open in the background.

**Browser support:** Chrome, Edge, Firefox, and most modern browsers. Safari on iOS does not support Web Notifications.

---

### 🗓 Monthly Goals

Set a target number of sessions per habit for each calendar month.

- Navigate months with **← Prev** and **Next →**.
- Each habit row shows a number input — type your monthly goal (e.g. 20 sessions).
- A progress bar fills as you complete sessions throughout the month.
- The counter shows `completed / goal` in real time.

**Below the goal rows**, a full month calendar grid displays:

- 🟠 **Orange dots** — sessions scheduled on that date
- 🟢 **Green dots** — sessions marked as completed
- Today's date is highlighted with a filled circle

---

### 📊 Insights

Compare your current performance against previous periods.

**Toggle between:**
- **This week** — compares to last week
- **This month** — compares to last month

**Comparison cards show:**

| Card | Description |
|---|---|
| Completions | Total habit completions in the period |
| Avg streak | Average streak across all habits |
| Habits done today / Active habits | Current snapshot |
| Scheduled sessions | Sessions planned this period vs last |

Each card shows a **↑ / ↓ / =** delta badge indicating whether performance has improved, declined, or stayed the same compared to the previous period.

**Streak bar chart** — a horizontal bar for each habit showing the current streak. Bars are sorted highest to lowest.

**Completion heatmap** — a 12-week grid (Mon–Sun rows) where each cell represents one day. The darker the green, the more completions that day.

| Shade | Meaning |
|---|---|
| Light grey | No completions |
| Light green | 1 completion |
| Medium green | 2 completions |
| Dark green | 3 completions |
| Darkest green | 4+ completions |

Hover over any cell to see the date and exact completion count in a tooltip.

---

## 💾 Data & Storage

All data is stored locally in your browser using `localStorage`. **Nothing is sent to any server.**

| Storage key | Contents |
|---|---|
| `habitmap_habits` | Array of all habit objects |
| `habitmap_sessions` | Array of all scheduled sessions |
| `habitmap_monthlyGoals` | Monthly session targets per habit |
| `habitmap_history` | Weekly and monthly performance snapshots |
| `habitmap_nextId` | Auto-increment ID counter |

**To reset all data:** Open your browser's Developer Tools → Application → Local Storage → delete all `habitmap_*` keys, then refresh the page.

---

## 🗂 Habit Data Structure

Each habit is stored as a JavaScript object:

```javascript
{
  id:        1,                      // unique number
  name:      "Read for 20 minutes",  // habit name
  category:  "Learning",             // one of the five categories
  target:    5,                      // target days per week (1–7)
  streak:    12,                     // current streak count
  doneToday: false                   // whether completed today
}
```

Each scheduled session:

```javascript
{
  id:      42,           // unique number
  habitId: 1,            // links to a habit's id
  date:    "2025-06-09", // ISO date string (YYYY-MM-DD)
  time:    "07:30",      // 24-hour time string (HH:MM)
  note:    "Morning run", // optional label
  done:    false         // whether this session was completed
}
```

---

## 🧩 JavaScript Function Reference

| Function | Description |
|---|---|
| `addHabit()` | Validates the form and creates a new habit |
| `deleteHabit(id)` | Removes a habit and its sessions by ID |
| `toggleHabit(id)` | Flips doneToday and adjusts the streak |
| `renderHabits()` | Rebuilds the habit list from the array |
| `updateSummary()` | Refreshes the three stat cards |
| `validateForm()` | Checks all three form fields; shows inline errors |
| `saveSession()` | Creates a new scheduled session from the modal form |
| `deleteSession(id)` | Removes a scheduled session |
| `renderWeekGrid()` | Draws the 7-day weekly planner grid |
| `renderMonthlyGoals()` | Renders the goal rows and month calendar |
| `renderMonthCal()` | Draws the full monthly calendar grid with dots |
| `refreshInsights()` | Recalculates and renders all Insights tab content |
| `renderStreakChart()` | Draws the horizontal streak bar chart |
| `renderHeatmap()` | Draws the 12-week completion heatmap |
| `snapshotHistory()` | Records weekly/monthly stats for comparison |
| `startClock()` | Starts the live clock ticker |
| `initNotifications()` | Sets up the browser notification permission flow |
| `checkSessionReminders(now)` | Fires notifications for sessions due right now |
| `saveToStorage()` | Serialises all state to localStorage |
| `loadFromStorage()` | Restores all state from localStorage |

---

## 🎨 Design System

The app uses a warm, editorial palette defined as CSS custom properties in `:root`:

| Variable | Value | Use |
|---|---|---|
| `--cream` | `#F5F0E8` | Page background |
| `--paper` | `#FDFAF4` | Cards and inputs |
| `--ink` | `#1C1A15` | Primary text, buttons |
| `--sienna` | `#C05A2A` | Accent — streaks, today highlight |
| `--sage` | `#4A7C59` | Success — completion, done state |
| `--gold` | `#B8860B` | Learning category pill |
| `--plum` | `#7B3F6E` | Productivity category pill |
| `--sky` | `#2D6A8F` | Fitness category pill |
| `--red-err` | `#B03030` | Validation errors |

**Typography:**
- **Display / headings** — DM Serif Display (italic accent on "Habit")
- **Body / UI** — DM Sans (300, 400, 500, 600 weights)

Both fonts load from Google Fonts and require an internet connection on first load. They are cached by the browser after that.

---

## 📱 Responsive Behaviour

| Screen width | Layout changes |
|---|---|
| > 700px | Full 7-column week grid, 2-column insights |
| ≤ 700px | 4-column week grid, 1-column insights |
| ≤ 540px | 3-column week grid, 1-column form, 2-column summary |

---

## 🛡 Technical Notes

- **No frameworks** — plain HTML, CSS, and ES6 JavaScript only.
- **No build tools** — works by opening the file directly.
- **No external libraries** — the only external resource is Google Fonts (CSS only).
- **No inline event handlers** — all events wired with `addEventListener()`.
- **XSS safe** — all user input is escaped via `escapeHtml()` before insertion into the DOM.
- **Delegated events** — the habit list and week grid use event delegation, so dynamically rendered cards work without re-attaching listeners.

---

## 🌐 Browser Compatibility

| Browser | Supported |
|---|---|
| Chrome 90+ | ✅ Full support including notifications |
| Edge 90+ | ✅ Full support including notifications |
| Firefox 90+ | ✅ Full support including notifications |
| Safari 15+ (macOS) | ✅ Most features; notifications require macOS 13+ |
| Safari (iOS) | ⚠️ All features except push notifications |
| Opera / Brave | ✅ Full support |

---

## 📄 Licence


---

*Built with ❤️ using only HTML, CSS, and JavaScript.*