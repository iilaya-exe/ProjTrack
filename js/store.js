'use strict';

/* ============================================================
   ProjectStore — data layer backed by LocalDB (js/backend.js),
   a localStorage-based emulator of the former php/api.php.
   All read/write operations are async (return Promises).
   Sync helpers (computeStats, blankItem, fmtPeso, fmtDate,
   generateId, getUrlId, PALETTE, STATUS_MAP) are unchanged.
============================================================ */
const ProjectStore = {

  API:        'php/api.php',
  DEFAULT_ID: 'bsmh-phase2',

  PALETTE: [
    { accent: '#2563a8', light: '#eff6ff' },
    { accent: '#16a34a', light: '#f0fdf4' },
    { accent: '#7c3aed', light: '#f5f3ff' },
    { accent: '#ea580c', light: '#fff7ed' },
    { accent: '#0d9488', light: '#f0fdfa' },
    { accent: '#be185d', light: '#fdf2f8' },
    { accent: '#0284c7', light: '#f0f9ff' },
    { accent: '#ca8a04', light: '#fefce8' },
  ],

  STATUS_MAP: {
    active:    { label: 'Active',    bg: '#dcfce7', color: '#166534' },
    planning:  { label: 'Planning',  bg: '#dbeafe', color: '#1d4ed8' },
    'on-hold': { label: 'On Hold',   bg: '#fef3c7', color: '#92400e' },
    completed: { label: 'Completed', bg: '#f3f4f6', color: '#374151' },
  },

  /* ── ID helpers (sync) ── */
  generateId() {
    return 'proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  },

  getUrlId() {
    return new URLSearchParams(window.location.search).get('id') || this.DEFAULT_ID;
  },

  /* ── Low-level fetch wrapper ── */
  async _api(params, body = null) {
    const url = this.API + '?' + new URLSearchParams(params);
    const opt = body
      ? { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body) }
      : { method: 'GET' };
    const res  = await LocalDB.fetch(url, opt);
    if (res.status === 401) {
      Auth.sessionExpired();
      return new Promise(() => {}); // never resolves — overlay covers the page, callers must not proceed
    }
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'API error');
    return json.data;
  },

  /* ── Project list ── */

  /* Returns ALL projects (default first, then user-created) as an array of
     UI-ready objects.  Each object has:
       id, name, code, client, status, budget, colorIndex, startDate,
       notes, createdAt, isDefault, stats { total_items, endorsed_count,
       with_po_count, long_lead_count, total_endorsed, total_po,
       total_savings, balance, budget } */
  async getAllProjects() {
    const rows = await this._api({ action: 'get_projects' });
    return rows.map(r => ({
      id:         r.id,
      name:       r.name,
      code:       r.code       || '',
      client:     r.client     || '',
      status:     r.status     || 'active',
      budget:     parseFloat(r.total_budget) || 0,
      colorIndex: parseInt(r.color_index) || 0,
      startDate:  r.start_date || '',
      notes:      r.notes      || '',
      createdAt:  r.created_at || '',
      isDefault:  !!parseInt(r.is_default),
      stats:      r.stats      || null,
    }));
  },

  /* ── Load a single project (used by tracker + dashboard) ── */
  /* Returns { project: { name, code, total_budget, … }, items: […] } */
  async load(id) {
    const [project, result] = await Promise.all([
      this._api({ action: 'get_project', id }),
      this._api({ action: 'get_items', project_id: id }),
    ]);
    return { project, items: result.items };
  },

  /* ── Create project (new) ── */
  async createProject(meta, items = []) {
    return this._api({ action: 'create_project' }, { ...meta, items });
  },

  /* ── Update project metadata ── */
  async upsertMeta(meta) {
    return this._api({ action: 'update_project' }, meta);
  },

  /* ── Delete project (and its items via CASCADE) ── */
  async deleteMeta(id) {
    return this._api({ action: 'delete_project' }, { id });
  },

  /* ── Item operations ── */
  async saveItem(projectId, item, note) {
    const body = { project_id: projectId, ...item };
    if (note) body._note = note;
    return this._api({ action: 'update_item' }, body);
  },

  async addItem(projectId, item) {
    return this._api({ action: 'add_item' }, { project_id: projectId, ...item });
  },

  async deleteItem(projectId, no) {
    return this._api({ action: 'delete_item' }, { project_id: projectId, no });
  },

  /* ── Stats computed from items (pure, sync) ── */
  computeStats(data) {
    const items    = data.items || [];
    const endorsed = items.filter(i => i.endorsed_amount > 0);
    const withPo   = items.filter(i => i.po_no);
    const longLead = items.filter(i =>
      i.endorsement_remarks && i.endorsement_remarks.toUpperCase().includes('LONG LEAD')
    );
    const budget  = data.project ? (data.project.total_budget || 0) : 0;
    const noComm  = data.project ? (data.project.no_need_commercial_endorsement || 0) : 0;
    const totalEnd = endorsed.reduce((s, i) => s + (i.endorsed_amount || 0), 0);
    const totalPo  = withPo.reduce((s,   i) => s + (i.po_amount || 0), 0);
    const totalSav = withPo.reduce((s,   i) => s + (i.savings_endorsed_po || 0), 0);
    const forEndorsementCount = Math.max(0, items.length - noComm);
    return {
      total_items:               items.length,
      endorsed_count:            endorsed.length,
      for_endorsement_count:     forEndorsementCount,
      with_po_count:             withPo.length,
      long_lead_count:           longLead.length,
      long_lead_items:           longLead,
      no_commercial_endorsement: noComm,
      total_endorsed: totalEnd,
      total_po:       totalPo,
      total_savings:  totalSav,
      balance:        budget - totalEnd,
      budget,
    };
  },

  /* ── Blank item template ── */
  blankItem(no) {
    return {
      no, trade: '', scope: '', remarks: '', budget: 0,
      endorsed_vendor: '', endorsement_remarks: '', endorsement_date: '',
      endorsed_amount: 0, savings_budget_endorsed: 0, vendor_timeline: '',
      date_needed: '', approved_vendor: '', priority: '', dp_required: '',
      downpayment: '', progress_billing: '', upon_completion: '', notes: '',
      awarded_vendor: '', pr_no: '', negotiated_proposal: 0, po_amount: 0,
      date_of_po: '', po_no: '', date_issuance_po: '', savings_endorsed_po: 0,
      po_remarks: '', invoice_no: '', invoice_date: '', rfp_no: '', rfp_date: '',
      date_submission_ap: '', rfp_amount: 0, pt: '', conditions: '',
      due_date: '', final_remarks: '',
    };
  },

  /* ── Formatting helpers (sync) ── */
  fmtDate(iso) {
    if (!iso) return '—';
    try {
      // MySQL timestamps use space separator (e.g. "2026-06-26 10:30:00") which is
      // non-standard for Date.parse — normalize to ISO 8601 T form for all browsers.
      const normalized = String(iso).replace(' ', 'T');
      return new Date(normalized).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return iso; }
  },
};
