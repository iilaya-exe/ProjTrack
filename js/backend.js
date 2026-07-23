'use strict';

/* ============================================================
   LocalDB — client-side backend emulator (localStorage).

   Replaces the former PHP backend (php/api.php + php/auth.php)
   so the whole app runs as a static site (e.g. GitHub Pages).

   It exposes LocalDB.fetch(url, opt), a drop-in replacement for
   window.fetch that understands the exact same query strings and
   JSON bodies the PHP endpoints used, and returns a Response-like
   object ({ status, ok, json() }). Because the response shape is
   identical, every existing call site keeps working untouched.

   ── Security note ──
   This is a single-user-per-browser app. ALL data (including user
   accounts) lives in this browser's localStorage. The password
   hashing below is light obfuscation only — it is NOT real
   security. Do not store sensitive data you would not put in a
   public, client-side file.
============================================================ */
const LocalDB = (function () {

  /* ── Storage keys ── */
  const KEY = {
    projects: 'abitrack_projects',
    items:    'abitrack_items',
    audit:    'abitrack_audit',
    users:    'abitrack_users',
    session:  'abitrack_session',
    seeded:   'abitrack_seeded',
  };

  const SESSION_LIFETIME = 8 * 3600; // seconds — sliding (refreshed on every `me`/`ping`)
  const DEFAULT_PROJECT_ID = 'aurora-hq';

  /* ── Item field list (mirrors the former ITEM_FIELDS in api.php) ── */
  const ITEM_FIELDS = [
    'trade','scope','remarks','budget','endorsed_vendor','endorsement_remarks',
    'endorsement_date','endorsed_amount','savings_budget_endorsed','vendor_timeline',
    'date_needed','approved_vendor','priority','dp_required','downpayment',
    'progress_billing','upon_completion','notes','awarded_vendor','pr_no',
    'negotiated_proposal','po_amount','date_of_po','po_no','date_issuance_po',
    'savings_endorsed_po','po_remarks','invoice_no','invoice_date','rfp_no',
    'rfp_date','date_submission_ap','rfp_amount','pt','conditions','due_date','final_remarks',
  ];
  const NUM_FIELDS = new Set([
    'budget','endorsed_amount','savings_budget_endorsed','negotiated_proposal',
    'po_amount','savings_endorsed_po','rfp_amount',
  ]);

  /* ── localStorage helpers ── */
  function read(key, fallback) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
    catch { return fallback; }
  }
  function write(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
  function nowIso() { return new Date().toISOString(); }

  /* ── Password hashing (light obfuscation only — see security note) ── */
  function hashPw(pw) {
    let h = 5381;
    const s = 'abi$' + String(pw);
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(36);
  }

  /* ── One-time seed of default admin + default project ── */
  function ensureSeed() {
    if (read(KEY.seeded, false)) return;
    if (!localStorage.getItem(KEY.users)) {
      write(KEY.users, [{
        id: 1,
        username: 'admin',
        password_hash: hashPw('admin123'),
        full_name: 'Administrator',
        role: 'admin',
        created_at: nowIso(),
        last_login: null,
      }]);
    }
    if (!localStorage.getItem(KEY.projects)) write(KEY.projects, DEMO_PROJECTS);
    if (!localStorage.getItem(KEY.items))    write(KEY.items, buildDemoItems());
    if (!localStorage.getItem(KEY.audit))    write(KEY.audit, []);
    write(KEY.seeded, true);
  }

  /* ── Demo seed data (fictional) ──────────────────────────────────
     Two sample projects so the tracker, dashboard, filters, and stats
     all have something to show on first run. Delete localStorage (or
     the projects/items keys) to re-seed. */
  const DEMO_PROJECTS = [
    {
      id: DEFAULT_PROJECT_ID,
      name: 'Aurora Corporate HQ — Interior Fit-Out',
      code: 'AUR-HQ',
      client: 'Northwind Holdings',
      status: 'active',
      total_budget: 58000000,
      start_date: '02/17/2026',
      notes: '12-storey headquarters interior fit-out. Target turnover Q4 2026.',
      color_index: 0,
      no_need_commercial_endorsement: 0,
      is_default: 1,
      created_at: '2026-02-17T08:00:00.000Z',
    },
    {
      id: 'meridian-p1',
      name: 'Meridian Retail Center — Phase 1',
      code: 'MER-P1',
      client: 'Crescent Malls Group',
      status: 'planning',
      total_budget: 28000000,
      start_date: '06/02/2026',
      notes: 'Ground-floor retail shell & core, plus anchor tenant fit-out.',
      color_index: 4,
      no_need_commercial_endorsement: 0,
      is_default: 0,
      created_at: '2026-06-02T08:00:00.000Z',
    },
  ];

  function buildDemoItems() {
    const mk = (pid, arr) => arr.map(it => Object.assign({ project_id: pid, no: it.no }, blankItemFields(it)));

    const aurora = mk(DEFAULT_PROJECT_ID, [
      { no: 1, trade: 'Preliminaries', scope: 'Site mobilization, temporary facilities & safety provisions',
        budget: 1800000, endorsed_vendor: 'BuildRight Services Inc.', endorsement_date: '03/05/2026',
        endorsed_amount: 1750000, savings_budget_endorsed: 50000, vendor_timeline: '3 weeks',
        date_needed: '03/20/2026', approved_vendor: 'BuildRight Services Inc.', priority: 'HIGH',
        awarded_vendor: 'BuildRight Services Inc.', pr_no: 'PR-2026-001', negotiated_proposal: 1750000,
        po_amount: 1750000, date_of_po: '03/12/2026', po_no: 'PO-2026-0101', date_issuance_po: '03/13/2026',
        savings_endorsed_po: 0, invoice_no: 'INV-3321', invoice_date: '05/04/2026' },

      { no: 2, trade: 'Civil / Architectural', scope: 'Concrete works, masonry partitions & wet-area waterproofing',
        budget: 8200000, endorsed_vendor: 'Cornerstone Builders Corp.', endorsement_date: '03/18/2026',
        endorsed_amount: 7950000, savings_budget_endorsed: 250000, vendor_timeline: '10 weeks',
        date_needed: '04/15/2026', approved_vendor: 'Cornerstone Builders Corp.', priority: 'HIGH',
        awarded_vendor: 'Cornerstone Builders Corp.', pr_no: 'PR-2026-004', negotiated_proposal: 7900000,
        po_amount: 7850000, date_of_po: '03/28/2026', po_no: 'PO-2026-0107', date_issuance_po: '03/30/2026',
        savings_endorsed_po: 100000, invoice_no: 'INV-3410', invoice_date: '06/12/2026', po_remarks: '30% downpayment released' },

      { no: 3, trade: 'Flooring & Finishes', scope: 'Porcelain tile, engineered timber & carpet tile supply/install',
        budget: 5600000, endorsed_vendor: 'FinishLine Interiors', endorsement_date: '04/22/2026',
        endorsed_amount: 5480000, savings_budget_endorsed: 120000, vendor_timeline: '8 weeks',
        date_needed: '08/05/2026', approved_vendor: 'FinishLine Interiors', priority: 'MEDIUM' },

      { no: 4, trade: 'Partition & Drywall', scope: 'Metal-stud drywall partitions & acoustic ceiling systems',
        budget: 4300000, date_needed: '08/20/2026', priority: 'MEDIUM', remarks: 'Awaiting revised layout from design team' },

      { no: 5, trade: 'Mechanical (VRV / HVAC)', scope: 'VRV system, ducting & ventilation for all floors',
        budget: 9800000, endorsed_vendor: 'ThermoCool Systems Inc.', endorsement_remarks: 'LONG LEAD ITEMS',
        endorsement_date: '03/25/2026', endorsed_amount: 9650000, savings_budget_endorsed: 150000,
        vendor_timeline: '16 weeks (imported units)', date_needed: '07/30/2026', approved_vendor: 'ThermoCool Systems Inc.',
        priority: 'HIGH', dp_required: 'Yes', downpayment: '40% on PO' },

      { no: 6, trade: 'Fire Protection', scope: 'Sprinkler network, FDAS & fire pumps',
        budget: 3900000, endorsed_vendor: 'Sentinel Fire & Safety', endorsement_date: '04/02/2026',
        endorsed_amount: 3820000, savings_budget_endorsed: 80000, vendor_timeline: '7 weeks',
        date_needed: '07/10/2026', approved_vendor: 'Sentinel Fire & Safety', priority: 'HIGH',
        awarded_vendor: 'Sentinel Fire & Safety', pr_no: 'PR-2026-011', negotiated_proposal: 3800000,
        po_amount: 3780000, date_of_po: '04/14/2026', po_no: 'PO-2026-0119', date_issuance_po: '04/15/2026',
        savings_endorsed_po: 40000 },

      { no: 7, trade: 'Electrical', scope: 'Power distribution, panel boards & lighting rough-in',
        budget: 7200000, endorsed_vendor: 'Voltaic Power Contractors', endorsement_remarks: 'LONG LEAD ITEMS',
        endorsement_date: '04/08/2026', endorsed_amount: 7100000, savings_budget_endorsed: 100000,
        vendor_timeline: '14 weeks (switchgear lead time)', date_needed: '08/15/2026',
        approved_vendor: 'Voltaic Power Contractors', priority: 'HIGH' },

      { no: 8, trade: 'Joinery / Millwork', scope: 'Reception desk, pantry cabinetry & bespoke wall panels',
        budget: 4100000, endorsed_vendor: 'Artisan Woodcraft Studio', endorsement_date: '05/06/2026',
        endorsed_amount: 3980000, savings_budget_endorsed: 120000, vendor_timeline: '9 weeks',
        date_needed: '09/12/2026', approved_vendor: 'Artisan Woodcraft Studio', priority: 'MEDIUM',
        awarded_vendor: 'Artisan Woodcraft Studio', pr_no: 'PR-2026-018', negotiated_proposal: 3960000,
        po_amount: 3960000, date_of_po: '05/18/2026', po_no: 'PO-2026-0131', date_issuance_po: '05/20/2026',
        savings_endorsed_po: 20000, po_remarks: 'Invoice pending final measurement' },

      { no: 9, trade: 'Signage & Wayfinding', scope: 'Exterior building signage, floor directories & room signs',
        budget: 1400000, date_needed: '10/01/2026', priority: 'LOW' },

      { no: 10, trade: 'Auxiliary / ELV Systems', scope: 'Structured cabling, CCTV, access control & PA system',
        budget: 3600000, endorsed_vendor: 'ConnectPro Technologies', endorsement_date: '05/12/2026',
        endorsed_amount: 3520000, savings_budget_endorsed: 80000, vendor_timeline: '8 weeks',
        date_needed: '09/25/2026', approved_vendor: 'ConnectPro Technologies', priority: 'MEDIUM',
        awarded_vendor: 'ConnectPro Technologies', pr_no: 'PR-2026-021', negotiated_proposal: 3500000,
        po_amount: 3500000, date_of_po: '05/26/2026', po_no: 'PO-2026-0138', date_issuance_po: '05/27/2026',
        savings_endorsed_po: 20000 },

      { no: 11, trade: 'Special Finishes', scope: 'Glass partitions, feature metal cladding & stone accents',
        budget: 2900000, endorsed_vendor: 'Lumina Facade Works', endorsement_date: '06/03/2026',
        endorsed_amount: 2850000, savings_budget_endorsed: 50000, vendor_timeline: '6 weeks',
        date_needed: '09/30/2026', approved_vendor: 'Lumina Facade Works', priority: 'MEDIUM' },

      { no: 12, trade: 'Doors & Ironmongery', scope: 'Fire-rated doors, glass doors & architectural hardware',
        budget: 1900000, date_needed: '10/10/2026', priority: 'LOW', remarks: 'For endorsement next cycle' },
    ]);

    const meridian = mk('meridian-p1', [
      { no: 1, trade: 'Preliminaries', scope: 'Site clearing, hoarding & temporary utilities',
        budget: 1200000, endorsed_vendor: 'Crescent Site Works', endorsement_date: '06/16/2026',
        endorsed_amount: 1180000, savings_budget_endorsed: 20000, vendor_timeline: '2 weeks',
        date_needed: '08/01/2026', approved_vendor: 'Crescent Site Works', priority: 'HIGH' },

      { no: 2, trade: 'Structural Retrofit', scope: 'Column jacketing & slab reinforcement for retail loads',
        budget: 6800000, date_needed: '09/05/2026', priority: 'HIGH', remarks: 'Pending structural engineer sign-off' },

      { no: 3, trade: 'Storefront / Curtain Wall', scope: 'Aluminium & glazed storefront system for mall frontage',
        budget: 7500000, endorsed_vendor: 'ClearView Glazing Corp.', endorsement_remarks: 'LONG LEAD ITEMS',
        endorsement_date: '06/28/2026', endorsed_amount: 7380000, savings_budget_endorsed: 120000,
        vendor_timeline: '15 weeks (imported profiles)', date_needed: '08/12/2026',
        approved_vendor: 'ClearView Glazing Corp.', priority: 'HIGH' },

      { no: 4, trade: 'MEP Rough-in', scope: 'Mechanical, electrical & plumbing rough-in for shell units',
        budget: 5400000, date_needed: '09/20/2026', priority: 'MEDIUM' },

      { no: 5, trade: 'Interior Fit-Out', scope: 'Anchor tenant fit-out — flooring, ceiling & partitions',
        budget: 4600000, endorsed_vendor: 'Metro Interiors Group', endorsement_date: '07/07/2026',
        endorsed_amount: 4520000, savings_budget_endorsed: 80000, vendor_timeline: '10 weeks',
        date_needed: '10/15/2026', approved_vendor: 'Metro Interiors Group', priority: 'MEDIUM' },
    ]);

    return aurora.concat(meridian);
  }

  /* ── HttpError — thrown to short-circuit a handler with a status code ── */
  function fail(status, message) { throw { __http: true, status, message }; }

  /* ── Session / auth ── */
  function currentUser() {
    const s = read(KEY.session, null);
    if (!s) return null;
    if (s.expires && Date.now() > s.expires) { localStorage.removeItem(KEY.session); return null; }
    return s;
  }
  function refreshSession() {
    const s = read(KEY.session, null);
    if (s) { s.expires = Date.now() + SESSION_LIFETIME * 1000; write(KEY.session, s); }
  }
  function requireAuth(minRole) {
    minRole = minRole || 'viewer';
    const u = currentUser();
    if (!u) fail(401, 'Authentication required');
    const levels = { viewer: 0, editor: 1, admin: 2 };
    const have = levels[u.role]; const need = levels[minRole];
    if ((have === undefined ? -1 : have) < (need === undefined ? 99 : need)) {
      fail(403, "This action requires '" + minRole + "' access or higher");
    }
    return u;
  }
  function requireAdmin() {
    const u = currentUser();
    if (!u) fail(401, 'Not authenticated');
    if (u.role !== 'admin') fail(403, 'Admin access required');
    return u;
  }

  /* ── Data accessors ── */
  const getProjects = () => read(KEY.projects, []);
  const getItems    = () => read(KEY.items, []);
  const getAudit    = () => read(KEY.audit, []);
  const getUsers    = () => read(KEY.users, []);

  function adminUsernames() {
    return new Set(getUsers().filter(u => u.role === 'admin').map(u => u.username));
  }

  /* ── Audit helpers (mirror api.php) ── */
  function auditLog(user, action, entity, projectId, itemNo, itemScope, changes) {
    const rows = getAudit();
    const nextId = rows.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
    rows.push({
      id: nextId,
      user_id: user.id,
      username: user.username,
      action, entity,
      project_id: projectId,
      item_no: itemNo,
      item_scope: itemScope,
      changes,
      changed_at: nowIso(),
    });
    write(KEY.audit, rows);
  }

  function isNumericVal(v) {
    return v !== '' && v !== null && v !== undefined && !isNaN(v);
  }
  function diffChanges(oldRow, newRow, fields) {
    const changes = {};
    for (const f of fields) {
      const o = (oldRow[f] === undefined || oldRow[f] === null) ? '' : oldRow[f];
      const n = (newRow[f] === undefined || newRow[f] === null) ? '' : newRow[f];
      if (isNumericVal(o) && isNumericVal(n)) {
        if (parseFloat(o) === parseFloat(n)) continue;
      } else if (String(o) === String(n)) {
        continue;
      }
      changes[f] = { old: o === '' ? null : o, new: n === '' ? null : n };
    }
    return changes;
  }

  /* ── Shape helpers ── */
  function castItem(row) {
    const out = {};
    for (const k in row) {
      if (k === 'project_id' || k === 'id' || k === 'parent_no') continue;
      out[k] = row[k] === null ? '' : row[k];
    }
    out.no = parseInt(row.no) || 0;
    NUM_FIELDS.forEach(f => { out[f] = row[f] !== undefined ? (parseFloat(row[f]) || 0) : 0; });
    return out;
  }
  function blankItemFields(item) {
    const out = {};
    ITEM_FIELDS.forEach(f => {
      let v = item[f];
      if (v === undefined || v === null) v = NUM_FIELDS.has(f) ? 0 : '';
      if (NUM_FIELDS.has(f)) v = parseFloat(v) || 0;
      out[f] = v;
    });
    return out;
  }
  function snapshotOf(item) {
    const snap = {};
    for (const f of ITEM_FIELDS) {
      const v = item[f];
      if (v !== '' && v !== null && v !== undefined && v !== 0) snap[f] = v;
    }
    return snap;
  }

  /* ==========================================================
     API endpoint handlers (formerly php/api.php)
     ========================================================== */
  const apiHandlers = {

    get_projects() {
      requireAuth();
      const items = getItems();
      const audit = getAudit();
      const rows = getProjects().slice().sort((a, b) =>
        (b.is_default - a.is_default) ||
        (String(a.created_at).localeCompare(String(b.created_at)))
      );
      return rows.map(p => {
        const its = items.filter(i => i.project_id === p.id);
        const totalBudget = parseFloat(p.total_budget) || 0;
        const totalEndorsed = its.reduce((s, i) => s + (i.endorsed_amount > 0 ? i.endorsed_amount : 0), 0);
        const stats = {
          total_items:     its.length,
          endorsed_count:  its.filter(i => i.endorsed_amount > 0).length,
          with_po_count:   its.filter(i => i.po_no !== '' && i.po_no != null).length,
          long_lead_count: its.filter(i => i.endorsement_remarks === 'LONG LEAD ITEMS').length,
          total_endorsed:  totalEndorsed,
          total_po:        its.reduce((s, i) => s + (i.po_no ? (i.po_amount || 0) : 0), 0),
          total_savings:   its.reduce((s, i) => s + (i.po_no ? (i.savings_endorsed_po || 0) : 0), 0),
          balance:         totalBudget - totalEndorsed,
          budget:          totalBudget,
          no_commercial_endorsement: parseInt(p.no_need_commercial_endorsement) || 0,
          audit_count:     audit.filter(a => a.project_id === p.id).length,
        };
        return Object.assign({}, p, { stats });
      });
    },

    get_project(params) {
      requireAuth();
      const id = params.get('id') || '';
      if (id === '') fail(400, 'id is required');
      const p = getProjects().find(x => x.id === id);
      if (!p) fail(404, "Project '" + id + "' not found");
      return p;
    },

    create_project(params, body) {
      const user = requireAuth('editor');
      if (!body.id)   fail(400, 'id is required');
      if (!body.name) fail(400, 'name is required');

      const projects = getProjects();
      if (projects.some(p => p.id === body.id)) fail(409, "Project '" + body.id + "' already exists");

      const row = {
        id: body.id,
        name: body.name,
        code: body.code || '',
        client: body.client || '',
        status: body.status || 'active',
        total_budget: parseFloat(body.budget) || 0,
        start_date: body.startDate || '',
        notes: body.notes || '',
        color_index: parseInt(body.colorIndex) || 0,
        no_need_commercial_endorsement: parseInt(body.no_need_commercial_endorsement) || 0,
        is_default: 0,
        created_at: nowIso(),
      };
      projects.push(row);
      write(KEY.projects, projects);

      const incoming = Array.isArray(body.items) ? body.items : [];
      if (incoming.length) {
        const items = getItems();
        const existing = new Set(items.filter(i => i.project_id === body.id).map(i => i.no));
        incoming.forEach(it => {
          const no = parseInt(it.no) || 0;
          if (existing.has(no)) return; // INSERT IGNORE semantics
          existing.add(no);
          items.push(Object.assign({ project_id: body.id, no }, blankItemFields(it)));
        });
        write(KEY.items, items);
      }

      auditLog(user, 'create', 'project', body.id, null, body.name, {
        snapshot: (() => {
          const snap = { name: body.name };
          if (body.code)   snap.code = body.code;
          if (body.client) snap.client = body.client;
          snap.status = body.status || 'active';
          if (body.budget) snap.budget = body.budget;
          return snap;
        })(),
      });
      return row;
    },

    update_project(params, body) {
      const user = requireAuth('editor');
      if (!body.id) fail(400, 'id is required');

      const projects = getProjects();
      const idx = projects.findIndex(p => p.id === body.id);
      if (idx === -1) fail(404, "Project '" + body.id + "' not found");
      const oldRow = projects[idx];

      const map = { budget: 'total_budget', startDate: 'start_date', colorIndex: 'color_index' };
      const merged = Object.assign({}, body);
      for (const js in map) if (js in body) merged[map[js]] = body[js];

      const allowed = ['name','code','client','status','total_budget','start_date','notes',
                       'color_index','no_need_commercial_endorsement'];
      const updFields = [];
      const newRow = Object.assign({}, oldRow);
      allowed.forEach(f => {
        if (f in merged) {
          let v = merged[f];
          if (f === 'total_budget') v = parseFloat(v) || 0;
          if (f === 'color_index' || f === 'no_need_commercial_endorsement') v = parseInt(v) || 0;
          newRow[f] = v;
          updFields.push(f);
        }
      });
      if (!updFields.length) fail(400, 'No valid fields to update');

      projects[idx] = newRow;
      write(KEY.projects, projects);

      const changes = diffChanges(oldRow, newRow, updFields);
      if (Object.keys(changes).length) {
        auditLog(user, 'update', 'project', body.id, null, oldRow.name, changes);
      }
      return newRow;
    },

    delete_project(params, body) {
      const user = requireAuth('admin');
      const id = body.id || '';
      if (id === '') fail(400, 'id is required');

      const projects = getProjects();
      const proj = projects.find(p => p.id === id);
      if (!proj) fail(404, "Project '" + id + "' not found");

      write(KEY.projects, projects.filter(p => p.id !== id));
      write(KEY.items, getItems().filter(i => i.project_id !== id)); // cascade
      auditLog(user, 'delete', 'project', id, null, proj.name, {});
      return null;
    },

    get_items(params) {
      requireAuth();
      const pid = params.get('project_id') || '';
      if (pid === '') fail(400, 'project_id is required');
      const rows = getItems()
        .filter(i => i.project_id === pid)
        .sort((a, b) => (a.no || 0) - (b.no || 0))
        .map(castItem);
      return { items: rows, total: rows.length };
    },

    update_item(params, body) {
      const user = requireAuth('editor');
      const pid = body.project_id || '';
      const no  = parseInt(body.no) || 0;
      if (pid === '') fail(400, 'project_id is required');
      if (no === 0)   fail(400, 'no is required');

      const items = getItems();
      const idx = items.findIndex(i => i.project_id === pid && i.no === no);
      if (idx === -1) fail(404, "Item #" + no + " not found in project '" + pid + "'");
      const oldRow = items[idx];

      const newRow = Object.assign({}, oldRow);
      const touched = [];
      ITEM_FIELDS.forEach(f => {
        if (f in body) {
          newRow[f] = NUM_FIELDS.has(f) ? (parseFloat(body[f]) || 0) : body[f];
          touched.push(f);
        }
      });
      if (!touched.length) fail(400, 'No valid fields to update');

      items[idx] = newRow;
      write(KEY.items, items);

      const changes = diffChanges(oldRow, body, touched);
      const note = body._note ? String(body._note).trim() : '';
      if (note !== '') changes._note = note;
      if (Object.keys(changes).length) {
        auditLog(user, 'update', 'item', pid, no, oldRow.scope, changes);
      }
      return castItem(newRow);
    },

    add_item(params, body) {
      const user = requireAuth('editor');
      const pid = body.project_id || '';
      const no  = parseInt(body.no) || 0;
      if (pid === '') fail(400, 'project_id is required');
      if (no === 0)   fail(400, 'no is required');

      const items = getItems();
      if (items.some(i => i.project_id === pid && i.no === no)) {
        fail(409, "Item #" + no + " already exists in project '" + pid + "'");
      }
      const row = Object.assign({ project_id: pid, no }, blankItemFields(body));
      items.push(row);
      write(KEY.items, items);

      auditLog(user, 'create', 'item', pid, no, row.scope || '', { snapshot: snapshotOf(row) });
      return castItem(row);
    },

    delete_item(params, body) {
      const user = requireAuth('editor');
      const pid = body.project_id || '';
      const no  = parseInt(body.no) || 0;
      if (pid === '') fail(400, 'project_id is required');
      if (no === 0)   fail(400, 'no is required');

      const items = getItems();
      const row = items.find(i => i.project_id === pid && i.no === no);
      if (!row) fail(404, "Item #" + no + " not found in project '" + pid + "'");

      write(KEY.items, items.filter(i => !(i.project_id === pid && i.no === no)));
      auditLog(user, 'delete', 'item', pid, no, row.scope || '', { snapshot: snapshotOf(row) });
      return null;
    },

    get_item_history(params) {
      const viewer = requireAuth();
      const pid = params.get('project_id') || '';
      const no  = parseInt(params.get('no')) || 0;
      if (pid === '') fail(400, 'project_id is required');
      if (no === 0)   fail(400, 'no is required');

      const admins = adminUsernames();
      const isAdmin = viewer.role === 'admin';
      return getAudit()
        .filter(a => a.project_id === pid && a.item_no === no && a.entity === 'item')
        .filter(a => isAdmin || !admins.has(a.username))
        .sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at)))
        .slice(0, 200)
        .map(a => ({ id: a.id, username: a.username, action: a.action, changes: a.changes, changed_at: a.changed_at }));
    },

    get_audit_log(params) {
      const viewer = requireAuth('editor');
      const isAdmin = viewer.role === 'admin';
      const pid = params.get('project_id') || '';
      const limit  = Math.min(Math.max(parseInt(params.get('limit'))  || 100, 1), 500);
      const offset = Math.max(parseInt(params.get('offset')) || 0, 0);

      const admins = adminUsernames();
      let rows = getAudit()
        .filter(a => (pid === '' || a.project_id === pid))
        .filter(a => isAdmin || !admins.has(a.username))
        .sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at)));

      const total = rows.length;
      const page = rows.slice(offset, offset + limit).map(a => ({
        id: a.id, username: a.username, action: a.action, entity: a.entity,
        project_id: a.project_id, item_no: a.item_no, item_scope: a.item_scope,
        changes: a.changes, changed_at: a.changed_at,
      }));
      return { logs: page, total, limit, offset };
    },
  };

  /* ==========================================================
     AUTH endpoint handlers (formerly php/auth.php)
     ========================================================== */
  const authHandlers = {

    me() {
      const u = currentUser();
      if (!u) fail(401, 'Not authenticated');
      refreshSession();
      return { id: u.user_id, username: u.username, full_name: u.full_name, role: u.role,
               session_lifetime: SESSION_LIFETIME };
    },

    ping() {
      const u = currentUser();
      if (!u) fail(401, 'Not authenticated');
      refreshSession();
      return { session_lifetime: SESSION_LIFETIME };
    },

    login(params, body) {
      const username = String(body.username || '').trim();
      const password = body.password || '';
      if (username === '' || password === '') fail(400, 'Username and password are required');

      const users = getUsers();
      const user = users.find(u => u.username === username);
      if (!user || user.password_hash !== hashPw(password)) {
        fail(401, 'Invalid username or password');
      }
      user.last_login = nowIso();
      write(KEY.users, users);

      write(KEY.session, {
        user_id: user.id, username: user.username, full_name: user.full_name,
        role: user.role, expires: Date.now() + SESSION_LIFETIME * 1000,
      });
      return { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
    },

    logout() {
      localStorage.removeItem(KEY.session);
      return null;
    },

    change_password(params, body) {
      const u = currentUser();
      if (!u) fail(401, 'Not authenticated');
      const current = body.current_password || '';
      const newpw   = body.new_password || '';
      if (String(newpw).length < 8) fail(400, 'New password must be at least 8 characters');

      const users = getUsers();
      const user = users.find(x => x.id === u.user_id);
      if (!user || user.password_hash !== hashPw(current)) {
        fail(400, 'Current password is incorrect');
      }
      user.password_hash = hashPw(newpw);
      write(KEY.users, users);
      return null;
    },

    get_users() {
      requireAdmin();
      return getUsers().map(u => ({
        id: u.id, username: u.username, full_name: u.full_name,
        role: u.role, created_at: u.created_at, last_login: u.last_login,
      }));
    },

    create_user(params, body) {
      requireAdmin();
      const uname = String(body.username || '').trim();
      const pw    = body.password || '';
      const fname = String(body.full_name || '').trim();
      const role  = body.role || 'viewer';

      if (uname === '') fail(400, 'Username is required');
      if (!/^[a-zA-Z0-9_.\-]{3,50}$/.test(uname)) fail(400, 'Username: 3-50 chars, letters/digits/._- only');
      if (String(pw).length < 8) fail(400, 'Password must be at least 8 characters');
      if (!['admin','editor','viewer'].includes(role)) fail(400, 'Invalid role');

      const users = getUsers();
      if (users.some(u => u.username === uname)) fail(409, "Username '" + uname + "' already exists");

      const id = users.reduce((m, u) => Math.max(m, u.id || 0), 0) + 1;
      users.push({ id, username: uname, password_hash: hashPw(pw), full_name: fname,
                   role, created_at: nowIso(), last_login: null });
      write(KEY.users, users);
      return { id, username: uname, full_name: fname, role };
    },

    update_user(params, body) {
      requireAdmin();
      const id = parseInt(body.id) || 0;
      if (id === 0) fail(400, 'id is required');

      const users = getUsers();
      const user = users.find(u => u.id === id);
      if (!user) fail(404, 'User not found');

      let touched = false;
      if ('full_name' in body) { user.full_name = String(body.full_name).trim(); touched = true; }
      if ('role' in body) {
        if (!['admin','editor','viewer'].includes(body.role)) fail(400, 'Invalid role');
        user.role = body.role; touched = true;
      }
      if (body.password) {
        if (String(body.password).length < 8) fail(400, 'Password must be at least 8 characters');
        user.password_hash = hashPw(body.password); touched = true;
      }
      if (!touched) fail(400, 'Nothing to update');
      write(KEY.users, users);
      return null;
    },

    delete_user(params, body) {
      requireAdmin();
      const id = parseInt(body.id) || 0;
      if (id === 0) fail(400, 'id is required');
      const u = currentUser();
      if (u && u.user_id === id) fail(400, 'You cannot delete your own account');

      const users = getUsers();
      if (!users.some(x => x.id === id)) fail(404, 'User not found');
      write(KEY.users, users.filter(x => x.id !== id));
      return null;
    },
  };

  /* ==========================================================
     Dispatcher + fetch shim
     ========================================================== */
  function makeResponse(status, payload) {
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  }

  async function localFetch(url, opt) {
    ensureSeed();
    opt = opt || {};

    let parsed;
    try { parsed = new URL(url, window.location.href); }
    catch { return makeResponse(400, { success: false, error: 'Bad request URL' }); }

    const isAuth  = parsed.pathname.indexOf('auth.php') !== -1;
    const handlers = isAuth ? authHandlers : apiHandlers;
    const action  = parsed.searchParams.get('action') || '';

    let body = {};
    if (opt.body) { try { body = JSON.parse(opt.body); } catch { body = {}; } }

    const handler = handlers[action];
    if (!handler) return makeResponse(404, { success: false, error: "Unknown action: '" + action + "'" });

    try {
      const data = handler(parsed.searchParams, body);
      return makeResponse(200, { success: true, data });
    } catch (e) {
      if (e && e.__http) return makeResponse(e.status, { success: false, error: e.message });
      console.error('LocalDB error:', e);
      return makeResponse(500, { success: false, error: 'Internal error: ' + (e && e.message ? e.message : e) });
    }
  }

  ensureSeed();

  return { fetch: localFetch, _keys: KEY, _hashPw: hashPw };
})();
