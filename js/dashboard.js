'use strict';

/* ============================================================
   Dashboard page — fully dynamic, driven by ProjectStore
============================================================ */

const RING_CIRC = 301.6;  // 2 * π * 48

function pct(part, whole) {
  if (!whole || whole === 0) return 0;
  return Math.min(100, (part / whole) * 100);
}

function fmtPct(n) {
  return n.toFixed(1) + '%';
}

function dashoffset(fraction) {
  return (RING_CIRC * (1 - fraction)).toFixed(1);
}

function peso(n) {
  if (!n && n !== 0) return '—';
  return '₱ ' + new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

/* Deterministic mini sparkline SVG seeded by a number value */
function sparkline(seed, color, w, h, pts) {
  w = w || 72; h = h || 24; pts = pts || 8;
  let s = Math.abs(Math.round(seed)) % 99991 || 7;
  const vals = [];
  for (let i = 0; i < pts; i++) { s = (s * 9301 + 49297) % 233280; vals.push(s / 233280); }
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const norm = vals.map(v => mx === mn ? 0.5 : 0.1 + (v - mn) / (mx - mn) * 0.8);
  const xs = norm.map((_, i) => +(i / (pts - 1) * w).toFixed(1));
  const ys = norm.map(v => +(h - v * h).toFixed(1));
  let d = `M${xs[0]},${ys[0]}`;
  for (let i = 1; i < pts; i++) {
    const cx = +((xs[i] + xs[i - 1]) / 2).toFixed(1);
    d += ` C${cx},${ys[i - 1]} ${cx},${ys[i]} ${xs[i]},${ys[i]}`;
  }
  const area = `${d} L${xs[pts - 1]},${h} L${xs[0]},${h} Z`;
  return `<svg class="db-sparkline" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${area}" fill="${color}" fill-opacity="0.18" stroke="none"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`;
}

function fmtDateOnSite(s) {
  if (!s) return '—';
  let d;
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) d = new Date(+m[3], +m[1] - 1, +m[2]);
  else d = new Date(s);
  if (isNaN(d)) return String(s);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

/* ── Build KPI ring HTML ── */
function ringCard(val, subVal, subLabel, color, label, sub, href) {
  const frac = subVal != null ? subVal : 1;
  const tag  = href ? 'a' : 'div';
  const attr = href ? ` href="${href}" class="db-kpi-card"` : ` class="db-kpi-card"`;
  return `
    <${tag}${attr}>
      <div class="db-ring-wrap">
        <svg class="db-ring" viewBox="0 0 120 120">
          <circle class="ring-bg" cx="60" cy="60" r="48"/>
          <circle class="ring-fill" cx="60" cy="60" r="48"
            stroke="${color}"
            stroke-dasharray="${RING_CIRC}"
            stroke-dashoffset="${dashoffset(frac)}"/>
        </svg>
        <div class="db-ring-inner">
          <div class="db-ring-val">${val}</div>
          <div class="db-ring-sub">${subLabel}</div>
        </div>
      </div>
      <div class="db-kpi-label">${label}</div>
      <div class="db-kpi-sub">${sub}</div>
    </${tag}>`;
}

/* ── Render Row A endorsement grid ── */
function renderEndorseGrid(stats) {
  const forEnd       = stats.for_endorsement_count || 0;
  const endorsed     = stats.endorsed_count || 0;
  const balanceCount = Math.max(0, forEnd - endorsed);
  const endorsedPct  = pct(endorsed, forEnd);
  const balancePct   = pct(balanceCount, forEnd);

  return `
    <div class="db-endorse-item">
      <div class="db-e-val">${stats.total_items}</div>
      <div class="db-e-lbl">Total Number of Items</div>
      <div class="db-e-foot">
        <div class="db-e-sub" style="color:#f59e0b;">All project items</div>
        <div class="db-e-bar" style="--pct:100%; --clr:#f59e0b;"></div>
      </div>
    </div>
    <div class="db-endorse-item">
      <div class="db-e-val">${forEnd}</div>
      <div class="db-e-lbl">For Endorsement</div>
      <div class="db-e-foot">
        <div class="db-e-sub" style="color:#fbbf24;">100% of items</div>
        <div class="db-e-bar" style="--pct:100%; --clr:#fbbf24;"></div>
      </div>
    </div>
    <div class="db-endorse-item">
      <div class="db-e-val success">${endorsed}</div>
      <div class="db-e-lbl">Total Endorsed</div>
      <div class="db-e-foot">
        <div class="db-e-sub" style="color:#34d399;">${endorsedPct.toFixed(1)}% complete</div>
        <div class="db-e-bar" style="--pct:${endorsedPct.toFixed(1)}%; --clr:#34d399;"></div>
      </div>
    </div>
    <div class="db-endorse-item">
      <div class="db-e-val muted">${balanceCount}</div>
      <div class="db-e-lbl">Balance for Endorsement</div>
      <div class="db-e-foot">
        <div class="db-e-sub" style="color:#94a3b8;">${balancePct.toFixed(1)}% remaining</div>
        <div class="db-e-bar" style="--pct:${balancePct.toFixed(1)}%; --clr:#94a3b8;"></div>
      </div>
    </div>`;
}

/* ── Render Row B KPI rings ── */
function renderKpiRings(stats, projId) {
  const forEnd        = stats.for_endorsement_count || 0;
  const endorsed      = stats.endorsed_count || 0;
  const endorsedFrac  = forEnd > 0 ? endorsed / forEnd : 0;
  const poFrac        = endorsed > 0 ? stats.with_po_count / endorsed : 0;
  const llFrac        = stats.total_items > 0 ? stats.long_lead_count / stats.total_items : 0;
  const nocommCount   = stats.no_commercial_endorsement || 0;
  const nocommFrac    = stats.total_items > 0 ? nocommCount / stats.total_items : 0;
  const balanceCount  = Math.max(0, forEnd - endorsed);
  const balanceFrac   = forEnd > 0 ? balanceCount / forEnd : 0;
  const base          = projId ? `index.html?id=${projId}&tab=` : null;

  return [
    ringCard(stats.total_items, 1, 'Total', '#f59e0b', 'Total Line Items', 'Tracked in project', base && base + 'all'),
    ringCard(endorsed, endorsedFrac, fmtPct(endorsedFrac * 100), '#34d399', 'Items Endorsed', `of ${forEnd} for endorsement`, base && base + 'endorsed'),
    ringCard(stats.with_po_count, poFrac, fmtPct(poFrac * 100), '#60a5fa', 'With P.O.', `of ${endorsed} endorsed`, base && base + 'with-po'),
    ringCard(nocommCount, nocommFrac, fmtPct(nocommFrac * 100), '#c084fc', 'No Commercial End.', 'No endorsement needed', base && base + 'all'),
    ringCard(stats.long_lead_count, llFrac, fmtPct(llFrac * 100), '#f87171', 'Long Lead Items', 'Flagged for priority', base && base + 'long-lead'),
    ringCard(balanceCount, balanceFrac, fmtPct(balanceFrac * 100), '#94a3b8', 'Balance (Endorsement)', 'Remaining to endorse', base && base + 'pending'),
  ].join('');
}

/* ── Render Row C financial bars ── */
function renderFinanceBars(stats) {
  const b = stats.budget || 0;
  const e = stats.total_endorsed || 0;
  const p = stats.total_po || 0;
  const s = stats.total_savings || 0;
  const bal = stats.balance || 0;

  function bar(label, val, color, widthPct, cls) {
    const w = Math.max(0, Math.min(100, widthPct));
    return `
      <div class="db-fbar-row">
        <div class="db-fbar-label">${label}</div>
        <div class="db-fbar-track">
          <div class="db-fbar-fill" style="width:${w.toFixed(2)}%; background:${color}; min-width:${w > 0 ? '4px' : '0'};"></div>
        </div>
        <div class="db-fbar-val${cls ? ' ' + cls : ''}">${peso(val)}</div>
      </div>`;
  }

  return [
    bar('Total Budget',     b,   '#3b82f6', 100,               ''),
    bar('Endorsed Amount',  e,   '#f59e0b', pct(e, b),         ''),
    bar('PO Amount',        p,   '#ef4444', pct(p, b),         ''),
    bar('Savings (E vs PO)',s,   '#34d399', pct(s, b),         'success'),
    bar('Balance (Budget)', bal, '#94a3b8', pct(bal, b),       'muted'),
  ].join('');
}

function _esc(s) {
  return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
}

/* ── Render Row C long lead items ── */
function renderLongLeadItems(items) {
  if (!items || items.length === 0) {
    return '<div style="padding:1.5rem;color:var(--text-light);font-style:italic;font-size:.85rem;">No long lead items flagged.</div>';
  }

  return items.map(item => {
    const endorsed  = item.endorsed_amount  || 0;
    const budget    = item.budget           || 0;
    const po        = item.po_amount        || 0;
    const overClass = budget > 0 && endorsed > budget ? ' over' : '';
    const priorityRaw = (item.priority || 'high').toLowerCase();
    const safePriorityCls = priorityRaw.replace(/[^a-z]/g, '');

    return `
      <div class="db-ll-item">
        <div class="db-ll-no">${item.no}</div>
        <div class="db-ll-info">
          <div class="db-ll-trade">${_esc(item.trade) || '—'}</div>
          <div class="db-ll-scope">${_esc(item.scope) || '—'}</div>
          <div class="db-ll-meta">
            ${item.awarded_vendor || item.endorsed_vendor
              ? `<span class="db-ll-vendor">${_esc(item.awarded_vendor || item.endorsed_vendor)}</span><span class="db-ll-sep">·</span>`
              : ''}
            ${item.po_no
              ? `<span class="db-ll-po">PO# ${_esc(item.po_no)}</span><span class="db-ll-sep">·</span>`
              : ''}
            ${item.date_needed
              ? `<span class="db-ll-date">On Site: <strong>${fmtDateOnSite(item.date_needed)}</strong></span>`
              : ''}
          </div>
        </div>
        <div class="db-ll-amounts">
          <div class="db-ll-amt-row">
            <span class="db-ll-amt-lbl">Budget</span>
            <span class="db-ll-amt-val">${peso(budget)}</span>
          </div>
          <div class="db-ll-amt-row">
            <span class="db-ll-amt-lbl">Endorsed</span>
            <span class="db-ll-amt-val endorsed${overClass}">${peso(endorsed)}</span>
          </div>
          <div class="db-ll-amt-row">
            <span class="db-ll-amt-lbl">PO Amount</span>
            <span class="db-ll-amt-val po">${peso(po)}</span>
          </div>
        </div>
        <span class="db-ll-priority ${safePriorityCls}">${_esc((item.priority || 'HIGH').toUpperCase())}</span>
      </div>`;
  }).join('');
}

/* ── Render Row D savings table rows ── */
function renderSavingsTable(stats) {
  const items = stats.long_lead_items || [];
  if (items.length === 0) {
    return {
      rows: '<tr><td colspan="8" style="text-align:center;padding:1.5rem;color:var(--text-light);font-style:italic;">No long lead items found.</td></tr>',
      totals: '',
    };
  }

  function savingsClass(val) {
    if (val > 0) return ' pos';
    if (val < 0) return ' neg';
    return '';
  }

  function fmtSavings(val) {
    if (val < 0) return `(${peso(Math.abs(val)).replace('₱ ', '')})`;
    return peso(val);
  }

  const rows = items.map(item => {
    const budget   = item.budget          || 0;
    const endorsed = item.endorsed_amount  || 0;
    const po       = item.po_amount        || 0;
    const savBvsE  = item.savings_budget_endorsed != null ? item.savings_budget_endorsed : (budget - endorsed);
    const savEvsP  = item.savings_endorsed_po    != null ? item.savings_endorsed_po    : (endorsed - po);
    const overClass = budget > 0 && endorsed > budget ? ' over' : '';

    return `
      <tr>
        <td class="num">${item.no}</td>
        <td>${_esc(item.trade) || '—'}</td>
        <td><strong>${_esc(item.awarded_vendor || item.endorsed_vendor) || '—'}</strong></td>
        <td class="amt">${peso(budget)}</td>
        <td class="amt${overClass}">${peso(endorsed)}</td>
        <td class="amt${savingsClass(savBvsE)}">${fmtSavings(savBvsE)}</td>
        <td class="amt">${peso(po)}</td>
        <td class="amt${savingsClass(savEvsP)}">${fmtSavings(savEvsP)}</td>
      </tr>`;
  }).join('');

  const totalBudget   = items.reduce((s, i) => s + (i.budget || 0), 0);
  const totalEndorsed = items.reduce((s, i) => s + (i.endorsed_amount || 0), 0);
  const totalPO       = items.reduce((s, i) => s + (i.po_amount || 0), 0);
  const totalSavBvsE  = totalBudget - totalEndorsed;
  const totalSavEvsP  = totalEndorsed - totalPO;

  const totals = `
    <tr class="db-total-row">
      <td colspan="3"><strong>TOTALS</strong></td>
      <td class="amt"><strong>${peso(totalBudget)}</strong></td>
      <td class="amt"><strong>${peso(totalEndorsed)}</strong></td>
      <td class="amt${savingsClass(totalSavBvsE)}"><strong>${fmtSavings(totalSavBvsE)}</strong></td>
      <td class="amt"><strong>${peso(totalPO)}</strong></td>
      <td class="amt${savingsClass(totalSavEvsP)}"><strong>${fmtSavings(totalSavEvsP)}</strong></td>
    </tr>`;

  return { rows, totals };
}

/* ── Main initializer ── */
async function initDashboard() {
  const user = await Auth.init();
  if (!user) return;

  document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });

  const id = ProjectStore.getUrlId();
  document.getElementById('db-tracker-link').href = 'index.html?id=' + id;

  let proj, stats;
  try {
    const data = await ProjectStore.load(id);
    proj  = data.project || {};
    stats = ProjectStore.computeStats(data);
  } catch (e) {
    console.error('Dashboard: failed to load project', e);
    document.getElementById('db-proj-name').textContent = 'Error loading project';
    return;
  }

  /* Header + identity card */
  document.getElementById('db-proj-name').textContent     = proj.name || 'Project';
  document.getElementById('db-proj-code').textContent     = proj.code || '';
  document.getElementById('db-identity-name').textContent = proj.name || 'Project';
  document.getElementById('db-identity-code').textContent = proj.code || '';

  /* ── Identity card meta section ── */
  const statusInfo = ProjectStore.STATUS_MAP[proj.status] || ProjectStore.STATUS_MAP['active'];
  const statusBadge = document.getElementById('db-id-status');
  statusBadge.textContent = statusInfo.label;
  statusBadge.style.background = statusInfo.bg;
  statusBadge.style.color = statusInfo.color;

  const clientEl = document.getElementById('db-id-client');
  if (proj.client) { clientEl.textContent = proj.client; }
  else { clientEl.style.display = 'none'; }

  const startEl = document.getElementById('db-id-start');
  if (proj.start_date) {
    startEl.textContent = 'Since ' + new Date(proj.start_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  }

  const budgetAmt  = parseFloat(proj.total_budget) || 0;
  const budgetPct  = budgetAmt > 0 ? Math.min(100, Math.round((stats.total_endorsed / budgetAmt) * 100)) : 0;
  if (budgetAmt > 0) {
    document.getElementById('db-id-budget-pct').textContent  = budgetPct + '%';
    document.getElementById('db-id-budget-fill').style.width = budgetPct + '%';
  } else {
    document.getElementById('db-id-budget-wrap').style.display = 'none';
  }

  /* ── Row A: Identity stats ── */
  document.getElementById('db-stat-po-count').textContent    = stats.with_po_count;
  document.getElementById('db-stat-end-count').textContent   = stats.endorsed_count;
  const nocomm = stats.no_commercial_endorsement || 0;
  document.getElementById('db-stat-nocomm').textContent      = nocomm;

  /* ── Row A: Endorsement panel ── */
  document.getElementById('db-endorse-grid').innerHTML = renderEndorseGrid(stats);

  /* ── Row A: Amount panel ── */
  const budget    = stats.budget || 0;
  const endorsed  = stats.total_endorsed || 0;
  const balance   = stats.balance || 0;
  const utilPct   = pct(endorsed, budget);

  document.getElementById('db-amt-budget').textContent   = peso(budget);
  document.getElementById('db-amt-endorsed').textContent = peso(endorsed);
  document.getElementById('db-amt-balance').textContent  = peso(balance);
  document.getElementById('db-util-pct').textContent     = fmtPct(utilPct);
  document.getElementById('db-util-fill').style.width    = utilPct.toFixed(1) + '%';

  document.getElementById('db-amt-item-budget').insertAdjacentHTML('beforeend',   sparkline(budget,               '#3b82f6'));
  document.getElementById('db-amt-item-endorsed').insertAdjacentHTML('beforeend', sparkline(endorsed + 5,         '#1d4ed8'));
  document.getElementById('db-amt-item-balance').insertAdjacentHTML('beforeend',  sparkline(Math.abs(balance) + 9,'#94a3b8'));

  /* ── Row A: PO panel ── */
  const totalPO      = stats.total_po || 0;
  const totalSavings = stats.total_savings || 0;
  const poPct        = pct(totalPO, endorsed);

  document.getElementById('db-po-amt').textContent     = peso(totalPO);
  document.getElementById('db-savings-amt').textContent = peso(totalSavings);
  document.getElementById('db-po-pct').textContent     = fmtPct(poPct);
  document.getElementById('db-po-fill').style.width    = poPct.toFixed(1) + '%';

  document.getElementById('db-po-item-total').insertAdjacentHTML('beforeend',   sparkline(totalPO + 2,       '#ef4444'));
  document.getElementById('db-po-item-savings').insertAdjacentHTML('beforeend', sparkline(totalSavings + 11, '#34d399'));

  /* ── Row B: KPI rings ── */
  document.getElementById('db-kpi-row').innerHTML = renderKpiRings(stats, id);

  /* ── Row C: Financial bars ── */
  document.getElementById('db-finance-bars').innerHTML = renderFinanceBars(stats);

  /* ── Row C: Long lead items ── */
  document.getElementById('db-ll-list').innerHTML = renderLongLeadItems(stats.long_lead_items || []);

  /* ── Row D: Savings table ── */
  const { rows, totals } = renderSavingsTable(stats);
  document.getElementById('db-savings-tbody').innerHTML = rows + totals;

  /* ── Footer ── */
  document.getElementById('db-footer-proj').textContent = (proj.name || 'Project') + ' — Executive Dashboard';
}

document.addEventListener('DOMContentLoaded', initDashboard);
