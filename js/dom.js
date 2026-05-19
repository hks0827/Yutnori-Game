// ===== DOM / SVG UTILITIES =====

const SVG_NS = 'http://www.w3.org/2000/svg';

// SVG element factory
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// HTML element factory
function htmlEl(tag, opts = {}) {
  const el = document.createElement(tag);
  if (opts.className) el.className = opts.className;
  if (opts.text != null) el.textContent = opts.text;
  if (opts.html != null) el.innerHTML = opts.html;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
  if (opts.style) Object.assign(el.style, opts.style);
  return el;
}

function $(id) { return document.getElementById(id); }

// ---- Screen switching ----
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = $(`screen-${name}`);
  if (target) target.classList.add('active');
}

// ---- Notification ----
function showNotification(msg, type = 'info', areaId = 'notification-area') {
  let area = $(areaId);
  if (!area || !area.offsetParent) {
    area = $('setup-notification-area') || area;
  }
  if (!area) { console.warn(msg); return; }
  const el = htmlEl('div', { className: `notification ${type}`, text: msg });
  area.prepend(el);
  setTimeout(() => el.remove(), 4000);
}
