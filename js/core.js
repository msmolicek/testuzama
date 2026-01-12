// SOUBOR: js/core.js (v1.0 - Refactor)
// POPIS: Jádro aplikace - Konstanty, State, DOM Cache, API Wrapper a Utility.

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

// --- DOM ELEMENTS CACHE ---
let DOM = {};

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