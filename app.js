const API_URL = 'https://script.google.com/macros/s/AKfycbyUoIy1GifiMKxPnh-AOVkwlWsDRKNLH0r_PJsPw0MVteNlkse9v6g4odCz4CJY_bSTRg/exec'; // <-- PASTE URL

const DOM = {
  heroRemaining: document.getElementById('heroRemaining'),
  heroPlanned: document.getElementById('heroPlanned'),
  heroSpent: document.getElementById('heroSpent'),
  monthDisplay: document.getElementById('monthDisplay'),
  envelopeMonthLabel: document.getElementById('envelopeMonthLabel'),
  budgetProgressContainer: document.getElementById('budgetProgressContainer'),
  unallocatedCash: document.getElementById('unallocatedCash'),
  copyLastMonthBtn: document.getElementById('copyLastMonthBtn'),
  accountSelect: document.getElementById('accountSelect'),
  txCategorySelect: document.getElementById('txCategorySelect'),
  categoryContainer: document.getElementById('categoryContainer'),
  budgetAccountSelect: document.getElementById('budgetAccountSelect'),
  balancesGrid: document.getElementById('balancesGrid')
};

let appData = { accounts: [], transactions: [], budgets: [] };
let currentDate = new Date(); // Start at real current date

async function init() {
  setupNavigation();
  updateMonthUI();
  await loadData();
}

// --- TIME TRAVEL LOGIC ---
function getMonthStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function updateMonthUI() {
  const opts = { year: 'numeric', month: 'long' };
  const displayStr = currentDate.toLocaleDateString('en-US', opts);
  DOM.monthDisplay.innerText = displayStr;
  DOM.envelopeMonthLabel.innerText = displayStr;
  if(appData.accounts.length) renderAll(); // Re-render everything for new month
}

document.getElementById('prevMonth').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); updateMonthUI(); });
document.getElementById('nextMonth').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); updateMonthUI(); });

// --- DATA ENGINE ---
async function loadData() {
  document.getElementById('loading').classList.remove('hidden');
  try {
    const res = await fetch(API_URL);
    appData = await res.json();
    if(!appData.budgets) appData.budgets = [];
    renderAll();
  } catch (err) { console.error(err); }
  document.getElementById('loading').classList.add('hidden');
}

function renderAll() {
  const currentMonthStr = getMonthStr(currentDate);
  
  // 1. Filter Data for Selected Month
  const currentBudgets = appData.budgets.filter(b => b.month === currentMonthStr);
  const currentTxs = appData.transactions.filter(tx => tx.timestamp.startsWith(currentMonthStr));

  // 2. Calculate Actual Bank Balances (All time, up to now)
  let totalBankCash = 0;
  const accBalances = {};
  appData.accounts.forEach(a => accBalances[a.name] = a.initial);
  appData.transactions.forEach(tx => {
    if(tx.timestamp <= getMonthStr(currentDate) + "-31") { // Include historical up to selected month
      if(tx.type === 'Income') accBalances[tx.account] += tx.amount;
      if(tx.type === 'Expense') accBalances[tx.account] -= tx.amount;
    }
  });
  Object.values(accBalances).forEach(bal => { if(bal > 0) totalBankCash += bal; });

  // 3. Render Accounts Tab (Actual Cash)
  DOM.balancesGrid.innerHTML = '';
  for (const [name, balance] of Object.entries(accBalances)) {
    DOM.balancesGrid.innerHTML += `
      <div class="p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
        <h3 class="text-sm font-medium text-gray-500">${name}</h3>
        <div class="text-xl font-bold text-gray-800">${balance.toFixed(2)}</div>
      </div>`;
  }

  // 4. Calculate Month Envelopes
  let totalPlanned = 0;
  let totalSpent = 0;
  
  const envelopeMetrics = currentBudgets.map(b => ({ ...b, spent: 0 }));
  
  currentTxs.forEach(tx => {
    if (tx.type === 'Expense' && tx.category) {
      const env = envelopeMetrics.find(m => m.account === tx.account && m.category === tx.category);
      if (env) {
        env.spent += tx.amount;
        totalSpent += tx.amount;
      }
    }
  });

  envelopeMetrics.forEach(env => totalPlanned += env.amount);

  // 5. Update Front Page Hero Card
  DOM.heroPlanned.innerText = totalPlanned.toFixed(2);
  DOM.heroSpent.innerText = totalSpent.toFixed(2);
  const remaining = totalPlanned - totalSpent;
  DOM.heroRemaining.innerText = remaining.toFixed(2);
  DOM.heroRemaining.className = `text-4xl font-bold mb-4 tracking-tight ${remaining < 0 ? 'text-red-400' : 'text-white'}`;

  // 6. Update Planner Tab
  DOM.unallocatedCash.innerText = (totalBankCash - totalPlanned).toFixed(2);
  
  DOM.budgetProgressContainer.innerHTML = envelopeMetrics.length ? '' : '<p class="text-sm text-gray-500">No budget plans for this month.</p>';
  
  // Show "Copy Last Month" if empty
  DOM.copyLastMonthBtn.classList.toggle('hidden', envelopeMetrics.length > 0);

  envelopeMetrics.forEach((m, index) => {
    const rem = m.amount - m.spent;
    const pct = Math.min(100, (m.spent / m.amount) * 100);
    const isOver = rem < 0;
    
    // Find absolute index in main array for deletion
    const trueIndex = appData.budgets.findIndex(b => b.month === m.month && b.category === m.category);
    
    DOM.budgetProgressContainer.innerHTML += `
      <div class="bg-white p-4 rounded-xl border shadow-sm relative">
        <button onclick="removeBudget(${trueIndex})" class="absolute top-2 right-2 text-red-400 hover:text-red-600 font-bold">✕</button>
        <div class="text-xs text-gray-500 mb-1">${m.account}</div>
        <div class="flex justify-between items-end mb-2">
          <span class="font-bold text-gray-800">${m.category}</span>
          <div class="text-right">
            <div class="text-sm font-semibold ${isOver ? 'text-red-600' : 'text-emerald-600'}">${rem.toFixed(2)} left</div>
            <div class="text-xs text-gray-400">of ${m.amount.toFixed(2)} planned</div>
          </div>
        </div>
        <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
          <div class="${isOver ? 'bg-red-500' : 'bg-emerald-500'} h-full transition-all" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  });

  populateSelects(currentBudgets);
}

// --- FORMS & ACTIONS ---

DOM.copyLastMonthBtn.addEventListener('click', async () => {
  const currentMonthStr = getMonthStr(currentDate);
  const prevDate = new Date(currentDate);
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonthStr = getMonthStr(prevDate);
  
  const oldBudgets = appData.budgets.filter(b => b.month === prevMonthStr);
  if(oldBudgets.length === 0) return alert("No envelopes found in the previous month.");
  
  oldBudgets.forEach(b => {
    appData.budgets.push({ month: currentMonthStr, account: b.account, category: b.category, amount: b.amount });
  });
  
  renderAll();
  await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'saveBudgets', budgets: appData.budgets }) });
});

document.getElementById('budgetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  appData.budgets.push({
    month: getMonthStr(currentDate),
    account: DOM.budgetAccountSelect.value,
    category: document.getElementById('budgetCatInput').value,
    amount: parseFloat(document.getElementById('budgetAmountInput').value)
  });
  renderAll(); e.target.reset();
  await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'saveBudgets', budgets: appData.budgets }) });
});

window.removeBudget = async function(index) {
  if(confirm('Delete envelope?')) {
    appData.budgets.splice(index, 1);
    renderAll();
    await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'saveBudgets', budgets: appData.budgets }) });
  }
}

document.getElementById('txForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  // Ensure timestamp matches the month we are currently looking at in the UI
  const fakeDateForMonth = new Date(currentDate);
  const today = new Date();
  if(fakeDateForMonth.getMonth() === today.getMonth()) { fakeDateForMonth.setDate(today.getDate()); } 
  else { fakeDateForMonth.setDate(15); } // middle of month if backdating
  
  const payload = {
    action: 'addTransaction',
    timestamp: fakeDateForMonth.toISOString(),
    type: document.querySelector('input[name="type"]:checked').value,
    account: DOM.accountSelect.value,
    category: DOM.txCategorySelect.value || '',
    amount: parseFloat(document.getElementById('amountInput').value),
    note: document.getElementById('noteInput').value
  };

  appData.transactions.push(payload);
  renderAll(); e.target.reset();
  document.getElementById('loading').classList.remove('hidden');
  await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
  document.getElementById('loading').classList.add('hidden');
});

// Category Dropdown Logic
function populateSelects(currentBudgets) {
  const accHtml = appData.accounts.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
  if (!DOM.accountSelect.options.length) DOM.accountSelect.innerHTML = accHtml;
  if (!DOM.budgetAccountSelect.options.length) DOM.budgetAccountSelect.innerHTML = accHtml;
  updateCategoryDropdown(currentBudgets);
}

function updateCategoryDropdown(currentBudgets) {
  if(!currentBudgets) currentBudgets = appData.budgets.filter(b => b.month === getMonthStr(currentDate));
  const account = DOM.accountSelect.value;
  const type = document.querySelector('input[name="type"]:checked').value;
  const matched = currentBudgets.filter(b => b.account === account);
  
  if (type === 'Expense' && matched.length > 0) {
    DOM.categoryContainer.classList.remove('hidden');
    DOM.txCategorySelect.innerHTML = '<option value="">-- Unplanned Expense --</option>' + 
      matched.map(b => `<option value="${b.category}">${b.category}</option>`).join('');
  } else {
    DOM.categoryContainer.classList.add('hidden');
    DOM.txCategorySelect.value = '';
  }
}

DOM.accountSelect.addEventListener('change', () => updateCategoryDropdown());
document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => updateCategoryDropdown()));
document.getElementById('refreshBtn').addEventListener('click', loadData);

// Nav Setup
function setupNavigation() {
  const tabs = ['Tracker', 'Planner', 'Analytics'];
  tabs.forEach(tab => {
    document.getElementById(`nav${tab}`).addEventListener('click', () => {
      tabs.forEach(t => {
        document.getElementById(`${t.toLowerCase()}Tab`).classList.toggle('hidden', t !== tab);
        document.getElementById(`nav${t}`).className = t === tab ? 'flex flex-col items-center justify-center w-full h-full text-emerald-600 font-semibold text-sm' : 'flex flex-col items-center justify-center w-full h-full text-gray-400 font-semibold text-sm';
      });
    });
  });
}

init();
