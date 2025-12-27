// SOUBOR: js/app.js (v5.3 - Final Polish)
// POPIS: Formátování data (01.07.2025), Odpracováno stav, Pilulky v modalu, KPI fixy.

const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxY0pfNreBWSFDAve0XUscwvYC7xiNcqowIPviOllbppkF0WGvJ2t-GHdGGfcJV1BIwfg/exec"; 

// --- GLOBAL STATE ---
const STATE = {
  currentUser: null,  
  viewDate: new Date(), 
  cache: {
    allShifts: [],    
    users: [],        
    history: null     
  },
  adminViewMode: 'monthly' 
};

// --- DOM ELEMENTS ---
const DOM = {
  loader: document.getElementById('loader'),
  toast: document.getElementById('toast'),
  toastMsg: document.getElementById('toast-msg'),
  loginView: document.getElementById('login-view'),
  appView: document.getElementById('app-view'),
  pinInput: document.getElementById('pinInput'),
  userSelect: document.getElementById('userSelect'),
  
  tabBrigadeer: document.getElementById('tabBrigadeer'),
  tabAdmin: document.getElementById('tabAdmin'),
  
  headerName: document.getElementById('headerUserName'),
  headerRole: document.getElementById('headerUserRole'),
  
  dashBrigadeer: document.getElementById('brigadeer-dashboard'),
  dashAdmin: document.getElementById('admin-dashboard'),
  
  calGrid: document.getElementById('calendarGrid'),
  calTitle: document.getElementById('calendarMonthTitle'),
  
  shiftDialog: document.getElementById('shiftDialog'),
  confirmDialog: document.getElementById('confirmDialog'),
  payDialog: document.getElementById('payDialog')
};

// =================================================================
// 1. INITIALIZATION
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
  if (!GAS_API_URL) {
    alert("CHYBA: Není vyplněna GAS_API_URL v souboru js/app.js!");
    return;
  }
  initApp();
});

function initApp() {
  serverCall('getUserList')
    .then(res => {
      const opts = res.users.map(u => `<option value="${u}">${u}</option>`).join('');
      DOM.userSelect.innerHTML += opts;
      hideLoader();
    })
    .catch(err => {
      showToast('Chyba spojení: ' + err.message, true);
    });

  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  DOM.pinInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') handleLogin(); });
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  
  DOM.userSelect.addEventListener('change', () => {
    if (DOM.userSelect.value) DOM.pinInput.focus();
  });

  DOM.tabBrigadeer.addEventListener('click', () => switchLoginMode('brigadeer'));
  DOM.tabAdmin.addEventListener('click', () => switchLoginMode('admin'));
  
  document.getElementById('prevMonthBtn').addEventListener('click', () => changeMonthLocal(-1));
  document.getElementById('nextMonthBtn').addEventListener('click', () => changeMonthLocal(1));
  document.getElementById('adminViewMonthly').addEventListener('click', (e) => setAdminView('monthly', e.target));
  document.getElementById('adminViewTotal').addEventListener('click', (e) => setAdminView('total', e.target));

  document.querySelectorAll('img').forEach(img => {
    img.onerror = function() { this.style.display = 'none'; };
  });
}

function switchLoginMode(mode) {
  DOM.pinInput.value = ''; 
  if (mode === 'admin') {
    DOM.tabAdmin.classList.add('active');
    DOM.tabBrigadeer.classList.remove('active');
    DOM.userSelect.classList.add('hidden'); 
    DOM.pinInput.placeholder = "Admin PIN";
    DOM.pinInput.focus(); 
  } else {
    DOM.tabBrigadeer.classList.add('active');
    DOM.tabAdmin.classList.remove('active');
    DOM.userSelect.classList.remove('hidden'); 
    DOM.userSelect.value = ""; 
    DOM.pinInput.placeholder = "Zadej PIN";
    DOM.userSelect.blur();
    DOM.pinInput.blur();
  }
}

// =================================================================
// 2. SERVER COMMUNICATION
// =================================================================

async function serverCall(action, params = []) {
  const payload = { action: action, params: params };
  try {
    const response = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP chyba: ${response.status}`);
    const data = await response.json();
    if (!data.success) throw new Error(data.message || "Neznámá chyba serveru");
    return data;
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
}

// =================================================================
// 3. LOGIN & DATA
// =================================================================

async function handleLogin() {
  const isAdminLogin = DOM.tabAdmin.classList.contains('active');
  const name = DOM.userSelect.value;
  const pin = DOM.pinInput.value;

  if (!pin) return showToast('Zadej PIN', true);
  if (!isAdminLogin && !name) return showToast('Vyber jméno', true);

  showLoader(); 

  try {
    let response;
    if (isAdminLogin) {
      response = await serverCall('verifyAdmin', [pin]);
    } else {
      response = await serverCall('verifyUser', [name, pin]);
    }
    STATE.currentUser = response.user;

    const appData = await serverCall('getInitialAppData');
    STATE.cache.allShifts = appData.shifts;
    STATE.cache.users = appData.users;

    if (STATE.currentUser.role !== 'Admin') {
      const history = await serverCall('getBrigadeerInitialData', [STATE.currentUser.name]);
      STATE.cache.history = history;
    }

    DOM.loginView.classList.add('hidden');
    DOM.appView.classList.remove('hidden');
    DOM.headerName.textContent = STATE.currentUser.name;
    DOM.headerRole.textContent = STATE.currentUser.role;
    DOM.pinInput.value = '';

    if (STATE.currentUser.role === 'Admin') {
      DOM.dashAdmin.classList.remove('hidden');
      DOM.dashBrigadeer.classList.add('hidden');
    } else {
      DOM.dashBrigadeer.classList.remove('hidden');
      DOM.dashAdmin.classList.add('hidden');
      renderBrigadeerStats();
    }

    STATE.viewDate = new Date();
    renderCalendarLocal();

  } catch (err) {
    showToast(err.message, true);
  } finally {
    hideLoader();
  }
}

function handleLogout() {
  STATE.currentUser = null;
  STATE.cache.history = null;
  STATE.cache.allShifts = [];
  DOM.appView.classList.add('hidden');
  DOM.loginView.classList.remove('hidden');
  switchLoginMode('brigadeer');
}

// =================================================================
// 4. CALENDAR ENGINE
// =================================================================

function changeMonthLocal(delta) {
  STATE.viewDate.setMonth(STATE.viewDate.getMonth() + delta);
  renderCalendarLocal();
}

function renderCalendarLocal() {
  const year = STATE.viewDate.getFullYear();
  const month = STATE.viewDate.getMonth() + 1;
  const currentShifts = STATE.cache.allShifts.filter(s => s.year === year && s.month === month);
  
  renderCalendar(year, month, currentShifts);

  if (STATE.currentUser && STATE.currentUser.role === 'Admin') {
    updateAdminTableAsync(year, month);
  } else if (STATE.currentUser) {
    renderBrigadeerStats(); 
  }
}

function renderCalendar(year, month, shiftsData) {
  DOM.calTitle.textContent = new Date(year, month - 1)
    .toLocaleString('cs-CZ', { month: 'long', year: 'numeric' });
  
  DOM.calGrid.innerHTML = '';
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayIndex = new Date(year, month - 1, 1).getDay(); 
  const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1; 

  for (let i = 0; i < startOffset; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    DOM.calGrid.appendChild(el);
  }

  const today = new Date();
  today.setHours(0,0,0,0);

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayDate = new Date(year, month - 1, d);
    const shifts = shiftsData.filter(s => s.date === dateStr);
    const confirmed = shifts.find(s => s.status === 'Potvrzeno');
    const isPending = !confirmed && shifts.length > 0;
    
    const el = document.createElement('div');
    el.className = 'cal-day anim';
    el.style.animationDelay = `${d * 0.005}s`; 
    
    if (dayDate.getTime() === today.getTime()) el.classList.add('today');
    if (dayDate < today) el.classList.add('past');

    let statusHTML = '';
    if (confirmed) {
      el.classList.add('s-confirmed');
      statusHTML = `<div class="day-status"><div class="status-dot confirmed"></div></div><div class="status-badge-mini text-green">${confirmed.name}</div>`;
    } else if (isPending) {
      el.classList.add('s-pending');
      statusHTML = `<div class="day-status"><div class="status-dot pending"></div></div><div class="status-badge-mini text-accent">${shifts.length} zájemců</div>`;
    } else {
       statusHTML = `<div class="day-status"><div class="status-dot free"></div></div>`;
    }

    el.innerHTML = `<div class="day-num">${d}</div>${statusHTML}`;
    el.addEventListener('click', () => openDayModal(dayDate, shifts, confirmed));
    DOM.calGrid.appendChild(el);
  }
}

// =================================================================
// 5. ADMIN & SERVER UPDATES
// =================================================================

async function updateAdminTableAsync(year, month) {
  try {
    const stats = await serverCall('getAdminOverviewData', [STATE.adminViewMode, year, month]);
    renderAdminTable(stats.dashboardData);
  } catch(e) { console.error(e); }
}

async function refreshAllData() {
  const appData = await serverCall('getInitialAppData');
  STATE.cache.allShifts = appData.shifts;
  renderCalendarLocal();
}

// =================================================================
// 6. MODALS (UPDATED LOGIC)
// =================================================================

function openDayModal(date, shifts, confirmedShift) {
  const dateStr = date.toISOString().split('T')[0];
  // NEW DATE FORMAT: dd.mm.yyyy (01.07.2025)
  const czDate = date.getDate().toString().padStart(2,'0') + '.' + 
                 (date.getMonth() + 1).toString().padStart(2,'0') + '.' + 
                 date.getFullYear();
  
  document.getElementById('shiftModalDate').textContent = czDate;
  const body = document.getElementById('shiftModalBody');
  const footer = document.getElementById('shiftModalFooter');
  
  body.innerHTML = '';
  footer.innerHTML = '';

  const isAdmin = STATE.currentUser.role === 'Admin';
  const isPast = date < new Date().setHours(0,0,0,0);

  if (confirmedShift) {
    const isMe = confirmedShift.name === STATE.currentUser.name;
    // LOGIKA PRO ODPRACOVÁNO vs OBSAZENO
    const statusLabel = isPast ? "ODPRACOVÁNO" : "OBSAZENO";
    
    let timeHtml = `
      <div class="kpi-card mb-4">
        <div class="kpi-label">${statusLabel}</div>
        <div class="kpi-val">${confirmedShift.name}</div>
        <div class="kpi-explain">${confirmedShift.timeFrom} – ${confirmedShift.timeTo}</div>
      </div>
    `;

    if ((isMe || isAdmin) && confirmedShift.timeFrom && confirmedShift.timeTo) {
       const hours = calcHours(confirmedShift.timeFrom, confirmedShift.timeTo);
       const rate = isAdmin ? (getCurrentUserRate(confirmedShift.name) || 0) : STATE.currentUser.rate;
       const earn = Math.round(hours * rate);
       timeHtml += `<div class="text-center mb-4"><span class="text-muted text-sm">Odměna za směnu:</span><br><strong class="text-green" style="font-size: 1.2rem">${earn} Kč</strong></div>`;
    }

    if (isAdmin) {
      body.innerHTML = `
        ${timeHtml}
        <div class="mb-2"><label class="text-muted text-sm">Změnit čas:</label><div class="input-group" style="display:flex; gap:5px"><input type="time" id="mTimeFrom" value="${confirmedShift.timeFrom}" class="styled-input"><input type="time" id="mTimeTo" value="${confirmedShift.timeTo}" class="styled-input"></div></div>
        <div class="mb-2"><label class="text-muted text-sm">Přeobsadit:</label><select id="mUserSelect" class="styled-input">${STATE.cache.users.map(u => `<option ${u===confirmedShift.name?'selected':''}>${u}</option>`).join('')}</select></div>
      `;
      footer.innerHTML = `<button class="btn btn-danger" onclick="actionDeleteShift('${dateStr}')">Zrušit</button><button class="btn btn-success" onclick="actionUpdateShift('${dateStr}', '${confirmedShift.name}')">Uložit</button>`;
    } else {
      body.innerHTML = timeHtml;
      // Pokud jsem to já a není to minulost, zobraz info
      if (isMe && !isPast) footer.innerHTML = `<div class="text-center text-muted w-100">Jste přihlášen.</div>`;
    }

  } else if (shifts.length > 0) {
    if (isAdmin) {
      let html = `<div class="mb-4"><h4 class="text-center mb-2">Vyberte brigádníka:</h4>`;
      shifts.forEach((s, idx) => {
         html += `<label class="card mb-2" style="padding:10px; display:flex; align-items:center; cursor:pointer"><input type="radio" name="shiftApp" value="${s.name}" ${idx===0?'checked':''} style="width:20px; height:20px; margin-right:10px"><div style="flex:1"><strong>${s.name}</strong></div></label>`;
      });
      html += `<div class="mt-4"><label class="text-muted text-sm">Čas směny:</label><div class="input-group" style="display:flex; gap:5px"><input type="time" id="mTimeFrom" value="13:00" class="styled-input"><input type="time" id="mTimeTo" value="18:00" class="styled-input"></div></div></div>`;
      body.innerHTML = html;
      footer.innerHTML = `<button class="btn btn-danger" onclick="actionDeleteShift('${dateStr}')">Zrušit vše</button><button class="btn btn-success" onclick="actionConfirmShift('${dateStr}')">Potvrdit</button>`;
    } else {
      // BRIGÁDNÍK VIEW - ŽLUTÁ
      const imApplied = shifts.some(s => s.name === STATE.currentUser.name);
      let list = `<ul class="mb-4" style="padding-left:20px; color:var(--c-text-muted)">`;
      shifts.forEach(s => list += `<li>${s.name}</li>`);
      list += `</ul>`;
      
      let statusInfo = imApplied 
        ? `<div class="status-pill yellow">Projevil(a) jsi zájem o směnu</div>` 
        : '';

      body.innerHTML = `<h4 class="text-center mb-2">Zájemci o směnu:</h4>${list}${statusInfo}`;
      
      if (imApplied) {
         // Button centering handled by CSS .modal-footer flex
         footer.innerHTML = `<button class="btn btn-danger full-width" onclick="actionCancelApp('${dateStr}')">Zrušit zájem</button>`;
      } else {
         footer.innerHTML = `<button class="btn btn-success full-width" onclick="actionApply('${dateStr}')">Mám zájem</button>`;
      }
    }
  } else {
    // EMPTY STATE - ŠEDÁ
    if (isAdmin) {
      body.innerHTML = `<h4 class="text-center mb-4">Vytvořit směnu</h4><div class="mb-2"><label class="text-muted text-sm">Brigádník:</label><select id="mUserSelect" class="styled-input">${STATE.cache.users.map(u => `<option>${u}</option>`).join('')}</select></div><div class="mb-2"><label class="text-muted text-sm">Čas:</label><div class="input-group" style="display:flex; gap:5px"><input type="time" id="mTimeFrom" value="13:00" class="styled-input"><input type="time" id="mTimeTo" value="18:00" class="styled-input"></div></div>`;
      footer.innerHTML = `<button class="btn btn-success full-width" onclick="actionCreateShift('${dateStr}')">Vytvořit</button>`;
    } else {
      body.innerHTML = `<div class="status-pill gray">Chceš se přihlásit na tuto směnu?</div>`;
      footer.innerHTML = `<button class="btn btn-primary full-width" onclick="actionApply('${dateStr}')">Mám zájem</button>`;
    }
  }
  DOM.shiftDialog.showModal();
}

// =================================================================
// 7. ACTIONS & UTILS
// =================================================================

function closeAllModals() { document.querySelectorAll('dialog').forEach(d => d.close()); }

async function runAction(apiFunc, args) {
  closeAllModals(); showLoader();
  try {
    const res = await serverCall(apiFunc, args); showToast(res.message);
    await refreshAllData();
    if (STATE.currentUser.role !== 'Admin') {
       const history = await serverCall('getBrigadeerInitialData', [STATE.currentUser.name]);
       STATE.cache.history = history;
       renderBrigadeerStats();
    }
  } catch (err) { showToast(err.message, true); } finally { hideLoader(); }
}

window.actionApply = (d) => runAction('applyForShift', [d, STATE.currentUser.name]);
window.actionCancelApp = (d) => runAction('cancelApplication', [d, STATE.currentUser.name]);

window.actionDeleteShift = (d) => { if(confirm("Opravdu smazat?")) runAction('adminDeleteShift', [d]); };
window.actionCreateShift = (d) => {
  const u = document.getElementById('mUserSelect').value;
  const f = document.getElementById('mTimeFrom').value;
  const t = document.getElementById('mTimeTo').value;
  runAction('adminCreateShift', [d, u, f, t]);
};
window.actionUpdateShift = (d, oldUser) => {
  const u = document.getElementById('mUserSelect').value;
  const f = document.getElementById('mTimeFrom').value;
  const t = document.getElementById('mTimeTo').value;
  runAction('adminUpdateShift', [d, oldUser, u, f, t]);
};
window.actionConfirmShift = (d) => {
  const el = document.querySelector('input[name="shiftApp"]:checked');
  if(!el) return showToast("Vyberte osobu", true);
  const f = document.getElementById('mTimeFrom').value;
  const t = document.getElementById('mTimeTo').value;
  runAction('confirmShift', [d, el.value, f, t]);
};

function renderBrigadeerStats() {
  if (!STATE.cache.history) return;
  const h = STATE.cache.history;
  const viewY = STATE.viewDate.getFullYear();
  const viewM = STATE.viewDate.getMonth() + 1;
  const mm = String(viewM).padStart(2, '0');

  let plannedH = 0, plannedC = 0, workedH = 0;
  let monthEarned = 0;
  let totalEarnedHistory = 0;

  h.allShifts.forEach(s => {
    if (s.status === 'Potvrzeno' && s.timeFrom && s.timeTo) {
      const sDate = new Date(s.date);
      const hours = calcHours(s.timeFrom, s.timeTo);
      
      if (sDate < new Date().setHours(0,0,0,0)) {
        workedH += hours; 
        totalEarnedHistory += (hours * STATE.currentUser.rate);
      }

      if (sDate.getFullYear() === viewY && (sDate.getMonth()+1) === viewM) {
        if (sDate < new Date().setHours(0,0,0,0)) {
           monthEarned += (hours * STATE.currentUser.rate);
        } else {
           plannedH += hours;
           plannedC++;
        }
      }
    }
  });

  let totalPaid = 0;
  h.allTransactions.forEach(t => { 
    if (t.amount < 0) totalPaid += Math.abs(t.amount); 
  });

  document.getElementById('b-planned-hours').textContent = plannedH.toFixed(1) + ' h';
  document.getElementById('b-planned-shifts').textContent = plannedC + ' směn';
  
  // UPDATE 1: Karta Výdělek (Label K VÝPLATĚ, dole datum)
  document.getElementById('b-month-earn-label').textContent = `K VÝPLATĚ`;
  document.getElementById('b-month-earn').textContent = Math.round(monthEarned) + ' Kč';
  // Změníme popisek "Tento měsíc" na "mm/yyyy" přes ID (pokud v HTML chybí ID, najdeme class)
  const explainEl = document.getElementById('b-month-earn').nextElementSibling;
  if(explainEl) explainEl.textContent = `${mm}/${viewY}`;

  // UPDATE 2: Karta Bilance (Label (CELKEM))
  document.getElementById('b-balance').previousElementSibling.textContent = "CELKEM (VŠE)";
  const balance = Math.max(0, totalEarnedHistory - totalPaid);
  document.getElementById('b-balance').textContent = Math.round(balance) + ' Kč';
  document.getElementById('b-paid').textContent = `Vyplaceno: ${Math.round(totalPaid)} Kč`;
  
  let workedH_Month = 0;
  h.allShifts.forEach(s => {
     const sDate = new Date(s.date);
     if (s.status === 'Potvrzeno' && s.timeFrom && s.timeTo && sDate < new Date().setHours(0,0,0,0)) {
        if (sDate.getFullYear() === viewY && (sDate.getMonth()+1) === viewM) {
           workedH_Month += calcHours(s.timeFrom, s.timeTo);
        }
     }
  });
  document.getElementById('b-worked-hours').textContent = workedH_Month.toFixed(1) + ' h';
}

function renderAdminTable(data) {
  const tbody = document.getElementById('adminStatsBody'); tbody.innerHTML = '';
  if (!data || data.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center py-4">Žádná data</td></tr>'; return; }
  data.forEach(u => {
    const tr = document.createElement('tr');
    let actionBtn = '-';
    if (parseFloat(u.payableHours) > 0) {
       actionBtn = `<button class="btn btn-success" style="padding:6px 12px; font-size:0.8rem" onclick="openPayModal('${u.name}', ${u.payableHours}, ${u.rate})">Vyplatit</button>`;
    }
    tr.innerHTML = `<td>${u.name}</td><td>${u.totalHours}</td><td class="${u.toPay > 0 ? 'text-accent' : 'text-muted'}">${u.toPay} Kč</td><td>${actionBtn}</td>`;
    tbody.appendChild(tr);
  });
}

window.openPayModal = (name, hours, rate) => {
  const modal = DOM.payDialog;
  document.getElementById('payModalPayable').textContent = hours + ' h';
  const inp = document.getElementById('payInputHours'); inp.value = hours;
  const calcEl = document.getElementById('payCalcAmount');
  const updateCalc = () => { calcEl.textContent = Math.round(inp.value * rate) + ' Kč'; };
  inp.oninput = updateCalc; updateCalc();
  document.getElementById('payForm').onsubmit = (e) => {
    e.preventDefault(); if(inp.value <= 0) return showToast("Zadejte hodiny", true);
    runAction('logHoursPayment', [name, inp.value]);
  };
  modal.showModal();
};

function calcHours(t1, t2) {
  const d1 = new Date("2000-01-01T" + t1); const d2 = new Date("2000-01-01T" + t2);
  return (d2 - d1) / 3.6e6;
}
function getCurrentUserRate(name) { return 0; }
function showLoader() { DOM.loader.style.display = 'flex'; }
function hideLoader() { DOM.loader.style.display = 'none'; }
function showToast(msg, isError = false) {
  DOM.toastMsg.textContent = msg; DOM.toast.style.borderColor = isError ? 'var(--c-red)' : 'var(--c-green)';
  DOM.toast.classList.add('show'); setTimeout(() => DOM.toast.classList.remove('show'), 3000);
}
function closeModal(id) { document.getElementById(id).close(); }