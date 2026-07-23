'use strict';

/* ==============================
   STATE
============================== */
let allItems = [];
let filteredItems = [];
let activeTeam = 'commercial';   // 'commercial' | 'procurement'
let activeTab  = 'all';
let sortCol    = 'no';
let sortDir    = 'asc';
let searchQuery  = '';
let tradeFilter  = '';
let statusFilter = '';
let currentProjectId   = null;
let currentProjectMeta = null;
let editingItemNo      = null;
let selectedItems      = new Set();
let currentPage        = 1;
const PAGE_SIZE        = 50;

/* ==============================
   COLUMN DEFINITIONS
============================== */
const COLS = {
  commercial: [
    { key: '_proj_code',             label: 'Project Code',            cls: 'num', w:  82 },
    { key: 'no',                     label: 'Nos. of Endorsement',     cls: 'num', w:  58 },
    { key: 'trade',                  label: 'Trade',                               w: 112 },
    { key: 'scope',                  label: 'Scope of Works',                      w: 170 },
    { key: 'remarks',                label: 'Remarks',                             w:  96 },
    { key: 'budget',                 label: 'Total Budget Allocation', cls: 'amt', w: 118 },
    { key: 'endorsed_vendor',        label: 'Endorsed Vendor / Subcon',            w: 132 },
    { key: 'endorsement_remarks',    label: 'Remarks',                             w:  92 },
    { key: 'endorsement_date',       label: 'Endorsement Date',                    w: 112 },
    { key: 'endorsed_amount',        label: 'Endorsed Amount VAT-Inc', cls: 'amt', w: 118 },
    { key: 'savings_budget_endorsed',label: 'Savings (Budget vs Endorsed)', cls: 'amt', w: 128 },
    { key: 'vendor_timeline',        label: "Vendor's Timeline",       cls: 'wide',w: 152 },
    { key: 'date_needed',            label: 'Date Needed On-Site',                 w: 112 },
    { key: 'approved_vendor',        label: 'Approved Vendor',                     w: 122 },
    { key: 'priority',               label: 'Priority Level',                      w:  78 },
    { key: '_status',                label: 'Status',                              w:  88 },
  ],
  procurement: [
    { key: 'no',                  label: '#',                               cls: 'num', w:  48 },
    { key: 'trade',               label: 'Trade',                                       w: 112 },
    { key: 'scope',               label: 'Scope of Works',                              w: 170 },
    { key: 'awarded_vendor',      label: 'Awarded Vendor',                              w: 130 },
    { key: 'pr_no',               label: 'PR or Endorsement #',                         w: 104 },
    { key: 'negotiated_proposal', label: 'Negotiated Proposal',           cls: 'amt',   w: 120 },
    { key: 'po_amount',           label: 'PO Amount',                    cls: 'amt',   w: 108 },
    { key: 'date_of_po',          label: 'Date of PO',                                  w:  98 },
    { key: 'po_no',               label: 'PO #',                                        w:  96 },
    { key: 'date_issuance_po',    label: 'Date of Issuance of PO',                      w: 108 },
    { key: 'savings_endorsed_po', label: 'Savings Amount (Endorsed vs PO)', cls: 'amt', w: 138 },
    { key: 'po_remarks',          label: 'Remarks',                                     w:  96 },
    { key: 'invoice_no',          label: 'Invoice Number or Delivery Receipt',           w: 144 },
    { key: 'invoice_date',        label: 'Invoice Date',                                 w:  98 },
    { key: 'rfp_no',              label: 'RFP #',                                        w:  80 },
    { key: 'rfp_date',            label: 'RFP Date',                                     w:  98 },
    { key: 'date_submission_ap',  label: 'Date Submission for AP',                       w: 118 },
    { key: 'rfp_amount',          label: 'RFP Amount',                    cls: 'amt',   w: 108 },
    { key: 'pt',                  label: 'PT',                                            w:  72 },
    { key: 'conditions',          label: 'Conditions',                                   w: 104 },
    { key: 'due_date',            label: 'Due Date',                                     w:  98 },
    { key: 'final_remarks',       label: 'Remarks',                                     w:  96 },
    { key: '_status',             label: 'Status',                                       w:  88 },
  ],
};

/* ==============================
   UTILITIES
============================== */
const fmt = (n) => {
  if (n === null || n === undefined || n === 0 || n === '') return null;
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const fmtPeso = (n) => {
  if (n === null || n === undefined || n === 0 || n === '') return null;
  return '₱ ' + new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

// Convert stored MM/DD/YYYY → YYYY-MM-DD for <input type="date">
const toDateInput = (s) => {
  if (!s) return '';
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
};

// Convert YYYY-MM-DD from <input type="date"> → MM/DD/YYYY for storage
const fromDateInput = (s) => {
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : s;
};

const tradeClass = (trade) => {
  if (!trade) return '';
  const t = trade.toLowerCase();
  if (t.includes('prelim'))  return 'prelim';
  if (t.includes('civil') || t.includes('arch') || t.includes('floor') || t.includes('wall') || t.includes('door') || t.includes('special')) return 'civil';
  if (t.includes('mech') || t.includes('vrv') || t.includes('pacu'))  return 'mech';
  if (t.includes('fire'))    return 'fire';
  if (t.includes('elec'))    return 'elec';
  if (t.includes('joinery')) return 'join';
  if (t.includes('signage')) return 'sign';
  if (t.includes('aux'))     return 'aux';
  return '';
};

const dateUrgency = (s) => {
  if (!s) return null;
  let d;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) d = new Date(+m[3], +m[1] - 1, +m[2]);
  else d = new Date(s);
  if (isNaN(d)) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.floor((d - today) / 86400000);
  if (diff < 0)   return 'overdue';
  if (diff <= 14) return 'due-soon';
  return null;
};

const itemStatus = (item) => {
  if (item.endorsement_remarks === 'LONG LEAD ITEMS') return 'long-lead';
  if (item.po_no)                return 'with-po';
  if (item.endorsed_amount > 0)  return 'endorsed';
  if (item.trade)                return 'pending';
  return 'empty';
};

/* ==============================
   DATA LOAD
============================== */
async function loadData() {
  const id = ProjectStore.getUrlId();
  currentProjectId = id;

  // Wire up the Dashboard link with the correct project id
  const dashLink = document.getElementById('dashboard-link');
  if (dashLink) dashLink.href = `dashboard.html?id=${id}`;

  try {
    const data = await ProjectStore.load(id);
    currentProjectMeta = data.project;
    allItems = data.items;
    loadPrefs();
    applyPrefsUI();
    renderTableHead();
    initCards(data.project, data.items);
    buildTradeFilter();

    // Apply tab from URL param (e.g. from dashboard drill-down links)
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam && ['all','long-lead','with-po','endorsed','pending'].includes(tabParam)) {
      activeTab = tabParam;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const tabBtn = document.querySelector(`[data-tab="${tabParam}"]`);
      if (tabBtn) tabBtn.classList.add('active');
    }

    applyFilters();
    fitTableToViewport();
  } catch (e) {
    console.error('Failed to load project data:', e);
    document.getElementById('items-tbody').innerHTML = `
      <tr><td colspan="20" style="text-align:center;padding:3rem;color:var(--danger);">
        Could not load project data. <a href="projects.html">Back to Projects</a>
      </td></tr>`;
  }
}

/* ==============================
   CARDS INIT
============================== */
function initCards(proj, items) {
  document.getElementById('proj-name').textContent = proj.name;
  document.getElementById('proj-code').textContent = proj.code;

  // Compute live stats from items
  const stats = ProjectStore.computeStats({ project: proj, items: items || [] });

  const savingsComm    = stats.budget - stats.total_endorsed;
  const pendingInvCount = items ? items.filter(i => i.po_no && !i.invoice_no).length : 0;

  // Commercial cards
  document.getElementById('stat-budget').textContent         = fmtPeso(stats.budget) || '—';
  document.getElementById('stat-endorsed').textContent       = fmtPeso(stats.total_endorsed) || '—';
  document.getElementById('stat-savings-comm').textContent   = fmtPeso(savingsComm) || '—';
  document.getElementById('stat-savings-comm').closest('.summary-card').classList.toggle('negative', savingsComm < 0);
  document.getElementById('stat-items').textContent          = stats.total_items;
  document.getElementById('stat-endorsed-count').textContent = `${stats.endorsed_count} / ${stats.total_items}`;
  document.getElementById('stat-long-lead').textContent      = stats.long_lead_count;

  // Procurement cards
  document.getElementById('stat-po').textContent             = fmtPeso(stats.total_po) || '—';
  document.getElementById('stat-savings').textContent        = fmtPeso(stats.total_savings) || '—';
  document.getElementById('stat-savings').closest('.summary-card').classList.toggle('negative', stats.total_savings < 0);
  document.getElementById('stat-with-po').textContent        = stats.with_po_count;
  document.getElementById('stat-items-proc').textContent     = stats.total_items;
  document.getElementById('stat-endorsed-proc').textContent  = fmtPeso(stats.total_endorsed) || '—';
  document.getElementById('stat-pending-inv').textContent    = pendingInvCount;

  document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  const footerEl = document.getElementById('tracker-footer');
  if (footerEl && proj.name) {
    footerEl.textContent = 'ABI Project Tracker — ' + proj.name;
  }
  if (proj.name) document.title = proj.name + ' — ABI Project Tracker';
}

/* ==============================
   TRADE FILTER BUILD
============================== */
function buildTradeFilter() {
  const trades = [...new Set(allItems.map(i => i.trade).filter(Boolean))].sort();
  const sel = document.getElementById('trade-filter');
  sel.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());
  trades.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  });
  // Reset stale filter if the previously selected trade no longer exists
  if (tradeFilter && !trades.includes(tradeFilter)) {
    tradeFilter = '';
  }
  sel.value = tradeFilter;
}

/* ==============================
   TAB COUNTS
============================== */
function updateTabCounts() {
  const c = { all: allItems.length, 'long-lead': 0, 'with-po': 0, endorsed: 0, pending: 0 };
  allItems.forEach(i => {
    if (i.endorsement_remarks === 'LONG LEAD ITEMS') c['long-lead']++;
    if (i.po_no)                                     c['with-po']++;
    if (i.endorsed_amount > 0)                       c.endorsed++;
    if (i.trade && !i.po_no && i.endorsed_amount === 0) c.pending++;
  });
  Object.entries(c).forEach(([tab, n]) => {
    const el = document.getElementById(`tcount-${tab}`);
    if (el) el.textContent = n ? String(n) : '';
  });
}

/* ==============================
   USER PREFERENCES (localStorage per project)
============================== */
function savePrefs() {
  if (!currentProjectId) return;
  try {
    localStorage.setItem(`abi-pref-${currentProjectId}`, JSON.stringify({
      activeTeam, activeTab, sortCol, sortDir, tradeFilter, statusFilter,
    }));
  } catch (_) {}
}

function loadPrefs() {
  if (!currentProjectId) return;
  try {
    const raw = localStorage.getItem(`abi-pref-${currentProjectId}`);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.activeTeam === 'commercial' || p.activeTeam === 'procurement') activeTeam = p.activeTeam;
    const validTabs = ['all', 'long-lead', 'with-po', 'endorsed', 'pending'];
    if (validTabs.includes(p.activeTab)) activeTab = p.activeTab;
    const validCols = [...COLS.commercial, ...COLS.procurement].map(c => c.key);
    if (p.sortCol && validCols.includes(p.sortCol)) sortCol = p.sortCol;
    if (p.sortDir === 'asc' || p.sortDir === 'desc') sortDir = p.sortDir;
    if (typeof p.tradeFilter  === 'string') tradeFilter  = p.tradeFilter;
    if (typeof p.statusFilter === 'string') statusFilter = p.statusFilter;
  } catch (_) {}
}

function applyPrefsUI() {
  document.querySelectorAll('.team-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.team === activeTeam);
  });
  const teamLabel = activeTeam === 'commercial' ? 'Commercial View' : 'Procurement Management View';
  document.getElementById('team-label-display').textContent = teamLabel;
  document.getElementById('cards-commercial').classList.toggle('hidden', activeTeam !== 'commercial');
  document.getElementById('cards-procurement').classList.toggle('hidden', activeTeam !== 'procurement');
  document.getElementById('main-table').dataset.team = activeTeam;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const tabBtn = document.querySelector(`[data-tab="${activeTab}"]`);
  if (tabBtn) tabBtn.classList.add('active');

  const statusSel = document.getElementById('status-filter');
  if (statusSel) statusSel.value = statusFilter;
}

/* ==============================
   TABLE HEIGHT FIT
============================== */
function fitTableToViewport() {
  const tw = document.querySelector('.table-wrap');
  if (!tw) return;
  requestAnimationFrame(() => {
    const rect    = tw.getBoundingClientRect();
    const footer  = document.querySelector('.site-footer');
    const footerH = footer
      ? footer.offsetHeight + parseInt(getComputedStyle(footer).marginTop || 0) + 4
      : 20;
    const available = window.innerHeight - rect.top - footerH;
    /* ~40px per row × 10 rows + ~40px thead ≈ 440px — ensures at least 10 rows visible */
    tw.style.maxHeight = Math.max(440, available) + 'px';
    tw.style.overflowY = 'auto';
  });
}

let _fitTimer;
window.addEventListener('resize', () => {
  clearTimeout(_fitTimer);
  _fitTimer = setTimeout(fitTableToViewport, 120);
});

/* ==============================
   TEAM SWITCH
============================== */
function switchTeam(team) {
  activeTeam = team;
  activeTab  = 'all';
  sortCol    = 'no';
  sortDir    = 'asc';

  // Update team buttons
  document.querySelectorAll('.team-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.team === team);
  });

  // Update label
  const label = team === 'commercial' ? 'Commercial View' : 'Procurement Management View';
  document.getElementById('team-label-display').textContent = label;

  // Swap summary cards
  document.getElementById('cards-commercial').classList.toggle('hidden', team !== 'commercial');
  document.getElementById('cards-procurement').classList.toggle('hidden', team !== 'procurement');

  // Update table body class for team-specific accent
  document.getElementById('main-table').dataset.team = team;

  // Reset status filter options based on team
  const statusSel = document.getElementById('status-filter');
  statusSel.value = '';
  statusFilter = '';

  // Reset sub-tabs
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="all"]').classList.add('active');

  renderTableHead();
  applyFilters();
  fitTableToViewport();
  savePrefs();
}

/* ==============================
   TABLE HEAD RENDER
============================== */
function renderTableHead() {
  const cols  = COLS[activeTeam];
  const table = document.getElementById('main-table');
  const thead = document.getElementById('table-head');

  // Colgroup keeps widths stable as rows load
  let cg = table.querySelector('colgroup');
  if (!cg) { cg = document.createElement('colgroup'); table.prepend(cg); }
  cg.innerHTML = `<col style="width:32px">` + cols.map(c => `<col${c.w ? ` style="width:${c.w}px"` : ''}>`).join('') + `<col style="width:36px">`;

  thead.innerHTML = `<tr><th class="th-cb"><input type="checkbox" id="cb-all" title="Select all visible"></th>${cols.map(c => {
    const style = c.w ? ` style="width:${c.w}px;min-width:${c.w}px;"` : '';
    return `<th data-sort="${c.key}" class="${c.cls || ''}"${style}>${c.label}<span class="sort-icon">↕</span></th>`;
  }).join('')}<th class="th-hist" title="Change history"></th></tr>`;

  // Re-attach sort listeners
  thead.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => handleSort(th.dataset.sort));
  });

  // Restore sort indicator for currently active sort column
  const activeTh = thead.querySelector(`[data-sort="${sortCol}"]`);
  if (activeTh) {
    activeTh.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    const icon = activeTh.querySelector('.sort-icon');
    if (icon) icon.textContent = sortDir === 'asc' ? '↑' : '↓';
  }
}

/* ==============================
   FILTER + SORT
============================== */
function applyFilters() {
  updateTabCounts();
  let items = [...allItems];

  // Tab filter
  if (activeTab === 'long-lead') {
    items = items.filter(i => i.endorsement_remarks === 'LONG LEAD ITEMS');
  } else if (activeTab === 'with-po') {
    items = items.filter(i => i.po_no !== '');
  } else if (activeTab === 'endorsed') {
    items = items.filter(i => i.endorsed_amount > 0);
  } else if (activeTab === 'pending') {
    items = items.filter(i => i.trade && !i.po_no && i.endorsed_amount === 0);
  }

  // Trade filter
  if (tradeFilter) {
    items = items.filter(i => i.trade === tradeFilter);
  }

  // Status filter — use direct field checks (same as tab filters) so long lead items
  // that also have POs / endorsed amounts are correctly included in those categories
  if (statusFilter) {
    if      (statusFilter === 'long-lead')  items = items.filter(i => i.endorsement_remarks === 'LONG LEAD ITEMS');
    else if (statusFilter === 'with-po')    items = items.filter(i => !!i.po_no);
    else if (statusFilter === 'endorsed')   items = items.filter(i => i.endorsed_amount > 0);
    else if (statusFilter === 'pending')    items = items.filter(i => i.trade && !i.po_no && i.endorsed_amount === 0);
    else if (statusFilter === 'empty')      items = items.filter(i => !i.trade);
    else if (statusFilter === 'overdue')    items = items.filter(i => dateUrgency(i.date_needed) === 'overdue');
    else if (statusFilter === 'due-soon')     items = items.filter(i => dateUrgency(i.date_needed) === 'due-soon');
    else if (statusFilter === 'pending-inv')  items = items.filter(i => i.po_no && !i.invoice_no);
    else                                      items = items.filter(i => itemStatus(i) === statusFilter);
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i =>
      (i.scope          && i.scope.toLowerCase().includes(q))          ||
      (i.trade          && i.trade.toLowerCase().includes(q))          ||
      (i.endorsed_vendor&& i.endorsed_vendor.toLowerCase().includes(q))||
      (i.awarded_vendor && i.awarded_vendor.toLowerCase().includes(q)) ||
      (i.po_no          && i.po_no.toLowerCase().includes(q))          ||
      (i.pr_no          && i.pr_no.toLowerCase().includes(q))          ||
      (i.invoice_no     && i.invoice_no.toLowerCase().includes(q))     ||
      String(i.no).includes(q)
    );
  }

  // Sort
  items.sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol];
    if (typeof av === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    av = String(av || '').toLowerCase();
    bv = String(bv || '').toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1  : -1;
    return 0;
  });

  filteredItems = items;
  currentPage   = 1;
  renderTable();
  renderPagination();
  const fc = filteredItems.length, ac = allItems.length;
  document.getElementById('result-count').textContent =
    fc === ac ? `${ac} item${ac !== 1 ? 's' : ''}` : `${fc} of ${ac} items`;
}

/* ==============================
   TABLE RENDER
============================== */
const E = () => `<span class="empty-tag">—</span>`;

function cellValue(item, col) {
  const key = col.key;

  if (key === '_status') {
    const s = itemStatus(item);
    if (s === 'long-lead') return `<span class="long-lead-tag"><span class="status-dot lead"></span>Long Lead</span>`;
    if (s === 'with-po')   return `<span class="po-tag">With PO</span>`;
    if (s === 'endorsed')  return `<span class="endorsed-tag">Endorsed</span>`;
    return `<span class="empty-tag">Pending</span>`;
  }

  if (key === '_proj_code') {
    const code = currentProjectMeta ? currentProjectMeta.code : '';
    if (!code) return E();
    const safeCode = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);">${safeCode}</span>`;
  }

  if (key === 'no') return item.no;

  if (key === 'trade') {
    if (!item.trade) return E();
    const esc = item.trade.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<span class="trade-tag ${tradeClass(item.trade)}">${esc}</span>`;
  }

  if (key === 'scope') {
    if (!item.scope) return E();
    const esc = item.scope.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<span class="scope-text" title="${esc}">${esc}</span>`;
  }

  if (key === 'priority') {
    if (!item.priority) return E();
    const pClass = item.priority.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    const pLabel = item.priority.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<span class="priority-badge ${pClass}">${pLabel}</span>`;
  }

  if (key === 'vendor_timeline') {
    if (!item.vendor_timeline) return E();
    const esc = item.vendor_timeline.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<span class="timeline-text" title="${esc}">${esc}</span>`;
  }

  if (key === 'date_needed') {
    if (!item.date_needed) return E();
    const u = dateUrgency(item.date_needed);
    const d = String(item.date_needed).replace(/&/g,'&amp;');
    if (u === 'overdue')  return `<span class="date-urg overdue"  title="Past due date"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${d}</span>`;
    if (u === 'due-soon') return `<span class="date-urg due-soon" title="Due within 14 days"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>${d}</span>`;
    return d;
  }

  if (key === 'endorsement_remarks') {
    if (!item.endorsement_remarks) return E();
    if (item.endorsement_remarks === 'LONG LEAD ITEMS')
      return `<span class="long-lead-tag"><span class="status-dot lead"></span>Long Lead</span>`;
    const escRmk = item.endorsement_remarks.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<span class="detail-value" style="font-size:0.78rem;">${escRmk}</span>`;
  }

  if (key === 'remarks') {
    if (!item.remarks) return E();
    const esc = item.remarks.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<span class="scope-text" title="${esc}">${esc}</span>`;
  }

  if (key === 'po_remarks') {
    if (!item.po_remarks) return E();
    const esc = item.po_remarks.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<span class="scope-text" title="${esc}">${esc}</span>`;
  }

  if (key === 'conditions') {
    if (!item.conditions) return E();
    const esc = item.conditions.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<span class="scope-text" title="${esc}">${esc}</span>`;
  }

  if (key === 'final_remarks') {
    if (!item.final_remarks) return E();
    const esc = item.final_remarks.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<span class="scope-text" title="${esc}">${esc}</span>`;
  }

  // Amount columns
  if (col.cls === 'amt') {
    const val = item[key];
    if (!val || val === 0) return E();
    const f = fmt(val);
    const neg = val < 0 ? ' negative' : (val > 0 ? ' positive' : '');
    // Only colour savings columns
    if (key.includes('savings')) return `<span class="amount${neg}">${f}</span>`;
    return `<span class="amount">${f}</span>`;
  }

  const val = item[key];
  if (!val) return E();
  const safe = String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return safe;
}

function renderTable() {
  const tbody = document.getElementById('items-tbody');
  const cols  = COLS[activeTeam];
  const span  = cols.length;

  if (filteredItems.length === 0) {
    const hasFilters = searchQuery || tradeFilter || statusFilter || activeTab !== 'all';
    const clearBtn = hasFilters
      ? `<button class="btn" onclick="document.getElementById('clear-filters').click()">Clear Filters</button>`
      : '';
    tbody.innerHTML = `
      <tr><td colspan="${span + 2}" class="no-results">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <p>${hasFilters ? 'No items match your current filters.' : 'No items in this project yet.'}</p>
        ${clearBtn}
      </td></tr>`;
    updateSelectAllState();
    updateBulkBar();
    return;
  }

  const _start     = (currentPage - 1) * PAGE_SIZE;
  const _pageItems = filteredItems.slice(_start, _start + PAGE_SIZE);

  tbody.innerHTML = _pageItems.map(item => {
    const isLongLead = item.endorsement_remarks === 'LONG LEAD ITEMS';
    const urgency    = dateUrgency(item.date_needed);
    const rowCls     = [isLongLead ? 'long-lead' : '', urgency ? `row-${urgency}` : ''].filter(Boolean).join(' ');
    const cbCell     = `<td class="td-cb" onclick="event.stopPropagation()"><input type="checkbox" class="row-cb" data-no="${item.no}"${selectedItems.has(item.no) ? ' checked' : ''}></td>`;
    const cells = cols.map(c => {
      const tdCls = c.cls === 'amt' ? ' class="td-amt"' : c.cls === 'num' ? ' class="num"' : '';
      const raw = item[c.key];
      const dataVal = raw && typeof raw === 'string' && raw.length > 0
        ? ` data-val="${raw.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"`
        : '';
      return `<td${tdCls}${dataVal}>${cellValue(item, c)}</td>`;
    }).join('');
    const histCell = `<td class="td-hist" onclick="event.stopPropagation()"><button class="btn-hist" onclick="openHistoryModal(${item.no})" title="Change history"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg></button></td>`;
    return `<tr class="${rowCls}" data-no="${item.no}" onclick="if(!window.getSelection().toString())openModal(${item.no})">${cbCell}${cells}${histCell}</tr>`;
  }).join('');

  updateSelectAllState();
  updateBulkBar();
}

/* ==============================
   PAGINATION
============================== */
function renderPagination() {
  const bar = document.getElementById('pagination-bar');
  if (!bar) return;
  const total = filteredItems.length;
  if (total <= PAGE_SIZE) { bar.style.display = 'none'; return; }

  bar.style.display = 'flex';
  const pages  = Math.ceil(total / PAGE_SIZE);
  const start  = (currentPage - 1) * PAGE_SIZE + 1;
  const end    = Math.min(currentPage * PAGE_SIZE, total);

  let html = `<span class="pg-info">Items ${start}–${end} of ${total}</span><div class="pg-btns">`;
  if (currentPage > 1) html += `<button class="btn btn-sm" onclick="goToPage(${currentPage - 1})">&#8249; Prev</button>`;

  const lo = Math.max(1, currentPage - 2);
  const hi = Math.min(pages, currentPage + 2);
  if (lo > 1) html += `<button class="btn btn-sm" onclick="goToPage(1)">1</button>${lo > 2 ? '<span class="pg-ellipsis">…</span>' : ''}`;
  for (let p = lo; p <= hi; p++)
    html += `<button class="btn btn-sm${p === currentPage ? ' pg-active' : ''}" onclick="goToPage(${p})">${p}</button>`;
  if (hi < pages) html += `${hi < pages - 1 ? '<span class="pg-ellipsis">…</span>' : ''}<button class="btn btn-sm" onclick="goToPage(${pages})">${pages}</button>`;
  if (currentPage < pages) html += `<button class="btn btn-sm" onclick="goToPage(${currentPage + 1})">Next &#8250;</button>`;

  bar.innerHTML = html + '</div>';
}

function goToPage(n) {
  const pages = Math.ceil(filteredItems.length / PAGE_SIZE);
  currentPage = Math.max(1, Math.min(n, pages));
  renderTable();
  renderPagination();
  document.querySelector('.table-wrap').scrollTop = 0;
}

/* ==============================
   MODAL (EDIT FORM)
============================== */
function openModal(no) {
  const item = allItems.find(i => i.no === no);
  if (!item) return;
  editingItemNo = no;

  const esc  = (s) => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
  const num  = (n) => (n && n !== 0) ? n : '';
  const sel  = (cur, opts) => opts.map(([v, l]) =>
    `<option value="${v}"${cur === v ? ' selected' : ''}>${l}</option>`).join('');

  document.getElementById('modal-no').textContent    = `Item #${item.no}`;
  document.getElementById('modal-title').textContent = item.scope || `Trade Item ${item.no}`;

  document.getElementById('modal-body').innerHTML = `
    <form id="edit-item-form" novalidate>

      <div class="ai-section">
        <div class="ai-section-title">General</div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">Trade</label>
            <input class="form-input" id="ef-trade" type="text" value="${esc(item.trade)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select class="form-input" id="ef-priority">
              ${sel(item.priority, [['','— None —'],['HIGH','High'],['MEDIUM','Medium'],['LOW','Low']])}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Scope of Works</label>
            <textarea class="form-input form-textarea" id="ef-scope" rows="2">${esc(item.scope)}</textarea>
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">Budget Allocation (₱)</label>
            <input class="form-input" id="ef-budget" type="number" step="0.01" min="0" value="${num(item.budget)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Date Needed On-Site</label>
            <input class="form-input" id="ef-date-needed" type="date" value="${toDateInput(item.date_needed)}" />
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">Vendor's Timeline</label>
            <input class="form-input" id="ef-timeline" type="text" value="${esc(item.vendor_timeline)}" />
          </div>
          <div class="form-group ai-checkbox-row">
            <input type="checkbox" id="ef-long-lead" ${item.endorsement_remarks === 'LONG LEAD ITEMS' ? 'checked' : ''} />
            <label for="ef-long-lead">Long Lead Item</label>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Remarks / Notes</label>
            <textarea class="form-input form-textarea" id="ef-remarks" rows="2">${esc(item.remarks || item.notes)}</textarea>
          </div>
        </div>
      </div>

      <div class="ai-section" id="ef-section-commercial">
        <div class="ai-section-title commercial">Commercial</div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">Endorsed Vendor / Subcon</label>
            <input class="form-input" id="ef-endorsed-vendor" type="text" value="${esc(item.endorsed_vendor)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Endorsement Date</label>
            <input class="form-input" id="ef-endorsement-date" type="date" value="${toDateInput(item.endorsement_date)}" />
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">Endorsed Amount VAT-Inc (₱)</label>
            <input class="form-input" id="ef-endorsed-amount" type="number" step="0.01" min="0" value="${num(item.endorsed_amount)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Approved Vendor</label>
            <input class="form-input" id="ef-approved-vendor" type="text" value="${esc(item.approved_vendor)}" />
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">DP Required Before Mobilization</label>
            <input class="form-input" id="ef-dp-required" type="text" value="${esc(item.dp_required)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Downpayment</label>
            <input class="form-input" id="ef-downpayment" type="text" value="${esc(item.downpayment)}" />
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">Progress Billing</label>
            <input class="form-input" id="ef-progress-billing" type="text" value="${esc(item.progress_billing)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Upon Completion / Retention</label>
            <input class="form-input" id="ef-upon-completion" type="text" value="${esc(item.upon_completion)}" />
          </div>
        </div>
      </div>

      <div class="ai-section" id="ef-section-procurement">
        <div class="ai-section-title procurement">Procurement Management</div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">Awarded Vendor</label>
            <input class="form-input" id="ef-awarded-vendor" type="text" value="${esc(item.awarded_vendor)}" />
          </div>
          <div class="form-group">
            <label class="form-label">PR / Endorsement No.</label>
            <input class="form-input" id="ef-pr-no" type="text" value="${esc(item.pr_no)}" />
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">Negotiated Proposal (₱)</label>
            <input class="form-input" id="ef-negotiated" type="number" step="0.01" min="0" value="${num(item.negotiated_proposal)}" />
          </div>
          <div class="form-group">
            <label class="form-label">PO Amount (₱)</label>
            <input class="form-input" id="ef-po-amount" type="number" step="0.01" min="0" value="${num(item.po_amount)}" />
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">PO No.</label>
            <input class="form-input" id="ef-po-no" type="text" value="${esc(item.po_no)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Date of PO</label>
            <input class="form-input" id="ef-date-po" type="date" value="${toDateInput(item.date_of_po)}" />
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">Date of Issuance of PO</label>
            <input class="form-input" id="ef-date-issuance-po" type="date" value="${toDateInput(item.date_issuance_po)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Invoice No. / DR No.</label>
            <input class="form-input" id="ef-invoice-no" type="text" value="${esc(item.invoice_no)}" />
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">Invoice Date</label>
            <input class="form-input" id="ef-invoice-date" type="date" value="${toDateInput(item.invoice_date)}" />
          </div>
          <div class="form-group">
            <label class="form-label">RFP No.</label>
            <input class="form-input" id="ef-rfp-no" type="text" value="${esc(item.rfp_no)}" />
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">RFP Date</label>
            <input class="form-input" id="ef-rfp-date" type="date" value="${toDateInput(item.rfp_date)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Date Submission for AP</label>
            <input class="form-input" id="ef-date-ap" type="date" value="${toDateInput(item.date_submission_ap)}" />
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">RFP Amount (₱)</label>
            <input class="form-input" id="ef-rfp-amount" type="number" step="0.01" min="0" value="${num(item.rfp_amount)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Due Date</label>
            <input class="form-input" id="ef-due-date" type="date" value="${toDateInput(item.due_date)}" />
          </div>
        </div>
        <div class="form-row two-col">
          <div class="form-group">
            <label class="form-label">PT</label>
            <input class="form-input" id="ef-pt" type="text" value="${esc(item.pt)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Conditions</label>
            <input class="form-input" id="ef-conditions" type="text" value="${esc(item.conditions)}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Final Remarks</label>
            <textarea class="form-input form-textarea" id="ef-final-remarks" rows="2">${esc(item.final_remarks)}</textarea>
          </div>
        </div>
      </div>

    </form>
  `;

  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  // Show only the section for the active team; hidden fields keep their values so save is safe
  document.getElementById('ef-section-commercial').classList.toggle('hidden', activeTeam !== 'commercial');
  document.getElementById('ef-section-procurement').classList.toggle('hidden', activeTeam !== 'procurement');

  // Viewers get a read-only view
  if (!Auth.can('edit')) {
    const form = document.getElementById('edit-item-form');
    if (form) {
      form.classList.add('form-view-only');
      form.insertAdjacentHTML('afterbegin', `
        <div class="modal-view-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <rect x="3" y="11" width="18" height="11" rx="2.5"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke-linecap="round"/>
          </svg>
          View Only — your account does not have edit permissions
        </div>`);
    }
    document.querySelectorAll('#modal-body input, #modal-body select, #modal-body textarea').forEach(el => {
      el.disabled = true;
    });
    document.getElementById('modal-save-btn').style.display = 'none';
  } else {
    document.getElementById('modal-save-btn').style.display = '';
    document.getElementById('modal-dup-btn').style.display  = '';
    document.getElementById('modal-dup-btn').disabled = false;
    document.getElementById('modal-dup-btn').innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Duplicate';
    const noteEl = document.getElementById('save-note');
    if (noteEl) { noteEl.style.display = ''; noteEl.value = ''; }
  }
}

function closeModal() {
  document.getElementById('modal-dup-btn').style.display = 'none';
  const noteEl = document.getElementById('save-note');
  if (noteEl) { noteEl.style.display = 'none'; noteEl.value = ''; }
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
  editingItemNo = null;
}

async function saveModalEdit() {
  if (!Auth.can('edit')) return;
  const idx = allItems.findIndex(i => i.no === editingItemNo);
  if (idx === -1) return;

  const g  = (id) => document.getElementById(id);
  const tv = (id) => g(id) ? g(id).value.trim() : '';
  const nv = (id) => g(id) ? parseFloat(g(id).value) || 0 : 0;

  const budget      = nv('ef-budget');
  const endorsedAmt = nv('ef-endorsed-amount');
  const poAmt       = nv('ef-po-amount');
  const wasLongLead = allItems[idx].endorsement_remarks === 'LONG LEAD ITEMS';
  const isLongLead  = g('ef-long-lead') ? g('ef-long-lead').checked : wasLongLead;

  const _snapshot = Object.assign({}, allItems[idx]);

  Object.assign(allItems[idx], {
    trade:                  tv('ef-trade'),
    scope:                  tv('ef-scope'),
    budget,
    priority:               tv('ef-priority'),
    date_needed:            fromDateInput(tv('ef-date-needed')),
    vendor_timeline:        tv('ef-timeline'),
    endorsement_remarks:    isLongLead ? 'LONG LEAD ITEMS' : (wasLongLead ? '' : allItems[idx].endorsement_remarks),
    remarks:                tv('ef-remarks'),
    notes:                  tv('ef-remarks'),
    endorsed_vendor:        tv('ef-endorsed-vendor'),
    endorsement_date:       fromDateInput(tv('ef-endorsement-date')),
    endorsed_amount:        endorsedAmt,
    savings_budget_endorsed: budget && endorsedAmt ? budget - endorsedAmt : 0,
    approved_vendor:        tv('ef-approved-vendor'),
    dp_required:            tv('ef-dp-required'),
    downpayment:            tv('ef-downpayment'),
    progress_billing:       tv('ef-progress-billing'),
    upon_completion:        tv('ef-upon-completion'),
    awarded_vendor:         tv('ef-awarded-vendor'),
    pr_no:                  tv('ef-pr-no'),
    negotiated_proposal:    nv('ef-negotiated'),
    po_amount:              poAmt,
    po_no:                  tv('ef-po-no'),
    date_of_po:             fromDateInput(tv('ef-date-po')),
    date_issuance_po:       fromDateInput(tv('ef-date-issuance-po')),
    savings_endorsed_po:    endorsedAmt && poAmt ? endorsedAmt - poAmt : 0,
    invoice_no:             tv('ef-invoice-no'),
    invoice_date:           fromDateInput(tv('ef-invoice-date')),
    rfp_no:                 tv('ef-rfp-no'),
    rfp_date:               fromDateInput(tv('ef-rfp-date')),
    date_submission_ap:     fromDateInput(tv('ef-date-ap')),
    rfp_amount:             nv('ef-rfp-amount'),
    due_date:               fromDateInput(tv('ef-due-date')),
    pt:                     tv('ef-pt'),
    conditions:             tv('ef-conditions'),
    final_remarks:          tv('ef-final-remarks'),
  });

  const saveBtn    = document.getElementById('modal-save-btn');
  const origBtnHtml = saveBtn.innerHTML;
  saveBtn.disabled  = true;
  saveBtn.textContent = 'Saving…';

  const saveNote = (document.getElementById('save-note') || {}).value || '';
  try {
    await ProjectStore.saveItem(currentProjectId, allItems[idx], saveNote.trim() || undefined);
  } catch (e) {
    Object.assign(allItems[idx], _snapshot);
    alert('Save failed: ' + e.message);
    saveBtn.disabled = false;
    saveBtn.innerHTML = origBtnHtml;
    return;
  }

  saveBtn.disabled = false;
  saveBtn.innerHTML = origBtnHtml;
  initCards(currentProjectMeta, allItems);
  applyFilters();
  closeModal();
}

/* ==============================
   DUPLICATE ITEM
============================== */
async function duplicateItem(no) {
  if (!Auth.can('edit')) return;
  const src = allItems.find(i => i.no === no);
  if (!src) return;

  const dupBtn = document.getElementById('modal-dup-btn');
  const origHtml = dupBtn ? dupBtn.innerHTML : '';
  if (dupBtn) { dupBtn.disabled = true; dupBtn.textContent = 'Duplicating…'; }

  const nextNo  = allItems.reduce((max, i) => Math.max(max, i.no || 0), 0) + 1;
  const newItem = { ...src, no: nextNo };

  allItems.push(newItem);
  try {
    await ProjectStore.addItem(currentProjectId, newItem);
  } catch (e) {
    allItems.pop();
    if (dupBtn) { dupBtn.disabled = false; dupBtn.innerHTML = origHtml; }
    alert('Duplicate failed: ' + e.message);
    return;
  }

  buildTradeFilter();
  initCards(currentProjectMeta, allItems);
  applyFilters();
  closeModal();
  // Open the newly created item so the user can review/edit it
  setTimeout(() => openModal(nextNo), 120);
}

/* ==============================
   SORT
============================== */
function handleSort(col) {
  if (col === '_status' || col === '_proj_code') return;
  if (sortCol === col) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortCol = col;
    sortDir = 'asc';
  }
  document.querySelectorAll('#table-head th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    const icon = th.querySelector('.sort-icon');
    if (icon) icon.textContent = '↕';
  });
  const th = document.querySelector(`#table-head [data-sort="${col}"]`);
  if (th) {
    th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    const icon = th.querySelector('.sort-icon');
    if (icon) icon.textContent = sortDir === 'asc' ? '↑' : '↓';
  }
  applyFilters();
  savePrefs();
}

/* ==============================
   BULK ACTIONS
============================== */
function updateSelectAllState() {
  const cbAll = document.getElementById('cb-all');
  if (!cbAll) return;
  const all  = filteredItems.length > 0 && filteredItems.every(i => selectedItems.has(i.no));
  const some = filteredItems.some(i => selectedItems.has(i.no));
  cbAll.checked       = all;
  cbAll.indeterminate = !all && some;
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  if (!bar) return;
  const n = selectedItems.size;
  if (n > 0) {
    bar.classList.add('visible');
    document.getElementById('bulk-count').textContent = n + ' item' + (n === 1 ? '' : 's') + ' selected';
  } else {
    bar.classList.remove('visible');
  }
}

function clearSelection() {
  selectedItems.clear();
  renderTable();
}

async function bulkExport() {
  const items = allItems.filter(i => selectedItems.has(i.no));
  if (!items.length) return;
  const orig = filteredItems;
  filteredItems = items;
  try { await exportExcel(); } finally { filteredItems = orig; }
}

async function bulkDelete() {
  const count = selectedItems.size;
  if (!count) return;
  if (!confirm(`Delete ${count} selected item${count === 1 ? '' : 's'}? This cannot be undone.`)) return;

  const delBtn = document.querySelector('.bulk-btn-danger');
  if (delBtn) { delBtn.disabled = true; delBtn.textContent = 'Deleting…'; }

  let failed = 0;
  for (const no of [...selectedItems]) {
    try {
      await ProjectStore.deleteItem(currentProjectId, no);
      const idx = allItems.findIndex(i => i.no === no);
      if (idx !== -1) allItems.splice(idx, 1);
      selectedItems.delete(no);
    } catch (e) {
      console.error('Delete failed for item', no, e);
      failed++;
    }
  }

  if (delBtn) { delBtn.disabled = false; delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/></svg> Delete'; }

  buildTradeFilter();
  initCards(currentProjectMeta, allItems);
  applyFilters();
  if (failed > 0) alert(`${failed} item(s) failed to delete.`);
}

/* ==============================
   ADD ITEM MODAL
============================== */
function openAddItemModal() {
  if (!Auth.can('edit')) return;
  document.getElementById('add-item-form').reset();
  document.getElementById('ai-error').textContent = '';
  document.getElementById('add-item-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAddItemModal() {
  document.getElementById('add-item-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveNewItem() {
  if (!Auth.can('edit')) return;
  const trade = document.getElementById('ai-trade').value.trim();
  const scope = document.getElementById('ai-scope').value.trim();
  const errEl = document.getElementById('ai-error');
  errEl.textContent = '';

  if (!trade) { errEl.textContent = 'Trade is required.'; return; }
  if (!scope) { errEl.textContent = 'Scope of Works is required.'; return; }

  const nextNo = allItems.reduce((max, i) => Math.max(max, i.no || 0), 0) + 1;
  const budget      = parseFloat(document.getElementById('ai-budget').value)          || 0;
  const endorsedAmt = parseFloat(document.getElementById('ai-endorsed-amount').value) || 0;
  const poAmt       = parseFloat(document.getElementById('ai-po-amount').value)       || 0;

  const item = {
    ...ProjectStore.blankItem(nextNo),
    trade,
    scope,
    budget,
    priority:               document.getElementById('ai-priority').value,
    date_needed:            fromDateInput(document.getElementById('ai-date-needed').value),
    vendor_timeline:        document.getElementById('ai-timeline').value.trim(),
    endorsement_remarks:    document.getElementById('ai-long-lead').checked ? 'LONG LEAD ITEMS' : '',
    endorsed_vendor:        document.getElementById('ai-endorsed-vendor').value.trim(),
    endorsement_date:       fromDateInput(document.getElementById('ai-endorsement-date').value),
    endorsed_amount:        endorsedAmt,
    savings_budget_endorsed: budget && endorsedAmt ? budget - endorsedAmt : 0,
    approved_vendor:        document.getElementById('ai-approved-vendor').value.trim(),
    awarded_vendor:         document.getElementById('ai-awarded-vendor').value.trim(),
    pr_no:                  document.getElementById('ai-pr-no').value.trim(),
    negotiated_proposal:    parseFloat(document.getElementById('ai-negotiated').value)  || 0,
    po_amount:              poAmt,
    po_no:                  document.getElementById('ai-po-no').value.trim(),
    date_of_po:             fromDateInput(document.getElementById('ai-date-po').value),
    savings_endorsed_po:    endorsedAmt && poAmt ? endorsedAmt - poAmt : 0,
    invoice_no:             document.getElementById('ai-invoice-no').value.trim(),
    invoice_date:           fromDateInput(document.getElementById('ai-invoice-date').value),
    rfp_no:                 document.getElementById('ai-rfp-no').value.trim(),
    rfp_date:               fromDateInput(document.getElementById('ai-rfp-date').value),
    rfp_amount:             parseFloat(document.getElementById('ai-rfp-amount').value) || 0,
    due_date:               fromDateInput(document.getElementById('ai-due-date').value),
  };

  allItems.push(item);

  const aiSaveBtn   = document.getElementById('ai-save');
  const origAiHtml  = aiSaveBtn.innerHTML;
  aiSaveBtn.disabled = true;
  aiSaveBtn.textContent = 'Saving…';

  try {
    await ProjectStore.addItem(currentProjectId, item);
  } catch (e) {
    allItems.pop();  // revert optimistic add
    errEl.textContent = 'Save failed: ' + e.message;
    aiSaveBtn.disabled = false;
    aiSaveBtn.innerHTML = origAiHtml;
    return;
  }

  aiSaveBtn.disabled = false;
  aiSaveBtn.innerHTML = origAiHtml;
  buildTradeFilter();
  initCards(currentProjectMeta, allItems);
  applyFilters();
  closeAddItemModal();
}

/* ==============================
   EXPORT EXCEL
============================== */
/* ── shared Excel cell helper (used by exportExcel inner scope) ── */
function _xlCell(row, col, value, o = {}) {
  const cell = row.getCell(col);
  if (value !== undefined && value !== null) cell.value = value;
  if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
  cell.font = { name: 'Calibri', bold: !!o.bold, italic: !!o.italic,
                size: o.size || 10, color: { argb: o.color || 'FF111827' } };
  cell.alignment = { horizontal: o.align || 'center', vertical: 'middle',
                     wrapText: o.wrap !== false, indent: o.indent || 0 };
  if (o.fmt)  cell.numFmt = o.fmt;
  if (o.border !== false) {
    const s = o.bs || 'thin', bc = o.bc || 'FFD1D5DB';
    cell.border = { top:{style:s,color:{argb:bc}}, left:{style:s,color:{argb:bc}},
                    bottom:{style:s,color:{argb:bc}}, right:{style:s,color:{argb:bc}} };
  }
  return cell;
}

async function exportExcel() {
  if (typeof ExcelJS === 'undefined') {
    alert('Excel library not loaded — please refresh and try again.');
    return;
  }

  const meta  = currentProjectMeta || {};
  const stats = ProjectStore.computeStats({ project: meta, items: allItems });

  // ── Palette ──────────────────────────────────────────────────
  const P = {
    navy:    'FF1E3A5F',  // master header
    teal:    'FF047075',  // commercial accent
    blue:    'FF1D4ED8',  // procurement accent
    green:   'FF15803D',  // savings / positive
    amber:   'FFB45309',  // balance / caution
    slate:   'FF1E293B',  // sub-header bar
    rowAlt:  'FFF8FAFC',  // alternating data row
    hdrBg:   'FFF1F5F9',  // stat label row
    border:  'FFD1D5DB',  // cell border
    dark:    'FF111827',  // primary text
    muted:   'FF6B7280',  // label text
    white:   'FFFFFFFF',
  };

  const parseDate = (s) => {
    if (!s) return null;
    const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? new Date(+m[3], +m[1] - 1, +m[2]) : null;
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ABI Project Tracker';
  wb.created = new Date();

  // ── Inner helpers ────────────────────────────────────────────
  const sc = _xlCell;

  const statBar = (ws, rowNum, height, cols, statDefs) => {
    ws.getRow(rowNum).height     = height || 18;
    ws.getRow(rowNum+1).height   = 26;
    const n = statDefs.length;
    const span = Math.floor(cols / n);
    statDefs.forEach((s, i) => {
      const c1 = i * span + 1;
      const c2 = (i === n - 1) ? cols : (i + 1) * span;
      if (c2 > c1) { ws.mergeCells(rowNum, c1, rowNum, c2); ws.mergeCells(rowNum+1, c1, rowNum+1, c2); }
      sc(ws.getRow(rowNum),   c1, s.label, { fill: P.hdrBg, bold: true, size: 8, color: P.muted, align: 'center', wrap: false, border: true });
      sc(ws.getRow(rowNum+1), c1, s.value, { fill: P.white, bold: true, size: 13, color: s.color || P.dark, align: 'center', fmt: s.fmt, wrap: false, border: true });
    });
  };

  const hdrRow = (ws, rowNum, accentColor, colDefs) => {
    ws.getRow(rowNum).height = 36;
    colDefs.forEach((col, i) => {
      const cell = ws.getRow(rowNum).getCell(i + 1);
      cell.value = col.label;
      cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb: accentColor } };
      cell.font  = { name:'Calibri', bold:true, size:10, color:{ argb: P.white } };
      cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
      cell.border = {
        top:    { style:'medium', color:{ argb:'FF000000' } },
        left:   { style:'thin',   color:{ argb:P.border } },
        bottom: { style:'medium', color:{ argb:'FF000000' } },
        right:  { style:'thin',   color:{ argb:P.border } },
      };
    });
  };

  const dataRows = (ws, startRow, colDefs, items) => {
    const AMT  = '#,##0.00';
    const DFMT = 'mm/dd/yyyy';
    items.forEach((item, idx) => {
      const r   = ws.getRow(startRow + idx);
      r.height  = 16;
      const bg  = idx % 2 === 0 ? P.white : P.rowAlt;
      colDefs.forEach((col, ci) => {
        const raw = item[col.key];
        let val   = raw;
        if (col.date) { const d = parseDate(raw); val = d || raw || ''; }
        else if (col.amt) { val = (typeof raw === 'number' ? raw : parseFloat(raw)) || 0; }
        else { val = raw || ''; }
        const align = col.amt ? 'right' : (col.left ? 'left' : 'center');
        sc(r, ci+1, val, { fill:bg, size:10, color:P.dark, align, wrap:false,
          fmt: col.amt ? AMT : (col.date && val instanceof Date ? DFMT : null),
          indent: (col.amt || col.left) ? 1 : 0, border:true, bc:P.border });
      });
    });
  };

  const titleBar = (ws, cols, text, accent) => {
    ws.getRow(1).height = 34;
    ws.mergeCells(1, 1, 1, cols);
    const cell = ws.getRow(1).getCell(1);
    cell.value = text;
    cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb: accent } };
    cell.font  = { name:'Calibri', bold:true, size:14, color:{ argb:P.white } };
    cell.alignment = { horizontal:'center', vertical:'middle' };
  };

  const infoBar = (ws, cols, text) => {
    ws.getRow(2).height = 17;
    ws.mergeCells(2, 1, 2, cols);
    const cell = ws.getRow(2).getCell(1);
    cell.value = text;
    cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb: P.slate } };
    cell.font  = { name:'Calibri', size:9, color:{ argb:'FF94A3B8' } };
    cell.alignment = { horizontal:'center', vertical:'middle' };
  };

  const projectInfo = `${meta.client || ''}   ·   ${meta.code || ''}   ·   Exported ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}   ·   ${filteredItems.length} item(s)`;

  // ════════════════════════════════════════════════════
  //  SHEET 1: SUMMARY / DASHBOARD
  // ════════════════════════════════════════════════════
  const dash = wb.addWorksheet('Summary', { tabColor:{ argb: P.navy } });
  const DC   = 6;  // dashboard columns
  [26, 28, 26, 28, 26, 28].forEach((w, i) => { dash.getColumn(i+1).width = w; });

  // Title
  dash.getRow(1).height = 40;
  dash.mergeCells(1, 1, 1, DC);
  const dtc = dash.getRow(1).getCell(1);
  dtc.value = 'ABI PROJECT TRACKER  ·  LONG LEAD ITEMS MANAGEMENT';
  dtc.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb: P.navy } };
  dtc.font  = { name:'Calibri', bold:true, size:16, color:{ argb: P.white } };
  dtc.alignment = { horizontal:'center', vertical:'middle' };

  // Project name
  dash.getRow(2).height = 26;
  dash.mergeCells(2, 1, 2, DC);
  const dpn = dash.getRow(2).getCell(1);
  dpn.value = meta.name || 'Project Tracker';
  dpn.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF2D5480' } };
  dpn.font  = { name:'Calibri', bold:true, size:13, color:{ argb: P.white } };
  dpn.alignment = { horizontal:'center', vertical:'middle' };

  // Project details row (label | value pairs)
  dash.getRow(3).height = 20;
  [
    [1, 'Client / Owner', P.hdrBg, P.muted, 'right'],
    [2, meta.client || '—', P.white, P.dark, 'left'],
    [3, 'Site / Code', P.hdrBg, P.muted, 'right'],
    [4, meta.code || '—', P.white, P.dark, 'left'],
    [5, 'Total Budget', P.hdrBg, P.muted, 'right'],
    [6, meta.total_budget || 0, P.white, P.dark, 'right'],
  ].forEach(([col, val, fill, color, align]) => {
    const isAmt = col === 6;
    sc(dash.getRow(3), col, val, { fill, color, align, bold: col%2===0, size:10, wrap:false,
       fmt: isAmt ? '#,##0.00' : null, border:true });
  });

  dash.getRow(4).height = 10; // spacer

  // Item count stats
  dash.mergeCells(5, 1, 5, DC);
  sc(dash.getRow(5), 1, 'ITEM COUNTS', { fill:P.teal, bold:true, size:10, color:P.white, align:'left', indent:1, border:false });
  dash.getRow(5).height = 18;
  statBar(dash, 6, 18, DC, [
    { label:'TOTAL LINE ITEMS',     value: stats.total_items,          color: P.navy },
    { label:'ENDORSED',             value: stats.endorsed_count,       color: P.teal },
    { label:'WITH P.O.',            value: stats.with_po_count,        color: P.blue },
    { label:'LONG LEAD',            value: stats.long_lead_count,      color: P.amber },
    { label:'NO COMM. ENDORSEMENT', value: stats.no_commercial_endorsement || 0, color: P.muted },
    { label:'TOTAL ITEMS IN FILE',  value: allItems.length,            color: P.muted },
  ]);
  dash.getRow(8).height = 10;  // spacer

  // Commercial financials
  dash.mergeCells(9, 1, 9, DC);
  sc(dash.getRow(9), 1, 'COMMERCIAL FINANCIAL SUMMARY', { fill:P.teal, bold:true, size:10, color:P.white, align:'left', indent:1, border:false });
  dash.getRow(9).height = 18;
  statBar(dash, 10, 18, DC, [
    { label:'TOTAL BUDGET',            value: meta.total_budget||0,    fmt:'#,##0.00', color: P.dark  },
    { label:'RUNNING ENDORSED AMOUNT', value: stats.total_endorsed,    fmt:'#,##0.00', color: P.teal  },
    { label:'BALANCE FOR ENDORSEMENT', value: stats.balance,           fmt:'#,##0.00', color: P.amber },
    { label:'ENDORSED / TOTAL',        value: `${stats.endorsed_count} / ${stats.total_items}`, color: P.navy },
    { label: '', value: '', color: P.muted },
    { label: '', value: '', color: P.muted },
  ]);
  dash.getRow(12).height = 10;

  // Procurement financials
  dash.mergeCells(13, 1, 13, DC);
  sc(dash.getRow(13), 1, 'PROCUREMENT FINANCIAL SUMMARY', { fill:P.blue, bold:true, size:10, color:P.white, align:'left', indent:1, border:false });
  dash.getRow(13).height = 18;
  statBar(dash, 14, 18, DC, [
    { label:'TOTAL PO AMOUNT',             value: stats.total_po,      fmt:'#,##0.00', color: P.blue  },
    { label:'TOTAL SAVINGS (ENDORSED→PO)', value: stats.total_savings, fmt:'#,##0.00', color: P.green },
    { label:'ITEMS WITH P.O.',             value: `${stats.with_po_count} / ${stats.total_items}`, color: P.navy },
    { label: '', value: '', color: P.muted },
    { label: '', value: '', color: P.muted },
    { label: '', value: '', color: P.muted },
  ]);
  dash.getRow(16).height = 10;

  // Footer note
  dash.getRow(17).height = 20;
  dash.mergeCells(17, 1, 17, DC);
  sc(dash.getRow(17), 1, 'Full item details available in the "Commercial" and "Procurement Management" sheets.', {
    fill:P.hdrBg, italic:true, size:10, color:P.muted, align:'center', border:false
  });

  // ════════════════════════════════════════════════════
  //  SHEET 2: COMMERCIAL
  // ════════════════════════════════════════════════════
  const COMM_COLS = [
    { key:'no',                     label:'#',                             w: 5  },
    { key:'trade',                  label:'Trade',                         w: 18 },
    { key:'scope',                  label:'Scope of Works',                w: 40, left:true },
    { key:'remarks',                label:'Remarks',                       w: 22, left:true },
    { key:'budget',                 label:'Total Budget\nAllocation',      w: 20, amt:true  },
    { key:'endorsed_vendor',        label:'Endorsed Vendor / Subcon',      w: 26, left:true },
    { key:'endorsement_remarks',    label:'Endorsement\nRemarks',          w: 22, left:true },
    { key:'endorsement_date',       label:'Endorsement\nDate',             w: 16, date:true },
    { key:'endorsed_amount',        label:'Endorsed Amount\n(VAT-Inc)',    w: 22, amt:true  },
    { key:'savings_budget_endorsed',label:'Savings\n(Budget vs Endorsed)', w: 22, amt:true  },
    { key:'vendor_timeline',        label:"Vendor's Timeline",             w: 32, left:true },
    { key:'date_needed',            label:'Date Needed\nOn-Site',          w: 16, date:true },
    { key:'approved_vendor',        label:'Approved Vendor',               w: 24, left:true },
    { key:'priority',               label:'Priority\nLevel',               w: 14 },
  ];

  const commWs = wb.addWorksheet('Commercial', { tabColor:{ argb: P.teal } });
  COMM_COLS.forEach((c, i) => { commWs.getColumn(i+1).width = c.w; });
  const CC = COMM_COLS.length;

  titleBar(commWs, CC, `COMMERCIAL ENDORSEMENT  ·  ${meta.name || ''}`, P.teal);
  infoBar(commWs, CC, projectInfo);
  statBar(commWs, 3, 18, CC, [
    { label:'TOTAL BUDGET',            value: meta.total_budget||0,   fmt:'#,##0.00', color:P.dark  },
    { label:'RUNNING ENDORSED AMOUNT', value: stats.total_endorsed,   fmt:'#,##0.00', color:P.teal  },
    { label:'BALANCE FOR ENDORSEMENT', value: stats.balance,          fmt:'#,##0.00', color:P.amber },
    { label:'ENDORSED / TOTAL ITEMS',  value:`${stats.endorsed_count} / ${stats.total_items}`, color:P.navy },
  ]);
  hdrRow(commWs, 5, P.teal, COMM_COLS);
  dataRows(commWs, 6, COMM_COLS, filteredItems);
  commWs.views = [{ state:'frozen', ySplit:5, topLeftCell:'A6', activePane:'bottomLeft' }];
  commWs.autoFilter = { from:{ row:5, column:1 }, to:{ row:5, column:CC } };

  // ════════════════════════════════════════════════════
  //  SHEET 3: PROCUREMENT MANAGEMENT
  // ════════════════════════════════════════════════════
  const PROC_COLS = [
    { key:'no',                  label:'#',                               w: 5  },
    { key:'trade',               label:'Trade',                           w: 18 },
    { key:'scope',               label:'Scope of Works',                  w: 40, left:true },
    { key:'awarded_vendor',      label:'Awarded Vendor',                  w: 26, left:true },
    { key:'pr_no',               label:'PR / Endorsement #',              w: 18 },
    { key:'negotiated_proposal', label:'Negotiated\nProposal',            w: 20, amt:true  },
    { key:'po_amount',           label:'PO Amount',                       w: 18, amt:true  },
    { key:'date_of_po',          label:'Date of PO',                      w: 15, date:true },
    { key:'po_no',               label:'PO #',                            w: 14 },
    { key:'date_issuance_po',    label:'Date of Issuance\nof PO',         w: 18, date:true },
    { key:'savings_endorsed_po', label:'Savings\n(Endorsed vs PO)',       w: 22, amt:true  },
    { key:'po_remarks',          label:'PO Remarks',                      w: 22, left:true },
    { key:'invoice_no',          label:'Invoice No / Delivery Receipt',   w: 28 },
    { key:'invoice_date',        label:'Invoice\nDate',                   w: 15, date:true },
    { key:'rfp_no',              label:'RFP #',                           w: 13 },
    { key:'rfp_date',            label:'RFP Date',                        w: 15, date:true },
    { key:'date_submission_ap',  label:'Date Submission\nfor AP',         w: 18, date:true },
    { key:'rfp_amount',          label:'RFP Amount',                      w: 18, amt:true  },
    { key:'pt',                  label:'PT',                              w: 10 },
    { key:'conditions',          label:'Conditions',                      w: 22, left:true },
    { key:'due_date',            label:'Due Date',                        w: 15, date:true },
    { key:'final_remarks',       label:'Final Remarks',                   w: 24, left:true },
  ];

  const procWs = wb.addWorksheet('Procurement Management', { tabColor:{ argb: P.blue } });
  PROC_COLS.forEach((c, i) => { procWs.getColumn(i+1).width = c.w; });
  const PC = PROC_COLS.length;

  titleBar(procWs, PC, `PROCUREMENT MANAGEMENT  ·  ${meta.name || ''}`, P.blue);
  infoBar(procWs, PC, projectInfo);
  statBar(procWs, 3, 18, PC, [
    { label:'TOTAL PO AMOUNT',             value: stats.total_po,      fmt:'#,##0.00', color:P.blue  },
    { label:'TOTAL SAVINGS (ENDORSED→PO)', value: stats.total_savings, fmt:'#,##0.00', color:P.green },
    { label:'ITEMS WITH P.O.',             value:`${stats.with_po_count} / ${stats.total_items}`,  color:P.navy },
    { label:'LONG LEAD ITEMS',             value: stats.long_lead_count,                color:P.amber },
  ]);
  hdrRow(procWs, 5, P.blue, PROC_COLS);
  dataRows(procWs, 6, PROC_COLS, filteredItems);
  procWs.views = [{ state:'frozen', ySplit:5, topLeftCell:'A6', activePane:'bottomLeft' }];
  procWs.autoFilter = { from:{ row:5, column:1 }, to:{ row:5, column:PC } };

  // ── Download ──────────────────────────────────────────────────
  try {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    const safe = (meta.name || 'Project').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
    a.download = `${safe}_Tracker.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export failed:', err);
    alert('Export failed: ' + err.message);
  }
}

/* ==============================
   IMPORT EXCEL
============================== */
let _importParsed = null; // { parsed: {sheetName: {items,colMap,mappedCount,totalHeaders}}, activeSheet, fileName }

/* Normalize a header cell string for lookup — keep # so "PO #", "RFP #", "#" round-trip */
function _impNorm(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^a-z0-9 '#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Header alias → DB field key */
const IMP_HDR_MAP = {
  'no': 'no', 'nos': 'no', '#': 'no', 'item no': 'no', 'item number': 'no',
  'number': 'no', 'nos of endorsement': 'no', 'item': 'no',
  'trade': 'trade',
  'scope': 'scope', 'scope of works': 'scope', 'scope of work': 'scope',
  'description': 'scope', 'material': 'scope',
  'remarks': 'remarks', 'general remarks': 'remarks',
  'notes': 'notes',
  'total budget allocation': 'budget', 'total budget': 'budget',
  'budget allocation': 'budget', 'budget': 'budget',
  'endorsed vendor subcon': 'endorsed_vendor', 'endorsed vendor': 'endorsed_vendor',
  'subcontractor': 'endorsed_vendor', 'vendor subcon': 'endorsed_vendor',
  'endorsement remarks': 'endorsement_remarks',
  'endorsement date': 'endorsement_date', 'date of endorsement': 'endorsement_date',
  'endorsed amount vat inc': 'endorsed_amount', 'endorsed amount': 'endorsed_amount',
  'endorsed amount vatvat inc': 'endorsed_amount',
  'savings budget vs endorsed': 'savings_budget_endorsed',
  'savings budget endorsed': 'savings_budget_endorsed',
  "vendor's timeline": 'vendor_timeline', 'vendors timeline': 'vendor_timeline',
  'vendor timeline': 'vendor_timeline', 'delivery timeline': 'vendor_timeline',
  'date needed on site': 'date_needed', 'date needed': 'date_needed',
  'on site date': 'date_needed', 'required on site': 'date_needed',
  'approved vendor': 'approved_vendor',
  'priority level': 'priority', 'priority': 'priority',
  'awarded vendor': 'awarded_vendor',
  'pr endorsement': 'pr_no', 'pr or endorsement': 'pr_no',
  'pr endorsement #': 'pr_no', 'pr or endorsement #': 'pr_no',
  'pr no': 'pr_no', 'pr number': 'pr_no', 'pr': 'pr_no',
  'negotiated proposal': 'negotiated_proposal', 'negotiated': 'negotiated_proposal',
  'po amount': 'po_amount', 'purchase order amount': 'po_amount',
  'date of po': 'date_of_po', 'po date': 'date_of_po', 'date po': 'date_of_po',
  'po no': 'po_no', 'po number': 'po_no', 'po': 'po_no', 'po #': 'po_no',
  'purchase order no': 'po_no', 'purchase order': 'po_no',
  'date of issuance of po': 'date_issuance_po', 'date issuance po': 'date_issuance_po',
  'po issuance date': 'date_issuance_po', 'issuance date': 'date_issuance_po',
  'savings endorsed vs po': 'savings_endorsed_po', 'savings endorsed po': 'savings_endorsed_po',
  'po remarks': 'po_remarks',
  'invoice no delivery receipt': 'invoice_no', 'invoice no': 'invoice_no',
  'invoice number': 'invoice_no', 'dr no': 'invoice_no', 'delivery receipt': 'invoice_no',
  'invoice date': 'invoice_date',
  'rfp no': 'rfp_no', 'rfp number': 'rfp_no', 'rfp': 'rfp_no', 'rfp #': 'rfp_no',
  'rfp date': 'rfp_date',
  'date submission for ap': 'date_submission_ap', 'date submission ap': 'date_submission_ap',
  'submission date ap': 'date_submission_ap',
  'rfp amount': 'rfp_amount',
  'pt': 'pt',
  'conditions': 'conditions',
  'due date': 'due_date',
  'final remarks': 'final_remarks',
};

const IMP_DATE_FIELDS = new Set([
  'endorsement_date','date_needed','date_of_po','date_issuance_po',
  'invoice_date','rfp_date','date_submission_ap','due_date',
]);
const IMP_AMT_FIELDS = new Set([
  'budget','endorsed_amount','savings_budget_endorsed','negotiated_proposal',
  'po_amount','savings_endorsed_po','rfp_amount',
]);

function _impFmtDate(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const m = String(val.getMonth() + 1).padStart(2,'0');
    const d = String(val.getDate()).padStart(2,'0');
    return `${m}/${d}/${val.getFullYear()}`;
  }
  const s = String(val).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : _impFmtDate(d);
}

function _parseSheetData(rows) {
  if (!rows || rows.length < 2) return null;

  // Find header row: scan rows 0–14, pick the one with the most mapped columns
  let headerIdx = -1, bestScore = 0;
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    let score = 0;
    for (const cell of rows[r]) {
      if (IMP_HDR_MAP[_impNorm(cell)]) score++;
    }
    if (score > bestScore) { bestScore = score; headerIdx = r; }
  }
  if (headerIdx === -1 || bestScore < 1) return null;

  // Build colIndex → fieldKey map (first match wins per field)
  const colMap = {};
  const usedFields = new Set();
  rows[headerIdx].forEach((h, ci) => {
    const field = IMP_HDR_MAP[_impNorm(h)];
    if (field && !usedFields.has(field)) { colMap[ci] = field; usedFields.add(field); }
  });
  if (Object.keys(colMap).length === 0) return null;

  const totalHeaders = rows[headerIdx].filter(h => String(h).trim()).length;
  const mappedCount  = Object.keys(colMap).length;

  // Parse data rows
  const items = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every(c => c === '' || c === null || c === undefined)) continue;

    const item = { ...ProjectStore.blankItem(0) };
    let hasData = false;

    for (const [ci, field] of Object.entries(colMap)) {
      const raw = row[parseInt(ci)];
      if (raw === '' || raw === null || raw === undefined) continue;
      hasData = true;

      if (IMP_DATE_FIELDS.has(field)) {
        item[field] = _impFmtDate(raw);
      } else if (IMP_AMT_FIELDS.has(field)) {
        const n = parseFloat(String(raw).replace(/[₱,\s]/g, ''));
        item[field] = isNaN(n) ? 0 : n;
      } else if (field === 'no') {
        const n = parseInt(raw);
        item.no = isNaN(n) ? 0 : n;
      } else {
        item[field] = String(raw).trim();
      }
    }

    if (!hasData || (!item.trade && !item.scope)) continue;

    // Auto-compute savings if columns are present
    if (!item.savings_budget_endorsed && item.budget && item.endorsed_amount)
      item.savings_budget_endorsed = item.budget - item.endorsed_amount;
    if (!item.savings_endorsed_po && item.endorsed_amount && item.po_amount)
      item.savings_endorsed_po = item.endorsed_amount - item.po_amount;

    items.push(item);
  }

  return { items, colMap, mappedCount, totalHeaders };
}

function openImportModal() {
  _importParsed = null;
  document.getElementById('imp-step-upload').classList.remove('hidden');
  document.getElementById('imp-step-preview').classList.add('hidden');
  document.getElementById('imp-step-progress').classList.add('hidden');
  document.getElementById('imp-error').textContent = '';
  document.getElementById('imp-action').disabled = true;
  document.getElementById('imp-action').textContent = 'Select a file first';
  document.getElementById('imp-cancel').disabled = false;
  document.getElementById('imp-cancel').textContent = 'Cancel';
  document.getElementById('imp-file-input').value = '';
  document.getElementById('imp-dz-sub').textContent = 'or click to browse  (.xlsx / .xls)';
  document.getElementById('imp-dropzone').classList.remove('drag-over');
  document.getElementById('import-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeImportModal() {
  document.getElementById('import-overlay').classList.remove('open');
  document.body.style.overflow = '';
  _importParsed = null;
}

async function handleImportFile(file) {
  if (!file) return;
  const errEl = document.getElementById('imp-error');
  errEl.textContent = '';

  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    errEl.textContent = 'Please select an Excel file (.xlsx or .xls).';
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    errEl.textContent = 'File is too large (max 15 MB).';
    return;
  }

  document.getElementById('imp-dz-sub').textContent = `Reading ${file.name}…`;
  document.getElementById('imp-action').textContent  = 'Parsing…';
  document.getElementById('imp-action').disabled     = true;

  try {
    const buffer = await file.arrayBuffer();

    // Offload XLSX.read + sheet_to_json to worker — keeps main thread responsive
    const sheets = await new Promise((resolve, reject) => {
      const worker = new Worker('js/proj-upload-worker.js');
      worker.onmessage = (e) => {
        worker.terminate();
        if (e.data.ok) resolve(e.data.sheets);
        else reject(new Error(e.data.error));
      };
      worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'Worker parse error')); };
      worker.postMessage(buffer, [buffer]);
    });

    const parsed = {};
    for (const { name, rows } of sheets) {
      const result = _parseSheetData(rows);
      if (result && result.items.length > 0) parsed[name] = result;
    }

    if (Object.keys(parsed).length === 0) {
      errEl.textContent = 'No recognisable data found. Ensure the file has column headers matching the tracker fields.';
      document.getElementById('imp-dz-sub').textContent = 'or click to browse  (.xlsx / .xls)';
      document.getElementById('imp-action').textContent = 'Select a file first';
      return;
    }

    // Prefer the "Commercial" sheet; otherwise pick the sheet with most items
    const sheetNames  = Object.keys(parsed);
    const activeSheet = sheetNames.find(n => /commercial/i.test(n))
      || sheetNames.reduce((a, b) => parsed[a].items.length >= parsed[b].items.length ? a : b);

    _importParsed = { parsed, activeSheet, fileName: file.name };
    _renderImportPreview();

  } catch (e) {
    console.error('Import parse error:', e);
    errEl.textContent = 'Could not read file: ' + e.message;
    document.getElementById('imp-dz-sub').textContent = 'or click to browse  (.xlsx / .xls)';
    document.getElementById('imp-action').textContent = 'Select a file first';
  }
}

const IMP_FIELD_LABELS = {
  no:'#', trade:'Trade', scope:'Scope', remarks:'Remarks', budget:'Budget',
  endorsed_vendor:'Vendor', endorsement_date:'End. Date', endorsed_amount:'Endorsed Amt',
  savings_budget_endorsed:'Savings (B vs E)', vendor_timeline:'Timeline',
  date_needed:'Date Needed', approved_vendor:'Approved Vendor', priority:'Priority',
  awarded_vendor:'Awarded Vendor', pr_no:'PR #', negotiated_proposal:'Neg. Proposal',
  po_amount:'PO Amount', date_of_po:'PO Date', po_no:'PO #',
  savings_endorsed_po:'Savings (E vs PO)', invoice_no:'Invoice #',
  invoice_date:'Inv. Date', rfp_no:'RFP #', rfp_date:'RFP Date', rfp_amount:'RFP Amt',
  due_date:'Due Date', final_remarks:'Final Remarks',
};

function _renderImportPreview() {
  if (!_importParsed) return;
  const { parsed, activeSheet } = _importParsed;
  const data   = parsed[activeSheet];
  const items  = data.items;
  const fields = Object.values(data.colMap);

  document.getElementById('imp-step-upload').classList.add('hidden');
  document.getElementById('imp-step-preview').classList.remove('hidden');

  // Info bar
  const hasUnmapped = data.totalHeaders - data.mappedCount;
  document.getElementById('imp-info-bar').innerHTML =
    `<strong>${items.length}</strong> item${items.length !== 1 ? 's' : ''} found in <em>${activeSheet}</em> &mdash; ` +
    `${data.mappedCount} of ${data.totalHeaders} columns recognised` +
    (hasUnmapped > 0 ? ` <span class="imp-unmapped">(${hasUnmapped} column${hasUnmapped > 1 ? 's' : ''} not mapped)</span>` : '');

  // Sheet selector
  const sel = document.getElementById('imp-sheet-select');
  sel.innerHTML = Object.entries(parsed)
    .map(([n, d]) => `<option value="${n}"${n === activeSheet ? ' selected' : ''}>${n} &nbsp;(${d.items.length} rows)</option>`)
    .join('');
  document.getElementById('imp-sheet-row').classList.toggle('hidden', Object.keys(parsed).length < 2);
  /* "Choose different file" button is always visible regardless of sheet count */

  // Preview table — up to 8 columns, 5 rows
  const previewFields = fields.slice(0, 8);
  const previewItems  = items.slice(0, 5);
  let html = '<thead><tr>' +
    previewFields.map(f => `<th>${IMP_FIELD_LABELS[f] || f}</th>`).join('') +
    '</tr></thead><tbody>';
  html += previewItems.map(item =>
    '<tr>' + previewFields.map(f => {
      let v = item[f];
      if (typeof v === 'number' && v) v = v.toLocaleString('en-PH', { maximumFractionDigits: 2 });
      if (!v) return `<td><span class="imp-empty">—</span></td>`;
      const safe = String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `<td>${safe}</td>`;
    }).join('') + '</tr>'
  ).join('');
  html += '</tbody>';
  document.getElementById('imp-preview-table').innerHTML = html;

  // Enable action button
  document.getElementById('imp-action').textContent = `Import ${items.length} Item${items.length !== 1 ? 's' : ''}`;
  document.getElementById('imp-action').disabled = items.length === 0;
}

async function runImport() {
  if (!_importParsed) return;
  const { parsed, activeSheet } = _importParsed;
  const data  = parsed[activeSheet];
  const items = data.items;
  const mode  = document.querySelector('input[name="imp-mode"]:checked').value;

  document.getElementById('imp-step-preview').classList.add('hidden');
  document.getElementById('imp-step-progress').classList.remove('hidden');
  document.getElementById('imp-action').disabled = true;
  document.getElementById('imp-cancel').disabled = true;
  document.getElementById('imp-error').textContent = '';

  const existingNos = new Set(allItems.map(i => i.no));
  let nextAutoNo    = allItems.reduce((max, i) => Math.max(max, i.no || 0), 0) + 1;

  let saved = 0, skipped = 0, failed = 0;
  const total  = items.length;
  const fill   = document.getElementById('imp-progress-fill');
  const ptxt   = document.getElementById('imp-progress-text');
  const psub   = document.getElementById('imp-progress-sub');

  for (let i = 0; i < items.length; i++) {
    const item = { ...items[i] };
    if (!item.no) item.no = nextAutoNo++;

    const exists = existingNos.has(item.no);
    fill.style.width = Math.round(((i + 1) / total) * 100) + '%';
    ptxt.textContent = `Saving item ${i + 1} of ${total}…`;

    try {
      if (exists) {
        if (mode === 'merge') {
          // Only send the fields that were actually present in the Excel sheet
          // (avoids clearing unrelated fields like PO data when importing a Commercial sheet)
          const update = { no: item.no };
          for (const field of Object.values(data.colMap)) {
            if (field !== 'no') update[field] = item[field];
          }
          await ProjectStore.saveItem(currentProjectId, update);
          const idx = allItems.findIndex(it => it.no === item.no);
          if (idx !== -1) allItems[idx] = { ...allItems[idx], ...update };
          saved++;
        } else {
          skipped++;
        }
      } else {
        await ProjectStore.addItem(currentProjectId, item);
        allItems.push(item);
        existingNos.add(item.no);
        nextAutoNo = Math.max(nextAutoNo, item.no + 1);
        saved++;
      }
    } catch (e) {
      console.warn(`Import failed on item #${item.no}:`, e.message);
      failed++;
    }
  }

  fill.style.width = '100%';
  ptxt.textContent = 'Import complete!';
  psub.textContent = `${saved} saved${skipped ? ', ' + skipped + ' skipped (already exist)' : ''}${failed ? ', ' + failed + ' failed' : ''}.`;

  buildTradeFilter();
  initCards(currentProjectMeta, allItems);
  applyFilters();

  document.getElementById('imp-cancel').disabled = false;
  document.getElementById('imp-cancel').textContent = 'Close';

  if (failed > 0) {
    document.getElementById('imp-error').textContent =
      `${failed} item(s) could not be saved — check the browser console for details.`;
  } else {
    setTimeout(closeImportModal, 1800);
  }
}

/* ==============================
   ITEM HISTORY MODAL
============================== */
const FIELD_LABELS = {
  trade:'Trade', scope:'Scope', budget:'Budget', remarks:'Remarks', notes:'Notes',
  endorsed_vendor:'Endorsed Vendor', endorsement_remarks:'Endorsement Remarks',
  endorsement_date:'Endorsement Date', endorsed_amount:'Endorsed Amount',
  savings_budget_endorsed:'Savings (Budget vs Endorsed)', vendor_timeline:"Vendor's Timeline",
  date_needed:'Date Needed On-Site', approved_vendor:'Approved Vendor', priority:'Priority',
  dp_required:'DP Required', downpayment:'Downpayment', progress_billing:'Progress Billing',
  upon_completion:'Upon Completion', awarded_vendor:'Awarded Vendor', pr_no:'PR No.',
  negotiated_proposal:'Negotiated Proposal', po_amount:'PO Amount', date_of_po:'Date of PO',
  po_no:'PO No.', date_issuance_po:'Date of Issuance of PO',
  savings_endorsed_po:'Savings (Endorsed vs PO)', po_remarks:'PO Remarks',
  invoice_no:'Invoice No.', invoice_date:'Invoice Date', rfp_no:'RFP No.',
  rfp_date:'RFP Date', date_submission_ap:'Date Submission for AP', rfp_amount:'RFP Amount',
  pt:'PT', conditions:'Conditions', due_date:'Due Date', final_remarks:'Final Remarks',
};

function fieldLabel(f) {
  return FIELD_LABELS[f] || f.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}

function histEsc(s) {
  return String(s == null ? '—' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderHistoryEntry(e) {
  const dt     = new Date(String(e.changed_at).replace(' ', 'T')).toLocaleString('en-US', {
    month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit'
  });
  const avatar = histEsc((e.username || '?')[0].toUpperCase());
  const ch     = e.changes || {};
  let body     = '';

  const noteHtml = ch._note
    ? `<div class="hist-note"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${histEsc(ch._note)}</div>`
    : '';

  if (e.action === 'update') {
    const rows = Object.entries(ch)
      .filter(([k, diff]) => {
        if (k === '_note') return false;  // rendered separately above
        // Skip malformed entries (old flat-value format: diff is not {old,new})
        if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return false;
        // Skip rows where both sides are empty — no real change to show
        const hasOld = diff.old != null && diff.old !== '';
        const hasNew = diff.new != null && diff.new !== '';
        return hasOld || hasNew;
      })
      .map(([f, diff]) => {
        const oldStr = (diff.old != null && diff.old !== '') ? String(diff.old) : null;
        const newStr = (diff.new != null && diff.new !== '') ? String(diff.new) : null;
        return `<div class="hist-diff-row">
          <div class="hist-diff-label">${histEsc(fieldLabel(f))}</div>
          <div class="hist-diff-values">
            <span class="hist-old-val${oldStr ? '' : ' hist-empty-val'}">${histEsc(oldStr ?? '(empty)')}</span>
            <span class="hist-arrow">→</span>
            <span class="hist-new-val${newStr ? '' : ' hist-empty-val'}">${histEsc(newStr ?? '(empty)')}</span>
          </div>
        </div>`;
      }).join('');
    body = rows ? `<div class="hist-diff">${rows}</div>` : '';
    if (noteHtml) body += noteHtml;
  } else if (ch.snapshot) {
    const entries = Object.entries(ch.snapshot)
      .filter(([, v]) => {
        if (v == null || v === '' || v === 0) return false;
        if (typeof v === 'string' && /^0+(\.0+)?$/.test(v.trim())) return false;
        return true;
      });
    const shown   = entries.slice(0, 8);
    const more    = entries.length - shown.length;
    const rows    = shown.map(([f, v]) => `<div class="hist-snap-row">
      <span class="hist-snap-key">${histEsc(fieldLabel(f))}</span>
      <span class="hist-snap-val">${histEsc(v)}</span>
    </div>`).join('');
    body = `<div class="hist-snapshot">${rows}${more > 0 ? `<div class="hist-more">+${more} more fields</div>` : ''}</div>`;
    if (noteHtml) body += noteHtml;
  }

  return `<div class="hist-entry ${e.action}">
    <div class="hist-dot"></div>
    <div class="hist-card">
      <div class="hist-card-head">
        <div class="hist-meta-row">
          <span class="hist-avatar">${avatar}</span>
          <span class="hist-action-badge ${e.action}">${e.action}</span>
          <span class="hist-username">${histEsc(e.username || '?')}</span>
          <span class="hist-date">${dt}</span>
        </div>
      </div>
      ${body}
    </div>
  </div>`;
}

async function openHistoryModal(itemNo) {
  const item  = allItems.find(i => i.no === itemNo);
  const label = item ? (item.scope || item.trade || `Item #${itemNo}`) : `Item #${itemNo}`;

  document.getElementById('history-title').textContent = `#${itemNo} — ${label}`;
  document.getElementById('history-body').innerHTML = '<div class="hist-loading">Loading history&hellip;</div>';
  document.getElementById('history-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  try {
    const rows = await ProjectStore._api({ action: 'get_item_history', project_id: currentProjectId, no: itemNo });
    if (!rows || rows.length === 0) {
      document.getElementById('history-body').innerHTML = '<div class="hist-empty">No changes recorded for this item yet.</div>';
      return;
    }
    document.getElementById('history-body').innerHTML =
      `<div class="hist-timeline">${rows.map(renderHistoryEntry).join('')}</div>`;
  } catch (err) {
    document.getElementById('history-body').innerHTML = `<div class="hist-error">Failed to load history: ${histEsc(err.message)}</div>`;
  }
}

function closeHistoryModal() {
  document.getElementById('history-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

/* ==============================
   EVENT LISTENERS
============================== */
document.addEventListener('DOMContentLoaded', async () => {
  // Auth check — redirects to login if session invalid
  const user = await Auth.init();
  if (!user) return;

  // Role-based UI: hide write controls for viewers
  if (!Auth.can('edit')) {
    document.getElementById('add-item-btn').style.display = 'none';
    document.getElementById('import-btn').style.display   = 'none';
  }
  // Hide bulk delete for viewers (editors and admins can delete items)
  if (!Auth.can('edit')) {
    const delBtn = document.querySelector('.bulk-btn-danger');
    if (delBtn) delBtn.style.display = 'none';
  }

  /* rest of the original DOMContentLoaded body below */
  _appInit();
});

function _appInit() {
  renderTableHead();
  loadData();

  // Team switcher
  document.querySelectorAll('.team-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTeam(btn.dataset.team));
  });

  // Search
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    applyFilters();
  });

  // Filters
  document.getElementById('trade-filter').addEventListener('change', e => {
    tradeFilter = e.target.value;
    applyFilters();
    savePrefs();
  });

  document.getElementById('status-filter').addEventListener('change', e => {
    statusFilter = e.target.value;
    applyFilters();
    savePrefs();
  });

  // Sub-tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      applyFilters();
      savePrefs();
    });
  });

  // Export
  document.getElementById('export-btn').addEventListener('click', exportExcel);

  // Checkbox: select-all — selects/clears all filtered items across all pages
  document.getElementById('table-head').addEventListener('change', e => {
    if (e.target.id !== 'cb-all') return;
    if (e.target.checked) filteredItems.forEach(i => selectedItems.add(i.no));
    else selectedItems.clear();
    renderTable();
    renderPagination();
  });


  // Checkbox: individual row selection (event delegation on tbody)
  document.getElementById('items-tbody').addEventListener('change', e => {
    const cb = e.target;
    if (!cb.classList.contains('row-cb')) return;
    const no = parseInt(cb.dataset.no, 10);
    if (cb.checked) selectedItems.add(no);
    else selectedItems.delete(no);
    updateSelectAllState();
    updateBulkBar();
  });

  // Detail / edit modal — only close on backdrop click, not on drag-select ending outside
  let modalOverlayMouseDownTarget = null;
  document.getElementById('modal-overlay').addEventListener('mousedown', e => {
    modalOverlayMouseDownTarget = e.target;
  });
  document.getElementById('modal-overlay').addEventListener('click', e => {
    const sel = window.getSelection && window.getSelection().toString().length > 0;
    if (!sel && e.target === e.currentTarget && modalOverlayMouseDownTarget === e.currentTarget) closeModal();
    modalOverlayMouseDownTarget = null;
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('modal-save-btn').addEventListener('click', saveModalEdit);
  document.getElementById('modal-dup-btn').addEventListener('click', () => duplicateItem(editingItemNo));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeAddItemModal();
      closeHistoryModal();
      // Block closing the import modal while an import is actively running
      // (cancel button is disabled + progress step is visible during import)
      const cancelBtn  = document.getElementById('imp-cancel');
      const inProgress = !document.getElementById('imp-step-progress').classList.contains('hidden')
                         && cancelBtn && cancelBtn.disabled;
      if (!inProgress) closeImportModal();
    }
    // Focus search with /
    if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey &&
        !e.target.matches('input, textarea, select')) {
      e.preventDefault();
      const s = document.getElementById('search-input');
      s.focus(); s.select();
    }
    // Open Add Item with N (when no modal is open and user has edit permission)
    if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.altKey && !e.metaKey &&
        !e.target.matches('input, textarea, select') &&
        !document.getElementById('modal-overlay').classList.contains('open') &&
        !document.getElementById('add-item-overlay').classList.contains('open') &&
        !document.getElementById('import-overlay').classList.contains('open') &&
        !document.getElementById('history-overlay').classList.contains('open') &&
        Auth.can('edit')) {
      openAddItemModal();
    }
    // Ctrl+Enter saves whichever modal is currently open
    if ((e.key === 'Enter') && (e.ctrlKey || e.metaKey)) {
      if (document.getElementById('modal-overlay').classList.contains('open')) {
        e.preventDefault();
        saveModalEdit();
      } else if (document.getElementById('add-item-overlay').classList.contains('open')) {
        e.preventDefault();
        saveNewItem();
      }
    }
  });

  // Add Item modal
  document.getElementById('add-item-btn').addEventListener('click', openAddItemModal);
  document.getElementById('ai-close').addEventListener('click', closeAddItemModal);
  document.getElementById('ai-cancel').addEventListener('click', closeAddItemModal);
  document.getElementById('ai-save').addEventListener('click', saveNewItem);
  let addOverlayMouseDownTarget = null;
  document.getElementById('add-item-overlay').addEventListener('mousedown', e => {
    addOverlayMouseDownTarget = e.target;
  });
  document.getElementById('add-item-overlay').addEventListener('click', e => {
    const sel = window.getSelection && window.getSelection().toString().length > 0;
    if (!sel && e.target === e.currentTarget && addOverlayMouseDownTarget === e.currentTarget) closeAddItemModal();
    addOverlayMouseDownTarget = null;
  });

  // Clear
  document.getElementById('clear-filters').addEventListener('click', () => {
    searchQuery  = '';
    tradeFilter  = '';
    statusFilter = '';
    activeTab    = 'all';
    currentPage  = 1;
    document.getElementById('search-input').value  = '';
    document.getElementById('trade-filter').value  = '';
    document.getElementById('status-filter').value = '';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-tab="all"]').classList.add('active');
    applyFilters();
    savePrefs();
  });

  // Cell overflow tooltip
  const cellTip  = document.getElementById('cell-tooltip');
  const tableEl  = document.getElementById('main-table');

  tableEl.addEventListener('mouseover', e => {
    const td = e.target.closest('tbody td');
    if (!td || !td.dataset.val) { cellTip.style.display = 'none'; return; }
    // Only show if content is actually clipped
    const inner = td.querySelector('.scope-text, .timeline-text') || td;
    if (inner.scrollWidth <= inner.clientWidth + 2) { cellTip.style.display = 'none'; return; }
    cellTip.textContent = td.dataset.val;
    cellTip.style.display = 'block';
  });

  tableEl.addEventListener('mousemove', e => {
    if (cellTip.style.display === 'none') return;
    const gap = 14;
    const tw  = cellTip.offsetWidth;
    const th  = cellTip.offsetHeight;
    const x   = e.clientX + gap + tw > window.innerWidth  ? e.clientX - tw - gap : e.clientX + gap;
    const y   = e.clientY + gap + th > window.innerHeight ? e.clientY - th - gap : e.clientY + gap;
    cellTip.style.left = x + 'px';
    cellTip.style.top  = y + 'px';
  });

  tableEl.addEventListener('mouseout', e => {
    if (!e.relatedTarget || !e.relatedTarget.closest('tbody td')) {
      cellTip.style.display = 'none';
    }
  });

  document.querySelector('.table-wrap').addEventListener('scroll', () => {
    cellTip.style.display = 'none';
  });

  // ── Import Excel ──────────────────────────────────────────────
  document.getElementById('import-btn').addEventListener('click', openImportModal);
  document.getElementById('imp-close').addEventListener('click', closeImportModal);
  document.getElementById('imp-cancel').addEventListener('click', closeImportModal);
  document.getElementById('imp-action').addEventListener('click', runImport);

  // Close on backdrop click
  let impOverlayDown = null;
  document.getElementById('import-overlay').addEventListener('mousedown', e => { impOverlayDown = e.target; });
  document.getElementById('import-overlay').addEventListener('click', e => {
    const sel = window.getSelection && window.getSelection().toString().length > 0;
    if (!sel && e.target === e.currentTarget && impOverlayDown === e.currentTarget) closeImportModal();
    impOverlayDown = null;
  });

  // Sheet selector change
  document.getElementById('imp-sheet-select').addEventListener('change', e => {
    if (_importParsed) { _importParsed.activeSheet = e.target.value; _renderImportPreview(); }
  });

  // "Choose different file" link
  document.getElementById('imp-reselect').addEventListener('click', () => {
    _importParsed = null;
    document.getElementById('imp-step-preview').classList.add('hidden');
    document.getElementById('imp-step-upload').classList.remove('hidden');
    document.getElementById('imp-action').disabled = true;
    document.getElementById('imp-action').textContent = 'Select a file first';
    document.getElementById('imp-error').textContent = '';
    document.getElementById('imp-file-input').value = '';
    document.getElementById('imp-dz-sub').textContent = 'or click to browse  (.xlsx / .xls)';
    document.getElementById('imp-dropzone').classList.remove('drag-over');
  });

  // File input — guard prevents the programmatic .click() from bubbling back
  const impFileInput = document.getElementById('imp-file-input');
  document.getElementById('imp-dropzone').addEventListener('click', e => {
    if (e.target === impFileInput) return;
    impFileInput.click();
  });
  impFileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleImportFile(e.target.files[0]);
  });

  // Drag-and-drop
  const dz = document.getElementById('imp-dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over'); });
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleImportFile(file);
  });

  // History modal close
  document.getElementById('history-close').addEventListener('click', closeHistoryModal);
  document.getElementById('history-close-btn').addEventListener('click', closeHistoryModal);
  document.getElementById('history-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeHistoryModal();
  });

  // Summary card click → filter table
  document.querySelectorAll('.summary-card[data-filter-tab]').forEach(card => {
    card.addEventListener('click', () => {
      activeTab = card.dataset.filterTab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const tabBtn = document.querySelector(`[data-tab="${activeTab}"]`);
      if (tabBtn) tabBtn.classList.add('active');
      applyFilters();
      savePrefs();
    });
  });
  document.querySelectorAll('.summary-card[data-filter-status]').forEach(card => {
    card.addEventListener('click', () => {
      statusFilter = card.dataset.filterStatus;
      activeTab = 'all';
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('[data-tab="all"]').classList.add('active');
      document.getElementById('status-filter').value = statusFilter;
      applyFilters();
      savePrefs();
    });
  });
}
