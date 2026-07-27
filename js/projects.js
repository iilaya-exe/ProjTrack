'use strict';

/* ============================================================
   Projects page — list, create, edit, delete projects
   All data operations go through ProjectStore (async API).
============================================================ */

let pendingDeleteId  = null;
let editingId        = null;
let selectedColor    = 0;
let cachedProjects   = [];
let _projUploadItems = null;

/* ── Helpers ── */
const fmtM = (n) => {
  if (!n || n === 0) return '—';
  return '₱ ' + new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(n);
};

/* ── Excel parsing (mirrors the import pipeline in app.js) ── */
function _impNorm(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^a-z0-9 '#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function _parseRowData(rows) {
  if (!rows || rows.length < 2) return null;

  let headerIdx = -1, bestScore = 0;
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    let score = 0;
    for (const cell of rows[r]) {
      if (IMP_HDR_MAP[_impNorm(cell)]) score++;
    }
    if (score > bestScore) { bestScore = score; headerIdx = r; }
  }
  if (headerIdx === -1 || bestScore < 1) return null;

  const colMap = {};
  const usedFields = new Set();
  rows[headerIdx].forEach((h, ci) => {
    const field = IMP_HDR_MAP[_impNorm(h)];
    if (field && !usedFields.has(field)) { colMap[ci] = field; usedFields.add(field); }
  });
  if (Object.keys(colMap).length === 0) return null;

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

    if (!item.savings_budget_endorsed && item.budget && item.endorsed_amount)
      item.savings_budget_endorsed = item.budget - item.endorsed_amount;
    if (!item.savings_endorsed_po && item.endorsed_amount && item.po_amount)
      item.savings_endorsed_po = item.endorsed_amount - item.po_amount;

    items.push(item);
  }

  return items.length ? { items, colMap } : null;
}

/* ── Upload zone state ── */
function _projResetUpload() {
  _projUploadItems = null;
  const idle = document.getElementById('proj-dz-idle');
  const done = document.getElementById('proj-dz-done');
  if (idle) idle.classList.remove('hidden');
  if (done) done.classList.add('hidden');
  const sub = document.getElementById('proj-dz-sub');
  if (sub) sub.textContent = 'or click to browse · .xlsx / .xls';
  const fi = document.getElementById('proj-file-input');
  if (fi) fi.value = '';
  const dz = document.getElementById('proj-dropzone');
  if (dz) dz.classList.remove('drag-over');
}

async function _projHandleFile(file) {
  if (!file) return;
  const sub  = document.getElementById('proj-dz-sub');
  const idle = document.getElementById('proj-dz-idle');
  const done = document.getElementById('proj-dz-done');

  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    sub.textContent = 'Please select an .xlsx or .xls file.';
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    sub.textContent = 'File is too large (max 15 MB).';
    return;
  }

  sub.textContent = `Reading ${file.name}…`;

  try {
    const buffer = await file.arrayBuffer();

    // Offload XLSX.read + sheet_to_json to a worker so the main thread stays responsive
    const sheets = await new Promise((resolve, reject) => {
      const worker = new Worker('js/proj-upload-worker.js');
      worker.onmessage = (e) => {
        worker.terminate();
        if (e.data.ok) resolve(e.data.sheets);
        else reject(new Error(e.data.error));
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message || 'Worker parse error'));
      };
      worker.postMessage(buffer, [buffer]); // transfer ownership — zero copy
    });

    let bestResult = null;
    for (const { name, rows } of sheets) {
      const result = _parseRowData(rows);
      if (result && result.items.length > 0) {
        if (!bestResult || result.items.length > bestResult.items.length) {
          bestResult = { ...result, sheetName: name };
        }
      }
    }

    if (!bestResult) {
      sub.textContent = 'No recognisable item data found. Try another file.';
      document.getElementById('proj-file-input').value = '';
      return;
    }

    let maxNo = bestResult.items.reduce((m, i) => Math.max(m, i.no || 0), 0);
    bestResult.items.forEach(item => { if (!item.no) item.no = ++maxNo; });

    _projUploadItems = bestResult.items;

    idle.classList.add('hidden');
    done.classList.remove('hidden');
    document.getElementById('proj-dz-info').textContent =
      `${_projUploadItems.length} item${_projUploadItems.length !== 1 ? 's' : ''} from “${bestResult.sheetName}”`;

  } catch (e) {
    sub.textContent = 'Could not read file: ' + e.message;
    document.getElementById('proj-file-input').value = '';
  }
}

/* ── Init ── */
async function init() {
  const user = await Auth.init();
  if (!user) return;

  document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });

  // Audit log visible to editors and admins; Users button is admin-only
  if (Auth.can('edit')) {
    document.getElementById('audit-log-link').style.display = '';
  }
  if (Auth.can('admin')) {
    document.getElementById('users-btn').style.display = '';
  }
  // Editors and admins can create / edit projects; only admins can delete
  if (!Auth.can('edit')) {
    const btn = document.getElementById('add-project-btn');
    if (btn) btn.style.display = 'none';
  }

  await renderGrid();
  buildColorPicker();
  bindEvents();
}

/* ── Render project grid ── */
async function renderGrid() {
  const grid = document.getElementById('project-grid');
  grid.innerHTML = `
    <div class="proj-loading">
      <div class="proj-spinner"></div>
      Loading projects&hellip;
    </div>`;

  try {
    cachedProjects = await ProjectStore.getAllProjects();
  } catch (e) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--danger);font-size:.9rem;">
        Could not load projects: ${e.message}
      </div>`;
    return;
  }

  let html = '';
  cachedProjects.forEach(proj => {
    html += projectCard(proj);
  });

  if (Auth.can('edit')) {
    html += `
    <div class="proj-card proj-add-card" id="add-card" role="button" tabindex="0" aria-label="Add new project">
      <div class="proj-add-inner">
        <div class="proj-add-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <div class="proj-add-label">Add New Project</div>
        <div class="proj-add-sub">Create a new project to track</div>
      </div>
    </div>`;
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.proj-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openDeleteModal(btn.dataset.id, btn.dataset.name);
    });
  });
  grid.querySelectorAll('.proj-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openEditModal(btn.dataset.id);
    });
  });

  const addCard = document.getElementById('add-card');
  if (addCard) {
    addCard.addEventListener('click', openAddModal);
    addCard.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') openAddModal();
    });
  }
}

/* ── Single project card HTML ── */
function projectCard(proj) {
  const { id, name, code, client, status, budget, colorIndex, startDate, createdAt, notes, stats } = proj;

  const palette = ProjectStore.PALETTE[colorIndex % ProjectStore.PALETTE.length];
  const accent  = palette.accent;
  const light   = palette.light;
  const sm      = ProjectStore.STATUS_MAP[status] || ProjectStore.STATUS_MAP['active'];

  const budgetDisplay   = budget ? fmtM(budget)               : '—';
  const endorsedDisplay = stats  ? fmtM(stats.total_endorsed)  : '—';
  const poDisplay       = stats  ? fmtM(stats.total_po)        : '—';

  const endorsePct = stats && stats.total_items > 0 ? Math.min(100, Math.round(stats.endorsed_count / stats.total_items * 100)) : 0;
  const poPct      = stats && stats.total_items > 0 ? Math.min(100, Math.round(stats.with_po_count   / stats.total_items * 100)) : 0;
  const budgetPct  = budget && stats               ? Math.min(100, Math.round(stats.total_endorsed  / budget            * 100)) : 0;

  const progressHtml = stats ? `
    <div class="proj-progress">
      <div class="proj-prog-item">
        <div class="proj-prog-hd">
          <span class="proj-prog-lbl">Endorsed</span>
          <span class="proj-prog-frac">${stats.endorsed_count} / ${stats.total_items}</span>
        </div>
        <div class="proj-prog-track">
          <div class="proj-prog-fill endorse" style="width:${endorsePct}%"></div>
        </div>
      </div>
      <div class="proj-prog-item">
        <div class="proj-prog-hd">
          <span class="proj-prog-lbl">With P.O.</span>
          <span class="proj-prog-frac">${stats.with_po_count} / ${stats.total_items}</span>
        </div>
        <div class="proj-prog-track">
          <div class="proj-prog-fill po" style="width:${poPct}%"></div>
        </div>
      </div>
      ${budget ? `
      <div class="proj-prog-item">
        <div class="proj-prog-hd">
          <span class="proj-prog-lbl">Budget Used</span>
          <span class="proj-prog-frac">${budgetPct}%</span>
        </div>
        <div class="proj-prog-track">
          <div class="proj-prog-fill budget" style="width:${budgetPct}%"></div>
        </div>
      </div>` : ''}
    </div>` : '';

  const auditStatHtml = stats && Auth.can('edit') ? `
      <div class="proj-stat-div"></div>
      <div class="proj-stat">
        <a href="audit.html?project_id=${id}" class="ps-audit-link" title="View audit log for this project">
          <span class="ps-num">${stats.audit_count || 0}</span>
          <span class="ps-lbl">Changes</span>
        </a>
      </div>` : '';

  const statsHtml = stats ? `
    <div class="proj-stat-row">
      <div class="proj-stat"><span class="ps-num">${stats.total_items}</span><span class="ps-lbl">Items</span></div>
      <div class="proj-stat-div"></div>
      <div class="proj-stat"><span class="ps-num">${stats.endorsed_count}</span><span class="ps-lbl">Endorsed</span></div>
      <div class="proj-stat-div"></div>
      <div class="proj-stat"><span class="ps-num">${stats.with_po_count}</span><span class="ps-lbl">With PO</span></div>
      <div class="proj-stat-div"></div>
      <div class="proj-stat"><span class="ps-num" style="color:#ea580c">${stats.long_lead_count}</span><span class="ps-lbl">Long Lead</span></div>
      ${auditStatHtml}
    </div>
    <div class="proj-budget-row">
      <div class="proj-budget-item"><span class="pb-lbl">Budget</span><span class="pb-val">${budgetDisplay}</span></div>
      <div class="proj-budget-item"><span class="pb-lbl">Endorsed</span><span class="pb-val" style="color:#1d4ed8">${endorsedDisplay}</span></div>
      <div class="proj-budget-item"><span class="pb-lbl">PO Amount</span><span class="pb-val" style="color:#b91c1c">${poDisplay}</span></div>
    </div>`
    : `<div class="proj-no-data">No items yet — open the tracker to get started.</div>`;

  const dateStr = createdAt
    ? `<span class="proj-date">Created ${ProjectStore.fmtDate(createdAt)}</span>`
    : '';

  const H = (s) => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
  const safeName  = H(name).replace(/"/g,'&quot;');
  const canAdmin  = Auth.can('admin');
  const canEdit   = Auth.can('edit');
  const deleteBtn = canAdmin ? `
    <button class="proj-icon-btn proj-delete-btn" data-id="${id}" data-name="${safeName}"
            title="Delete project" aria-label="Delete">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3,6 5,6 21,6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      </svg>
    </button>` : '';

  const editBtn = canEdit ? `
    <button class="proj-icon-btn proj-edit-btn" data-id="${id}" title="Edit project" aria-label="Edit">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>` : '';

  return `
    <div class="proj-card" style="--proj-accent:${accent}; --proj-light:${light};">
      <div class="proj-card-top">
        <div class="proj-card-header">
          <div class="proj-card-labels">
            <span class="proj-status-badge" style="background:${sm.bg};color:${sm.color};">${sm.label}</span>
          </div>
          <div class="proj-card-actions">${editBtn}${deleteBtn}</div>
        </div>
        <div class="proj-name">${H(name)}</div>
        <div class="proj-code">${H(code)}</div>
        ${client ? `<div class="proj-client">${H(client)}</div>` : ''}
        ${startDate ? `<div class="proj-start-date">Started ${ProjectStore.fmtDate(startDate)}</div>` : ''}
        ${notes ? `<div class="proj-notes">${H(notes)}</div>` : ''}
        ${progressHtml}
      </div>
      <div class="proj-card-stats">${statsHtml}</div>
      <div class="proj-card-footer">
        ${dateStr}
        <div class="proj-card-btns">
          <a href="index.html?id=${id}" class="btn btn-sm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            Tracker
          </a>
          <a href="dashboard.html?id=${id}" class="btn btn-sm btn-accent" style="--btn-accent-bg:${accent};">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            Dashboard
          </a>
        </div>
      </div>
    </div>`;
}

/* ── Add modal ── */
function openAddModal() {
  if (!Auth.can('edit')) return;
  editingId = null;
  selectedColor = cachedProjects.length % ProjectStore.PALETTE.length;
  document.getElementById('proj-modal-mode-label').textContent = 'New Project';
  document.getElementById('proj-modal-title').textContent = 'Add Project Details';
  document.getElementById('proj-modal-save-label').textContent = 'Create Project';
  resetForm();
  updateColorPicker();
  openModal('proj-modal-overlay');
}

/* ── Edit modal ── */
function openEditModal(id) {
  if (!Auth.can('edit')) return;
  const proj = cachedProjects.find(p => p.id === id);
  if (!proj) return;
  editingId = id;
  document.getElementById('proj-modal-mode-label').textContent = 'Edit Project';
  document.getElementById('proj-modal-title').textContent = 'Update Project Details';
  document.getElementById('proj-modal-save-label').textContent = 'Save Changes';

  document.getElementById('f-name').value   = proj.name      || '';
  document.getElementById('f-code').value   = proj.code      || '';
  document.getElementById('f-client').value = proj.client    || '';
  document.getElementById('f-status').value = proj.status    || 'active';
  document.getElementById('f-budget').value = proj.budget    || '';
  document.getElementById('f-start').value  = proj.startDate || '';
  document.getElementById('f-notes').value  = proj.notes     || '';
  selectedColor = proj.colorIndex ?? 0;

  document.getElementById('form-error').textContent = '';
  document.getElementById('f-tpl-row').style.display = 'none';
  document.getElementById('f-dropzone-row').style.display = 'none';
  updateColorPicker();
  openModal('proj-modal-overlay');
}

/* ── Save (create / update) ── */
async function saveProject() {
  if (!Auth.can('edit')) return;
  const name = document.getElementById('f-name').value.trim();
  const code = document.getElementById('f-code').value.trim();
  const err  = document.getElementById('form-error');
  err.textContent = '';
  if (!name) { err.textContent = 'Project Name is required.'; return; }
  if (!code) { err.textContent = 'Project Code is required.'; return; }

  const saveBtn = document.getElementById('proj-modal-save');
  saveBtn.disabled = true;
  saveBtn.querySelector('span').textContent = editingId ? 'Saving…' : 'Creating…';

  const meta = {
    id:         editingId || ProjectStore.generateId(),
    name,
    code,
    client:     document.getElementById('f-client').value.trim(),
    status:     document.getElementById('f-status').value,
    budget:     parseFloat(document.getElementById('f-budget').value) || 0,
    startDate:  document.getElementById('f-start').value,
    notes:      document.getElementById('f-notes').value.trim(),
    colorIndex: selectedColor,
  };

  try {
    if (!editingId) {
      const tpl = document.querySelector('input[name="template"]:checked').value;
      const items = tpl === 'upload' ? (_projUploadItems || []) : [];
      await ProjectStore.createProject(meta, items);
    } else {
      await ProjectStore.upsertMeta(meta);
    }
  } catch (e) {
    err.textContent = 'Save failed: ' + e.message;
    saveBtn.disabled = false;
    saveBtn.querySelector('span').textContent = editingId ? 'Save Changes' : 'Create Project';
    return;
  }

  closeModal('proj-modal-overlay');
  await renderGrid();
  saveBtn.disabled = false;
  saveBtn.querySelector('span').textContent = editingId ? 'Save Changes' : 'Create Project';
}

/* ── Delete modal ── */
function openDeleteModal(id, name) {
  if (!Auth.can('admin')) return;
  pendingDeleteId = id;
  document.getElementById('del-proj-name').textContent = `"${name}"`;
  openModal('del-modal-overlay');
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  const btn = document.getElementById('del-confirm');
  btn.disabled = true;
  try {
    await ProjectStore.deleteMeta(pendingDeleteId);
  } catch (e) {
    alert('Could not delete project: ' + e.message);
    btn.disabled = false;
    return;
  }
  pendingDeleteId = null;
  closeModal('del-modal-overlay');
  await renderGrid();
  btn.disabled = false;
}

/* ── Color picker ── */
function buildColorPicker() {
  const picker = document.getElementById('color-picker');
  picker.innerHTML = ProjectStore.PALETTE.map((c, i) =>
    `<button type="button" class="color-swatch" data-idx="${i}"
             style="background:${c.accent};" title="${c.accent}"></button>`
  ).join('');
  picker.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      selectedColor = parseInt(sw.dataset.idx);
      updateColorPicker();
    });
  });
}

function updateColorPicker() {
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.classList.toggle('selected', parseInt(sw.dataset.idx) === selectedColor);
  });
}

/* ── Form ── */
function resetForm() {
  document.getElementById('proj-form').reset();
  document.getElementById('form-error').textContent = '';
  document.getElementById('f-tpl-row').style.display = '';
  document.getElementById('f-dropzone-row').style.display = '';
  document.getElementById('tpl-upload-lbl').classList.add('selected');
  document.getElementById('tpl-blank-lbl').classList.remove('selected');
  _projResetUpload();
}

/* ── Modal helpers ── */
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Bind all events ── */
function bindEvents() {
  document.getElementById('add-project-btn').addEventListener('click', openAddModal);

  document.getElementById('proj-modal-save').addEventListener('click', saveProject);
  document.getElementById('proj-modal-close').addEventListener('click', () => closeModal('proj-modal-overlay'));
  document.getElementById('proj-modal-cancel').addEventListener('click', () => closeModal('proj-modal-overlay'));
  let projOverlayDown = null;
  document.getElementById('proj-modal-overlay').addEventListener('mousedown', e => { projOverlayDown = e.target; });
  document.getElementById('proj-modal-overlay').addEventListener('click', e => {
    const sel = window.getSelection && window.getSelection().toString().length > 0;
    if (!sel && e.target === e.currentTarget && projOverlayDown === e.currentTarget) closeModal('proj-modal-overlay');
    projOverlayDown = null;
  });

  document.getElementById('del-confirm').addEventListener('click', confirmDelete);
  document.getElementById('del-cancel').addEventListener('click', () => closeModal('del-modal-overlay'));
  document.getElementById('del-modal-close').addEventListener('click', () => closeModal('del-modal-overlay'));
  let delOverlayDown = null;
  document.getElementById('del-modal-overlay').addEventListener('mousedown', e => { delOverlayDown = e.target; });
  document.getElementById('del-modal-overlay').addEventListener('click', e => {
    const sel = window.getSelection && window.getSelection().toString().length > 0;
    if (!sel && e.target === e.currentTarget && delOverlayDown === e.currentTarget) closeModal('del-modal-overlay');
    delOverlayDown = null;
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('proj-modal-overlay');
      closeModal('del-modal-overlay');
    }
  });

  // Template radio — toggle dropzone visibility
  document.querySelectorAll('input[name="template"]').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('.template-option').forEach(lbl => lbl.classList.remove('selected'));
      r.closest('.template-option').classList.add('selected');
      const isUpload = r.value === 'upload';
      document.getElementById('f-dropzone-row').style.display = isUpload ? '' : 'none';
      if (!isUpload) _projResetUpload();
    });
  });

  // Upload dropzone
  const dz  = document.getElementById('proj-dropzone');
  const fi  = document.getElementById('proj-file-input');
  const clr = document.getElementById('proj-dz-clear');

  dz.addEventListener('click', e => {
    if (clr && clr.contains(e.target)) return;
    fi.click();
  });
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); }
  });
  fi.addEventListener('change', e => {
    if (e.target.files[0]) _projHandleFile(e.target.files[0]);
  });
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over'); });
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) _projHandleFile(e.dataTransfer.files[0]);
  });
  clr.addEventListener('click', e => {
    e.stopPropagation();
    _projResetUpload();
  });
}

/* ── User Management Modal (admin only) ── */
function openUsersModal() {
  if (!Auth.can('admin')) return;
  document.getElementById('users-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  loadUsersModal();
}
function closeUsersModal() {
  document.getElementById('users-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function loadUsersModal() {
  const body = document.getElementById('users-body');
  body.innerHTML = '<div style="padding:24px;color:#6b7280;text-align:center">Loading users&hellip;</div>';
  try {
    const res  = await fetch('php/auth.php?action=get_users');
    if (res.status === 401) { Auth.sessionExpired(); return; }
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    renderUsersTable(json.data);
  } catch (e) {
    body.innerHTML = `<div style="padding:24px;color:#b91c1c;">Failed to load users: ${e.message}</div>`;
  }
}

function renderUsersTable(users) {
  const H = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const rows = users.map(u => `
    <tr>
      <td>${H(u.username)}</td>
      <td>${H(u.full_name)}</td>
      <td><span class="user-role-badge ${u.role}">${u.role}</span></td>
      <td style="color:#9ca3af;font-size:.78rem">${u.last_login ? new Date(String(u.last_login).replace(' ','T')).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Never'}</td>
      <td>
        <button class="btn btn-sm"
          data-uid="${u.id}" data-uname="${H(u.username)}" data-fname="${H(u.full_name)}" data-role="${u.role}"
          onclick="openEditUserModal(+this.dataset.uid,this.dataset.uname,this.dataset.fname,this.dataset.role)">Edit</button>
        ${u.id !== (Auth.user && Auth.user.id) ? `<button class="btn btn-sm btn-danger" style="margin-left:4px"
          data-uid="${u.id}" data-uname="${H(u.username)}"
          onclick="deleteUser(+this.dataset.uid,this.dataset.uname)">Delete</button>` : ''}
      </td>
    </tr>`).join('');

  document.getElementById('users-body').innerHTML = `
    <table class="users-table">
      <thead><tr><th>Username</th><th>Full Name</th><th>Role</th><th>Last Login</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="users-add-form" id="users-edit-form" style="display:none">
      <div class="users-add-form-title">Edit User: <span id="ue-username-label" style="font-weight:700"></span></div>
      <input type="hidden" id="ue-id" />
      <div class="form-group" style="margin:0">
        <label class="form-label">Full Name</label>
        <input class="form-input" id="ue-fullname" type="text" />
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Role</label>
        <select class="form-input" id="ue-role">
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div class="form-group" style="grid-column:1/-1;margin:0">
        <label class="form-label">New Password <span style="color:#9ca3af;font-weight:400">(leave blank to keep unchanged)</span></label>
        <input class="form-input" id="ue-password" type="password" placeholder="Min 8 characters" autocomplete="new-password" />
      </div>
      <div class="uf-error" id="ue-error" style="display:none;grid-column:1/-1"></div>
      <div class="users-add-actions">
        <button class="btn" onclick="closeEditUserForm()">Cancel</button>
        <button class="btn btn-primary" onclick="saveEditUser()">Save Changes</button>
      </div>
    </div>
    <div class="users-add-form" id="users-add-form">
      <div class="users-add-form-title">Add New User</div>
      <div class="form-group">
        <label class="form-label">Username</label>
        <input class="form-input" id="uf-username" type="text" autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input class="form-input" id="uf-fullname" type="text" />
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-input" id="uf-password" type="password" />
      </div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="form-input" id="uf-role">
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div class="uf-error" id="uf-error" style="display:none"></div>
      <div class="users-add-actions">
        <button class="btn btn-primary" onclick="saveNewUser()">Create User</button>
      </div>
    </div>`;
}

async function saveNewUser() {
  if (!Auth.can('admin')) return;
  const errEl = document.getElementById('uf-error');
  errEl.style.display = 'none';
  const body = {
    username:  document.getElementById('uf-username').value.trim(),
    full_name: document.getElementById('uf-fullname').value.trim(),
    password:  document.getElementById('uf-password').value,
    role:      document.getElementById('uf-role').value,
  };
  try {
    const res  = await fetch('php/auth.php?action=create_user', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
    });
    if (res.status === 401) { Auth.sessionExpired(); return; }
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    loadUsersModal();
  } catch (e) {
    errEl.textContent  = e.message;
    errEl.style.display = '';
  }
}

function openEditUserModal(id, username, fullName, role) {
  if (!Auth.can('admin')) return;
  document.getElementById('ue-id').value                    = id;
  document.getElementById('ue-username-label').textContent  = username;
  document.getElementById('ue-fullname').value              = fullName;
  document.getElementById('ue-role').value                  = role;
  document.getElementById('ue-password').value              = '';
  document.getElementById('ue-error').style.display         = 'none';
  const editForm = document.getElementById('users-edit-form');
  editForm.style.display = '';
  editForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('ue-fullname').focus();
}

function closeEditUserForm() {
  document.getElementById('users-edit-form').style.display = 'none';
}

async function saveEditUser() {
  if (!Auth.can('admin')) return;
  const errEl    = document.getElementById('ue-error');
  errEl.style.display = 'none';
  const id       = +document.getElementById('ue-id').value;
  const fullName = document.getElementById('ue-fullname').value.trim();
  const role     = document.getElementById('ue-role').value;
  const pw       = document.getElementById('ue-password').value;
  const body     = { id, full_name: fullName, role };
  if (pw) body.password = pw;
  try {
    const res  = await fetch('php/auth.php?action=update_user', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
    });
    if (res.status === 401) { Auth.sessionExpired(); return; }
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    loadUsersModal();
  } catch (e) {
    errEl.textContent   = e.message;
    errEl.style.display = '';
  }
}

async function deleteUser(id, username) {
  if (!Auth.can('admin')) return;
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  try {
    const res  = await fetch('php/auth.php?action=delete_user', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id }),
    });
    if (res.status === 401) { Auth.sessionExpired(); return; }
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    loadUsersModal();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
}

document.addEventListener('DOMContentLoaded', init);
