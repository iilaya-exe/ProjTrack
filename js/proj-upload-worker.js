'use strict';
importScripts('xlsx.full.min.js');

self.onmessage = function(e) {
  try {
    const wb = XLSX.read(e.data, { type: 'array', cellDates: true });
    const sheets = wb.SheetNames.map(name => ({
      name,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true }),
    }));
    self.postMessage({ ok: true, sheets });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
