// SOUBOR: js/logic.js (v13.1 - BULLETPROOF FIX)
// POPIS: Defenzivní programování pro odstranění chyb po přihlášení brigádníka.

// --- 0. LOCAL STATE ---
const TEMP_STATE = {
  activeDate: null, 
  originalShifts: [], 
  currentShifts: [], 
  isDirty: false, 
  viewMode: 'LIST',
  editTarget: null
};

// --- 1. INIT ---
document.addEventListener('DOMContentLoaded', () => {
  if (typeof GAS_API_URL === 'undefined') return alert("CHYBA: Core.js chybí!");
  injectHistoryModal(); initDOM(); initApp();
});

function initApp() {
  serverCall('getUserList').then(res => {
    STATE.cache.users = res.users.map(u => u.name);
    res.users.forEach(u => STATE.cache.userRates[u.name] = u.rate);
    DOM.userSelect.innerHTML = `<option value="" disabled selected>Vyber své jméno</option>` + 
      STATE.cache.users.map(u => `<option value="${u}">${u}</option>`).join('');
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

  DOM.shiftDialog.addEventListener('close', async () => {
    if (STATE.currentUser && STATE.currentUser.role === 'Admin' && TEMP_STATE.isDirty) {
      await syncBatchData();
    }
  });

  [DOM.shiftDialog, DOM.confirmDialog, DOM.payDialog, DOM.historyDialog].forEach(dialog => {
    if(dialog) dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  });
}

// --- 2. LOGIN ---
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
    if(!vRes.success) { hideLoader(); return showToast(isAdm ? 'Nesprávný admin PIN' : 'Nesprávný PIN', 'error'); }

    STATE.currentUser = vRes.user;
    if (isAdm) document.body.classList.add('is-admin');
    else document.body.classList.remove('is-admin');

    const promises = [serverCall('getInitialAppData')];
    if (!isAdm) promises.push(serverCall('getBrigadeerInitialData', [STATE.currentUser.name]));
    const [appData, histData] = await Promise.all(promises);
    
    STATE.cache.allShifts = appData.shifts || []; // Fallback na prázdné pole
    if (appData.users) appData.users.forEach(u => STATE.cache.userRates[u.name] = u.rate);
    
    // Zde byla chyba - pokud histData nepřišla, zůstalo to undefined
    if (histData && histData.success) {
        STATE.cache.history = histData;
    } else {
        STATE.cache.history = { allShifts: [], allTransactions: [] };
    }

    DOM.loginView.classList.add('hidden');
    DOM.appView.classList.remove('hidden');
    DOM.headerName.textContent = STATE.currentUser.name;
    DOM.headerRole.textContent = STATE.currentUser.role;
    DOM.dashAdmin.classList.toggle('hidden', !isAdm);
    DOM.dashBrigadeer.classList.toggle('hidden', isAdm);
    
    STATE.viewDate = new Date();
    
    // Bezpečné volání render funkcí
    if (!isAdm) {
        try { renderBrigadeerStats(); } catch(e) { console.error(e); }
    }
    renderCalendarLocal();

  } catch (err) { showToast(err.message, 'error'); } finally { hideLoader(); }
}

function handleLogout() {
  STATE.currentUser = null;
  document.body.classList.remove('is-admin');
  DOM.appView.classList.add('hidden');
  DOM.loginView.classList.remove('hidden');
  switchLoginMode('brigadeer');
}

// --- 3. CALENDAR ---
function changeMonthLocal(d) {
  STATE.viewDate.setMonth(STATE.viewDate.getMonth() + d);
  renderCalendarLocal();
}

function renderCalendarLocal() {
  const y = STATE.viewDate.getFullYear();
  const m = STATE.viewDate.getMonth() + 1;
  const shifts = (STATE.cache.allShifts || []).filter(s => s.year === y && s.month === m);
  
  DOM.calTitle.textContent = new Date(y, m - 1).toLocaleString('cs-CZ', { month: 'long', year: 'numeric' });
  DOM.calGrid.innerHTML = '';
  
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() || 7) - 1; 
  const today = new Date(); today.setHours(0,0,0,0);

  for (let i = 0; i < offset; i++) DOM.calGrid.appendChild(Object.assign(document.createElement('div'), {className: 'cal-day empty'}));

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayShifts = shifts.filter(s => s.date === dateStr);
    
    // Bezpečné třídění
    const confirmedList = sortShiftsByTime(dayShifts.filter(s => s.status === 'Potvrzeno'));
    const pendingList = dayShifts.filter(s => s.status === 'Zájem');
    
    const isBrigadeer = STATE.currentUser && STATE.currentUser.role !== 'Admin';
    const dayDate = new Date(y, m - 1, d);
    const isPast = dayDate < today;

    const el = document.createElement('div');
    el.className = 'cal-day anim';
    el.style.animationDelay = `${d * 0.005}s`;
    if (dayDate.getTime() === today.getTime()) el.classList.add('today');
    if (isPast) el.classList.add('past');

    let html = `<div class="day-num">${d}</div>`;
    
    if (isBrigadeer) {
        // --- LOGIKA PRO BRIGÁDNÍKA ---
        const myName = STATE.currentUser.name;
        const myConfirmedShift = confirmedList.find(s => s.name === myName);
        const amIPending = pendingList.some(s => s.name === myName);
        
        if (myConfirmedShift) {
            // 1. Mám směnu -> ZELENÁ
            el.classList.add('s-confirmed');
            html += `<div class="day-status"><div class="status-dot confirmed"></div></div><div class="status-badge-mini text-green">${myConfirmedShift.timeFrom}-${myConfirmedShift.timeTo}</div>`; 
        
        } else if (confirmedList.length > 1) {
            // 2. Cizí dělená směna -> FIALOVÁ
            el.classList.add('s-split');
            html += `<div class="day-status"><div class="status-dots-group"><div class="status-dot split"></div><div class="status-dot split"></div></div></div><div class="status-badge-mini" style="color:var(--c-purple)">${confirmedList.length}x Směna</div>`;

        } else if (confirmedList.length === 1) {
            // 3. Cizí jedna směna -> Ukážeme jako free (nebo obsazeno, pokud chceme), ale bez zelené
             html += `<div class="day-status"><div class="status-dot free"></div></div>`;
        
        } else if (pendingList.length > 0) {
             // 4. Zájemci
             if(amIPending) {
                el.classList.add('s-pending');
                html += `<div class="day-status"><div class="status-dot pending"></div></div><div class="status-badge-mini text-accent">Máš zájem</div>`;
             } else if (!isPast) {
                // Info o zájemcích pro ostatní
                html += `<div class="day-status"><div class="status-dot free"></div></div><div class="status-badge-mini text-muted">${pendingList.length} zájemců</div>`;
             } else {
                html += `<div class="day-status"><div class="status-dot free"></div></div>`;
             }
        } else {
             html += `<div class="day-status"><div class="status-dot free"></div></div>`;
        }

    } else {
        // --- LOGIKA PRO ADMINA ---
        if (confirmedList.length > 1) {
            el.classList.add('s-split');
            html += `<div class="day-status"><div class="status-dots-group"><div class="status-dot split"></div><div class="status-dot split"></div></div></div><div class="status-badge-mini" style="color:var(--c-purple)">${confirmedList.length}x Dělená</div>`;
        } else if (confirmedList.length === 1) {
            el.classList.add('s-confirmed');
            html += `<div class="day-status"><div class="status-dot confirmed"></div></div><div class="status-badge-mini text-green">${confirmedList[0].name}</div>`;
        } else if (pendingList.length > 0) {
            el.classList.add('s-pending');
            html += `<div class="day-status"><div class="status-dot pending"></div></div><div class="status-badge-mini text-accent">${pendingList.length} zájemců</div>`;
        } else html += `<div class="day-status"><div class="status-dot free"></div></div>`;
    }
    el.innerHTML = html;
    el.onclick = () => openDayModal(dayDate, dateStr);
    DOM.calGrid.appendChild(el);
  }
  
  if (STATE.currentUser && STATE.currentUser.role === 'Admin') updateAdminTableAsync(y, m);
  else renderBrigadeerStats();
}

// --- 4. MODAL ---
function openDayModal(dateObj, dateStr) {
  TEMP_STATE.activeDate = dateStr;
  const shiftsForDay = (STATE.cache.allShifts || []).filter(s => s.date === dateStr);
  TEMP_STATE.originalShifts = JSON.parse(JSON.stringify(shiftsForDay));
  TEMP_STATE.currentShifts = JSON.parse(JSON.stringify(shiftsForDay));
  TEMP_STATE.isDirty = false;
  TEMP_STATE.viewMode = 'LIST';
  document.getElementById('shiftModalDate').textContent = dateObj.toLocaleDateString('cs-CZ');
  renderModalBody();
  if (!DOM.shiftDialog.open) DOM.shiftDialog.showModal();
}

function renderModalBody() {
  const isAdm = STATE.currentUser.role === 'Admin';
  const body = document.getElementById('shiftModalBody');
  const footer = document.getElementById('shiftModalFooter');
  
  const confirmedList = sortShiftsByTime(TEMP_STATE.currentShifts.filter(s => s.status === 'Potvrzeno'));
  const pendingList = TEMP_STATE.currentShifts.filter(s => s.status === 'Zájem');

  // --- ADMIN RENDER ---
  if (isAdm) {
      if (TEMP_STATE.viewMode === 'EDIT' || TEMP_STATE.viewMode === 'ADD') {
          const isEdit = TEMP_STATE.viewMode === 'EDIT';
          const editData = TEMP_STATE.editTarget || {};
          const saveBtnAction = `localSaveAction('${isEdit && editData.id ? editData.id : ''}')`;
          
          body.innerHTML = `
             <div class="status-pill ${isEdit ? 'green' : 'gray'}">${isEdit ? 'Úprava směny' : 'Nová směna'}</div>
             <div class="mb-2"><label class="text-label-bold">Brigádník:</label>
               <select id="mUser" class="styled-input">
                 ${STATE.cache.users.map(u => {
                     const sel = (isEdit && u === editData.name) ? 'selected' : '';
                     return `<option value="${u}" ${sel}>${u}</option>`;
                 }).join('')}
               </select></div>
             <div class="mb-2"><label class="text-label-bold">Čas:</label>
               <div class="input-group" style="display:flex;gap:5px">
                 <input type="time" id="mFrom" value="${editData.timeFrom || '13:00'}" class="styled-input">
                 <input type="time" id="mTo" value="${editData.timeTo || '18:00'}" class="styled-input">
               </div></div>`;
          footer.innerHTML = `
            <button class="btn btn-success" onclick="${saveBtnAction}">${ICON_CHECK} ${isEdit ? 'Uložit' : 'Potvrdit'}</button>
            <button class="btn btn-danger" onclick="setModalViewMode('LIST')">${ICON_X} Zpět</button>`;
      } else {
          let html = '';
          if (confirmedList.length > 1) html += `<div class="status-pill purple">Dělená směna (${confirmedList.length})</div>`;
          else if (confirmedList.length === 1) html += `<div class="status-pill green">Naplánováno</div>`;
          else html += `<div class="status-pill gray">Volný termín</div>`;

          if (confirmedList.length > 0) {
              confirmedList.forEach(shift => {
                  const rate = STATE.cache.userRates[shift.name] || 0;
                  const hours = calcHours(shift.timeFrom, shift.timeTo);
                  const price = Math.round(hours * rate);
                  html += `<div class="shift-row"><div class="shift-row-info"><span class="row-name">${shift.name}</span><span class="row-time">${shift.timeFrom} – ${shift.timeTo}</span></div><div class="shift-row-price">${formatCurrency(price)} Kč</div><div class="shift-row-actions">
                            <button class="action-btn edit" onclick="localEditStart('${shift.id}')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                            <button class="action-btn delete" onclick="localDeleteAction('${shift.id}')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                        </div></div>`;
              });
          }
          if (pendingList.length > 0) {
              html += `<div class="status-pill yellow mt-4">Zájemci (${pendingList.length})</div>`;
              pendingList.sort((a, b) => (a.timestamp ? new Date(a.timestamp).getTime() : 0) - (b.timestamp ? new Date(b.timestamp).getTime() : 0));
              html += `<div class="text-center text-muted mb-4 text-sm" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center;">`;
              pendingList.forEach(p => { html += `<span class="name-pill gray" onclick="localPreFillAdd('${p.name}')">${p.name}</span>`; });
              html += `</div>`;
          }
          body.innerHTML = html;
          footer.innerHTML = `<button class="btn btn-secondary btn-fit" onclick="setModalViewMode('ADD')">+ Přidat směnu</button>`;
      }
  
  // --- BRIGADEER RENDER ---
  } else {
      let html = '';
      const myName = STATE.currentUser.name;
      const myShift = confirmedList.find(s => s.name === myName);
      const myInterest = pendingList.find(s => s.name === myName);
      const isPast = getLocalDayDate(TEMP_STATE.activeDate) < new Date().setHours(0,0,0,0);
      
      if (myShift) {
          // 1. Mám směnu
          const rate = STATE.cache.userRates[myName] || 0;
          const price = Math.round(calcHours(myShift.timeFrom, myShift.timeTo) * rate);
          html = `<div class="status-pill green">${isPast ? 'Odpracováno' : 'Máš směnu'}</div><div class="shift-row"><div class="shift-row-info"><span class="row-name">${myName}</span><span class="row-time">${myShift.timeFrom} – ${myShift.timeTo}</span></div><div class="shift-row-price">${formatCurrency(price)} Kč</div></div>`;
          if (!isPast) footer.innerHTML = `<button class="btn btn-danger btn-fit" onclick="brigadeerActionDirect('remove', '${TEMP_STATE.activeDate}')">${ICON_X} Zrušit směnu</button>`; else footer.innerHTML = '';
      
      } else if (confirmedList.length > 0) {
          // 2. Dělená směna (vidím ostatní, ale jen info)
          html = `<div class="status-pill purple">Obsazeno</div>`;
          confirmedList.forEach(shift => {
             html += `<div class="shift-row"><div class="shift-row-info"><span class="row-name">${shift.name}</span><span class="row-time">${shift.timeFrom} – ${shift.timeTo}</span></div></div>`;
          });
          footer.innerHTML = ''; 

      } else if (myInterest) {
          // 3. Mám zájem
          html = `<div class="status-pill yellow">Máš zájem</div><p class="text-center text-muted">Čekej na potvrzení.</p>`;
          if (!isPast) footer.innerHTML = `<button class="btn btn-danger btn-fit" onclick="brigadeerActionDirect('remove', '${TEMP_STATE.activeDate}')">${ICON_X} Zrušit zájem</button>`; else footer.innerHTML = '';
      
      } else {
          // 4. Volno
          html = `<div class="status-pill gray">${isPast ? 'Termín již proběhl' : 'Volný termín'}</div>`;
          if (!isPast) footer.innerHTML = `<button class="btn btn-success btn-fit" onclick="brigadeerActionDirect('add', '${TEMP_STATE.activeDate}')">${ICON_CHECK} Mám zájem</button>`; else footer.innerHTML = '';
      }
      body.innerHTML = html;
  }
}

// --- 5. HELPERS ---

function sortShiftsByTime(list) {
  if (!list) return [];
  return list.sort((a, b) => {
    // Defenzivní kontrola - pokud chybí čas, řadíme na konec
    const tA = a.timeFrom || '23:59';
    const tB = b.timeFrom || '23:59';
    if (tA !== tB) return tA.localeCompare(tB);
    return (a.timeTo || '23:59').localeCompare(b.timeTo || '23:59');
  });
}

function renderBrigadeerStats() {
  if (!STATE.cache.history) return; // Silent fail if no history yet
  const h = STATE.cache.history;
  if (!h.allShifts) return;

  const y = STATE.viewDate.getFullYear();
  const m = STATE.viewDate.getMonth() + 1;
  const mm = String(m).padStart(2, '0');
  let planned = 0, earnedM = 0, totalEarned = 0, workedM = 0, countP = 0;
  
  h.allShifts.forEach(s => {
    if (s.status === 'Potvrzeno' && s.timeFrom && s.timeTo) {
      const d = new Date(s.date);
      const hrs = calcHours(s.timeFrom, s.timeTo);
      const isPast = d < new Date().setHours(0,0,0,0);
      if (isPast) totalEarned += hrs * STATE.currentUser.rate;
      if (d.getFullYear() === y && (d.getMonth() + 1) === m) {
        if (isPast) { earnedM += hrs * STATE.currentUser.rate; workedM += hrs; } else { planned += hrs; countP++; }
      }
    }
  });
  
  const paid = (h.allTransactions || []).reduce((sum, t) => t.amount < 0 ? sum + Math.abs(t.amount) : sum, 0);
  
  const elPlan = document.getElementById('b-planned-hours'); if(elPlan) elPlan.textContent = planned.toFixed(1) + ' h';
  const elShift = document.getElementById('b-planned-shifts'); if(elShift) elShift.textContent = countP + ' směn';
  const elWork = document.getElementById('b-worked-hours'); if(elWork) elWork.textContent = workedM.toFixed(1) + ' h';
  
  const labelEarn = document.getElementById('b-month-earn-label'); if(labelEarn) labelEarn.textContent = `K VÝPLATĚ`;
  const elEarn = document.getElementById('b-month-earn'); if(elEarn) elEarn.textContent = formatCurrency(Math.round(earnedM)) + ' Kč';
  const explainEl = elEarn ? elEarn.nextElementSibling : null; if(explainEl) explainEl.textContent = `${mm}/${y}`;
  
  const labelBalance = document.getElementById('b-balance-label-text'); if(labelBalance) labelBalance.textContent = "CELKEM";
  const balance = Math.max(0, totalEarned - paid);
  const elBal = document.getElementById('b-balance'); if(elBal) elBal.textContent = formatCurrency(Math.round(balance)) + ' Kč';
  const elPaid = document.getElementById('b-paid'); if(elPaid) elPaid.textContent = `Vyplaceno: ${formatCurrency(Math.round(paid))} Kč`;
}

// Actions & Helpers (Standard)
window.setModalViewMode = (mode) => { TEMP_STATE.viewMode = mode; TEMP_STATE.editTarget = null; renderModalBody(); };
window.localPreFillAdd = (name) => { TEMP_STATE.editTarget = { name: name, timeFrom: '13:00', timeTo: '18:00' }; TEMP_STATE.viewMode = 'ADD'; renderModalBody(); };
window.localEditStart = (id) => { const shift = TEMP_STATE.currentShifts.find(s => s.id === id); if(shift) { TEMP_STATE.editTarget = JSON.parse(JSON.stringify(shift)); TEMP_STATE.viewMode = 'EDIT'; renderModalBody(); } };
window.localDeleteAction = (id) => { TEMP_STATE.currentShifts = TEMP_STATE.currentShifts.filter(s => s.id !== id); TEMP_STATE.isDirty = true; renderModalBody(); };

window.localSaveAction = (editId) => {
    const name = document.getElementById('mUser').value;
    const from = document.getElementById('mFrom').value;
    const to = document.getElementById('mTo').value;
    if (!name || !from || !to) return showToast('Vyplň vše', 'info');

    if (editId && editId !== 'null' && editId !== '') {
        const idx = TEMP_STATE.currentShifts.findIndex(s => s.id === editId);
        if (idx > -1) {
            TEMP_STATE.currentShifts[idx].name = name;
            TEMP_STATE.currentShifts[idx].timeFrom = from;
            TEMP_STATE.currentShifts[idx].timeTo = to;
        }
    } else {
        TEMP_STATE.currentShifts.push({
            id: 'temp_' + Date.now(), 
            date: TEMP_STATE.activeDate,
            name: name,
            status: 'Potvrzeno',
            timeFrom: from,
            timeTo: to,
            timestamp: new Date().toISOString()
        });
    }
    
    TEMP_STATE.currentShifts = [...TEMP_STATE.currentShifts];
    TEMP_STATE.isDirty = true;
    TEMP_STATE.viewMode = 'LIST';
    renderModalBody(); 
};

async function syncBatchData() {
    showLoader();
    try {
        const res = await serverCall('syncDayData', [TEMP_STATE.activeDate, TEMP_STATE.currentShifts]);
        STATE.cache.allShifts = res.shifts;
        renderCalendarLocal();
        showToast('Uloženo', 'success');
    } catch (e) {
        showToast('Chyba uložení: ' + e.message, 'error');
        const appData = await serverCall('getInitialAppData');
        STATE.cache.allShifts = appData.shifts;
        renderCalendarLocal();
    } finally { hideLoader(); TEMP_STATE.isDirty = false; }
}

window.brigadeerActionDirect = async (action, dateStr) => {
    closeModal('shiftDialog'); showLoader();
    try {
        const res = await serverCall('brigadeerAction', [action, dateStr, STATE.currentUser.name]);
        if(res.success) {
            showToast(res.message, 'success');
            const [appData, histData] = await Promise.all([serverCall('getInitialAppData'), serverCall('getBrigadeerInitialData', [STATE.currentUser.name])]);
            STATE.cache.allShifts = appData.shifts;
            if(histData) STATE.cache.history = histData;
            renderCalendarLocal();
        } else { showToast(res.message, 'error'); }
    } catch (e) { showToast(e.message, 'error'); } finally { hideLoader(); }
};

// Admin Helpers
function setAdminView(mode, btn) { STATE.adminViewMode = mode; document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); renderCalendarLocal(); }
async function updateAdminTableAsync(y, m) {
  const tbody = document.getElementById('adminStatsBody'); if(!tbody) return;
  const colSpan = STATE.adminViewMode === 'monthly' ? 3 : 4;
  tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="spinner-small-center"></div></td></tr>`;
  try {
    const stats = await serverCall('getAdminOverviewData', [STATE.adminViewMode, y, m]);
    tbody.innerHTML = ''; 
    if (!stats.dashboardData || !stats.dashboardData.length) return;
    stats.dashboardData.forEach(u => {
      const displayedHours = STATE.adminViewMode === 'total' ? u.payableHours : u.totalHours;
      const hasWork = parseFloat(displayedHours) > 0;
      const rowClass = hasWork ? 'row-active' : '';
      const pillClass = hasWork ? 'green' : 'gray';
      const nameCell = `<span class="name-pill ${pillClass}" onclick="openHistoryModal('${u.name}')">${u.name}</span>`;
      let html = `<tr class="${rowClass}"><td class="align-left">${nameCell}</td><td>${displayedHours}</td><td class="${u.toPay>0 ? 'text-accent' : (hasWork?'':'text-muted')}">${formatCurrency(u.toPay)} Kč</td>`;
      if (STATE.adminViewMode === 'total') {
          const btn = parseFloat(u.payableHours) > 0 ? `<button class="btn-icon-circle" onclick="openPayModal('${u.name}', ${u.payableHours}, ${u.rate}, ${u.toPay})">${ICON_MONEY}</button>` : '-';
          html += `<td>${btn}</td>`;
      }
      tbody.innerHTML += html + `</tr>`;
    });
  } catch(e) { tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-danger">Error</td></tr>`; }
}
async function openHistoryModal(userName) {
  const y = STATE.viewDate.getFullYear(); const m = STATE.viewDate.getMonth() + 1;
  DOM.histModalTitle.textContent = userName;
  DOM.histModalSubtitle.textContent = STATE.adminViewMode === 'total' ? `${y}` : `${String(m).padStart(2, '0')}/${y}`;
  DOM.histModalBody.innerHTML = '<div class="spinner-small-center"></div>';
  DOM.historyDialog.showModal();
  try {
    const res = await serverCall('getAdminUserHistory', [userName, STATE.adminViewMode, y, m]);
    DOM.histModalBody.innerHTML = '';
    if (!res.history || res.history.length === 0) { DOM.histModalBody.innerHTML = '<div class="text-muted text-center py-4">Žádná historie</div>'; return; }
    let html = '<div class="history-list">';
    res.history.forEach(item => { html += `<div class="history-item"><div class="h-row-top"><span class="h-date">${item.date}</span><span class="h-amount text-red">${formatCurrency(item.amount)} Kč</span></div><div class="h-note">${item.note}</div></div>`; });
    DOM.histModalBody.innerHTML = html + '</div>';
  } catch (e) { DOM.histModalBody.innerHTML = `<div class="text-danger">${e.message}</div>`; }
}
window.openPayModal = (n, h, r, d) => {
  DOM.payModalPayable.textContent = h+' h'; DOM.payModalTotalDebt.textContent = formatCurrency(d)+' Kč';
  const inp = DOM.payInputHours; inp.value = h; 
  inp.oninput = () => { DOM.payCalcAmount.textContent = formatCurrency(Math.round((parseFloat(inp.value)||0) * r))+' Kč'; DOM.payRemaining.textContent = formatCurrency(d - Math.round((parseFloat(inp.value)||0) * r))+' Kč'; };
  inp.oninput();
  DOM.payForm.onsubmit = (e) => { e.preventDefault(); if(inp.value <= 0) return; closeModal('payDialog'); runAction('logHoursPayment', [n, inp.value]); };
  DOM.payDialog.showModal();
};
async function runAction(func, args) { showLoader(); try { await serverCall(func, args); showToast('Uloženo','success'); const appData = await serverCall('getInitialAppData'); STATE.cache.allShifts = appData.shifts; if (STATE.currentUser.role === 'Admin') updateAdminTableAsync(STATE.viewDate.getFullYear(), STATE.viewDate.getMonth() + 1); renderCalendarLocal(); } catch(e) { showToast(e.message, 'error'); } finally { hideLoader(); } }
function getLocalDayDate(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d); }