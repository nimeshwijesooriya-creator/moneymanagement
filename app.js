const API_URL = 'https://script.google.com/macros/s/AKfycbyUoIy1GifiMKxPnh-AOVkwlWsDRKNLH0r_PJsPw0MVteNlkse9v6g4odCz4CJY_bSTRg/exec'; // <-- PASTE YOUR URL HERE

const DOM = {
  balancesGrid: document.getElementById('balancesGrid'),
  accountSelect: document.getElementById('accountSelect'),
  txCategorySelect: document.getElementById('txCategorySelect'),
  categoryContainer: document.getElementById('categoryContainer'),
  budgetAccountSelect: document.getElementById('budgetAccountSelect'),
  budgetProgressContainer: document.getElementById('budgetProgressContainer'),
  wagesRatioContainer: document.getElementById('wagesRatioContainer'),
  spendingRatioContainer: document.getElementById('spendingRatioContainer'),
  loading: document.getElementById('loading')
};

let appData = { accounts: [], transactions: [], budgets: [] };

async function init() {
  setupNavigation();
  await loadData();
}

async function loadData() {
  DOM.loading.classList.remove('hidden');
  try {
    const res = await fetch(API_URL);
    appData = await res.json();
    if(!appData.budgets) appData.budgets = [];
    renderAll();
  } catch (err) { console.error('Data sync failed:', err); }
  DOM.loading.classList.add('hidden');
}

// ---- METRICS & RENDERING ---- //
function calculateMetrics() {
  const accMetrics = {};
  let poolBalance = 0, poolExpenses = 0;

  appData.accounts.forEach(acc => accMetrics[acc.name] = { balance: acc.initial, limit: acc.limit, expenses: 0 });

  appData.transactions.forEach(tx => {
    if (accMetrics[tx.account]) {
      if (tx.type === 'Income') accMetrics[tx.account].balance += tx.amount;
      if (tx.type === 'Expense') {
        accMetrics[tx.account].balance -= tx.amount;
        accMetrics[tx.account].expenses += tx.amount;
        poolExpenses += tx.amount;
      }
    }
  });

  Object.values(accMetrics).forEach(acc => { if (acc.balance > 0) poolBalance += acc.balance; });
  return { accMetrics, poolBalance, poolExpenses };
}

function renderAll() {
  const metrics = calculateMetrics();
  renderDashboard(metrics.accMetrics);
  renderPlanner();
  renderAnalytics(metrics);
  populateSelects();
  updateCategoryDropdown();
}

function renderDashboard(metrics) {
  DOM.balancesGrid.innerHTML = '';
  for (const [name, data] of Object.entries(metrics)) {
    const isLow = data.balance <= data.limit;
    DOM.balancesGrid.innerHTML += `
      <div class="p-4 rounded-xl border shadow-sm ${isLow ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}">
        <h3 class="text-sm font-medium ${isLow ? 'text-red-600' : 'text-gray-500'} mb-1">${name}</h3>
        <div class="text-xl font-bold ${isLow ? 'text-red-700' : 'text-gray-800'}">${data.balance.toFixed(2)}</div>
      </div>
    `;
  }
}

// ---- PLANNER LOGIC ---- //
function renderPlanner() {
  const budgetMetrics = appData.budgets.map(b => ({ ...b, spent: 0 }));
  
  // Calculate how much was spent from each envelope
  appData.transactions.forEach(tx => {
    if (tx.type === 'Expense' && tx.category) {
      const b = budgetMetrics.find(m => m.account === tx.account && m.category === tx.category);
      if (b) b.spent += tx.amount;
    }
  });

  DOM.budgetProgressContainer.innerHTML = budgetMetrics.length ? '' : '<p class="text-sm text-gray-500">No budget plans created yet.</p>';
  
  budgetMetrics.forEach((m, index) => {
    const remaining = m.amount - m.spent;
    const percent = Math.min(100, (m.spent / m.amount) * 100);
    const isOver = remaining < 0;
    
    DOM.budgetProgressContainer.innerHTML += `
      <div class="bg-white p-4 rounded-xl border shadow-sm relative">
        <button onclick="removeBudget(${index})" class="absolute top-2 right-2 text-red-400 hover:text-red-600 text-sm font-bold">✕</button>
        <div class="text-xs text-gray-500 mb-1">${m.account}</div>
        <div class="flex justify-between items-end mb-2">
          <span class="font-bold text-gray-800">${m.category}</span>
          <div class="text-right">
            <div class="text-sm font-semibold ${isOver ? 'text-red-600' : 'text-blue-600'}">${remaining.toFixed(2)} left</div>
            <div class="text-xs text-gray-400">of ${m.amount.toFixed(2)} planned</div>
          </div>
        </div>
        <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
          <div class="${isOver ? 'bg-red-500' : 'bg-blue-500'} h-full transition-all" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  });
}

// Add a Budget Plan
document.getElementById('budgetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    account: DOM.budgetAccountSelect.value,
    category: document.getElementById('budgetCatInput').value,
    amount: parseFloat(document.getElementById('budgetAmountInput').value)
  };
  
  appData.budgets.push(payload);
  renderAll();
  e.target.reset();
  
  await fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'saveBudgets', budgets: appData.budgets })
  });
});

// Remove a Budget Plan
window.removeBudget = async function(index) {
  if(confirm('Delete this budget category?')) {
    appData.budgets.splice(index, 1);
    renderAll();
    await fetch(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveBudgets', budgets: appData.budgets })
    });
  }
}

// ---- TRACKER & FORMS ---- //
function populateSelects() {
  const options = appData.accounts.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
  if (!DOM.accountSelect.value) DOM.accountSelect.innerHTML = options;
  if (!DOM.budgetAccountSelect.value) DOM.budgetAccountSelect.innerHTML = options;
}

function updateCategoryDropdown() {
  const account = DOM.accountSelect.value;
  const type = document.querySelector('input[name="type"]:checked').value;
  const matchedBudgets = appData.budgets.filter(b => b.account === account);
  
  if (type === 'Expense' && matchedBudgets.length > 0) {
    DOM.categoryContainer.classList.remove('hidden');
    DOM.txCategorySelect.innerHTML = '<option value="">-- General Expense --</option>' + 
      matchedBudgets.map(b => `<option value="${b.category}">${b.category}</option>`).join('');
  } else {
    DOM.categoryContainer.classList.add('hidden');
    DOM.txCategorySelect.value = '';
  }
}

DOM.accountSelect.addEventListener('change', updateCategoryDropdown);
document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', updateCategoryDropdown));

// Add Transaction
document.getElementById('txForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    action: 'addTransaction',
    type: document.querySelector('input[name="type"]:checked').value,
    account: DOM.accountSelect.value,
    category: DOM.txCategorySelect.value || '',
    amount: parseFloat(document.getElementById('amountInput').value),
    note: document.getElementById('noteInput').value
  };

  appData.transactions.push({ ...payload, timestamp: new Date().toISOString() });
  renderAll();
  e.target.reset();
  DOM.loading.classList.remove('hidden');

  await fetch(API_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  DOM.loading.classList.add('hidden');
});

// Analytics & Nav logic truncated for brevity (same as previous)
function renderAnalytics(metrics) { /* (Keep your previous renderAnalytics code here) */ }
function setupNavigation() {
  const tabs = ['Tracker', 'Planner', 'Analytics'];
  tabs.forEach(tab => {
    document.getElementById(`nav${tab}`).addEventListener('click', () => {
      tabs.forEach(t => {
        document.getElementById(`${t.toLowerCase()}Tab`).classList.toggle('hidden', t !== tab);
        document.getElementById(`nav${t}`).className = t === tab ? 'flex flex-col items-center justify-center w-full h-full text-emerald-600 font-semibold text-sm' : 'flex flex-col items-center justify-center w-full h-full text-gray-400 font-semibold text-sm';
      });
      if(tab !== 'Tracker') renderAll();
    });
  });
}

document.getElementById('refreshBtn').addEventListener('click', loadData);
init();
