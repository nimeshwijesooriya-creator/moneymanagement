const API_URL = 'https://script.google.com/macros/s/AKfycbyUoIy1GifiMKxPnh-AOVkwlWsDRKNLH0r_PJsPw0MVteNlkse9v6g4odCz4CJY_bSTRg/exec'; 

const DOM = {
  heroRemaining: document.getElementById('heroRemaining'),
  heroPlanned: document.getElementById('heroPlanned'),
  heroSpent: document.getElementById('heroSpent'),
  liabilityWarning: document.getElementById('liabilityWarning'),
  owedToSavings: document.getElementById('owedToSavings'),
  monthDisplay: document.getElementById('monthDisplay'),
  envelopeMonthLabel: document.getElementById('envelopeMonthLabel'),
  budgetProgressContainer: document.getElementById('budgetProgressContainer'),
  unallocatedCash: document.getElementById('unallocatedCash'),
  copyLastMonthBtn: document.getElementById('copyLastMonthBtn'),
  accountSelect: document.getElementById('accountSelect'),
  txCategorySelect: document.getElementById('txCategorySelect'),
  categoryContainer: document.getElementById('categoryContainer'),
  budgetAccountSelect: document.getElementById('budgetAccountSelect'),
  balancesGrid: document.getElementById('balancesGrid'),
  transferToContainer: document.getElementById('transferToContainer'),
  transferToSelect: document.getElementById('transferToSelect'),
  accountLabel: document.getElementById('accountLabel')
};

let appData = { accounts: [], transactions: [], budgets: [] };
let currentDate = new Date();
let activeEditIndex = -1;

async function init() { 
  setupNavigation(); 
  setupPWAInstall();
  updateMonthUI(); 
  await loadData(); 
}

function getMonthStr(date) { 
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; 
}

function updateMonthUI() {
  const displayStr = currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  DOM.monthDisplay.innerText = displayStr;
  DOM.envelopeMonthLabel.innerText = displayStr;
  if(appData.accounts.length) renderAll();
}

document.getElementById('prevMonth').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); updateMonthUI(); });
document.getElementById('nextMonth').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); updateMonthUI(); });

async function loadData() {
  document.getElementById('loading').classList.remove('hidden');
  try {
    const res = await fetch(API_URL);
    appData = await res.json();
    if(!appData.budgets) appData.budgets = [];
    document.getElementById('trackerTab').classList.remove('hidden'); 
    renderAll();
  } catch (err) { console.error(err); }
  document.getElementById('loading').classList.add('hidden');
}

function renderAll() {
  const currentMonthStr = getMonthStr(currentDate);
  const currentBudgets = appData.budgets.filter(b => b.month === currentMonthStr);
  const currentTxs = appData.transactions.filter(tx => tx.timestamp.startsWith(currentMonthStr));

  // --- WEALTH METRICS ENGINE ---
  const accBalances = {};
  appData.accounts.forEach((a, index) => {
    accBalances[a.name] = { bal: a.initial, type: a.type, initial: a.initial, trueIndex: index };
  });
  
  appData.transactions.forEach(tx => {
    if(tx.timestamp <= getMonthStr(currentDate) + "-31") {
      if(tx.type === 'Income' && accBalances[tx.account]) accBalances[tx.account].bal += tx.amount;
      if(tx.type === 'Expense' && accBalances[tx.account]) accBalances[tx.account].bal -= tx.amount;
      if(tx.type === 'Transfer') {
        if(accBalances[tx.account]) accBalances[tx.account].bal -= tx.amount;
        if(accBalances[tx.toAccount]) accBalances[tx.toAccount].bal += tx.amount;
      }
    }
  });

  let unallocatedAvailableCash = 0;
  DOM.balancesGrid.innerHTML = '';
  
  ['Everyday', 'Savings', 'Liability'].forEach(groupType => {
    let groupHtml = `<h3 class="text-sm font-bold text-gray-500 uppercase mt-4 mb-2">${groupType} Accounts</h3><div class="grid grid-cols-2 gap-3">`;
    let hasItems = false;
    
    for (const [name, data] of Object.entries(accBalances)) {
      if(data.type === groupType) {
        hasItems = true;
        if(groupType === 'Everyday') unallocatedAvailableCash += data.bal; 
        
        const isNegative = data.bal < 0;
        groupHtml += `
          <div class="p-4 rounded-xl border border-gray-200 bg-white shadow-sm relative">
            <button onclick="openEditAccount(${data.trueIndex})" class="absolute top-2 right-2 text-gray-400 hover:text-blue-600 text-base">✎</button>
            <h4 class="text-xs font-medium text-gray-500 truncate pr-5">${name}</h4>
            <div class="text-lg font-bold ${isNegative ? 'text-red-500' : 'text-gray-800'}">${data.bal.toFixed(2)}</div>
          </div>`;
      }
    }
    groupHtml += `</div>`;
    if(hasItems) DOM.balancesGrid.innerHTML += groupHtml;
  });

  // --- ENVELOPE CALCULATION ENGINE ---
  let totalPlanned = 0, totalSpent = 0, totalLiabilityDebt = 0;
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

  DOM.budgetProgressContainer.innerHTML = envelopeMetrics.length ? '' : '<p class="text-sm text-gray-500">No budget envelopes matching this month.</p>';
  
  envelopeMetrics.forEach((m) => {
    totalPlanned += m.amount;
    const rem = m.amount - m.spent;
    if (rem < 0) totalLiabilityDebt += Math.abs(rem); 

    const pct = Math.min(100, (m.spent / m.amount) * 100);
    const isOver = rem < 0;
    const trueIndex = appData.budgets.findIndex(b => b.month === m.month && b.category === m.category && b.account === m.account);
    
    DOM.budgetProgressContainer.innerHTML += `
      <div class="bg-white p-4 rounded-xl border shadow-sm relative">
        <button onclick="openEditBudget(${trueIndex})" class="absolute top-2 right-8 text-blue-400 hover:text-blue-600 font-bold">✎</button>
        <button onclick="removeBudget(${trueIndex})" class="absolute top-2 right-2 text-red-400 hover:text-red-600 font-bold">✕</button>
        <div class="text-xs text-gray-500 mb-1">${m.account}</div>
        <div class="flex justify-between items-end mb-2">
          <span class="font-bold text-gray-800">${m.category}</span>
          <div class="text-right">
            <div class="text-sm font-semibold ${isOver ? 'text-red-600' : 'text-emerald-600'}">${rem.toFixed(2)} left</div>
            <div class="text-xs text-gray-400">of ${m.amount.toFixed(2)}</div>
          </div>
        </div>
        <div class="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
          <div class="${isOver ? 'bg-red-500' : 'bg-emerald-500'} h-full transition-all" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  });

  // Summary Sync
  DOM.heroPlanned.innerText = totalPlanned.toFixed(2);
  DOM.heroSpent.innerText = totalSpent.toFixed(2);
  const remaining = totalPlanned - totalSpent;
  DOM.heroRemaining.innerText = remaining.toFixed(2);
  DOM.heroRemaining.className = `text-4xl font-bold mb-4 tracking-tight ${remaining < 0 ? 'text-red-400' : 'text-white'}`;
  
  if(totalLiabilityDebt > 0) {
    DOM.liabilityWarning.classList.remove('hidden');
    DOM.owedToSavings.innerText = totalLiabilityDebt.toFixed(2);
  } else {
    DOM.liabilityWarning.classList.add('hidden');
  }

  DOM.unallocatedCash.innerText = (unallocatedAvailableCash - totalPlanned).toFixed(2);
  DOM.copyLastMonthBtn.classList.toggle('hidden', envelopeMetrics.length > 0);

  populateSelects(currentBudgets);
}

// --- CONTROLLERS & API WORKER POSTS ---
document.getElementById('accountForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    action: 'addAccount',
    name: document.getElementById('accNameInput').value,
    type: document.getElementById('accTypeSelect').value,
    initialBalance: parseFloat(document.getElementById('accBalInput').value)
  };
  appData.accounts.push({ name: payload.name, type: payload.type, initial: payload.initialBalance });
  renderAll(); e.target.reset();
  await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
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

document.getElementById('txForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fakeDateForMonth = new Date(currentDate);
  const today = new Date();
  if(fakeDateForMonth.getMonth() === today.getMonth()) { fakeDateForMonth.setDate(today.getDate()); } 
  else { fakeDateForMonth.setDate(15); } 
  
  const type = document.querySelector('input[name="type"]:checked').value;
  const payload = {
    action: 'addTransaction',
    timestamp: fakeDateForMonth.toISOString(),
    type: type,
    account: DOM.accountSelect.value,
    category: type === 'Expense' ? DOM.txCategorySelect.value : '',
    toAccount: type === 'Transfer' ? DOM.transferToSelect.value : '',
    amount: parseFloat(document.getElementById('amountInput').value),
    note: document.getElementById('noteInput').value
  };

  appData.transactions.push(payload);
  renderAll(); e.target.reset();
  document.getElementById('loading').classList.remove('hidden');
  await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
  document.getElementById('loading').classList.add('hidden');
});

DOM.copyLastMonthBtn.addEventListener('click', async () => {
  const currentMonthStr = getMonthStr(currentDate);
  const prevDate = new Date(currentDate); prevDate.setMonth(prevDate.getMonth() - 1);
  const oldBudgets = appData.budgets.filter(b => b.month === getMonthStr(prevDate));
  if(!oldBudgets.length) return alert("No envelopes found in the previous month.");
  oldBudgets.forEach(b => appData.budgets.push({ month: currentMonthStr, account: b.account, category: b.category, amount: b.amount }));
  renderAll();
  await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'saveBudgets', budgets: appData.budgets }) });
});

window.removeBudget = async function(index) {
  if(confirm('Delete envelope?')) { 
    appData.budgets.splice(index, 1); 
    renderAll(); 
    await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'saveBudgets', budgets: appData.budgets }) }); 
  }
}

// --- MODAL ACTIONS ---
window.openEditAccount = function(index) {
  activeEditIndex = index;
  const acc = appData.accounts[index];
  document.getElementById('editAccName').value = acc.name;
  document.getElementById('editAccType').value = acc.type;
  document.getElementById('editAccBal').value = acc.initial;
  document.getElementById('editAccountModal').classList.remove('hidden');
}

window.saveAccountEdit = async function() {
  appData.accounts[activeEditIndex].name = document.getElementById('editAccName').value;
  appData.accounts[activeEditIndex].type = document.getElementById('editAccType').value;
  appData.accounts[activeEditIndex].initial = parseFloat(document.getElementById('editAccBal').value);
  document.getElementById('editAccountModal').classList.add('hidden');
  renderAll();
  await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'saveAccounts', accounts: appData.accounts }) });
}

window.deleteAccount = async function() {
  if(confirm('Delete account entry?')) {
    appData.accounts.splice(activeEditIndex, 1);
    document.getElementById('editAccountModal').classList.add('hidden');
    renderAll();
    await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'saveAccounts', accounts: appData.accounts }) });
  }
}

window.openEditBudget = function(index) {
  activeEditIndex = index;
  const b = appData.budgets[index];
  document.getElementById('editBudCat').value = b.category;
  document.getElementById('editBudAmt').value = b.amount;
  document.getElementById('editBudgetModal').classList.remove('hidden');
}

window.saveBudgetEdit = async function() {
  appData.budgets[activeEditIndex].category = document.getElementById('editBudCat').value;
  appData.budgets[activeEditIndex].amount = parseFloat(document.getElementById('editBudAmt').value);
  document.getElementById('editBudgetModal').classList.add('hidden');
  renderAll();
  await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'saveBudgets', budgets: appData.budgets }) });
}

// --- SELECT POPULATION UI WORKERS ---
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
  
  DOM.categoryContainer.classList.add('hidden');
  DOM.transferToContainer.classList.add('hidden');
  DOM.accountLabel.innerText = type === 'Transfer' ? 'From Account' : 'Account';

  if (type === 'Expense') {
    const matched = currentBudgets.filter(b => b.account === account);
    DOM.categoryContainer.classList.remove('hidden');
    DOM.txCategorySelect.innerHTML = '<option value="">-- Unplanned Expense --</option>' + 
      matched.map(b => `<option value="${b.category}">${b.category}</option>`).join('');
  } else if (type === 'Transfer') {
    DOM.transferToContainer.classList.remove('hidden');
    DOM.transferToSelect.innerHTML = appData.accounts.filter(a => a.name !== account).map(a => `<option value="${a.name}">${a.name}</option>`).join('');
  }
}

DOM.accountSelect.addEventListener('change', () => updateCategoryDropdown());
document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => updateCategoryDropdown()));
document.getElementById('refreshBtn').addEventListener('click', loadData);

// --- NAVIGATION CORE ---
function setupNavigation() {
  const tabs = ['Tracker', 'Planner', 'Analytics'];
  tabs.forEach(tab => {
    document.getElementById(`nav${tab}`).addEventListener('click', () => {
      tabs.forEach(t => {
        document.getElementById(`${t.toLowerCase()}Tab`).classList.toggle('hidden', t !== tab);
        document.getElementById(`nav${t}`).className = t === tab ? 'flex flex-col items-center justify-center w-full h-full text-emerald-700 font-semibold text-sm' : 'flex flex-col items-center justify-center w-full h-full text-gray-400 font-semibold text-sm';
      });
    });
  });
}

// --- PROMPT DRIVEN PWA TRAPS ---
function setupPWAInstall() {
  let deferredPrompt;
  const installBtn = document.getElementById('installAppBtn');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    if (installBtn) installBtn.classList.remove('hidden');
  });
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.classList.add('hidden');
    });
  }
}

init();
