import {
  $, $$, h, api, icon, iconEl, hydrateIcons, toast, withLoading, validate, rules, showFormError,
  clearFormErrors, confirmDialog, countUp, colorFor, initials, fmt, singleOpenFaq, enableBackdropClose, session,
} from './ui.js';

const state = { user: null, signupRole: 'candidate', pendingAction: null, unread: 0 };
const PIPELINE = ['applied', 'reviewing', 'interview', 'offered', 'hired'];
const EMPLOYER_STATUSES = ['reviewing', 'interview', 'offered', 'hired', 'rejected'];
const STATUS_STYLE = { applied: 'brand', reviewing: '', interview: 'amber', offered: 'green', hired: 'green', rejected: 'red', withdrawn: 'red', open: 'green', closed: '' };
const TYPE_LABEL = { full_time: 'Full time', part_time: 'Part time', contract: 'Contract', internship: 'Internship' };
const firstName = (n) => String(n).split(' ')[0];
const badge = (status, text) => h('span', { className: `badge ${STATUS_STYLE[status] ?? ''}` }, text ?? fmt.label(status));
const companyLogo = (name, size) => h('div', { className: 'logo-sq', style: { background: colorFor(name), ...(size && { width: `${size}px`, height: `${size}px`, borderRadius: `${size / 4}px` }) } }, initials(name));

function salaryText(job) {
  const { salaryMin: a, salaryMax: b } = job;
  if (a == null && b == null) return null;
  const n = (x) => fmt.number(x);
  return a != null && b != null ? `${n(a)} – ${n(b)}` : `from ${n(a ?? b)}`;
}

// ---------- header ----------
function renderHeader() {
  const box = $('#header-actions');
  if (!state.user) {
    box.replaceChildren(
      h('button', { className: 'btn btn-ghost btn-sm', onClick: openLogin }, 'Log in'),
      h('button', { className: 'btn btn-cta btn-sm', onClick: () => goToSignup('candidate') }, 'Sign up free'),
    );
    return;
  }
  const link = { candidate: ['#/applications', 'My applications', 'file'], employer: ['#/listings', 'My listings', 'briefcase'], admin: ['#/admin', 'Admin', 'grid'] }[state.user.role];
  box.replaceChildren(
    h('a', { className: 'btn btn-ghost btn-sm hide-sm', href: link[0] }, iconEl(link[2], 16), link[1]),
    h('button', { className: 'icon-btn bell', 'aria-label': 'Notifications', onClick: openNotifications, html: icon('bell', 19) },
      state.unread ? h('span', { className: 'dot' }, state.unread > 9 ? '9+' : state.unread) : null),
    h('div', { className: 'user-chip' },
      h('span', { className: 'name' }, firstName(state.user.name)),
      h('span', { className: 'avatar', style: { background: colorFor(state.user.email) } }, initials(state.user.name)),
      h('button', { className: 'icon-btn', title: 'Log out', 'aria-label': 'Log out', html: icon('logout', 16), onClick: logout }),
    ),
  );
}

async function refreshUnread() {
  if (!state.user) return;
  try {
    const { unreadCount } = await api('/api/notifications?limit=1');
    if (unreadCount !== state.unread) {
      state.unread = unreadCount;
      renderHeader();
    }
  } catch { /* ignore */ }
}

// ---------- routing ----------
const PAGES = { home: 'page-home', applications: 'page-applications', listings: 'page-listings', admin: 'page-admin' };
const PAGE_ROLE = { applications: 'candidate', listings: 'employer', admin: 'admin' };

function route() {
  const page = location.hash.replace(/^#\/?/, '') || 'home';
  const id = PAGES[page] ?? 'page-home';
  if (PAGE_ROLE[page] && state.user?.role !== PAGE_ROLE[page]) {
    location.hash = '#/';
    if (!state.user) openLogin();
    return;
  }
  $$('dialog[open]').forEach((d) => d.close());
  Object.values(PAGES).forEach((p) => ($(`#${p}`).hidden = p !== id));
  window.scrollTo({ top: 0 });
  ({ 'page-home': loadHome, 'page-applications': loadApplications, 'page-listings': loadListings, 'page-admin': loadAdmin })[id]();
}
window.addEventListener('hashchange', route);

function scrollToSection(id) {
  const go = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  if ($('#page-home').hidden) {
    location.hash = '#/';
    setTimeout(go, 150);
  } else go();
}

document.addEventListener('click', (e) => {
  const scrollLink = e.target.closest('[data-scroll]');
  if (scrollLink) {
    e.preventDefault();
    $$('dialog[open]').forEach((d) => d.close());
    scrollToSection(scrollLink.dataset.scroll);
  }
  if (e.target.closest('[data-open-auth]')) { e.preventDefault(); openLogin(); }
  const closer = e.target.closest('[data-close]');
  if (closer) closer.closest('dialog')?.close();
});

// ---------- landing ----------
async function loadHome() {
  renderHeroCard();
  await Promise.all([loadStats(), loadJobs()]);
}

function setSignupRole(role) {
  state.signupRole = role;
  $$('#hero-card [data-role]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.role === role)));
  const employer = role === 'employer';
  $('#company-field').hidden = !employer;
  $('#hero-form-title').textContent = employer ? 'Start hiring for free' : 'Create your free profile';
  $('#hero-form-sub').textContent = employer ? 'Post your first role in two minutes. No credit card.' : 'Apply to any job in two clicks. Takes 30 seconds.';
  $('#hero-submit').textContent = employer ? 'Create employer account' : 'Create free profile';
}

function goToSignup(role = 'candidate') {
  if (state.user) return;
  if ($('#page-home').hidden) location.hash = '#/';
  setTimeout(() => {
    setSignupRole(role);
    $('#hero-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#hero-form')?.elements.fullName.focus({ preventScroll: true });
  }, 120);
}

function renderHeroCard() {
  if (!state.user) {
    if (!$('#hero-form')) location.reload();
    return;
  }
  const actions = {
    candidate: [h('a', { className: 'btn btn-cta', href: '#/', 'data-scroll': 'jobs' }, 'Browse jobs'), h('a', { className: 'btn btn-secondary', href: '#/applications' }, 'My applications')],
    employer: [h('button', { className: 'btn btn-cta', onClick: () => { location.hash = '#/listings'; setTimeout(() => openJobForm(), 200); } }, iconEl('plus', 16), 'Post a job'), h('a', { className: 'btn btn-secondary', href: '#/listings' }, 'My listings')],
    admin: [h('a', { className: 'btn btn-cta', href: '#/admin' }, 'Open admin')],
  }[state.user.role];
  $('#hero-card').replaceChildren(h('div', {},
    h('h2', { style: { fontSize: '1.35rem', marginBottom: '6px' } }, `Welcome back, ${firstName(state.user.name)}`),
    h('p', { className: 'muted', style: { marginBottom: '18px' } }, state.user.role === 'employer'
      ? 'Check your applicants or publish a new role.'
      : 'New roles were added since your last visit — have a look.'),
    h('div', { className: 'actions' }, actions),
  ));
}

$$('#hero-card [data-role]').forEach((b) => b.addEventListener('click', () => setSignupRole(b.dataset.role)));

$('#hero-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const f = form.elements;
  const employer = state.signupRole === 'employer';
  clearFormErrors(form);
  const ok = validate(form, {
    fullName: [rules.required('Tell us your name')],
    companyName: employer ? [rules.required('Which company are you hiring for?')] : [],
    email: [rules.required('Enter your email'), rules.email()],
    password: [rules.required('Choose a password'), rules.minLength(6)],
  });
  if (!ok) return;
  await withLoading($('#hero-submit'), async () => {
    try {
      const { token, user } = await api('/api/auth/register', {
        method: 'POST',
        body: {
          name: f.fullName.value.trim(), email: f.email.value.trim(), password: f.password.value,
          role: state.signupRole, ...(employer && { companyName: f.companyName.value.trim() }),
        },
      });
      signIn(token, user, { quiet: true });
      $('#hero-card').replaceChildren(h('div', { className: 'success-card' },
        h('div', { className: 'ok', html: icon('check', 26, 2.5) }),
        h('h3', {}, `Welcome to Hirely, ${firstName(user.name)}!`),
        h('p', {}, employer
          ? `Your employer account for ${user.profile.companyName} is ready. Post your first role — candidates can apply right away.`
          : 'Your profile is ready. Find a role you like — you can upload your CV right from the job page.'),
        h('div', { className: 'actions' }, employer
          ? h('button', { className: 'btn btn-cta', onClick: () => { location.hash = '#/listings'; setTimeout(() => openJobForm(), 200); } }, iconEl('plus', 16), 'Post your first job')
          : h('a', { className: 'btn btn-cta', href: '#/', 'data-scroll': 'jobs' }, 'Browse jobs', iconEl('arrowRight', 16))),
      ));
    } catch (err) {
      showFormError(form, err, { email: /email|account/i, password: /password/i, companyName: /company/i });
    }
  });
});

async function loadStats() {
  try {
    const { data, pagination } = await api('/api/jobs?limit=100');
    countUp($('#stat-jobs'), pagination.total);
    countUp($('#stat-companies'), new Set(data.map((j) => j.company.id)).size);
    countUp($('#stat-remote'), data.filter((j) => j.isRemote).length);
    $('#hero-pill').textContent = `${pagination.total} open role${pagination.total === 1 ? '' : 's'} right now`;
    // "Popular" chips from the most common tags
    const counts = {};
    data.flatMap((j) => j.tags).forEach((t) => (counts[t] = (counts[t] ?? 0) + 1));
    const popular = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
    $('#popular').replaceChildren(h('span', {}, 'Popular:'), ...popular.map((t) => h('button', {
      type: 'button',
      onClick: () => { $('#filters').elements.q.value = t; loadJobs(); scrollToSection('jobs'); },
    }, t)));
  } catch { /* optional */ }
}

// ---------- search & filters ----------
const filters = $('#filters');

function filterParams() {
  const f = filters.elements;
  const params = new URLSearchParams({ limit: 50, sort: $('#sort').value });
  if (f.q.value.trim()) params.set('q', f.q.value.trim());
  if (f.location.value.trim()) params.set('location', f.location.value.trim());
  const types = $$('input[name="type"]:checked', filters).map((c) => c.value);
  if (types.length) params.set('type', types.join(','));
  if (f.experience.value) params.set('experience', f.experience.value);
  if (f.minSalary.value) params.set('minSalary', f.minSalary.value);
  if (f.remote.checked) params.set('remote', 'true');
  return params;
}

function jobRow(job) {
  const salary = salaryText(job);
  return h('article', { className: 'job-row', tabindex: '0', onClick: () => openJob(job.id), onKeydown: (e) => e.key === 'Enter' && openJob(job.id) },
    companyLogo(job.company.name),
    h('div', { className: 'grow' },
      h('h3', {}, job.title),
      h('div', { className: 'job-meta' },
        h('span', {}, iconEl('building', 15), job.company.name),
        h('span', {}, iconEl('pin', 15), job.location, job.isRemote ? ' · Remote' : ''),
        h('span', {}, iconEl('briefcase', 15), `${TYPE_LABEL[job.employmentType]} · ${fmt.label(job.experienceLevel)}`),
      ),
      job.tags.length ? h('div', { className: 'tags' }, job.tags.map((t) => h('span', { className: 'tag' }, t))) : null,
    ),
    h('div', { className: 'job-side' },
      salary && h('span', { className: 'salary' }, salary),
      h('span', {}, fmt.relative(job.createdAt)),
    ),
  );
}

async function loadJobs() {
  const list = $('#job-list');
  try {
    const { data, pagination } = await api(`/api/jobs?${filterParams()}`);
    $('#result-count').textContent = `${fmt.number(pagination.total)} job${pagination.total === 1 ? '' : 's'} found`;
    list.replaceChildren(...(data.length ? data.map(jobRow) : [h('div', { className: 'empty card' },
      h('div', { className: 'ic', html: icon('search', 26) }),
      h('strong', {}, 'No jobs match these filters'),
      h('span', {}, 'Try removing a filter or searching for a broader skill.'),
      h('div', { style: { marginTop: '16px' } }, h('button', { className: 'btn btn-secondary', onClick: () => { filters.reset(); loadJobs(); } }, 'Clear filters')),
    )]));
  } catch (err) {
    list.replaceChildren(h('div', { className: 'empty card' }, h('strong', {}, "Couldn't load jobs"), h('span', {}, err.message)));
  }
}

let filterTimer;
const reloadSoon = () => { clearTimeout(filterTimer); filterTimer = setTimeout(loadJobs, 250); };
filters.addEventListener('input', reloadSoon);
filters.addEventListener('change', reloadSoon);
filters.addEventListener('reset', () => setTimeout(loadJobs));
filters.addEventListener('submit', (e) => e.preventDefault());
$('#sort').addEventListener('change', loadJobs);

$('#hero-search').addEventListener('submit', (e) => {
  e.preventDefault();
  filters.elements.q.value = e.currentTarget.elements.q.value;
  filters.elements.location.value = e.currentTarget.elements.location.value;
  loadJobs();
  scrollToSection('jobs');
});

// ---------- job detail & apply ----------
async function openJob(id) {
  let job;
  try {
    job = await api(`/api/jobs/${id}`);
  } catch (err) {
    return toast(err.message, { type: 'error' });
  }
  const salary = salaryText(job);
  const body = $('#job-dialog-body');
  body.replaceChildren(
    h('div', { className: 'modal-head' },
      h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center' } },
        companyLogo(job.company.name),
        h('div', {}, h('h2', {}, job.title), h('p', {}, `${job.company.name} · ${job.location}${job.isRemote ? ' · Remote friendly' : ''}`))),
      h('button', { className: 'icon-btn', 'aria-label': 'Close', html: icon('x', 18), onClick: () => $('#job-dialog').close() }),
    ),
    h('div', { className: 'job-meta', style: { marginBottom: '14px' } },
      h('span', {}, iconEl('briefcase', 15), `${TYPE_LABEL[job.employmentType]} · ${fmt.label(job.experienceLevel)}`),
      salary && h('span', { className: 'salary' }, iconEl('wallet', 15), salary),
      h('span', {}, iconEl('clock', 15), `Posted ${fmt.relative(job.createdAt)}`),
    ),
    job.tags.length ? h('div', { className: 'tags', style: { marginBottom: '16px' } }, job.tags.map((t) => h('span', { className: 'tag' }, t))) : null,
    h('p', { style: { whiteSpace: 'pre-wrap', color: 'var(--muted)', marginBottom: '22px' } }, job.description),
    h('div', { id: 'apply-area', style: { borderTop: '1px solid var(--line)', paddingTop: '20px' } }),
  );
  renderApplyArea(job);
  if (!$('#job-dialog').open) $('#job-dialog').showModal();
}

async function renderApplyArea(job) {
  const area = $('#apply-area');
  if (!state.user) {
    area.replaceChildren(
      h('button', {
        className: 'btn btn-cta btn-lg btn-block',
        onClick: () => { state.pendingAction = () => openJob(job.id); $('#job-dialog').close(); goToSignup('candidate'); },
      }, 'Apply now — it takes 2 clicks'),
      h('p', { className: 'switch-line', style: { marginTop: '10px' } }, 'Create a free profile first. Already have one? ',
        h('button', { type: 'button', className: 'link-btn', onClick: () => { state.pendingAction = () => openJob(job.id); $('#job-dialog').close(); openLogin(); } }, 'Log in')),
    );
    return;
  }
  if (state.user.role !== 'candidate') {
    area.replaceChildren(h('p', { className: 'muted' }, 'You are signed in as an employer. Log in with a candidate account to apply.'));
    return;
  }
  if (job.myApplication && job.myApplication.status !== 'withdrawn') {
    area.replaceChildren(h('div', { className: 'actions', style: { justifyContent: 'space-between' } },
      h('span', {}, 'You applied to this job · ', badge(job.myApplication.status)),
      h('a', { className: 'btn btn-secondary btn-sm', href: '#/applications' }, 'Track application')));
    return;
  }

  const resumes = await api('/api/resumes');
  const form = h('form', { className: 'form', novalidate: true });
  const resumePicker = h('div', { className: 'field' });

  const renderPicker = (list, selectedId) => {
    resumePicker.replaceChildren(
      h('label', {}, 'Your CV'),
      list.length
        ? h('select', { name: 'resumeId' }, list.map((r) => h('option', { value: r.id, selected: r.id === selectedId }, `${r.originalName} · uploaded ${fmt.relative(r.uploadedAt)}`)))
        : h('input', { type: 'hidden', name: 'resumeId', value: '' }),
      dropzone(async (resume) => {
        list.unshift(resume);
        renderPicker(list, resume.id);
      }, list.length ? 'Upload a different CV' : 'Upload your CV to apply'),
    );
  };
  renderPicker(resumes, resumes[0]?.id);

  form.append(
    h('h3', { style: { fontSize: '1.1rem' } }, `Apply to ${job.company.name}`),
    resumePicker,
    h('div', { className: 'field' }, h('label', { for: 'cover' }, 'Short note to the employer ', h('span', { className: 'muted' }, '(optional)')),
      h('textarea', { id: 'cover', name: 'coverLetter', maxlength: '5000', placeholder: 'Two or three sentences on why you are a good fit.', style: { minHeight: '90px' } })),
    h('div', { className: 'form-alert', role: 'alert' }),
    h('button', { className: 'btn btn-cta btn-lg btn-block', type: 'submit' }, 'Send application'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const resumeId = Number(form.elements.resumeId.value);
    if (!resumeId) return showFormError(form, new Error('Upload your CV first — it only takes a moment.'));
    await withLoading(form.querySelector('[type="submit"]'), async () => {
      try {
        await api(`/api/jobs/${job.id}/apply`, { method: 'POST', body: { resumeId, coverLetter: form.elements.coverLetter.value.trim() || undefined } });
        area.replaceChildren(h('div', { className: 'success-card' },
          h('div', { className: 'ok', html: icon('check', 26, 2.5) }),
          h('h3', {}, 'Application sent!'),
          h('p', {}, `${job.company.name} has been notified. You'll get an update as soon as they move your application.`),
          h('div', { className: 'actions' },
            h('a', { className: 'btn btn-cta', href: '#/applications' }, 'Track my applications'),
            h('button', { className: 'btn btn-secondary', onClick: () => $('#job-dialog').close() }, 'Keep browsing')),
        ));
      } catch (err) {
        showFormError(form, err);
      }
    });
  });
  area.replaceChildren(form);
}

/** File picker + drag & drop that uploads a CV and calls onUploaded(resume). */
function dropzone(onUploaded, text = 'Upload a CV') {
  const input = h('input', { type: 'file', accept: '.pdf,.doc,.docx', hidden: true });
  const label = h('span', {}, h('strong', {}, text), h('br'), h('span', { className: 'muted small' }, 'PDF, DOC or DOCX · up to 5 MB'));
  const zone = h('label', { className: 'dropzone', style: { marginTop: '8px' } }, h('span', { className: 'ic', html: icon('upload', 20) }), label, input);
  const upload = async (file) => {
    if (!file) return;
    if (!/\.(pdf|docx?)$/i.test(file.name)) return toast('Please choose a PDF, DOC or DOCX file', { type: 'error' });
    if (file.size > 5 * 1024 * 1024) return toast('That file is over 5 MB — try exporting a smaller PDF', { type: 'error' });
    label.replaceChildren(h('strong', {}, `Uploading ${file.name}…`));
    const form = new FormData();
    form.append('resume', file);
    try {
      const resume = await api('/api/resumes', { method: 'POST', form });
      toast('CV uploaded');
      onUploaded(resume);
    } catch (err) {
      toast(err.message, { type: 'error' });
      label.replaceChildren(h('strong', {}, text), h('br'), h('span', { className: 'muted small' }, 'PDF, DOC or DOCX · up to 5 MB'));
    }
  };
  input.addEventListener('change', () => upload(input.files[0]));
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); upload(e.dataTransfer.files[0]); });
  return zone;
}

// Downloads need the auth header, so fetch the file and save it from a blob.
async function downloadResume(resume) {
  try {
    const res = await fetch(resume.downloadUrl, { headers: { Authorization: `Bearer ${session.token}` } });
    if (!res.ok) throw new Error('Could not download this CV');
    const url = URL.createObjectURL(await res.blob());
    const a = h('a', { href: url, download: resume.originalName });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (err) {
    toast(err.message, { type: 'error' });
  }
}

// ---------- candidate: my applications ----------
function timeline(app) {
  const failed = app.status === 'rejected' || app.status === 'withdrawn';
  // Every stage up to the furthest one reached counts as passed (employers may skip steps).
  const furthest = Math.max(0, ...app.history.map((x) => PIPELINE.indexOf(x.status)));
  const stages = failed ? [...PIPELINE.slice(0, furthest + 1), app.status] : PIPELINE;
  const currentIndex = failed ? stages.length - 1 : PIPELINE.indexOf(app.status);
  return h('div', { className: 'timeline' }, stages.map((s, i) => h('div', {
    className: `stage ${i <= currentIndex ? 'done' : ''} ${i === currentIndex ? 'current' : ''} ${failed && i === currentIndex ? 'bad' : ''}`,
  }, fmt.label(s))));
}

async function loadApplications() {
  const [resumes, apps] = await Promise.all([api('/api/resumes'), api('/api/applications')]);
  $('#resume-list').replaceChildren(...(resumes.length ? resumes.map((r) => h('div', { className: 'file-row' },
    h('span', { className: 'ic', html: icon('file', 20), style: { color: 'var(--brand)' } }),
    h('div', { className: 'grow' }, h('a', { href: '#', onClick: (e) => { e.preventDefault(); downloadResume(r); } }, r.originalName),
      h('div', { className: 'muted small' }, `${Math.ceil(r.size / 1024)} KB · uploaded ${fmt.relative(r.uploadedAt)}`)),
    h('button', {
      className: 'icon-btn danger', 'aria-label': `Delete ${r.originalName}`, html: icon('trash', 16),
      onClick: async () => {
        if (!(await confirmDialog({ title: 'Delete this CV?', message: r.originalName, confirmText: 'Delete', danger: true }))) return;
        try { await api(`/api/resumes/${r.id}`, { method: 'DELETE' }); toast('CV deleted'); loadApplications(); } catch (err) { toast(err.message, { type: 'error' }); }
      },
    }),
  )) : [h('p', { className: 'muted small' }, 'No CVs yet. Upload one to start applying in two clicks.')]));

  const zone = dropzone(() => loadApplications());
  $('#dropzone').replaceWith(zone);
  zone.id = 'dropzone';

  $('#application-list').replaceChildren(...(apps.length ? apps.map((a) => h('article', { className: 'app-card' },
    h('div', { className: 'top' },
      companyLogo(a.job.company, 44),
      h('div', { className: 'grow' }, h('h3', { style: { fontSize: '1.08rem' } }, a.job.title),
        h('div', { className: 'muted small' }, `${a.job.company} · applied ${fmt.relative(a.appliedAt)}${a.job.status === 'closed' ? ' · listing closed' : ''}`)),
      badge(a.status),
    ),
    timeline(a),
    a.history.at(-1)?.note && h('p', { className: 'history' }, `Note from ${a.job.company}: ${a.history.at(-1).note}`),
    !['hired', 'rejected', 'withdrawn'].includes(a.status) && h('div', { className: 'actions', style: { justifyContent: 'flex-end', marginTop: '14px' } },
      h('button', {
        className: 'btn btn-ghost btn-sm',
        onClick: async () => {
          if (!(await confirmDialog({ title: 'Withdraw this application?', message: `${a.job.company} will be notified. You can apply again later.`, confirmText: 'Withdraw', danger: true }))) return;
          try { await api(`/api/applications/${a.id}/withdraw`, { method: 'POST' }); toast('Application withdrawn'); loadApplications(); } catch (err) { toast(err.message, { type: 'error' }); }
        },
      }, 'Withdraw')),
  )) : [h('div', { className: 'empty card' },
    h('div', { className: 'ic', html: icon('briefcase', 26) }),
    h('strong', {}, 'No applications yet'),
    h('span', {}, 'Find a role you like and apply in two clicks.'),
    h('div', { style: { marginTop: '16px' } }, h('a', { className: 'btn btn-cta', href: '#/', 'data-scroll': 'jobs' }, 'Browse jobs')),
  )]));
}

// ---------- employer: listings ----------
async function loadListings() {
  const jobs = await api('/api/employer/jobs');
  $('#company-line').textContent = `${state.user.profile?.companyName ?? 'Your company'} · open roles and applicants`;
  const sum = (key) => jobs.reduce((n, j) => n + (j.applications.byStatus[key] ?? 0), 0);
  const stat = (label, value, ic) => h('div', { className: 'stat' }, h('div', { className: 'label' }, iconEl(ic, 16), label), h('div', { className: 'value' }, value));
  $('#emp-stats').replaceChildren(
    stat('Open roles', jobs.filter((j) => j.status === 'open').length, 'briefcase'),
    stat('Total applicants', jobs.reduce((n, j) => n + j.applications.total, 0), 'users'),
    stat('New — not reviewed', sum('applied'), 'bell'),
    stat('In interview', sum('interview'), 'calendar'),
  );
  $('#listing-list').replaceChildren(...(jobs.length ? jobs.map((j) => h('article', { className: 'app-card' },
    h('div', { className: 'top' },
      h('div', { className: 'grow' },
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, h('h3', { style: { fontSize: '1.1rem' } }, j.title), badge(j.status, j.status === 'open' ? 'Open' : 'Closed')),
        h('div', { className: 'muted small' }, `${j.location}${j.isRemote ? ' · Remote' : ''} · ${TYPE_LABEL[j.employmentType]} · posted ${fmt.relative(j.createdAt)}`)),
      h('button', { className: 'btn btn-cta btn-sm', onClick: () => openApplicants(j) }, iconEl('users', 15), `${j.applications.total} applicant${j.applications.total === 1 ? '' : 's'}`),
    ),
    h('div', { className: 'actions', style: { marginTop: '14px', justifyContent: 'space-between' } },
      h('div', { className: 'actions' }, Object.entries(j.applications.byStatus).filter(([s]) => s !== 'withdrawn').map(([s, n]) => badge(s, `${n} ${fmt.label(s).toLowerCase()}`))),
      h('div', { className: 'actions' },
        h('button', { className: 'btn btn-ghost btn-sm', onClick: () => openJobForm(j) }, iconEl('pencil', 15), 'Edit'),
        h('button', {
          className: 'btn btn-ghost btn-sm',
          onClick: async () => {
            try {
              await api(`/api/jobs/${j.id}`, { method: 'PATCH', body: { status: j.status === 'open' ? 'closed' : 'open' } });
              toast(j.status === 'open' ? 'Listing closed — it no longer accepts applications' : 'Listing re-opened');
              loadListings();
            } catch (err) { toast(err.message, { type: 'error' }); }
          },
        }, j.status === 'open' ? 'Close listing' : 'Re-open'),
        h('button', {
          className: 'icon-btn danger', 'aria-label': 'Delete listing', html: icon('trash', 16),
          onClick: async () => {
            if (!(await confirmDialog({ title: `Delete "${j.title}"?`, message: 'All applications for this role will be deleted too.', confirmText: 'Delete', danger: true }))) return;
            try { await api(`/api/jobs/${j.id}`, { method: 'DELETE' }); toast('Listing deleted'); loadListings(); } catch (err) { toast(err.message, { type: 'error' }); }
          },
        }),
      ),
    ),
  )) : [h('div', { className: 'empty card' },
    h('div', { className: 'ic', html: icon('briefcase', 26) }),
    h('strong', {}, 'Post your first role'),
    h('span', {}, 'It takes about two minutes. Candidates can apply immediately.'),
    h('div', { style: { marginTop: '16px' } }, h('button', { className: 'btn btn-cta', onClick: () => openJobForm() }, iconEl('plus', 16), 'Post a job')),
  )]));
}

async function openApplicants(job) {
  const body = $('#applicants-body');
  const dialog = $('#applicants-dialog');
  body.replaceChildren(h('div', { className: 'skeleton', style: { height: '140px' } }));
  if (!dialog.open) dialog.showModal();
  const apps = await api(`/api/jobs/${job.id}/applications`);
  body.replaceChildren(
    h('div', { className: 'modal-head' },
      h('div', {}, h('h2', {}, 'Applicants'), h('p', {}, `${job.title} · ${apps.length} application${apps.length === 1 ? '' : 's'}`)),
      h('button', { className: 'icon-btn', 'aria-label': 'Close', html: icon('x', 18), onClick: () => dialog.close() })),
    ...(apps.length ? apps.map((a) => {
      const final = ['hired', 'rejected', 'withdrawn'].includes(a.status);
      const select = h('select', {
        className: 'input status-select', disabled: final, 'aria-label': `Status for ${a.candidate.name}`,
        onChange: async (e) => {
          try {
            await api(`/api/applications/${a.id}/status`, { method: 'PATCH', body: { status: e.target.value } });
            toast(`${a.candidate.name} moved to ${fmt.label(e.target.value).toLowerCase()} — they've been notified`);
            openApplicants(job);
            loadListings();
          } catch (err) { toast(err.message, { type: 'error' }); }
        },
      }, h('option', { value: a.status, disabled: true, selected: true }, fmt.label(a.status)),
         EMPLOYER_STATUSES.filter((s) => s !== a.status).map((s) => h('option', { value: s }, `Move to ${fmt.label(s).toLowerCase()}`)));
      return h('div', { className: 'app-card', style: { marginBottom: '10px' } },
        h('div', { className: 'top' },
          h('span', { className: 'avatar', style: { background: colorFor(a.candidate.email), width: '40px', height: '40px' } }, initials(a.candidate.name)),
          h('div', { className: 'grow' }, h('strong', {}, a.candidate.name),
            h('div', { className: 'muted small' }, [a.candidate.headline, a.candidate.email, `applied ${fmt.relative(a.appliedAt)}`].filter(Boolean).join(' · '))),
          final ? badge(a.status) : select,
        ),
        a.coverLetter && h('p', { className: 'muted small', style: { margin: '12px 0 0', whiteSpace: 'pre-wrap' } }, `“${a.coverLetter}”`),
        a.resume && h('button', { className: 'btn btn-secondary btn-sm', style: { marginTop: '12px' }, onClick: () => downloadResume(a.resume) }, iconEl('download', 15), a.resume.originalName),
      );
    }) : [h('div', { className: 'empty' }, h('div', { className: 'ic', html: icon('users', 26) }), h('strong', {}, 'No applicants yet'), h('span', {}, 'New applications will appear here — and in your notifications.'))]),
  );
}

function openJobForm(job) {
  const form = $('#job-form');
  form.reset();
  clearFormErrors(form);
  const f = form.elements;
  f.jobId.value = job?.id ?? '';
  if (job) {
    f.title.value = job.title;
    f.location.value = job.location;
    f.description.value = job.description;
    f.employmentType.value = job.employmentType;
    f.experienceLevel.value = job.experienceLevel;
    f.salaryMin.value = job.salaryMin ?? '';
    f.salaryMax.value = job.salaryMax ?? '';
    f.tags.value = job.tags.join(', ');
    f.isRemote.checked = job.isRemote;
  }
  $('#job-form-title').textContent = job ? 'Edit job' : 'Post a job';
  form.querySelector('[type="submit"]').textContent = job ? 'Save changes' : 'Publish job';
  $('#job-form-dialog').showModal();
}
$('#new-job').addEventListener('click', () => openJobForm());

$('#job-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const f = form.elements;
  clearFormErrors(form);
  const ok = validate(form, {
    title: [rules.required('Add a job title'), rules.minLength(3)],
    location: [rules.required('Where is the job based? Use "Remote" if anywhere')],
    description: [rules.required('Describe the role'), rules.minLength(20, 'Write at least 20 characters so candidates know what the job is')],
    salaryMax: [(v) => (v && f.salaryMin.value && Number(v) < Number(f.salaryMin.value) ? '"To" must be higher than "from"' : null)],
  });
  if (!ok) return;
  const editing = f.jobId.value;
  const body = {
    title: f.title.value.trim(),
    location: f.location.value.trim(),
    description: f.description.value.trim(),
    employmentType: f.employmentType.value,
    experienceLevel: f.experienceLevel.value,
    salaryMin: f.salaryMin.value === '' ? null : Number(f.salaryMin.value),
    salaryMax: f.salaryMax.value === '' ? null : Number(f.salaryMax.value),
    tags: f.tags.value,
    isRemote: f.isRemote.checked,
  };
  await withLoading(form.querySelector('[type="submit"]'), async () => {
    try {
      if (editing) await api(`/api/jobs/${editing}`, { method: 'PATCH', body });
      else await api('/api/jobs', { method: 'POST', body });
      $('#job-form-dialog').close();
      toast(editing ? 'Job updated' : 'Job published — candidates can apply now');
      loadListings();
    } catch (err) {
      showFormError(form, err, { salaryMin: /salary/i, description: /description/i, title: /title/i });
    }
  });
});

// ---------- admin ----------
async function loadAdmin() {
  const [stats, users] = await Promise.all([api('/api/admin/stats'), api('/api/admin/users')]);
  const stat = (label, value, ic) => h('div', { className: 'stat' }, h('div', { className: 'label' }, iconEl(ic, 16), label), h('div', { className: 'value' }, value));
  $('#admin-stats').replaceChildren(
    stat('Candidates', stats.users.candidate ?? 0, 'user'),
    stat('Employers', stats.users.employer ?? 0, 'building'),
    stat('Open jobs', stats.jobs.open ?? 0, 'briefcase'),
    stat('Applications', stats.applications.total, 'file'),
    stat('Hire rate', `${stats.applications.hireRate}%`, 'chart'),
  );
  $('#top-jobs').replaceChildren(h('table', { className: 'table' },
    h('thead', {}, h('tr', {}, ['Job', 'Company', 'Applications'].map((x) => h('th', {}, x)))),
    h('tbody', {}, stats.topJobs.map((j) => h('tr', {}, h('td', {}, h('strong', {}, j.title)), h('td', {}, j.company), h('td', {}, j.applications))))));
  $('#user-list').replaceChildren(h('table', { className: 'table' },
    h('thead', {}, h('tr', {}, ['User', 'Role', 'Activity', 'Joined', ''].map((x) => h('th', {}, x)))),
    h('tbody', {}, users.map((u) => h('tr', {},
      h('td', {}, h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } },
        h('span', { className: 'avatar', style: { background: colorFor(u.email) } }, initials(u.name)),
        h('div', {}, h('strong', {}, u.name), h('div', { className: 'muted small' }, u.company ? `${u.company} · ${u.email}` : u.email)))),
      h('td', {}, badge(u.role === 'admin' ? 'applied' : '', fmt.label(u.role))),
      h('td', { className: 'small' }, u.role === 'employer' ? `${u.jobs} jobs` : u.role === 'candidate' ? `${u.applications} applications` : '—'),
      h('td', { className: 'small muted' }, fmt.date(u.createdAt)),
      h('td', { style: { textAlign: 'right' } }, u.id !== state.user.id && h('button', {
        className: `btn btn-sm ${u.isActive ? 'btn-danger' : 'btn-secondary'}`,
        onClick: async () => {
          if (u.isActive && !(await confirmDialog({ title: `Deactivate ${u.name}?`, message: 'They will be logged out and unable to sign in.', confirmText: 'Deactivate', danger: true }))) return;
          try { await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } }); loadAdmin(); } catch (err) { toast(err.message, { type: 'error' }); }
        },
      }, u.isActive ? 'Deactivate' : 'Activate')),
    ))),
  ));
}

// ---------- notifications ----------
async function openNotifications() {
  const body = $('#notif-body');
  const dialog = $('#notif-dialog');
  const { data, unreadCount } = await api('/api/notifications?limit=30');
  const target = { candidate: '#/applications', employer: '#/listings', admin: '#/admin' }[state.user.role];
  body.replaceChildren(
    h('div', { className: 'modal-head' },
      h('div', {}, h('h2', {}, 'Notifications'), h('p', {}, unreadCount ? `${unreadCount} unread` : "You're all caught up")),
      h('button', { className: 'icon-btn', 'aria-label': 'Close', html: icon('x', 18), onClick: () => dialog.close() })),
    data.length
      ? h('div', { style: { maxHeight: '55vh', overflow: 'auto' } }, data.map((n) => h('a', {
          className: `notif ${n.isRead ? 'read' : 'unread'}`, href: target, style: { textDecoration: 'none' },
          onClick: () => api(`/api/notifications/${n.id}/read`, { method: 'PATCH' }).then(refreshUnread).catch(() => {}),
        }, h('span', { className: 'dot' }), h('div', {}, h('div', { className: 'msg' }, n.message), h('div', { className: 'muted small' }, fmt.relative(n.createdAt))))))
      : h('div', { className: 'empty' }, h('div', { className: 'ic', html: icon('bell', 26) }), h('strong', {}, 'No notifications yet'), h('span', {}, 'Updates about your applications will show up here.')),
    unreadCount ? h('div', { className: 'actions', style: { justifyContent: 'flex-end', marginTop: '16px' } },
      h('button', { className: 'btn btn-secondary btn-sm', onClick: async () => { await api('/api/notifications/read-all', { method: 'POST' }); await refreshUnread(); openNotifications(); } }, 'Mark all as read')) : null,
  );
  if (!dialog.open) dialog.showModal();
}

// ---------- auth ----------
function openLogin() {
  const form = $('#login-form');
  form.reset();
  clearFormErrors(form);
  $('#auth-dialog').showModal();
  form.elements.email.focus();
}
$('#to-signup').addEventListener('click', () => { $('#auth-dialog').close(); goToSignup('candidate'); });
$('#employer-cta').addEventListener('click', () => (state.user?.role === 'employer' ? (location.hash = '#/listings') : goToSignup('employer')));
$('#cta-bottom').addEventListener('click', () => (state.user ? scrollToSection('jobs') : goToSignup('candidate')));

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  clearFormErrors(form);
  if (!validate(form, { email: [rules.required('Enter your email'), rules.email()], password: [rules.required('Enter your password')] })) return;
  await withLoading(form.querySelector('[type="submit"]'), async () => {
    try {
      const { token, user } = await api('/api/auth/login', { method: 'POST', body: { email: form.elements.email.value.trim(), password: form.elements.password.value } });
      $('#auth-dialog').close();
      signIn(token, user);
    } catch (err) {
      showFormError(form, err);
    }
  });
});

function signIn(token, user, { quiet = false } = {}) {
  session.token = token;
  state.user = user;
  state.unread = 0;
  renderHeader();
  refreshUnread();
  if (!quiet) toast(`Welcome back, ${firstName(user.name)}!`);
  const pending = state.pendingAction;
  state.pendingAction = null;
  if (pending) {
    renderHeroCard();
    pending();
  } else if (!quiet) {
    location.hash = { candidate: '#/', employer: '#/listings', admin: '#/admin' }[user.role];
    route();
  }
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  session.token = null;
  location.hash = '#/';
  location.reload();
}

window.addEventListener('session-expired', () => {
  if (!state.user) return;
  state.user = null;
  renderHeader();
  toast('Your session expired — please log in again', { type: 'error' });
});

setInterval(refreshUnread, 30000);

(async function init() {
  $('#year').textContent = new Date().getFullYear();
  hydrateIcons();
  singleOpenFaq();
  enableBackdropClose();
  if (session.token) {
    try { state.user = await api('/api/auth/me'); } catch { session.token = null; }
  }
  renderHeader();
  refreshUnread();
  route();
})();
