// SOUBOR: js/app.js (v5.56 - MODAL LAYOUT CONSISTENCY)
// POPIS: Sjednocení modálních oken. Vždy pořadí: 1. Brigádník (Select), 2. Čas (Input).
//        Sjednocen popisek "Kdo:" -> "Brigádník:".

const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxY0pfNreBWSFDAve0XUscwvYC7xiNcqowIPviOllbppkF0WGvJ2t-GHdGGfcJV1BIwfg/exec"; 

// --- SVG ICONS (UI) ---
const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const ICON_X = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
const ICON_MONEY = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><path d="M12 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/></svg>`;

// --- SVG ICONS (TOASTS) ---
const T_ICON_SUCCESS = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--c-green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const T_ICON_ERROR = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--c-red)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
const T_ICON_INFO = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--c-gold)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

// --- STATE MANAGEMENT ---
const STATE = {
  currentUser: null,
  viewDate: new Date(),
  cache: { 
    allShifts: [], 
    users: [], 
    userRates: {}, 
    history: null 
  },
  adminViewMode: 'monthly'
};

// --- DOM ELEMENTS ---
let DOM = {};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  if (!GAS_API_URL) return alert("CHYBA: Není vyplněna GAS_API_URL!");
  injectHistoryModal(); 
  initDOM(); 
  initApp();
});

function injectHistoryModal() {
  if (document.getElementById('historyDialog')) return;
  const html = `
  <dialog id="historyDialog">
    <div class="modal-content">
      <button class="btn-close-abs" onclick="closeModal('historyDialog')">✕</button>
      <div class="modal-title" style="margin-bottom:10px">
        <span id="histModalTitle">Historie</span>
        <span id="histModalSubtitle" class="text-muted" style="font-size:0.8rem; font-weight:500">...</span>
      </div>
      <div id="histModalBody" class="history-list-wrapper"></div>
    </div>
  </dialog>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

function initDOM() {
  DOM = {
    loader: document.getElementById('loader'),
    toast: document.getElementById('toast'),
    toastIcon: document.getElementById('toast-icon'),
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
    payDialog: document.getElementById('payDialog'),
    payModalPayable: document.getElementById('payModalPayable'),
    payModalTotalDebt: document.getElementById('payModalTotalDebt'),
    payInputHours: document.getElementById('payInputHours'),
    payCalcAmount: document.getElementById('payCalcAmount'),
    payRemaining: document.getElementById('payRemaining'),
    payForm: document.getElementById('payForm'),
    historyDialog: document.getElementById('historyDialog'),
    histModalBody: document.getElementById('histModalBody'),
    histModalTitle: document.getElementById('histModalTitle'),
    histModalSubtitle: document.getElementById('histModalSubtitle'),
    // Confirm Actions
    confirmMessage: document.getElementById('confirmMessage'),
    confirmActionBtn: document.getElementById('confirmActionBtn')
  };
}

function initApp() {
  serverCall('getUserList').then(res => {
    STATE.cache.users = res.users.map(u => u.name);
    res.users.forEach(u => STATE.cache.userRates[u.name] = u.rate);
    DOM.userSelect.innerHTML += STATE.cache.users.map(u => `<option value="${u}">${u}</option>`).join('');
    hideLoader();
  }).catch(err => showToast('Chyba spojení: ' + err.message, 'error'));

  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  DOM.pinInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') handleLogin(); });
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
  DOM.userSelect.addEventListener('change', () => DOM.pinInput.focus());
  
  DOM.tabBrigadeer.addEventListener('click', () => switchLoginMode('brigadeer'));
  DOM.tabAdmin.addEventListener('click', () => switchLoginMode('admin'));
  
  document.getElementById('prevMonthBtn').addEventListener('click', () => changeMonthLocal(-1));
  document.getElementById('nextMonthBtn').addEventListener('click', () => changeMonthLocal(1));
  
  document.getElementById('adminViewMonthly').addEventListener('click', (e) => setAdminView('monthly', e.target));
  document.getElementById('adminViewTotal').addEventListener('click', (e) => setAdminView('total', e.target));
}

// --- LOGIN LOGIC ---
function switchLoginMode(mode) {
  DOM.pinInput.value = '';
  document.body.classList.remove('is-admin');
  
  const isAdm = mode === 'admin';
  DOM.tabAdmin.classList.toggle('active', isAdm);
  DOM.tabBrigadeer.classList.toggle('active', !isAdm);
  DOM.userSelect.classList.toggle('hidden', isAdm);
  DOM.pinInput.focus();
}

async function handleLogin() {
  const isAdm = DOM.tabAdmin.classList.contains('active');
  const name = DOM.userSelect.value;
  const pin = DOM.pinInput.value;
  
  if (!pin) return showToast('Zadej PIN', 'info');
  if (!isAdm && !name) return showToast('Vyber jméno', 'info');

  showLoader();
  try {
    const vRes = await serverCall(isAdm ? 'verifyAdmin' : 'verifyUser', isAdm ? [pin] : [name, pin]);
    
    if(!vRes.success) {
        hideLoader();
        return showToast(isAdm ? 'Nesprávný admin PIN' : 'Nesprávný PIN', 'error');
    }

    STATE.currentUser = vRes.user;

    if (isAdm) {
        document.body.classList.add('is-admin');
    } else {
        document.body.classList.remove('is-admin');
    }

    const promises = [serverCall('getInitialAppData')];
    if (!isAdm) promises.push(serverCall('getBrigadeerInitialData', [STATE.currentUser.name]));

    const [appData, histData] = await Promise.all(promises);
    
    STATE.cache.allShifts = appData.shifts;
    if (appData.users) appData.users.forEach(u => STATE.cache.userRates[u.name] = u.rate);
    if (histData) STATE.cache.history = histData;

    DOM.loginView.classList.add('hidden');
    DOM.appView.classList.remove('hidden');
    DOM.headerName.textContent = STATE.currentUser.name;
    DOM.headerRole.textContent = STATE.currentUser.role;
    
    DOM.dashAdmin.classList.toggle('hidden', !isAdm);
    DOM.dashBrigadeer.classList.toggle('hidden', isAdm);
    
    STATE.viewDate = new Date();
    
    if (!isAdm) renderBrigadeerStats();
    renderCalendarLocal();

  } catch (err) { 
      showToast(err.message, 'error'); 
  } finally { 
      hideLoader(); 
  }
}

function handleLogout() {
  STATE.currentUser = null;
  document.body.classList.remove('is-admin');
  
  DOM.appView.classList.add('hidden');
  DOM.loginView.classList.remove('hidden');
  switchLoginMode('brigadeer');
}

// --- CALENDAR LOGIC ---
function changeMonthLocal(d) {
  STATE.viewDate.setMonth(STATE.viewDate.getMonth() + d);
  renderCalendarLocal();
}

function renderCalendarLocal() {
  const y = STATE.viewDate.getFullYear();
  const m = STATE.viewDate.getMonth() + 1;
  
  const shifts = STATE.cache.allShifts.filter(s => s.year === y && s.month === m);
  
  DOM.calTitle.textContent = new Date(y, m - 1).toLocaleString('cs-CZ', { month: 'long', year: 'numeric' });
  DOM.calGrid.innerHTML = '';
  
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() || 7) - 1; 
  const today = new Date(); 
  today.setHours(0,0,0,0);

  for (let i = 0; i < offset; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-day empty';
      DOM.calGrid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayShifts = shifts.filter(s => s.date === dateStr);
    
    let confirmed = dayShifts.find(s => s.status === 'Potvrzeno');
    let hasInterest = dayShifts.length > 0;
    const applicantCount = dayShifts.length;
    
    const dayDate = new Date(y, m - 1, d);
    const isPast = dayDate < today;
    const isBrigadeer = STATE.currentUser.role !== 'Admin';

    if (isBrigadeer && isPast) {
        if (confirmed && confirmed.name !== STATE.currentUser.name) {
            confirmed = null; 
        }
        if (!confirmed) {
            hasInterest = false;
        }
    }

    const el = document.createElement('div');
    el.className = 'cal-day anim';
    el.style.animationDelay = `${d * 0.005}s`;
    
    if (dayDate.getTime() === today.getTime()) el.classList.add('today');
    if (isPast) el.classList.add('past');

    let html = `<div class="day-num">${d}</div>`;
    
    if (confirmed) {
      el.classList.add('s-confirmed');
      html += `<div class="day-status"><div class="status-dot confirmed"></div></div><div class="status-badge-mini text-green">${confirmed.name}</div>`;
    } else if (hasInterest) {
      el.classList.add('s-pending');
      
      if (applicantCount > 1) {
         html += `<div class="day-status"><div class="status-dots-group"><div class="status-dot pending"></div><div class="status-dot pending"></div></div></div>`;
      } else {
         html += `<div class="day-status"><div class="status-dot pending"></div></div>`;
      }
      
      html += `<div class="status-badge-mini text-accent">${applicantCount} zájemců</div>`;
    } else {
      html += `<div class="day-status"><div class="status-dot free"></div></div>`;
    }
    
    el.innerHTML = html;
    el.onclick = () => openDayModal(dayDate, dateStr, dayShifts, confirmed);
    DOM.calGrid.appendChild(el);
  }
  
  if (STATE.currentUser.role === 'Admin') {
      updateAdminTableAsync(y, m);
  } else {
      renderBrigadeerStats();
  }
}

// --- ADMIN DASHBOARD & TABLE ---
function setAdminView(mode, btn) {
  STATE.adminViewMode = mode;
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCalendarLocal();
}

async function updateAdminTableAsync(y, m) {
  const tbody = document.getElementById('adminStatsBody'); 
  const headerRow = document.querySelector('#adminStatsTable thead tr');
  
  if (STATE.adminViewMode === 'monthly') {
      headerRow.innerHTML = `<th>JMÉNO</th><th>HODIN</th><th>VYPLATIT</th>`;
  } else {
      headerRow.innerHTML = `<th>JMÉNO</th><th>HODIN</th><th>VYPLATIT</th><th>AKCE</th>`;
  }

  const colSpan = STATE.adminViewMode === 'monthly' ? 3 : 4;
  tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="spinner-small-center"></div></td></tr>`;

  try {
    const stats = await serverCall('getAdminOverviewData', [STATE.adminViewMode, y, m]);
    tbody.innerHTML = ''; 

    if (!stats.dashboardData.length) { 
        tbody.innerHTML = ''; 
        return; 
    }
    
    stats.dashboardData.forEach(u => {
      const displayedHours = STATE.adminViewMode === 'total' ? u.payableHours : u.totalHours;
      const hasWork = parseFloat(displayedHours) > 0;
      
      const rowClass = hasWork ? 'row-active' : '';
      const pillClass = hasWork ? 'green' : 'gray';

      const nameCell = `
        <span class="name-pill ${pillClass}" onclick="openHistoryModal('${u.name}')">
          ${u.name}
        </span>
      `;

      let html = `<tr class="${rowClass}">
        <td class="align-left">${nameCell}</td>
        <td>${displayedHours}</td>
        <td class="${u.toPay>0 ? 'text-accent' : (hasWork?'':'text-muted')}">${formatCurrency(u.toPay)} Kč</td>`;
      
      if (STATE.adminViewMode === 'total') {
          const btn = parseFloat(u.payableHours) > 0 
            ? `<button class="btn-icon-circle" onclick="openPayModal('${u.name}', ${u.payableHours}, ${u.rate}, ${u.toPay})">${ICON_MONEY}</button>` 
            : '-';
          html += `<td>${btn}</td>`;
      }
      
      html += `</tr>`;
      tbody.innerHTML += html;
    });
  } catch(e) { 
      console.error(e); 
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-danger text-center">Chyba načítání dat</td></tr>`;
  }
}

// --- HISTORY MODAL ---
async function openHistoryModal(userName) {
  const y = STATE.viewDate.getFullYear();
  const m = STATE.viewDate.getMonth() + 1;
  const modeLabel = STATE.adminViewMode === 'total' ? `Rok ${y}` : `${m}/${y}`;
  
  DOM.histModalTitle.textContent = userName;
  DOM.histModalSubtitle.textContent = modeLabel;
  DOM.histModalBody.innerHTML = '<div class="spinner-small-center"></div>';
  
  DOM.historyDialog.showModal();
  
  try {
    const res = await serverCall('getAdminUserHistory', [userName, STATE.adminViewMode, y, m]);
    DOM.histModalBody.innerHTML = '';

    if (!res.history || res.history.length === 0) {
      DOM.histModalBody.innerHTML = '<div class="text-muted text-center py-4">Žádná historie plateb</div>';
      return;
    }

    let html = '<div class="history-list">';
    res.history.forEach(item => {
      html += `
        <div class="history-item">
           <div class="h-row-top">
             <span class="h-date">${item.date}</span>
             <span class="h-amount text-red">${formatCurrency(item.amount)} Kč</span>
           </div>
           <div class="h-note">${item.note}</div>
        </div>
      `;
    });
    html += '</div>';
    DOM.histModalBody.innerHTML = html;

  } catch (e) {
    DOM.histModalBody.innerHTML = `<div class="text-danger text-center">Chyba: ${e.message}</div>`;
  }
}

// --- STANDARD MODALS ---
function renderBrigadeerStats() {
  if (!STATE.cache.history) return;
  
  const h = STATE.cache.history;
  const y = STATE.viewDate.getFullYear();
  const m = STATE.viewDate.getMonth() + 1;
  const mm = String(m).padStart(2, '0');
  
  let planned = 0, earnedM = 0, totalEarned = 0, workedM = 0, countP = 0;
  
  h.allShifts.forEach(s => {
    if (s.status === 'Potvrzeno' && s.timeFrom && s.timeTo) {
      const d = new Date(s.date);
      const hrs = calcHours(s.timeFrom, s.timeTo);
      const isPast = d < new Date().setHours(0,0,0,0);
      
      if (isPast) {
          totalEarned += hrs * STATE.currentUser.rate;
      }
      
      if (d.getFullYear() === y && (d.getMonth() + 1) === m) {
        if (isPast) { 
            earnedM += hrs * STATE.currentUser.rate; 
            workedM += hrs; 
        } else { 
            planned += hrs; 
            countP++; 
        }
      }
    }
  });

  const paid = h.allTransactions.reduce((sum, t) => t.amount < 0 ? sum + Math.abs(t.amount) : sum, 0);
  
  document.getElementById('b-planned-hours').textContent = planned.toFixed(1) + ' h';
  document.getElementById('b-planned-shifts').textContent = countP + ' směn';
  document.getElementById('b-worked-hours').textContent = workedM.toFixed(1) + ' h';
  
  const labelEarn = document.getElementById('b-month-earn-label');
  if(labelEarn) labelEarn.textContent = `K VÝPLATĚ`;
  
  document.getElementById('b-month-earn').textContent = formatCurrency(Math.round(earnedM)) + ' Kč';
  const explainEl = document.getElementById('b-month-earn').nextElementSibling;
  if(explainEl) explainEl.textContent = `${mm}/${y}`;

  const labelBalance = document.getElementById('b-balance-label-text');
  if(labelBalance) labelBalance.textContent = "CELKEM";
  
  const balance = Math.max(0, totalEarned - paid);
  document.getElementById('b-balance').textContent = formatCurrency(Math.round(balance)) + ' Kč';
  document.getElementById('b-paid').textContent = `Vyplaceno: ${formatCurrency(Math.round(paid))} Kč`;
}

function openDayModal(dateObj, dateStr, shifts, confirmed) {
  const czDate = dateObj.toLocaleDateString('cs-CZ');
  document.getElementById('shiftModalDate').textContent = czDate;
  
  const body = document.getElementById('shiftModalBody');
  const footer = document.getElementById('shiftModalFooter');
  
  body.innerHTML = ''; 
  footer.innerHTML = '';
  
  const isAdm = STATE.currentUser.role === 'Admin';
  const isMe = confirmed && confirmed.name === STATE.currentUser.name;
  
  const today = new Date(); today.setHours(0,0,0,0);
  const isPast = dateObj < today;

  // --- 1. JIŽ POTVRZENÁ SMĚNA ---
  if (confirmed) {
    const hrs = confirmed.timeFrom && confirmed.timeTo ? calcHours(confirmed.timeFrom, confirmed.timeTo) : 0;
    const rate = STATE.cache.userRates[confirmed.name] || 0;
    const earn = Math.round(hrs * rate);
    
    let html = `<div class="kpi-card mb-4"><div class="kpi-label">${isPast?"ODPRACOVÁNO":"NAPLÁNOVÁNO"}</div><div class="kpi-val">${confirmed.name}</div><div class="kpi-explain">${confirmed.timeFrom} – ${confirmed.timeTo}</div></div>`;
    
    if (isAdm || isMe) {
        html += `<div class="text-center mb-4"><div class="text-label-gray mb-1">Odměna:</div><strong id="mPrice" class="text-green" style="font-size:1.2rem">${formatCurrency(earn)} Kč</strong></div>`;
    }

    if (isAdm) {
      // UPDATE: Vykreslení - Nejdříve Brigádník (Select), potom Čas (Inputs)
      body.innerHTML = html + `
        <div class="mb-2">
           <label class="text-label-bold">Brigádník:</label>
           <select id="mUser" class="styled-input">${STATE.cache.users.map(u=>`<option ${u===confirmed.name?'selected':''}>${u}</option>`).join('')}</select>
        </div>
        <div class="mb-2">
           <label class="text-label-bold">Čas:</label>
           <div class="input-group" style="display:flex;gap:5px">
             <input type="time" id="mFrom" value="${confirmed.timeFrom}" class="styled-input">
             <input type="time" id="mTo" value="${confirmed.timeTo}" class="styled-input">
           </div>
        </div>
      `;
      footer.innerHTML = `<button class="btn btn-success" onclick="actUpdate('${dateStr}','${confirmed.name}')">${ICON_CHECK} Potvrdit</button><button class="btn btn-danger" onclick="actDelete('${dateStr}','${confirmed.name}')">${ICON_X} Zrušit</button>`;
      
      setTimeout(()=> ['mFrom','mTo','mUser'].forEach(id=>document.getElementById(id).addEventListener('input', updatePrice)), 50);
    } else {
      body.innerHTML = html;
      if (isMe) {
          footer.innerHTML = `<button class="btn btn-danger btn-fit" onclick="actDelete('${dateStr}','${confirmed.name}')">${ICON_X} Zrušit směnu</button>`;
      } else {
          footer.innerHTML = `<div class="text-center text-muted">Obsazeno</div>`;
      }
    }
  } 
  // --- 2. JSOU ZÁJEMCI (PENDING) ---
  else if (shifts.length > 0) {
    if (isAdm) {
      // Řazení zájemců podle TIMESTAMP
      const sortedShifts = [...shifts].sort((a, b) => {
          const tA = a.timestamp ? new Date(a.timestamp).getTime() : 9999999999999;
          const tB = b.timestamp ? new Date(b.timestamp).getTime() : 9999999999999;
          return tA - tB;
      });

      const firstApplicantName = sortedShifts[0].name;

      let optionsHtml = '';
      
      // A) ZÁJEMCI (s časem)
      sortedShifts.forEach(s => {
          let timeLabel = '';
          if (s.timestamp) {
              const d = new Date(s.timestamp);
              timeLabel = ` (${d.getDate()}.${d.getMonth()+1}. ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')})`;
          }
          const isSelected = (s.name === firstApplicantName) ? 'selected' : '';
          optionsHtml += `<option value="${s.name}" ${isSelected}>${s.name}${timeLabel}</option>`;
      });

      // B) OSTATNÍ (abecedně)
      const appliedNames = sortedShifts.map(s => s.name);
      const otherUsers = STATE.cache.users.filter(u => !appliedNames.includes(u)).sort();
      
      if (otherUsers.length > 0) {
          optionsHtml += `<option disabled>──────────</option>`;
          otherUsers.forEach(u => {
              optionsHtml += `<option value="${u}">${u}</option>`;
          });
      }

      // UPDATE: Vykreslení - Nejdříve Brigádník, potom Čas
      body.innerHTML = `
          <h4 class="text-center mb-2">Potvrdit směnu</h4>
          <div class="mb-2">
             <label class="text-label-bold">Brigádník:</label>
             <select id="mUser" class="styled-input">${optionsHtml}</select>
          </div>
          <div class="mt-4">
             <label class="text-label-bold">Čas:</label>
             <div class="input-group" style="display:flex;gap:5px">
               <input type="time" id="mFrom" value="13:00" class="styled-input">
               <input type="time" id="mTo" value="18:00" class="styled-input">
             </div>
          </div>
      `;
      footer.innerHTML = `<button class="btn btn-success" onclick="actConfirm('${dateStr}')">${ICON_CHECK} Potvrdit</button><button class="btn btn-danger" onclick="actDelete('${dateStr}',null)">${ICON_X} Zrušit</button>`;
    } else {
      const applied = shifts.some(s => s.name === STATE.currentUser.name);
      body.innerHTML = `<h4 class="text-center mb-2">Zájemci:</h4><ul class="mb-4 text-muted" style="padding-left:20px">` + shifts.map(s=>`<li>${s.name}</li>`).join('') + `</ul>` + (applied ? `<div class="status-pill gray">Máš zájem o směnu</div>` : '');
      
      if (isPast && !applied) {
         footer.innerHTML = `<div class="status-pill gray">Termín již proběhl</div>`;
      } else {
         footer.innerHTML = `<button class="btn btn-${applied?'danger':'success'} btn-fit" onclick="${applied?'actCancel':'actApply'}('${dateStr}')">${applied ? ICON_X : ICON_CHECK} ${applied?'Zrušit zájem':'Mám zájem'}</button>`;
      }
    }
  } 
  // --- 3. VOLNÝ TERMÍN (PRÁZDNO) ---
  else {
    if (isAdm) {
      // UPDATE: Vykreslení - Nejdříve Brigádník (Kdo -> Brigádník), potom Čas
      body.innerHTML = `
        <h4 class="text-center mb-4">Nová směna</h4>
        <div class="mb-2">
           <label class="text-label-bold">Brigádník:</label>
           <select id="mUser" class="styled-input">${STATE.cache.users.map(u=>`<option>${u}</option>`).join('')}</select>
        </div>
        <div class="mb-2">
           <label class="text-label-bold">Čas:</label>
           <div class="input-group" style="display:flex;gap:5px">
             <input type="time" id="mFrom" value="13:00" class="styled-input">
             <input type="time" id="mTo" value="18:00" class="styled-input">
           </div>
        </div>`;
      footer.innerHTML = `<button class="btn btn-success" onclick="actCreate('${dateStr}')">${ICON_CHECK} Potvrdit</button>`;
    } else {
      if (isPast) {
         body.innerHTML = `<div class="status-pill gray">Termín již proběhl</div>`;
         footer.innerHTML = ``;
      } else {
         body.innerHTML = `<div class="status-pill gray">Volný termín</div>`;
         footer.innerHTML = `<button class="btn btn-success btn-fit" onclick="actApply('${dateStr}')">${ICON_CHECK} Mám zájem</button>`;
      }
    }
  }
  DOM.shiftDialog.showModal();
}

// --- USER ACTIONS ---
window.actApply = (date) => runAction('applyForShift', [date, STATE.currentUser.name]);
window.actCancel = (date) => runAction('cancelApplication', [date, STATE.currentUser.name]);

window.actConfirm = (date) => {
  const user = document.getElementById('mUser').value;
  const from = document.getElementById('mFrom').value;
  const to = document.getElementById('mTo').value;
  runAction('confirmShift', [date, user, from, to]);
};

window.actDelete = (date, user) => {
  if (!user && STATE.currentUser.role === 'Admin') {
      const userEl = document.getElementById('mUser');
      if(userEl) user = userEl.value;
  }
  
  const msg = user ? `Opravdu smazat směnu pro: ${user}?` : "Opravdu smazat?";
  DOM.confirmMessage.textContent = msg;
  
  const newBtn = DOM.confirmActionBtn.cloneNode(true);
  DOM.confirmActionBtn.parentNode.replaceChild(newBtn, DOM.confirmActionBtn);
  DOM.confirmActionBtn = newBtn;
  
  DOM.confirmActionBtn.addEventListener('click', () => {
      closeModal('confirmDialog');
      if (STATE.currentUser.role === 'Admin') {
          runAction('adminDeleteShift', [date, user]);
      } else {
          runAction('cancelApplication', [date, STATE.currentUser.name]);
      }
  });
  
  closeModal('shiftDialog');
  DOM.confirmDialog.showModal();
};

window.actCreate = (date) => {
  const user = document.getElementById('mUser').value;
  const from = document.getElementById('mFrom').value;
  const to = document.getElementById('mTo').value;
  runAction('adminCreateShift', [date, user, from, to]);
};

window.actUpdate = (date, oldUser) => {
  const newUser = document.getElementById('mUser').value;
  const from = document.getElementById('mFrom').value;
  const to = document.getElementById('mTo').value;
  runAction('adminUpdateShift', [date, oldUser, newUser, from, to]);
};

function updatePrice() {
  const f = document.getElementById('mFrom').value;
  const t = document.getElementById('mTo').value;
  const u = document.getElementById('mUser').value;
  const el = document.getElementById('mPrice');
  
  if(f && t && u && el) {
      el.textContent = formatCurrency(Math.round(calcHours(f,t) * (STATE.cache.userRates[u]||0))) + " Kč";
  }
}

// --- SERVER ACTIONS ---
async function runAction(func, args) {
  closeModal('shiftDialog'); 
  showLoader();
  try {
    const res = await serverCall(func, args);
    
    let msg = res.message;
    let type = 'success'; 

    if(msg.includes('Úspěšně přihlášen')) msg = "Požadavek na směnu byl odeslán";
    else if(msg.includes('Na tento den už jsi přihlášen')) { msg = "Na tento den už jsi přihlášen(a)"; type='error'; }
    else if(msg.includes('Zrušeno')) msg = "Směna byla zrušena";
    else if(msg.includes('Potvrzeno')) msg = "Směna byla potvrzena";
    else if(msg.includes('Vytvořeno')) msg = "Směna byla vytvořena";
    else if(msg.includes('Smazáno')) msg = "Směna byla smazána";
    else if(msg.includes('Upraveno')) msg = "Směna byla upravena";
    else if(msg.includes('Nenalezeno')) { msg = "Nenalezeno"; type='error'; }
    else if(msg.includes('Vyplaceno')) msg = "Vyplaceno";
    else if(msg.includes('Neplatná')) { msg = "Neplatná hodnota"; type='error'; }

    showToast(msg, type);

    const [appData, histData] = await Promise.all([
      serverCall('getInitialAppData'),
      STATE.currentUser.role !== 'Admin' ? serverCall('getBrigadeerInitialData', [STATE.currentUser.name]) : null
    ]);
    
    STATE.cache.allShifts = appData.shifts;
    if(histData) STATE.cache.history = histData;
    
    renderCalendarLocal();
  } catch(e) { 
      showToast(e.message, 'error'); 
  } finally { 
      hideLoader(); 
  }
}

window.openPayModal = (n, h, r, d) => {
  if(!DOM.payDialog || !DOM.payModalPayable) {
      console.error("DOM Elements missing for Payment Modal");
      return;
  }
  
  DOM.payModalPayable.textContent = h+' h'; 
  DOM.payModalTotalDebt.textContent = formatCurrency(d)+' Kč';
  const inp = DOM.payInputHours; 
  inp.value = h; 
  
  inp.style.cssText = "max-width: 140px; margin: 0 auto; display: block; text-align: center; font-size: 1.5rem; font-weight: 800;";
  
  const submitBtn = DOM.payForm.querySelector('button[type="submit"]');
  if(submitBtn) {
      submitBtn.innerHTML = `${ICON_MONEY} Vyplatit`;
      submitBtn.classList.remove('full-width'); 
  }
  
  const recalc = () => {
     const val = Math.round((parseFloat(inp.value)||0) * r);
     DOM.payCalcAmount.textContent = formatCurrency(val)+' Kč';
     DOM.payRemaining.textContent = formatCurrency(d - val)+' Kč';
  };
  inp.oninput = recalc; recalc();
  
  DOM.payForm.onsubmit = (e) => { 
      e.preventDefault(); 
      if(inp.value <= 0) return showToast("Zadej hodiny", 'info');
      closeModal('payDialog'); 
      runAction('logHoursPayment', [n, inp.value]); 
  };
  DOM.payDialog.showModal();
};

// --- HELPER UTILS ---
async function serverCall(act, p=[]) {
  const r = await fetch(GAS_API_URL, {method:'POST', body:JSON.stringify({action:act, params:p})});
  const d = await r.json(); if(!d.success) throw new Error(d.message); return d;
}

function showToast(msg, type='success') {
    DOM.toastMsg.textContent = msg;
    DOM.toastIcon.innerHTML = '';
    
    if(type==='error') DOM.toastIcon.innerHTML = T_ICON_ERROR;
    else if(type==='info') DOM.toastIcon.innerHTML = T_ICON_INFO;
    else DOM.toastIcon.innerHTML = T_ICON_SUCCESS;

    DOM.toast.classList.add('show');
    setTimeout(() => DOM.toast.classList.remove('show'), 3000);
}

function formatCurrency(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
function calcHours(t1, t2) { return (new Date("2000-01-01T"+t2) - new Date("2000-01-01T"+t1)) / 3.6e6; }
function showLoader() { DOM.loader.style.display='flex'; }
function hideLoader() { DOM.loader.style.display='none'; }
function closeModal(id) { document.getElementById(id).close(); }