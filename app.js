// ====== REPLACE WITH YOUR NEW DEPLOYMENT URL ======
const API_URL = 'https://script.google.com/macros/s/AKfycbzE07h2CogJf4xd_EXt2KHU1FO0bWasGxzAcgBF4WgzT-0tUgCD5PmoKY7mFNGmLTA9Rg/exec';

let db = { accounts: [], transactions: [], budgets: [] };
let currentTab = 'wealth';
let txType = 'Expense';

// DOM Elements
const loadingEl = document.getElementById('loading');
const viewWealth = document.getElementById('view-wealth');
const viewPlanner = document.getElementById('view-planner');
const viewTransactions = document.getElementById('view-transactions');
const plannerMonthInput = document.getElementById('planner-month');

// Initialize Date
const now = new Date();
plannerMonthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

async function initApp() {
  try {
    const response = await fetch(API_URL);
    db = await response.json();
    loadingEl.classList.add('hidden');
    switchTab('wealth');
  } catch (error) {
    loadingEl.innerText = "Error loading data. Check internet or API URL.";
  }
}

// Navigation
document.getElementById('nav-wealth').addEventListener('click', () => switchTab('wealth'));
document.getElementById('nav-planner').addEventListener('click', () => switchTab('planner'));
document.getElementById('nav-transactions').addEventListener('click', () => switchTab('transactions'));
plannerMonthInput.addEventListener('change', () => renderPlanner());

function switchTab(tab) {
  currentTab = tab;
  
  // 1. Hide all views
  viewWealth.classList.add('hidden');
  viewPlanner.classList.add('hidden');
  viewTransactions.classList.add('hidden');
  
  // 2. UNHIDE the active view (This was the missing part!)
  if (tab === 'wealth') viewWealth.classList.remove('hidden');
  if (tab === 'planner') viewPlanner.classList.remove('hidden');
  if (tab === 'transactions') viewTransactions.classList.remove('hidden');

  // 3. Update bottom navigation colors
  document.getElementById('nav-wealth').classList.remove('text-emerald-700');
  document.getElementById('nav-planner').classList.remove('text-emerald-700');
  document.getElementById('nav-transactions').classList.remove('text-emerald-700');
  document.getElementById(`nav-${tab}`).classList.add('text-emerald-700');
  
  // 4. Update Header Title
  document.getElementById('header-title').innerText = tab === 'wealth' ? 'Net Worth & Balances' : tab === 'planner' ? 'Budget Planner' : 'Transactions';

  // 5. Render the data
  if(tab === 'wealth') renderWealth();
  if(tab === 'planner') renderPlanner();
  if(tab === 'transactions') renderTransactions();
}

function calculateAccountBalance(accountName, initialBalance) {
  let balance = initialBalance;
  db.transactions.forEach(tx => {
    if (tx.account === accountName) {
      if (tx.type === 'Income') balance += tx.amount;
      if (tx.type === 'Expense' || tx.type === 'Transfer') balance -= tx.amount;
    }
    if (tx.type === 'Transfer' && tx.toAccount === accountName) {
      balance += tx.amount;
    }
  });
  return balance;
}

function renderWealth() {
  const container = document.getElementById('accounts-container');
  container.innerHTML = '';
  let totalNetWorth = 0;

  const groups = { 'Checking / Everyday': [], 'Savings': [], 'Monthly Fixed Payment': [] };
  
  db.accounts.forEach(acc => {
    const currentBalance = calculateAccountBalance(acc.name, acc.initial);
    totalNetWorth += currentBalance;
    if(groups[acc.type]) groups[acc.type].push({ ...acc, currentBalance });
  });

  document.getElementById('wealth-total').innerText = totalNetWorth.toFixed(2);

  for (const [type, accs] of Object.entries(groups)) {
    if (accs.length === 0) continue;
    let groupHtml = `<h3 class="text-xs font-bold uppercase text-gray-500 mb-2 mt-4">${type}</h3><div class="grid grid-cols-2 gap-3">`;
    accs.forEach(a => {
      groupHtml += `
        <div class="bg-white border rounded-xl p-3 shadow-sm">
          <div class="text-sm text-gray-600 font-medium truncate">${a.name}</div>
          <div class="text-lg font-bold text-gray-800">${a.currentBalance.toFixed(2)}</div>
        </div>`;
    });
    container.innerHTML += groupHtml + '</div>';
  }
}

function renderPlanner() {
  const selectedMonth = plannerMonthInput.value;
  const container = document.getElementById('envelopes-container');
  const accSelect = document.getElementById('env-account');
  container.innerHTML = '';
  accSelect.innerHTML = '';

  let allocatedCash = 0;
  let totalNetWorth = 0;

  // Calculate Net Worth for Unallocated Math
  db.accounts.forEach(acc => {
    totalNetWorth += calculateAccountBalance(acc.name, acc.initial);
    accSelect.innerHTML += `<option value="${acc.name}">${acc.name}</option>`;
  });

  const monthBudgets = db.budgets.filter(b => b.month === selectedMonth);
  
  if (monthBudgets.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray-500">No budget envelopes found for this month.</p>';
  } else {
    monthBudgets.forEach(b => {
      allocatedCash += b.amount;
      // Calculate spent logic (Transactions matching category + month)
      let spent = 0;
      db.transactions.forEach(tx => {
        if (tx.type === 'Expense' && tx.category === b.category && tx.timestamp.startsWith(selectedMonth)) {
          spent += tx.amount;
        }
      });
      let remaining = b.amount - spent;
      let barWidth = Math.min((spent / b.amount) * 100, 100);

      container.innerHTML += `
        <div class="bg-white border rounded-xl p-4 shadow-sm">
          <div class="flex justify-between items-center mb-1">
            <span class="font-bold text-gray-700">${b.category} <span class="text-xs text-gray-400 font-normal">(${b.account})</span></span>
            <span class="font-bold ${remaining < 0 ? 'text-red-500' : 'text-emerald-600'}">${remaining.toFixed(2)}</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2 mb-1"><div class="bg-blue-500 h-2 rounded-full" style="width: ${barWidth}%"></div></div>
          <div class="flex justify-between text-xs text-gray-500"><span>Spent: ${spent.toFixed(2)}</span><span>Budget: ${b.amount.toFixed(2)}</span></div>
        </div>`;
    });
  }

  const unallocatedCash = totalNetWorth - allocatedCash;
  document.getElementById('planner-allocated').innerText = allocatedCash.toFixed(2);
  document.getElementById('planner-unallocated').innerText = unallocatedCash.toFixed(2);
}

function renderTransactions() {
  const fromSelect = document.getElementById('tx-account');
  const toSelect = document.getElementById('tx-to-account');
  const catSelect = document.getElementById('tx-category');
  const histContainer = document.getElementById('history-container');

  fromSelect.innerHTML = ''; toSelect.innerHTML = ''; catSelect.innerHTML = '<option value="">-- Unplanned / No Category --</option>';
  
  db.accounts.forEach(a => {
    fromSelect.innerHTML += `<option value="${a.name}">${a.name}</option>`;
    toSelect.innerHTML += `<option value="${a.name}">${a.name}</option>`;
  });

  const selectedMonth = plannerMonthInput.value;
  db.budgets.filter(b => b.month === selectedMonth).forEach(b => {
    catSelect.innerHTML += `<option value="${b.category}">${b.category}</option>`;
  });

  histContainer.innerHTML = '';
  const recent = [...db.transactions].reverse().slice(0, 20);
  recent.forEach(tx => {
    histContainer.innerHTML += `
      <div class="bg-white border rounded-lg p-3 flex justify-between shadow-sm">
        <div>
          <div class="font-bold text-sm text-gray-800">${tx.note || tx.category || 'Transaction'}</div>
          <div class="text-xs text-gray-500">${tx.timestamp.split('T')[0]} • ${tx.account}</div>
        </div>
        <div class="font-bold ${tx.type === 'Income' ? 'text-emerald-600' : 'text-red-600'}">
          ${tx.type === 'Income' ? '+' : '-'}${tx.amount.toFixed(2)}
        </div>
      </div>`;
  });
}

// Transaction Tabs Logic
document.querySelectorAll('.tx-tab').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tx-tab').forEach(b => { b.classList.remove('text-red-600', 'text-emerald-600', 'text-blue-600', 'bg-red-100', 'bg-emerald-100', 'bg-blue-100'); b.classList.add('text-gray-500'); });
    
    txType = e.target.innerText;
    if (txType === 'Expense') e.target.classList.add('text-red-600', 'bg-red-100');
    if (txType === 'Income') e.target.classList.add('text-emerald-600', 'bg-emerald-100');
    if (txType === 'Transfer') e.target.classList.add('text-blue-600', 'bg-blue-100');

    document.getElementById('wrap-to-account').classList.toggle('hidden', txType !== 'Transfer');
    document.getElementById('wrap-envelope').classList.toggle('hidden', txType === 'Transfer');
  });
});

// Post Data function
async function postData(payload, btnElement) {
  const origText = btnElement.innerText;
  btnElement.innerText = "Saving...";
  try {
    await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
    await initApp(); // Refresh data
    btnElement.closest('form').reset();
  } catch (error) {
    alert("Error saving data!");
  }
  btnElement.innerText = origText;
}

// Event Listeners for Forms
document.getElementById('form-account').addEventListener('submit', (e) => {
  e.preventDefault();
  postData({
    action: 'addAccount',
    name: document.getElementById('acc-name').value,
    type: document.getElementById('acc-type').value,
    initialBalance: parseFloat(document.getElementById('acc-balance').value)
  }, e.target.querySelector('button'));
});

document.getElementById('form-envelope').addEventListener('submit', (e) => {
  e.preventDefault();
  const currentBudgets = db.budgets.filter(b => b.month === plannerMonthInput.value);
  currentBudgets.push({
    month: plannerMonthInput.value,
    account: document.getElementById('env-account').value,
    category: document.getElementById('env-category').value,
    amount: parseFloat(document.getElementById('env-amount').value)
  });
  
  postData({ action: 'saveBudgets', budgets: db.budgets.filter(b => b.month !== plannerMonthInput.value).concat(currentBudgets) }, e.target.querySelector('button'));
});

document.getElementById('form-transaction').addEventListener('submit', (e) => {
  e.preventDefault();
  const nowStr = new Date().toISOString();
  postData({
    action: 'addTransaction',
    timestamp: nowStr,
    account: document.getElementById('tx-account').value,
    toAccount: txType === 'Transfer' ? document.getElementById('tx-to-account').value : '',
    type: txType,
    category: txType !== 'Transfer' ? document.getElementById('tx-category').value : '',
    amount: parseFloat(document.getElementById('tx-amount').value),
    note: document.getElementById('tx-note').value
  }, e.target.querySelector('button'));
});

// Run App
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./sw.js'); }
initApp();
