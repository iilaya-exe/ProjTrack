'use strict';

/* ============================================================
   Audit Log page — editor + admin, driven by api.php?action=get_audit_log
============================================================ */

const PAGE_SIZE = 50;
let auditOffset = 0;
let auditTotal  = 0;
let filterProject = '';
let filterAction  = '';

const FIELD_LABELS = {
  // Project fields
  name:'Project Name', code:'Project Code', client:'Client', status:'Status',
  total_budget:'Total Budget', start_date:'Start Date', color_index:'Color',
  no_need_commercial_endorsement:'No Commercial Endorsement',
  // Item fields
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

function H(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadAuditLog() {
  const wrap = document.getElementById('audit-log-wrap');
  wrap.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">Loading&hellip;</div>';

  const params = new URLSearchParams({
    action: 'get_audit_log',
    limit:  PAGE_SIZE,
    offset: auditOffset,
  });
  if (filterProject) params.set('project_id', filterProject);

  try {
    const res  = await LocalDB.fetch('php/api.php?' + params);
    if (res.status === 401) { Auth.sessionExpired(); return; }
    if (res.status === 403) { wrap.innerHTML = '<div class="hist-error">Access denied. Editor or admin access required.</div>'; return; }
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    const logs = json.data.logs || [];
    auditTotal  = json.data.total || 0;

    if (!logs.length) {
      wrap.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">No audit records found.</div>';
      renderPagination();
      return;
    }

    const actionF = filterAction;
    const filtered = actionF ? logs.filter(l => l.action === actionF) : logs;

    if (!filtered.length) {
      wrap.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">No records match the selected filter.</div>';
      renderPagination();
      return;
    }

    wrap.innerHTML = `<div class="hist-timeline">${filtered.map(renderLogRow).join('')}</div>`;
    renderPagination();

  } catch (e) {
    wrap.innerHTML = `<div style="padding:40px;color:#b91c1c;text-align:center;">Error: ${H(e.message)}</div>`;
  }
}

function renderLogRow(entry) {
  const dt     = new Date(String(entry.changed_at).replace(' ', 'T')).toLocaleString('en-US', {
    month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit'
  });
  const avatar = H((entry.username || '?')[0].toUpperCase());
  const ch     = entry.changes || {};
  let changesHtml = '';

  const noteHtml = ch._note
    ? `<div class="hist-note"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>${H(ch._note)}</div>`
    : '';

  if (entry.action === 'update') {
    const rows = Object.entries(ch)
      .filter(([k, diff]) => {
        if (k === '_note') return false;
        // Skip malformed entries (old flat-value format: diff is a primitive, not {old,new})
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
          <div class="hist-diff-label">${H(fieldLabel(f))}</div>
          <div class="hist-diff-values">
            <span class="hist-old-val${oldStr ? '' : ' hist-empty-val'}">${H(oldStr ?? '(empty)')}</span>
            <span class="hist-arrow">→</span>
            <span class="hist-new-val${newStr ? '' : ' hist-empty-val'}">${H(newStr ?? '(empty)')}</span>
          </div>
        </div>`;
      }).join('');
    changesHtml = rows ? `<div class="hist-diff">${rows}</div>` : '';
    if (noteHtml) changesHtml += noteHtml;
  } else if (ch.snapshot) {
    const entries = Object.entries(ch.snapshot)
      .filter(([, v]) => {
        if (v == null || v === '' || v === 0) return false;
        if (typeof v === 'string' && /^0+(\.0+)?$/.test(v.trim())) return false;
        return true;
      });
    const shown   = entries.slice(0, 6);
    const more    = entries.length - shown.length;
    const rows    = shown.map(([f, v]) => `<div class="hist-snap-row">
      <span class="hist-snap-key">${H(fieldLabel(f))}</span>
      <span class="hist-snap-val">${H(v)}</span>
    </div>`).join('');
    changesHtml = `<div class="hist-snapshot">${rows}${more > 0 ? `<div class="hist-more">+${more} more fields</div>` : ''}</div>`;
  }

  const scope  = entry.item_scope ? H(entry.item_scope).slice(0, 70) : '';
  const locRow = entry.entity === 'item'
    ? `<div class="hist-loc-row">
        <span class="hist-loc-item">Item #${entry.item_no}${scope ? ' — ' + scope : ''}</span>
        <span class="hist-loc-sep">·</span>
        <span class="hist-loc-proj">${H(entry.project_id)}</span>
      </div>`
    : `<div class="hist-loc-row">
        <span class="hist-loc-item">Project</span>
        <span class="hist-loc-sep">·</span>
        <span class="hist-loc-proj">${H(entry.project_id)}</span>
      </div>`;

  return `<div class="hist-entry ${entry.action}">
    <div class="hist-dot"></div>
    <div class="hist-card">
      <div class="hist-card-head">
        <div class="hist-meta-row">
          <span class="hist-avatar">${avatar}</span>
          <span class="hist-action-badge ${entry.action}">${entry.action}</span>
          <span class="hist-username">${H(entry.username || '?')}</span>
          <span class="hist-date">${dt}</span>
        </div>
        ${locRow}
      </div>
      ${changesHtml}
    </div>
  </div>`;
}

function renderPagination() {
  const pg   = document.getElementById('audit-pagination');
  const pages = Math.ceil(auditTotal / PAGE_SIZE);
  const cur   = Math.floor(auditOffset / PAGE_SIZE);

  if (pages <= 1) { pg.innerHTML = `<span style="color:var(--text-muted);font-size:.8rem;">${auditTotal} total records</span>`; return; }

  let html = `<span style="color:var(--text-muted);font-size:.8rem;margin-right:8px;">${auditTotal} records &nbsp; Page ${cur+1} of ${pages}</span>`;
  if (cur > 0) html += `<button class="btn btn-sm" onclick="goPage(${cur-1})">&#8592; Prev</button>`;
  if (cur < pages - 1) html += `<button class="btn btn-sm" onclick="goPage(${cur+1})">Next &#8594;</button>`;
  pg.innerHTML = html;
}

function goPage(n) {
  auditOffset = n * PAGE_SIZE;
  loadAuditLog();
  window.scrollTo(0, 0);
}

async function loadProjectFilter() {
  try {
    const res  = await LocalDB.fetch('php/api.php?action=get_projects');
    const json = await res.json();
    if (!json.success) return;
    const sel = document.getElementById('filter-project');
    json.data.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name || p.id;
      sel.appendChild(opt);
    });
  } catch {}
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await Auth.init();
  if (!user) return;

  if (!Auth.can('edit')) {
    document.getElementById('audit-log-wrap').innerHTML =
      '<div style="padding:60px;color:#b91c1c;text-align:center;font-size:1rem;">Access denied — editor or admin access required.</div>';
    return;
  }

  document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', {
    weekday:'short', year:'numeric', month:'short', day:'numeric',
  });

  // Pre-filter from URL (e.g. audit.html?project_id=xyz)
  const urlParams = new URLSearchParams(window.location.search);
  const urlProject = urlParams.get('project_id');
  if (urlProject) filterProject = urlProject;

  await loadProjectFilter();
  if (urlProject) {
    const sel = document.getElementById('filter-project');
    sel.value = urlProject;
  }
  await loadAuditLog();

  document.getElementById('filter-project').addEventListener('change', e => {
    filterProject = e.target.value;
    auditOffset   = 0;
    loadAuditLog();
  });
  document.getElementById('filter-action').addEventListener('change', e => {
    filterAction = e.target.value;
    auditOffset  = 0;
    loadAuditLog();
  });
  document.getElementById('refresh-btn').addEventListener('click', () => {
    auditOffset = 0;
    loadAuditLog();
  });
});
