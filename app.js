// POST YOUR GOOGLE APPS SCRIPT URL HERE
const API_URL = 'https://script.google.com/macros/s/AKfycbyZOZ5WMV_fSjjPWQqbJ_JLfzjf6H4-6KJ_swsjLODgwK8VvQ-sLYxX5EHoAYOnj5fRjA/exec';

const DOM = {
  balancesGrid: document.getElementById('balancesGrid'),
  accountSelect: document.getElementById('accountSelect'),
  txForm: document.getElementById('txForm'),
  loading: document.getElementById('loading'),
  refreshBtn: document.getElementById('refreshBtn')
};

let appData = { accounts: [], transactions: [] };

async function init() {
  registerServiceWorker();
  await loadData();
}

async function loadData() {
  setLoading(true);
  try {
    const res = await fetch(API_URL);
    appData = await res.json();
    renderDashboard();
    populateSelect();
  } catch (err) {
    console.error(err);
  }
  setLoading(false);
}

function calculateBalances() {
  const balances = {};
  
  appData.accounts.forEach(acc => {
    balances[acc.name] = { balance: acc.initial, limit: acc.limit };
  });

  appData.transactions.forEach(tx => {
    if(balances[tx.account]) {
      if(tx.type === 'Income') balances[tx.account].balance += tx.amount;
      if(tx.type === 'Expense') balances[tx.account].balance -= tx.amount;
    }
  });

  return balances;
}

function renderDashboard() {
  const balances = calculateBalances();
  DOM.balancesGrid.innerHTML = '';

  for (const [name, data] of Object.entries(balances)) {
    const isLow = data.balance <= data.limit;
    
    const card = document.createElement('div');
    card.className = `p-4 rounded-xl border shadow-sm ${isLow ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`;
    
    card.innerHTML = `
      <h3 class="text-sm font-medium ${isLow ? 'text-red-600' : 'text-gray-500'} mb-1">${name}</h3>
      <div class="text-xl font-bold ${isLow ? 'text-red-700' : 'text-gray-800'}">
        ${data.balance.toFixed(2)}
      </div>
      ${isLow ? `<div class="text-xs text-red-600 mt-2 font-semibold flex items-center">⚠️ Limit Warning</div>` : ''}
    `;
    DOM.balancesGrid.appendChild(card);
  }
}

function populateSelect() {
  DOM.accountSelect.innerHTML = appData.accounts
    .map(a => `<option value="${a.name}">${a.name}</option>`).join('');
}

DOM.txForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const payload = {
    type: document.querySelector('input[name="type"]:checked').value,
    account: DOM.accountSelect.value,
    amount: parseFloat(document.getElementById('amountInput').value),
    note: document.getElementById('noteInput').value
  };

  // Optimistic UI Update
  appData.transactions.push({ ...payload, timestamp: new Date().toISOString() });
  renderDashboard();
  DOM.txForm.reset();

  setLoading(true);
  try {
    // Note: We use text/plain to intentionally bypass the CORS pre-flight OPTIONS request
    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    alert('Failed to save. Connect to network and try again.');
  }
  setLoading(false);
});

DOM.refreshBtn.addEventListener('click', loadData);

function setLoading(state) {
  DOM.loading.classList.toggle('hidden', !state);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
  }
}

init();
