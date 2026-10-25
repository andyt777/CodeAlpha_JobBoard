// Shared UI helpers: icons, DOM building, API calls, form validation, loading states, toasts.

// ---------- icons (Lucide-style, MIT) ----------
const ICONS = {
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
  pointer: '<path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  sparkles: '<path d="M9.94 14.06 4 20"/><path d="m12 2 1.9 5.7L19.6 9.6 13.9 11.5 12 17.2l-1.9-5.7L4.4 9.6l5.7-1.9z"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 3 2h2Zm0 0v7"/>',
  chef: '<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/>',
  table: '<path d="M3 3h18v4H3z"/><path d="M5 7v14"/><path d="M19 7v14"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
};

export function icon(name, size = 18, strokeWidth = 2) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
}

/** Replaces <i data-icon="name" data-size="20"></i> placeholders with SVGs. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]:not([data-icon-done])').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, el.dataset.size ?? 18));
    el.dataset.iconDone = '';
  });
}

// ---------- DOM ----------
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/**
 * h('div', { className: 'card', onClick }, 'text', child) — builds elements.
 * Strings become text nodes (never HTML), so user data is always escaped.
 * Use { html: icon('x') } to insert trusted markup such as icons.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'className') el.className = value;
    else if (key === 'html') el.insertAdjacentHTML('beforeend', value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export const iconEl = (name, size = 18) => h('span', { className: 'i', html: icon(name, size), style: { display: 'inline-flex' } });

// ---------- session ----------
const TOKEN_KEY = 'token';
export const session = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set token(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage unavailable (private mode) */ }
  },
};

// ---------- API ----------
export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** fetch wrapper: JSON in/out, bearer token, friendly errors. */
export async function api(path, { method = 'GET', body, form, auth = true } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(auth && session.token && { Authorization: `Bearer ${session.token}` }),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError("We couldn't reach the server. Check your connection and try again.", 0);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (res.status === 401 && session.token) {
    session.token = null;
    window.dispatchEvent(new CustomEvent('session-expired'));
  }
  if (!res.ok) {
    const fallback = res.status >= 500 ? 'Something went wrong on our side. Please try again in a moment.' : 'Request failed';
    throw new ApiError(data?.error || fallback, res.status, data?.details);
  }
  return data;
}

// ---------- feedback ----------
export function toast(message, { type = 'success' } = {}) {
  let el = $('#toast');
  if (!el) {
    el = h('div', { id: 'toast', className: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.replaceChildren(iconEl(type === 'error' ? 'alert' : 'checkCircle', 18), message);
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}

/** Puts a button into its loading state (disabled + spinner) while `fn` runs. */
export async function withLoading(button, fn) {
  if (!button) return fn();
  button.setAttribute('aria-busy', 'true');
  button.disabled = true;
  try {
    return await fn();
  } finally {
    button.removeAttribute('aria-busy');
    button.disabled = false;
  }
}

// ---------- form validation ----------
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const rules = {
  required: (message = 'This field is required') => (v) => (String(v ?? '').trim() ? null : message),
  email: (message = 'Enter a valid email address, e.g. name@example.com') => (v) => (!v || EMAIL.test(String(v).trim()) ? null : message),
  minLength: (n, message) => (v) => (!v || String(v).length >= n ? null : message ?? `Use at least ${n} characters`),
  maxLength: (n, message) => (v) => (!v || String(v).length <= n ? null : message ?? `Use at most ${n} characters`),
  min: (n, message) => (v) => (v === '' || Number(v) >= n ? null : message ?? `Must be at least ${n}`),
  max: (n, message) => (v) => (v === '' || Number(v) <= n ? null : message ?? `Must be at most ${n}`),
  pattern: (re, message) => (v) => (!v || re.test(String(v)) ? null : message),
  future: (message = 'Pick a time in the future') => (v) => (!v || new Date(v) > new Date() ? null : message),
  url: (message = 'Enter a valid link, e.g. https://example.com/page') => (v) => {
    if (!v) return null;
    const raw = /^[a-z][a-z0-9+.-]*:/i.test(v.trim()) ? v.trim() : `https://${v.trim()}`;
    try {
      const u = new URL(raw);
      return ['http:', 'https:'].includes(u.protocol) && (u.hostname.includes('.') || u.hostname === 'localhost') ? null : message;
    } catch {
      return message;
    }
  },
};

function fieldWrapper(input) {
  return input.closest('.field') ?? input.parentElement;
}

export function setFieldError(input, message) {
  const field = fieldWrapper(input);
  let errorEl = field.querySelector('.field-error');
  if (!errorEl) {
    errorEl = h('div', { className: 'field-error', role: 'alert' });
    field.append(errorEl);
  }
  field.classList.toggle('invalid', !!message);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  errorEl.replaceChildren(...(message ? [iconEl('alert', 14), message] : []));
}

/**
 * Validates `form` against { fieldName: [rule, rule] }. Shows errors under fields,
 * focuses the first invalid one and clears errors as the user types.
 * Returns true when everything is valid.
 */
export function validate(form, schema) {
  let firstInvalid = null;
  for (const [name, checks] of Object.entries(schema)) {
    const input = form.elements[name];
    if (!input || input.closest('[hidden]')) continue;
    const value = input.type === 'checkbox' ? input.checked : input.value;
    const message = checks.map((check) => check(value)).find(Boolean) ?? null;
    setFieldError(input, message);
    if (message && !firstInvalid) firstInvalid = input;
    if (!input.dataset.liveValidation) {
      input.dataset.liveValidation = '1';
      input.addEventListener('input', () => {
        if (fieldWrapper(input).classList.contains('invalid')) {
          const msg = checks.map((check) => check(input.value)).find(Boolean) ?? null;
          setFieldError(input, msg);
        }
      });
    }
  }
  firstInvalid?.focus();
  return !firstInvalid;
}

/**
 * Shows a server error under the field it belongs to. `fieldHints` maps field names to
 * patterns matched against the message; `fallbackField` receives anything unmatched,
 * so errors always appear next to an input instead of shifting the layout.
 */
export function showFormError(form, err, fieldHints = {}, { fallbackField } = {}) {
  const alert = form.querySelector('.form-alert');
  const target = Object.entries(fieldHints).find(([field, pattern]) => pattern.test(err.message) && form.elements[field])?.[0]
    ?? (fallbackField && form.elements[fallbackField] ? fallbackField : null);
  if (target) {
    setFieldError(form.elements[target], err.message);
    form.elements[target].focus();
    if (alert) alert.textContent = '';
    return;
  }
  if (alert) alert.textContent = err.message;
  else toast(err.message, { type: 'error' });
}

export function clearFormErrors(form) {
  form.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
  const alert = form.querySelector('.form-alert');
  if (alert) alert.textContent = '';
}

// ---------- dialogs ----------
/** Accessible confirm dialog (replaces window.confirm). Resolves true/false. */
export function confirmDialog({ title, message, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { className: 'modal' },
      h('div', { className: 'modal-body' },
        h('div', { className: 'modal-head' }, h('div', {}, h('h2', {}, title), message && h('p', {}, message))),
        h('div', { className: 'actions', style: { justifyContent: 'flex-end' } },
          h('button', { className: 'btn btn-secondary', value: 'cancel', onClick: () => dialog.close('cancel') }, 'Cancel'),
          h('button', { className: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => dialog.close('ok') }, confirmText),
        ),
      ),
    );
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** Closes any <dialog> when its backdrop is clicked. */
export function enableBackdropClose() {
  document.addEventListener('click', (e) => {
    if (e.target instanceof HTMLDialogElement && e.target.open) e.target.close();
  });
}

// ---------- formatting ----------
export const fmt = {
  number: (n) => Number(n ?? 0).toLocaleString('en-US'),
  date: (iso) => new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
  dateTime: (iso) => new Date(iso).toLocaleString('en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  time: (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  relative(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    return fmt.date(iso);
  },
  label: (s) => String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
};

/** Animates a number from 0 to `value` (used by the social-proof stats). */
export function countUp(el, value) {
  const target = Number(value) || 0;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || target < 10) {
    el.textContent = fmt.number(target);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / 900, 1);
    el.textContent = fmt.number(Math.round(target * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Consistent colour per string (company names, domains...). */
const PALETTE = ['#0d9488', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#4f46e5', '#b45309', '#be123c'];
export function colorFor(text) {
  let hash = 0;
  for (const ch of String(text)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function initials(text) {
  return String(text).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

/** Only one FAQ item open at a time. */
export function singleOpenFaq(root = document) {
  $$('.faq details', root).forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) $$('.faq details', root).forEach((other) => other !== d && (other.open = false));
  }));
}
