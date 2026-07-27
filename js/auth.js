'use strict';

/* ============================================================
   Auth — session check, role helpers, user badge rendering.
   Loaded before any page-specific script on every HTML page.
============================================================ */
const Auth = {
  user: null,
  _cpwTimer: null,
  _sessionWarnTimer: null,
  _sessionExpireTimer: null,

  /* Called once on DOMContentLoaded.
     Verifies the session; redirects to login.html if not authenticated.
     Returns the user object on success, null if redirecting. */
  async init() {
    try {
      const res  = await fetch('php/auth.php?action=me');
      const json = await res.json().catch(() => null);
      if (!json || !json.success) { this._toLogin(); return null; }
      this.user = json.data;
      this._renderBadge();
      this._startSessionTimers(json.data.session_lifetime || 1440);
      return this.user;
    } catch {
      this._toLogin();
      return null;
    }
  },

  _startSessionTimers(lifetimeSecs) {
    clearTimeout(this._sessionWarnTimer);
    clearTimeout(this._sessionExpireTimer);
    const warnMs   = Math.max(0, (lifetimeSecs - 120)) * 1000;  // warn 2 min before
    const expireMs = lifetimeSecs * 1000;
    this._sessionWarnTimer   = setTimeout(() => this._showSessionWarning(), warnMs);
    this._sessionExpireTimer = setTimeout(() => this._dismissSessionWarning(), expireMs);
  },

  _showSessionWarning() {
    if (document.getElementById('session-warn-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'session-warn-toast';
    toast.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#92400e" stroke-width="2" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span style="font-size:.85rem;color:#78350f;font-weight:500;flex:1;">Your session will expire in about 2 minutes.</span>
        <button id="session-warn-stay" style="background:#d97706;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:.8rem;font-weight:600;cursor:pointer;white-space:nowrap;">Stay Logged In</button>
        <button id="session-warn-close" style="background:none;border:none;cursor:pointer;font-size:1rem;color:#92400e;line-height:1;padding:2px 4px;">&#x2715;</button>
      </div>`;
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9990;background:#fef3c7;border:1.5px solid #fcd34d;border-radius:10px;padding:12px 16px;box-shadow:0 8px 24px rgba(0,0,0,.15);min-width:360px;max-width:520px;';
    document.body.appendChild(toast);
    document.getElementById('session-warn-close').onclick = () => this._dismissSessionWarning();
    document.getElementById('session-warn-stay').onclick  = () => this._keepAlive();
  },

  _dismissSessionWarning() {
    const t = document.getElementById('session-warn-toast');
    if (t) t.remove();
  },

  async _keepAlive() {
    try {
      const res  = await fetch('php/auth.php?action=ping', { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!json || !json.success) { this.sessionExpired(); return; }
      this._dismissSessionWarning();
      this._startSessionTimers(json.data.session_lifetime || 1440);
    } catch {
      this.sessionExpired();
    }
  },

  _toLogin() {
    const here = encodeURIComponent(window.location.href);
    window.location.replace('login.html?next=' + here);
  },

  sessionExpired() {
    if (document.getElementById('session-expired-overlay')) return;
    this.user = null;
    const here = encodeURIComponent(window.location.href);
    const el = document.createElement('div');
    el.id = 'session-expired-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;';
    el.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:40px 36px;max-width:380px;width:90%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.28);">
        <div style="width:52px;height:52px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h3 style="margin:0 0 8px;font-size:1.1rem;font-weight:700;color:#111827;">Session Expired</h3>
        <p style="margin:0 0 24px;font-size:.875rem;color:#6b7280;line-height:1.65;">Your session has timed out due to inactivity. Please log in again to continue.</p>
        <a href="login.html?next=${here}" style="display:inline-block;padding:10px 32px;background:#2563eb;color:#fff;border-radius:8px;font-weight:600;font-size:.9rem;text-decoration:none;letter-spacing:.01em;">
          Log In Again
        </a>
      </div>`;
    document.body.appendChild(el);
  },

  async logout() {
    try { await fetch('php/auth.php?action=logout', { method: 'POST' }); } catch {}
    window.location.replace('login.html');
  },

  showChangePasswordModal() {
    if (this._cpwTimer) { clearTimeout(this._cpwTimer); this._cpwTimer = null; }
    let overlay = document.getElementById('changepw-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      document.getElementById('cpw-current').value = '';
      document.getElementById('cpw-new').value     = '';
      document.getElementById('cpw-confirm').value = '';
      document.getElementById('cpw-error').style.display   = 'none';
      document.getElementById('cpw-success').style.display = 'none';
      setTimeout(() => document.getElementById('cpw-current').focus(), 50);
      return;
    }
    overlay = document.createElement('div');
    overlay.id = 'changepw-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
    overlay.addEventListener('click', e => { if (e.target === overlay) Auth.closeChangePasswordModal(); });
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:10px;padding:20px 22px;max-width:380px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <h3 style="margin:0;font-size:0.95rem;font-weight:700;color:#111827;">Change Password</h3>
          <button onclick="Auth.closeChangePasswordModal()" style="background:none;border:none;cursor:pointer;font-size:1rem;color:#6b7280;line-height:1;padding:3px;">&#x2715;</button>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Current Password</label>
            <input id="cpw-current" type="password" class="form-input" autocomplete="current-password" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">New Password</label>
            <input id="cpw-new" type="password" class="form-input" autocomplete="new-password" placeholder="Min 8 characters" />
          </div>
        </div>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="form-group">
            <label class="form-label">Confirm New Password</label>
            <input id="cpw-confirm" type="password" class="form-input" autocomplete="new-password" />
          </div>
        </div>
        <div id="cpw-error"   style="display:none;color:#b91c1c;font-size:.78rem;margin-bottom:8px;"></div>
        <div id="cpw-success" style="display:none;color:#16a34a;font-size:.78rem;margin-bottom:8px;"></div>
        <div style="display:flex;gap:6px;justify-content:flex-end;">
          <button class="btn" onclick="Auth.closeChangePasswordModal()">Cancel</button>
          <button class="btn btn-primary" onclick="Auth.submitChangePassword()">Save Password</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('cpw-current').focus(), 50);
  },

  closeChangePasswordModal() {
    const el = document.getElementById('changepw-overlay');
    if (el) el.style.display = 'none';
  },

  async submitChangePassword() {
    const errEl = document.getElementById('cpw-error');
    const okEl  = document.getElementById('cpw-success');
    errEl.style.display = 'none';
    okEl.style.display  = 'none';
    const current = document.getElementById('cpw-current').value;
    const newpw   = document.getElementById('cpw-new').value;
    const confirm = document.getElementById('cpw-confirm').value;
    if (newpw.length < 8) {
      errEl.textContent = 'New password must be at least 8 characters.';
      errEl.style.display = ''; return;
    }
    if (newpw !== confirm) {
      errEl.textContent = 'New passwords do not match.';
      errEl.style.display = ''; return;
    }
    try {
      const res  = await fetch('php/auth.php?action=change_password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: newpw }),
      });
      if (res.status === 401) { this.closeChangePasswordModal(); this.sessionExpired(); return; }
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      okEl.textContent   = 'Password changed successfully!';
      okEl.style.display = '';
      document.getElementById('cpw-current').value = '';
      document.getElementById('cpw-new').value     = '';
      document.getElementById('cpw-confirm').value = '';
      this._cpwTimer = setTimeout(() => { this._cpwTimer = null; this.closeChangePasswordModal(); }, 1800);
    } catch (e) {
      errEl.textContent   = e.message;
      errEl.style.display = '';
    }
  },

  /* Permission check — called synchronously after init() */
  can(action) {
    if (!this.user) return false;
    const r = this.user.role;
    if (action === 'edit')   return r === 'admin' || r === 'editor';
    if (action === 'delete') return r === 'admin';
    if (action === 'admin')  return r === 'admin';
    return false;
  },

  /* Fills every .auth-slot element in the page with the user badge + sign-out */
  _renderBadge() {
    document.querySelectorAll('.auth-slot').forEach(slot => {
      if (!this.user) return;
      const initial = (this.user.full_name || this.user.username).charAt(0).toUpperCase();
      slot.innerHTML = `
        <span class="auth-user-badge">
          <span class="auth-avatar">${_authEsc(initial)}</span>
          <span class="auth-name">${_authEsc(this.user.full_name || this.user.username)}</span>
          <span class="auth-role-pill auth-role-${this.user.role}">${this.user.role}</span>
        </span>
        <button class="nav-link-btn" onclick="Auth.showChangePasswordModal()" title="Change password">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Password
        </button>
        <button class="nav-link-btn auth-signout-btn" onclick="Auth.logout()" title="Sign out">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16,17 21,12 16,7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign Out
        </button>
      `;
    });
  },
};

function _authEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
