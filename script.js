/*
 * ================================================================
 *  THE HABIT MAP — script.js  (v2)
 * ================================================================
 *
 *  Data stored in localStorage:
 *    habitmap_habits       — array of habit objects
 *    habitmap_nextId       — auto-increment counter
 *    habitmap_sessions     — array of scheduled sessions
 *    habitmap_monthlyGoals — object { habitId: { YYYY-MM: N } }
 *    habitmap_history      — object { habitId: { YYYY-WW: { streak, done } } }
 *
 *  Key object shapes:
 *    Habit:   { id, name, category, target, streak, doneToday }
 *    Session: { id, habitId, date (YYYY-MM-DD), time (HH:MM), note, done }
 * ================================================================
 */


/* ═══════════════════════════════════════════════════════════════
   SECTION 1 — STATE
═══════════════════════════════════════════════════════════════ */

let habits = [];
let sessions = [];   // scheduled sessions (weekly planner)
let monthlyGoals = {};   // { habitId: { "2025-06": 20 } }
let history = {};   // { habitId: { "2025-W23": { streak, done } } }
let nextId = 1;
let sortByStreak = false;
let filterCat = '';

// Planner state
let plannerWeekOffset = 0;  // 0 = current week, -1 = last week, etc.
let schedulingDate = null;  // ISO date string for the open modal

// Monthly goals state
let monthlyOffset = 0;  // 0 = current month

// Insights state
let insightsPeriod = 'week'; // 'week' | 'month'

// Notification timer refs
const notifTimers = {};


/* ═══════════════════════════════════════════════════════════════
   SECTION 2 — PERSISTENCE
═══════════════════════════════════════════════════════════════ */

function saveToStorage() {
    localStorage.setItem('habitmap_habits', JSON.stringify(habits));
    localStorage.setItem('habitmap_nextId', String(nextId));
    localStorage.setItem('habitmap_sessions', JSON.stringify(sessions));
    localStorage.setItem('habitmap_monthlyGoals', JSON.stringify(monthlyGoals));
    localStorage.setItem('habitmap_history', JSON.stringify(history));
}

function loadFromStorage() {
    try { habits = JSON.parse(localStorage.getItem('habitmap_habits')) || []; } catch (e) { habits = []; }
    try { sessions = JSON.parse(localStorage.getItem('habitmap_sessions')) || []; } catch (e) { sessions = []; }
    try { monthlyGoals = JSON.parse(localStorage.getItem('habitmap_monthlyGoals')) || {}; } catch (e) { monthlyGoals = {}; }
    try { history = JSON.parse(localStorage.getItem('habitmap_history')) || {}; } catch (e) { history = {}; }
    const sid = localStorage.getItem('habitmap_nextId');
    if (sid) nextId = parseInt(sid, 10);
}


/* ═══════════════════════════════════════════════════════════════
   SECTION 3 — DATE / TIME UTILITIES
═══════════════════════════════════════════════════════════════ */

/** Returns today as YYYY-MM-DD */
function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

/** Returns the Monday of the week containing `date` */
function weekStart(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun
    const diff = (day === 0) ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
}

/** Returns array of 7 Date objects for the week containing the offset */
function weekDates(offsetWeeks) {
    const now = new Date();
    now.setDate(now.getDate() + offsetWeeks * 7);
    const mon = weekStart(now);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        return d;
    });
}

/** Format Date as YYYY-MM-DD */
function fmtISO(d) {
    return d.toISOString().slice(0, 10);
}

/** Format Date as "Mon 12" */
function fmtDayShort(d) {
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
}

/** Returns "YYYY-WXX" week key for a date */
function weekKey(date) {
    const d = new Date(date);
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Returns "YYYY-MM" for a Date */
function monthKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Returns the month Date for an offset from today */
function monthDate(offset) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return d;
}

/** Number of days in a month */
function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

/** Returns previous weekKey relative to a given weekKey string */
function prevWeekKey(wk) {
    // parse the date of the Monday of wk and subtract 7 days
    const [y, w] = wk.split('-W').map(Number);
    const jan1 = new Date(y, 0, 1);
    const monday = new Date(jan1.getTime() + (w - 1) * 7 * 86400000);
    monday.setDate(monday.getDate() - 7);
    return weekKey(monday);
}

/** Returns previous monthKey */
function prevMonthKey(mk) {
    const [y, m] = mk.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return monthKey(d);
}


/* ═══════════════════════════════════════════════════════════════
   SECTION 4 — LIVE CLOCK
═══════════════════════════════════════════════════════════════ */

function startClock() {
    function tick() {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        document.getElementById('clock-time').textContent = `${hh}:${mm}:${ss}`;
        document.getElementById('clock-date').textContent =
            now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

        // Check if any sessions are due right now (same minute)
        checkSessionReminders(now);
    }
    tick();
    setInterval(tick, 1000);
}


/* ═══════════════════════════════════════════════════════════════
   SECTION 5 — NOTIFICATIONS
═══════════════════════════════════════════════════════════════ */

function initNotifications() {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
        // Show banner asking user to enable
        document.getElementById('notif-banner').classList.remove('hidden');
    }

    document.getElementById('btn-allow-notif').addEventListener('click', () => {
        Notification.requestPermission().then(p => {
            document.getElementById('notif-banner').classList.add('hidden');
        });
    });

    document.getElementById('btn-dismiss-notif').addEventListener('click', () => {
        document.getElementById('notif-banner').classList.add('hidden');
    });
}

/**
 * Fires a browser notification for a session if it matches HH:MM right now
 * and hasn't fired already this minute.
 */
function checkSessionReminders(now) {
    if (Notification.permission !== 'granted') return;

    const todayStr = fmtISO(now);
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    const ss = now.getSeconds();

    // Only fire in the first 5 seconds of the minute to avoid repeated alerts
    if (ss > 5) return;

    sessions.forEach(s => {
        if (s.date !== todayStr) return;
        if (s.time !== currentTime) return;
        if (s.done) return;

        const timerKey = `${s.id}-${s.date}-${s.time}`;
        if (notifTimers[timerKey]) return;  // already fired this minute

        notifTimers[timerKey] = true;
        const habit = habits.find(h => h.id === s.habitId);
        const name = habit ? habit.name : 'Habit';

        new Notification('⏰ Habit Reminder — The Habit Map', {
            body: `Time for: ${name}${s.note ? '\n' + s.note : ''}`,
            icon: 'https://em-content.zobj.net/source/apple/391/seedling_1f331.png',
        });
    });
}

function sendTestNotification() {
    if (Notification.permission !== 'granted') return;
    new Notification('✅ Notifications enabled!', {
        body: 'You\'ll receive habit reminders on time.',
    });
}


/* ═══════════════════════════════════════════════════════════════
   SECTION 6 — HISTORY SNAPSHOT
   Saves a weekly and monthly snapshot of each habit's stats.
   Call this once per app load.
═══════════════════════════════════════════════════════════════ */

function snapshotHistory() {
    const wk = weekKey(new Date());
    const mk = monthKey(new Date());

    habits.forEach(h => {
        if (!history[h.id]) history[h.id] = {};

        // Weekly snapshot: always update current week entry
        if (!history[h.id][wk]) history[h.id][wk] = { streak: 0, done: 0 };
        history[h.id][wk].streak = h.streak;
        if (h.doneToday) history[h.id][wk].done += 1;

        // Monthly snapshot
        if (!history[h.id][mk]) history[h.id][mk] = { streak: 0, done: 0 };
        history[h.id][mk].streak = h.streak;
        if (h.doneToday) history[h.id][mk].done += 1;
    });

    saveToStorage();
}


/* ═══════════════════════════════════════════════════════════════
   SECTION 7 — HELPERS
═══════════════════════════════════════════════════════════════ */

function catClass(category) {
    const map = {
        'Health': 'cat-health', 'Fitness': 'cat-fitness',
        'Learning': 'cat-learning', 'Productivity': 'cat-productivity',
        'Personal Development': 'cat-personal',
    };
    return map[category] || 'cat-health';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(errId, inputId) {
    document.getElementById(errId).classList.add('visible');
    document.getElementById(inputId).classList.add('error');
}

function clearError(errId, inputId) {
    document.getElementById(errId).classList.remove('visible');
    document.getElementById(inputId).classList.remove('error');
}


/* ═══════════════════════════════════════════════════════════════
   SECTION 8 — DASHBOARD (original feature set)
═══════════════════════════════════════════════════════════════ */

function validateForm() {
    const nameEl = document.getElementById('input-name');
    const targetEl = document.getElementById('input-target');
    const catEl = document.getElementById('input-category');
    let valid = true;

    if (nameEl.value.trim().length < 3) {
        showError('err-name', 'input-name'); valid = false;
    } else { clearError('err-name', 'input-name'); }

    const t = parseFloat(targetEl.value);
    if (!Number.isInteger(t) || t < 1 || t > 7) {
        showError('err-target', 'input-target'); valid = false;
    } else { clearError('err-target', 'input-target'); }

    if (catEl.value === '') {
        showError('err-cat', 'input-category'); valid = false;
    } else { clearError('err-cat', 'input-category'); }

    return valid;
}

function addHabit() {
    if (!validateForm()) return;

    const habit = {
        id: nextId++,
        name: document.getElementById('input-name').value.trim(),
        category: document.getElementById('input-category').value,
        target: parseInt(document.getElementById('input-target').value, 10),
        streak: 0,
        doneToday: false,
    };

    habits.push(habit);
    saveToStorage();
    renderHabits();
    updateSummary();
    refreshPlannerHabitSelect();
    refreshInsights();

    document.getElementById('input-name').value = '';
    document.getElementById('input-target').value = '';
    document.getElementById('input-category').value = '';
    document.getElementById('input-name').focus();
}

function deleteHabit(id) {
    habits = habits.filter(h => h.id !== id);
    // Also remove any sessions for this habit
    sessions = sessions.filter(s => s.habitId !== id);
    saveToStorage();
    renderHabits();
    updateSummary();
    renderWeekGrid();
    refreshInsights();
}

function toggleHabit(id) {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;

    habit.doneToday = !habit.doneToday;
    habit.streak = habit.doneToday
        ? habit.streak + 1
        : Math.max(0, habit.streak - 1);

    snapshotHistory();
    saveToStorage();
    renderHabits();
    updateSummary();
    refreshInsights();
}

function renderHabits() {
    const container = document.getElementById('habit-list');

    let visible = filterCat
        ? habits.filter(h => h.category === filterCat)
        : [...habits];

    if (sortByStreak) visible.sort((a, b) => b.streak - a.streak);

    if (visible.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>${habits.length === 0
                ? 'No habits yet. Add your first habit above!'
                : 'No habits match the selected filter.'}</p>
      </div>`;
        return;
    }

    container.innerHTML = visible.map(h => {
        const pct = Math.min(100, Math.round((h.streak / (h.target * 4)) * 100));
        const doneClass = h.doneToday ? 'done' : '';
        const cc = catClass(h.category);
        return `
      <div class="habit-card ${doneClass}" data-id="${h.id}">
        <input type="checkbox" class="habit-check"
          aria-label="Mark ${escapeHtml(h.name)} as done"
          ${h.doneToday ? 'checked' : ''} data-toggle="${h.id}" />
        <div class="habit-info">
          <div class="habit-name">${escapeHtml(h.name)}</div>
          <div class="habit-meta">
            <span class="cat-pill ${cc}">${escapeHtml(h.category)}</span>
            <span class="habit-target">${h.target}×/week</span>
            <span class="streak-badge">🔥 ${h.streak}</span>
          </div>
          <div class="habit-progress-wrap">
            <div class="habit-progress-bar" style="width:${pct}%"></div>
          </div>
        </div>
        <button class="btn-delete" data-delete="${h.id}">Delete</button>
      </div>`;
    }).join('');
}

function updateSummary() {
    const total = habits.length;
    const doneNum = habits.filter(h => h.doneToday).length;
    const pct = total === 0 ? null : Math.round((doneNum / total) * 100);

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-done').textContent = doneNum;
    document.getElementById('stat-pct').textContent = pct === null ? '—' : pct + '%';
    document.getElementById('summary-bar').style.width = (pct ?? 0) + '%';
}


/* ═══════════════════════════════════════════════════════════════
   SECTION 9 — WEEKLY PLANNER
═══════════════════════════════════════════════════════════════ */

function renderWeekGrid() {
    const days = weekDates(plannerWeekOffset);
    const today = todayISO();

    // Update week label
    const first = fmtDayShort(days[0]);
    const last = fmtDayShort(days[6]);
    document.getElementById('week-label').textContent = `${first} – ${last}`;

    const grid = document.getElementById('week-grid');
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    grid.innerHTML = days.map((d, i) => {
        const iso = fmtISO(d);
        const isToday = iso === today;
        const daySessions = sessions
            .filter(s => s.date === iso)
            .sort((a, b) => a.time.localeCompare(b.time));

        const chips = daySessions.map(s => {
            const habit = habits.find(h => h.id === s.habitId);
            const hName = habit ? escapeHtml(habit.name) : '(deleted)';
            const doneClass = s.done ? 'chip-done' : '';
            return `
        <div class="session-chip ${doneClass}" title="${hName}${s.note ? ' — ' + escapeHtml(s.note) : ''}">
          <button class="chip-delete" data-del-session="${s.id}" title="Remove">✕</button>
          <span class="chip-time">${s.time}</span>
          <span class="chip-name">${hName}</span>
        </div>`;
        }).join('');

        return `
      <div class="day-col ${isToday ? 'today' : ''}">
        <div class="day-col-header">
          <div class="day-name">${DAY_NAMES[i]}</div>
          <div class="day-num">${d.getDate()}</div>
        </div>
        ${chips}
        <button class="btn-add-session" data-date="${iso}">+ Add</button>
      </div>`;
    }).join('');
}

/** Populate the habit select in the schedule modal */
function refreshPlannerHabitSelect() {
    const sel = document.getElementById('sch-habit');
    const current = sel.value;
    sel.innerHTML = '<option value="">— Select habit —</option>' +
        habits.map(h =>
            `<option value="${h.id}" ${String(h.id) === current ? 'selected' : ''}>${escapeHtml(h.name)}</option>`
        ).join('');
}

function openScheduleModal(dateISO) {
    schedulingDate = dateISO;
    const d = new Date(dateISO + 'T00:00:00');
    document.getElementById('modal-title').textContent =
        'Schedule — ' + d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    document.getElementById('sch-time').value = '';
    document.getElementById('sch-note').value = '';
    document.getElementById('sch-habit').value = '';
    document.getElementById('schedule-modal').classList.remove('hidden');
}

function closeScheduleModal() {
    document.getElementById('schedule-modal').classList.add('hidden');
    schedulingDate = null;
}

function saveSession() {
    const habitId = parseInt(document.getElementById('sch-habit').value, 10);
    const time = document.getElementById('sch-time').value;
    let valid = true;

    if (!habitId) { showError('err-sch-habit', 'sch-habit'); valid = false; }
    else { clearError('err-sch-habit', 'sch-habit'); }

    if (!time) { showError('err-sch-time', 'sch-time'); valid = false; }
    else { clearError('err-sch-time', 'sch-time'); }

    if (!valid) return;

    const session = {
        id: nextId++,
        habitId: habitId,
        date: schedulingDate,
        time: time,
        note: document.getElementById('sch-note').value.trim(),
        done: false,
    };

    sessions.push(session);
    saveToStorage();
    closeScheduleModal();
    renderWeekGrid();
    renderMonthCal();  // update dots on month calendar too

    // Schedule a browser notification if date is today
    if (schedulingDate === todayISO() && Notification.permission === 'granted') {
        scheduleNotificationForSession(session);
    }
}

/**
 * Schedules a setTimeout-based notification for a session happening today.
 * (The clock-based check also catches it; this is a belt-and-braces backup.)
 */
function scheduleNotificationForSession(session) {
    const [hh, mm] = session.time.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hh, mm, 0, 0);
    const diff = target - now;
    if (diff < 0) return; // already passed

    setTimeout(() => {
        if (Notification.permission !== 'granted') return;
        const habit = habits.find(h => h.id === session.habitId);
        new Notification('⏰ Habit Reminder — The Habit Map', {
            body: `Time for: ${habit ? habit.name : 'Habit'}${session.note ? '\n' + session.note : ''}`,
            icon: 'https://em-content.zobj.net/source/apple/391/seedling_1f331.png',
        });
    }, diff);
}

/** Re-schedule notifications for all today's sessions on page load */
function rescheduleAllTodayNotifications() {
    const today = todayISO();
    sessions
        .filter(s => s.date === today && !s.done)
        .forEach(scheduleNotificationForSession);
}

function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id);
    saveToStorage();
    renderWeekGrid();
    renderMonthCal();
}


/* ═══════════════════════════════════════════════════════════════
   SECTION 10 — MONTHLY GOALS
═══════════════════════════════════════════════════════════════ */

function renderMonthlyGoals() {
    const d = monthDate(monthlyOffset);
    const mk = monthKey(d);

    document.getElementById('month-label').textContent =
        d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    const container = document.getElementById('monthly-goal-list');

    if (habits.length === 0) {
        container.innerHTML = '<p style="color:var(--ink-light);font-size:0.9rem">Add habits on the Dashboard first.</p>';
        renderMonthCal();
        return;
    }

    // Count actual completions this month from sessions
    const sessionDoneThisMonth = {};
    sessions
        .filter(s => s.date.startsWith(mk) && s.done)
        .forEach(s => {
            sessionDoneThisMonth[s.habitId] = (sessionDoneThisMonth[s.habitId] || 0) + 1;
        });

    // Also count habit.doneToday if today is in this month
    const todayMk = monthKey(new Date());
    habits.forEach(h => {
        if (h.doneToday && todayMk === mk) {
            sessionDoneThisMonth[h.id] = (sessionDoneThisMonth[h.id] || 0) + 1;
        }
    });

    container.innerHTML = habits.map(h => {
        if (!monthlyGoals[h.id]) monthlyGoals[h.id] = {};
        const goal = monthlyGoals[h.id][mk] || 0;
        const done = sessionDoneThisMonth[h.id] || 0;
        const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;

        return `
      <div class="goal-row">
        <div class="goal-row-name">
          ${escapeHtml(h.name)}
          <div class="goal-row-cat">${escapeHtml(h.category)}</div>
        </div>
        <div class="goal-input-wrap">
          <label>Monthly goal (sessions):</label>
          <input type="number" min="0" max="365" step="1"
            class="goal-input"
            data-habit="${h.id}"
            data-mk="${mk}"
            value="${goal}"
            placeholder="0" />
        </div>
        <div class="goal-bar-wrap">
          <div class="goal-bar" style="width:${pct}%"></div>
        </div>
        <div class="goal-progress-label">${done}${goal > 0 ? ' / ' + goal : ''}</div>
      </div>`;
    }).join('');

    renderMonthCal();
}

function renderMonthCal() {
    const d = monthDate(monthlyOffset);
    const year = d.getFullYear();
    const month = d.getMonth();
    const today = new Date();
    const mk = monthKey(d);

    // Build a set of dates that have sessions this month
    const sessionDates = {};
    sessions
        .filter(s => s.date.startsWith(mk))
        .forEach(s => {
            if (!sessionDates[s.date]) sessionDates[s.date] = { total: 0, done: 0 };
            sessionDates[s.date].total++;
            if (s.done) sessionDates[s.date].done++;
        });

    // Also mark today if any habit is done
    const todayISO_ = fmtISO(today);
    if (monthKey(today) === mk && habits.some(h => h.doneToday)) {
        if (!sessionDates[todayISO_]) sessionDates[todayISO_] = { total: 1, done: 1 };
    }

    const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const firstDay = new Date(year, month, 1);
    // getDay(): 0=Sun. Convert to Mon-based (0=Mon)
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const totalDays = daysInMonth(year, month);
    const cells = [];

    // Leading empty cells from previous month
    const prevMonthDays = daysInMonth(year, month - 1);
    for (let i = 0; i < startDow; i++) {
        const dayNum = prevMonthDays - startDow + 1 + i;
        cells.push({ day: dayNum, thisMonth: false, dateStr: null });
    }

    for (let day = 1; day <= totalDays; day++) {
        const dt = new Date(year, month, day);
        const iso = fmtISO(dt);
        const isToday = iso === fmtISO(today);
        cells.push({ day, thisMonth: true, dateStr: iso, isToday });
    }

    // Trailing cells
    const remainder = cells.length % 7;
    if (remainder !== 0) {
        for (let i = 1; i <= 7 - remainder; i++) {
            cells.push({ day: i, thisMonth: false, dateStr: null });
        }
    }

    const headerHTML = DAY_NAMES_SHORT.map(n =>
        `<div class="cal-day-name">${n}</div>`).join('');

    const cellsHTML = cells.map(c => {
        const todayCls = c.isToday ? 'today-cell' : '';
        const otherCls = !c.thisMonth ? 'other-month' : '';
        let dotsHTML = '';

        if (c.dateStr && sessionDates[c.dateStr]) {
            const sd = sessionDates[c.dateStr];
            const dots = Array.from({ length: Math.min(sd.total, 5) }, (_, i) =>
                `<div class="cal-dot ${i < sd.done ? 'done-dot' : ''}"></div>`
            ).join('');
            dotsHTML = `<div class="cal-dot-row">${dots}</div>`;
        }

        return `
      <div class="cal-cell ${todayCls} ${otherCls}">
        <div class="cal-cell-num">${c.day}</div>
        ${dotsHTML}
      </div>`;
    }).join('');

    document.getElementById('month-cal').innerHTML = `
    <div class="cal-header">${headerHTML}</div>
    <div class="cal-grid">${cellsHTML}</div>`;
}


/* ═══════════════════════════════════════════════════════════════
   SECTION 11 — INSIGHTS (performance comparison)
═══════════════════════════════════════════════════════════════ */

function refreshInsights() {
    const now = new Date();

    if (insightsPeriod === 'week') {
        const currentKey = weekKey(now);
        const prevKey = prevWeekKey(currentKey);

        // Current week totals
        let curDone = 0, curStreakSum = 0;
        habits.forEach(h => {
            const cur = (history[h.id] || {})[currentKey] || {};
            curDone += (cur.done || 0);
            curStreakSum += (cur.streak || h.streak);
        });

        // Prev week totals
        let prevDone = 0, prevStreakSum = 0;
        habits.forEach(h => {
            const prev = (history[h.id] || {})[prevKey] || {};
            prevDone += (prev.done || 0);
            prevStreakSum += (prev.streak || 0);
        });

        renderInsightCards([
            { label: 'Completions this week', cur: curDone, prev: prevDone, unit: '' },
            {
                label: 'Avg streak', cur: habits.length ? Math.round(curStreakSum / habits.length) : 0,
                prev: habits.length ? Math.round(prevStreakSum / habits.length) : 0,
                unit: ''
            },
            {
                label: 'Habits completed today', cur: habits.filter(h => h.doneToday).length,
                prev: null, unit: ''
            },
            { label: 'Active habits', cur: habits.length, prev: null, unit: '' },
        ]);

    } else {
        const currentMK = monthKey(now);
        const prevMK = prevMonthKey(currentMK);

        let curDone = 0, prevDone = 0, curStreak = 0, prevStreak = 0;
        habits.forEach(h => {
            const cur = (history[h.id] || {})[currentMK] || {};
            const prev = (history[h.id] || {})[prevMK] || {};
            curDone += (cur.done || 0);
            prevDone += (prev.done || 0);
            curStreak += (cur.streak || h.streak);
            prevStreak += (prev.streak || 0);
        });

        const n = habits.length || 1;
        renderInsightCards([
            { label: 'Completions this month', cur: curDone, prev: prevDone, unit: '' },
            { label: 'Avg streak this month', cur: Math.round(curStreak / n), prev: Math.round(prevStreak / n), unit: '' },
            { label: 'Active habits', cur: habits.length, prev: null, unit: '' },
            {
                label: 'Scheduled sessions', cur: sessions.filter(s => s.date.startsWith(currentMK)).length,
                prev: sessions.filter(s => s.date.startsWith(prevMK)).length, unit: ''
            },
        ]);
    }

    renderStreakChart();
    renderHeatmap();
}

function renderInsightCards(cards) {
    document.getElementById('insights-grid').innerHTML = cards.map(c => {
        const hasPrev = c.prev !== null && c.prev !== undefined;
        let deltaHTML = '';
        if (hasPrev) {
            const diff = c.cur - c.prev;
            const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same';
            const icon = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
            deltaHTML = `<span class="ic-delta ${cls}">${icon} ${Math.abs(diff)}</span>`;
        }
        const prevLabel = hasPrev ? `<span class="ic-prev">prev: ${c.prev}${c.unit}</span>` : '';

        return `
      <div class="insight-card">
        <div class="ic-label">${c.label}</div>
        <div class="ic-row">
          <div class="ic-current">${c.cur}${c.unit}</div>
          ${prevLabel}
          ${deltaHTML}
        </div>
      </div>`;
    }).join('');
}

function renderStreakChart() {
    const container = document.getElementById('streak-chart');
    if (habits.length === 0) {
        container.innerHTML = '<p style="color:var(--ink-light);font-size:0.88rem">No habits yet.</p>';
        return;
    }

    const maxStreak = Math.max(1, ...habits.map(h => h.streak));

    // Get previous period streak for comparison
    const now = new Date();
    const prevKey = insightsPeriod === 'week' ? prevWeekKey(weekKey(now)) : prevMonthKey(monthKey(now));

    container.innerHTML = habits
        .slice()
        .sort((a, b) => b.streak - a.streak)
        .map(h => {
            const prevData = (history[h.id] || {})[prevKey] || {};
            const prevStreak = prevData.streak || 0;
            const curPct = Math.min(100, Math.round((h.streak / maxStreak) * 100));
            const prevPct = Math.min(100, Math.round((prevStreak / maxStreak) * 100));

            return `
        <div class="sc-row">
          <div class="sc-label" title="${escapeHtml(h.name)}">${escapeHtml(h.name)}</div>
          <div class="sc-bar-wrap" title="Current: ${h.streak} | Previous: ${prevStreak}">
            <div class="sc-bar-current" style="width:${curPct}%"></div>
          </div>
          <div class="sc-val">${h.streak}</div>
        </div>`;
        }).join('');
}

function renderHeatmap() {
    const container = document.getElementById('heatmap');
    const today = new Date();

    // Build 12 weeks × 7 days grid (84 days ending today)
    const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    // Create session-date lookup (count per date)
    const dateCounts = {};
    sessions.forEach(s => {
        if (s.done) dateCounts[s.date] = (dateCounts[s.date] || 0) + 1;
    });
    // Add habit completions for today
    if (habits.some(h => h.doneToday)) {
        const t = fmtISO(today);
        dateCounts[t] = (dateCounts[t] || 0) + 1;
    }

    const maxCount = Math.max(1, ...Object.values(dateCounts));

    // Build 12 rows (weeks), 7 cells each
    // Row 0 = oldest week, row 11 = current week
    const WEEKS = 12;
    const TOTAL_DAYS = WEEKS * 7;

    // Find the Monday 12 weeks ago
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (TOTAL_DAYS - 1));

    // Build rows: each row is a day-of-week (Mon–Sun label on left, 12 cells)
    const rows = Array.from({ length: 7 }, () => []);

    for (let i = 0; i < TOTAL_DAYS; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const iso = fmtISO(d);
        const dow = (d.getDay() + 6) % 7; // 0=Mon
        const cnt = dateCounts[iso] || 0;
        const level = cnt === 0 ? 0 : Math.min(4, Math.ceil((cnt / maxCount) * 4));
        const isFuture = d > today;
        rows[dow].push({ iso, level, count: cnt, isFuture });
    }

    container.innerHTML = rows.map((cells, dow) => `
    <div class="heatmap-row">
      <div class="heatmap-label">${DAYS[dow]}</div>
      ${cells.map(c => `
        <div class="heat-cell heat-${c.isFuture ? 0 : c.level}"
          title="${c.iso}: ${c.count} completion${c.count !== 1 ? 's' : ''}"></div>
      `).join('')}
    </div>`).join('');
}


/* ═══════════════════════════════════════════════════════════════
   SECTION 12 — TAB NAVIGATION
═══════════════════════════════════════════════════════════════ */

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabId);
        b.setAttribute('aria-selected', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === 'tab-' + tabId);
    });

    // Refresh the newly-visible tab
    if (tabId === 'planner') { refreshPlannerHabitSelect(); renderWeekGrid(); }
    if (tabId === 'monthly') { renderMonthlyGoals(); }
    if (tabId === 'insights') { refreshInsights(); }
}


/* ═══════════════════════════════════════════════════════════════
   SECTION 13 — EVENT LISTENERS
═══════════════════════════════════════════════════════════════ */

// ── Tabs ──
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Dashboard form ──
document.getElementById('btn-submit').addEventListener('click', addHabit);
document.getElementById('input-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') addHabit();
});

// Delegated: toggle + delete habits
document.getElementById('habit-list').addEventListener('change', e => {
    const id = e.target.dataset.toggle;
    if (id) toggleHabit(parseInt(id, 10));
});
document.getElementById('habit-list').addEventListener('click', e => {
    const id = e.target.dataset.delete;
    if (id) deleteHabit(parseInt(id, 10));
});

// Filter + sort
document.getElementById('filter-cat').addEventListener('change', e => {
    filterCat = e.target.value;
    renderHabits();
});
document.getElementById('btn-sort').addEventListener('click', function () {
    sortByStreak = !sortByStreak;
    this.classList.toggle('active', sortByStreak);
    this.textContent = sortByStreak ? '↓ Sorted by streak' : '↑ Sort by streak';
    renderHabits();
});

// Clear error borders on input
['input-name', 'input-target', 'input-category'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => el.classList.remove('error'));
    el.addEventListener('change', () => el.classList.remove('error'));
});

// ── Weekly planner ──
document.getElementById('btn-prev-week').addEventListener('click', () => {
    plannerWeekOffset--;
    renderWeekGrid();
});
document.getElementById('btn-next-week').addEventListener('click', () => {
    plannerWeekOffset++;
    renderWeekGrid();
});

// Delegated: open modal when "Add" clicked on a day column
document.getElementById('week-grid').addEventListener('click', e => {
    const date = e.target.dataset.date;
    if (date) { openScheduleModal(date); return; }

    const delId = e.target.dataset.delSession;
    if (delId) deleteSession(parseInt(delId, 10));
});

// Modal buttons
document.getElementById('btn-save-session').addEventListener('click', saveSession);
document.getElementById('btn-cancel-session').addEventListener('click', closeScheduleModal);

// Close modal on overlay click
document.getElementById('schedule-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('schedule-modal')) closeScheduleModal();
});

// ── Monthly goals ──
document.getElementById('btn-prev-month').addEventListener('click', () => {
    monthlyOffset--;
    renderMonthlyGoals();
});
document.getElementById('btn-next-month').addEventListener('click', () => {
    monthlyOffset++;
    renderMonthlyGoals();
});

// Delegated: save goal input value
document.getElementById('monthly-goal-list').addEventListener('change', e => {
    const el = e.target;
    if (!el.classList.contains('goal-input')) return;
    const habitId = parseInt(el.dataset.habit, 10);
    const mk = el.dataset.mk;
    const val = Math.max(0, parseInt(el.value, 10) || 0);
    if (!monthlyGoals[habitId]) monthlyGoals[habitId] = {};
    monthlyGoals[habitId][mk] = val;
    saveToStorage();
    renderMonthlyGoals(); // re-render to update progress bars
});

// ── Insights period toggle ──
document.getElementById('ins-week-btn').addEventListener('click', function () {
    insightsPeriod = 'week';
    document.getElementById('ins-week-btn').classList.add('active');
    document.getElementById('ins-month-btn').classList.remove('active');
    refreshInsights();
});
document.getElementById('ins-month-btn').addEventListener('click', function () {
    insightsPeriod = 'month';
    document.getElementById('ins-month-btn').classList.add('active');
    document.getElementById('ins-week-btn').classList.remove('active');
    refreshInsights();
});


/* ═══════════════════════════════════════════════════════════════
   SECTION 14 — BOOTSTRAP  (runs once on page load)
═══════════════════════════════════════════════════════════════ */

loadFromStorage();
snapshotHistory();
startClock();
initNotifications();
rescheduleAllTodayNotifications();
renderHabits();
updateSummary();