import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let server;
let base;
let uploadDir;

async function call(method, urlPath, { token, body, form } = {}) {
  const res = await fetch(base + urlPath, {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: form ?? (body && JSON.stringify(body)),
  });
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  return { status: res.status, body: type.includes('json') && text ? JSON.parse(text) : text, headers: res.headers };
}

const login = async (email, password) => (await call('POST', '/api/auth/login', { body: { email, password } })).body.token;

function resumeForm(name, content) {
  const form = new FormData();
  form.append('resume', new Blob([content]), name);
  return form;
}
const FAKE_PDF = '%PDF-1.4\n% test resume\n';

let admin;
let employer;   // TechCorp (seeded)
let other;      // GreenSoft (seeded)
let candidate;  // new account
let resumeId;
let jobId;
let applicationId;

before(async () => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobboard-test-'));
  server = createApp(openDb(':memory:', { seed: true }), { uploadDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://localhost:${server.address().port}`;
  admin = await login('admin@jobs.com', 'admin123');
  employer = await login('employer@jobs.com', 'employer123');
  other = await login('greensoft@jobs.com', 'employer123');
});

after(() => {
  server.close();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

test('candidates and employers can register with a profile', async () => {
  const res = await call('POST', '/api/auth/register', {
    body: { name: 'Dana Dev', email: 'dana@test.com', password: 'secret123', role: 'candidate', headline: 'Node developer', skills: 'Node, SQL' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.profile.headline, 'Node developer');
  candidate = res.body.token;

  // employers must give a company name
  const bad = await call('POST', '/api/auth/register', { body: { name: 'E', email: 'e@test.com', password: 'secret123', role: 'employer' } });
  assert.equal(bad.status, 400);

  // nobody can sign up as admin
  const admin2 = await call('POST', '/api/auth/register', { body: { name: 'A', email: 'a@test.com', password: 'secret123', role: 'admin' } });
  assert.equal(admin2.status, 400);
});

test('job search with filters', async () => {
  const all = await call('GET', '/api/jobs');
  assert.equal(all.body.pagination.total, 5);

  const node = await call('GET', '/api/jobs?tag=node');
  assert.equal(node.body.data.length, 2);

  const remoteFull = await call('GET', '/api/jobs?remote=true&type=full_time');
  assert.deepEqual(remoteFull.body.data.map((j) => j.title).sort(), ['Backend Developer (Node.js)', 'Python / Django Developer']);

  const text = await call('GET', '/api/jobs?q=greensoft');
  assert.equal(text.body.data.length, 2);

  const salary = await call('GET', '/api/jobs?minSalary=5000&sort=salary');
  assert.equal(salary.body.data[0].title, 'DevOps Engineer (Contract)');

  assert.equal((await call('GET', '/api/jobs?type=freelance')).status, 400);
});

test('employers post, edit and close jobs; candidates cannot', async () => {
  const payload = {
    title: 'Junior Express Developer',
    description: 'Work on our REST APIs using Express and SQLite. Mentoring included.',
    location: 'Bucharest',
    employmentType: 'full_time',
    experienceLevel: 'entry',
    isRemote: true,
    salaryMin: 1500,
    salaryMax: 2200,
    tags: ['Node', 'express', 'node'],
  };
  assert.equal((await call('POST', '/api/jobs', { token: candidate, body: payload })).status, 403);
  assert.equal((await call('POST', '/api/jobs', { token: employer, body: { ...payload, salaryMin: 3000 } })).status, 400);

  const res = await call('POST', '/api/jobs', { token: employer, body: payload });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.tags, ['node', 'express']);
  assert.equal(res.body.company.name, 'TechCorp');
  jobId = res.body.id;

  assert.equal((await call('PATCH', `/api/jobs/${jobId}`, { token: other, body: { title: 'Hacked' } })).status, 403);
  const edited = await call('PATCH', `/api/jobs/${jobId}`, { token: employer, body: { salaryMax: 2500 } });
  assert.equal(edited.body.salaryMax, 2500);
});

test('resume upload validates type, content and size', async () => {
  assert.equal((await call('POST', '/api/resumes', { token: employer, form: resumeForm('cv.pdf', FAKE_PDF) })).status, 403);

  const wrongExt = await call('POST', '/api/resumes', { token: candidate, form: resumeForm('cv.exe', 'MZ...') });
  assert.equal(wrongExt.status, 400);

  const fakePdf = await call('POST', '/api/resumes', { token: candidate, form: resumeForm('cv.pdf', 'not really a pdf') });
  assert.equal(fakePdf.status, 400);
  assert.match(fakePdf.body.error, /match/);

  const tooBig = await call('POST', '/api/resumes', { token: candidate, form: resumeForm('big.pdf', '%PDF' + 'x'.repeat(5 * 1024 * 1024)) });
  assert.equal(tooBig.status, 400);

  const ok = await call('POST', '/api/resumes', { token: candidate, form: resumeForm('Dana CV.pdf', FAKE_PDF) });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.originalName, 'Dana CV.pdf');
  resumeId = ok.body.id;

  // only the uploaded file is left on disk
  assert.equal(fs.readdirSync(uploadDir).length, 1);
});

test('candidate applies; employer is notified', async () => {
  const noResume = await call('POST', `/api/jobs/${jobId}/apply`, { token: candidate, body: {} });
  assert.equal(noResume.status, 400);

  const res = await call('POST', `/api/jobs/${jobId}/apply`, { token: candidate, body: { resumeId, coverLetter: 'I love Express!' } });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'applied');
  assert.equal(res.body.history.length, 1);
  applicationId = res.body.id;

  assert.equal((await call('POST', `/api/jobs/${jobId}/apply`, { token: candidate, body: { resumeId } })).status, 409);

  const notes = await call('GET', '/api/notifications', { token: employer });
  assert.equal(notes.body.unreadCount, 1);
  assert.match(notes.body.data[0].message, /Dana Dev applied for "Junior Express Developer"/);

  const job = await call('GET', `/api/jobs/${jobId}`, { token: candidate });
  assert.equal(job.body.myApplication.status, 'applied');
});

test('employer reviews applicants, downloads the resume and updates status', async () => {
  const list = await call('GET', `/api/jobs/${jobId}/applications`, { token: employer });
  assert.equal(list.status, 200);
  assert.equal(list.body[0].candidate.name, 'Dana Dev');

  assert.equal((await call('GET', `/api/jobs/${jobId}/applications`, { token: other })).status, 403);

  const file = await call('GET', `/api/resumes/${resumeId}/download`, { token: employer });
  assert.equal(file.status, 200);
  assert.equal(file.body, FAKE_PDF);
  assert.match(file.headers.get('content-disposition'), /Dana CV\.pdf/);
  // GreenSoft never received this resume
  assert.equal((await call('GET', `/api/resumes/${resumeId}/download`, { token: other })).status, 404);

  const moved = await call('PATCH', `/api/applications/${applicationId}/status`, { token: employer, body: { status: 'interview', note: 'Tuesday 10:00' } });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.history.at(-1).note, 'Tuesday 10:00');

  const candidateNotes = await call('GET', '/api/notifications?unread=true', { token: candidate });
  assert.match(candidateNotes.body.data[0].message, /interview stage/);
  await call('POST', '/api/notifications/read-all', { token: candidate });
  assert.equal((await call('GET', '/api/notifications', { token: candidate })).body.unreadCount, 0);
});

test('candidate tracks applications and can withdraw / re-apply', async () => {
  const mine = await call('GET', '/api/applications', { token: candidate });
  assert.equal(mine.body.length, 1);
  assert.deepEqual(mine.body[0].history.map((h) => h.status), ['applied', 'interview']);

  // used resumes can't be deleted
  assert.equal((await call('DELETE', `/api/resumes/${resumeId}`, { token: candidate })).status, 409);

  const withdrawn = await call('POST', `/api/applications/${applicationId}/withdraw`, { token: candidate });
  assert.equal(withdrawn.body.status, 'withdrawn');
  assert.equal((await call('PATCH', `/api/applications/${applicationId}/status`, { token: employer, body: { status: 'offered' } })).status, 409);

  const again = await call('POST', `/api/jobs/${jobId}/apply`, { token: candidate, body: { resumeId } });
  assert.equal(again.status, 200);
  assert.equal(again.body.status, 'applied');
});

test('closed jobs are hidden and refuse applications', async () => {
  await call('PATCH', `/api/jobs/${jobId}`, { token: employer, body: { status: 'closed' } });
  assert.equal((await call('GET', `/api/jobs/${jobId}`)).status, 404);
  const owner = await call('GET', `/api/jobs/${jobId}`, { token: employer });
  assert.equal(owner.body.applications.total, 1);

  const mineAsEmployer = await call('GET', '/api/employer/jobs', { token: employer });
  assert.ok(mineAsEmployer.body.some((j) => j.id === jobId && j.status === 'closed'));

  const late = await call('POST', '/api/jobs/1/apply', { token: candidate, body: { resumeId } });
  assert.equal(late.status, 201); // job 1 is still open
  await call('PATCH', '/api/jobs/2', { token: employer, body: { status: 'closed' } });
  assert.equal((await call('POST', '/api/jobs/2/apply', { token: candidate, body: { resumeId } })).status, 409);
});

test('admin sees statistics and can deactivate users', async () => {
  assert.equal((await call('GET', '/api/admin/stats', { token: employer })).status, 403);

  const stats = await call('GET', '/api/admin/stats', { token: admin });
  assert.equal(stats.status, 200);
  assert.equal(stats.body.users.candidate, 2);
  assert.equal(stats.body.applications.total, 2);
  assert.equal(stats.body.resumesUploaded, 1);

  const users = await call('GET', '/api/admin/users?role=employer', { token: admin });
  const greensoft = users.body.find((u) => u.company === 'GreenSoft');
  await call('PATCH', `/api/admin/users/${greensoft.id}`, { token: admin, body: { isActive: false } });
  assert.equal((await call('GET', '/api/auth/me', { token: other })).status, 401);
  const relogin = await call('POST', '/api/auth/login', { body: { email: 'greensoft@jobs.com', password: 'employer123' } });
  assert.equal(relogin.status, 403);
});

test('public company page', async () => {
  const company = await call('GET', '/api/companies/2');
  assert.equal(company.body.name, 'TechCorp');
  assert.ok(company.body.openJobs.length >= 1);
});
