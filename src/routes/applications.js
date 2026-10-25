import { Router } from 'express';
import { HttpError } from '../errors.js';
import { transaction } from '../db.js';
import { presentResume } from './resumes.js';
import * as v from '../validate.js';

const EMPLOYER_STATUSES = ['reviewing', 'interview', 'offered', 'hired', 'rejected'];
const FINAL_STATUSES = ['hired', 'rejected', 'withdrawn'];
const STATUS_TEXT = {
  reviewing: 'is being reviewed',
  interview: 'moved to the interview stage',
  offered: 'received an offer 🎉',
  hired: 'was accepted - you are hired! 🎉',
  rejected: 'was not selected this time',
};

const APPLICATION_SELECT = `
  SELECT a.*, j.title AS job_title, j.status AS job_status, j.employer_id, ep.company_name,
         u.name AS candidate_name, u.email AS candidate_email,
         cp.headline, cp.skills, cp.location AS candidate_location,
         r.original_name, r.mime_type, r.size, r.created_at AS resume_created_at
  FROM applications a
  JOIN jobs j ON j.id = a.job_id
  JOIN employer_profiles ep ON ep.user_id = j.employer_id
  JOIN users u ON u.id = a.candidate_id
  LEFT JOIN candidate_profiles cp ON cp.user_id = a.candidate_id
  LEFT JOIN resumes r ON r.id = a.resume_id`;

export function applicationRoutes(db, auth, notifier) {
  const q = {
    job: db.prepare('SELECT * FROM jobs WHERE id = ?'),
    resume: db.prepare('SELECT * FROM resumes WHERE id = ?'),
    existing: db.prepare('SELECT * FROM applications WHERE job_id = ? AND candidate_id = ?'),
    insert: db.prepare('INSERT INTO applications (job_id, candidate_id, resume_id, cover_letter) VALUES (?, ?, ?, ?)'),
    reapply: db.prepare(`
      UPDATE applications SET status = 'applied', resume_id = ?, cover_letter = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?`),
    setStatus: db.prepare(`
      UPDATE applications SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`),
    addEvent: db.prepare('INSERT INTO application_events (application_id, status, note, changed_by) VALUES (?, ?, ?, ?)'),
    history: db.prepare(`
      SELECT status, note, created_at AS at FROM application_events WHERE application_id = ? ORDER BY id`),
    one: db.prepare(`${APPLICATION_SELECT} WHERE a.id = ?`),
  };

  const present = (row, { withHistory = false } = {}) => ({
    id: row.id,
    status: row.status,
    coverLetter: row.cover_letter,
    appliedAt: row.created_at,
    updatedAt: row.updated_at,
    job: { id: row.job_id, title: row.job_title, status: row.job_status, company: row.company_name },
    candidate: {
      id: row.candidate_id,
      name: row.candidate_name,
      email: row.candidate_email,
      headline: row.headline,
      skills: row.skills,
      location: row.candidate_location,
    },
    resume: row.resume_id
      ? presentResume({ id: row.resume_id, original_name: row.original_name, mime_type: row.mime_type, size: row.size, created_at: row.resume_created_at })
      : null,
    ...(withHistory && { history: q.history.all(row.id) }),
  });

  const loadVisible = (id, user) => {
    const row = q.one.get(id);
    const visible = row && (user.role === 'admin' || row.candidate_id === user.id || row.employer_id === user.id);
    if (!visible) throw new HttpError(404, 'Application not found');
    return row;
  };

  // POST /api/jobs/:id/apply { resumeId, coverLetter? }
  const apply = (req, res) => {
    const jobId = v.id(req.params.id, 'job id');
    const resumeId = v.id(req.body?.resumeId, 'resumeId');
    const coverLetter = v.string(req.body?.coverLetter, 'coverLetter', { required: false, max: 5000 });

    const { id, created } = transaction(db, () => {
      const job = q.job.get(jobId);
      if (!job) throw new HttpError(404, 'Job not found');
      if (job.status !== 'open') throw new HttpError(409, 'This job is no longer accepting applications');

      const resume = q.resume.get(resumeId);
      if (!resume || resume.candidate_id !== req.user.id) throw new HttpError(400, 'Choose one of your own uploaded resumes');

      const existing = q.existing.get(jobId, req.user.id);
      if (existing && existing.status !== 'withdrawn') throw new HttpError(409, 'You have already applied to this job');

      let appId;
      if (existing) {
        q.reapply.run(resumeId, coverLetter, existing.id);
        appId = existing.id;
      } else {
        appId = Number(q.insert.run(jobId, req.user.id, resumeId, coverLetter).lastInsertRowid);
      }
      q.addEvent.run(appId, 'applied', null, req.user.id);
      notifier.notify(job.employer_id, 'new_application', `${req.user.name} applied for "${job.title}"`, `/jobs/${job.id}/applications`);
      return { id: appId, created: !existing };
    });

    res.status(created ? 201 : 200).json(present(q.one.get(id), { withHistory: true }));
  };

  // GET /api/jobs/:id/applications?status= — employer view of the applicants for one job
  const listForJob = (req, res) => {
    const jobId = v.id(req.params.id, 'job id');
    const job = q.job.get(jobId);
    if (!job) throw new HttpError(404, 'Job not found');
    if (req.user.role !== 'admin' && job.employer_id !== req.user.id) throw new HttpError(403, 'Not your job listing');
    const status = v.oneOf(req.query.status, 'status', [...EMPLOYER_STATUSES, 'applied', 'withdrawn'], { required: false });
    const rows = db
      .prepare(`${APPLICATION_SELECT} WHERE a.job_id = ? ${status ? 'AND a.status = ?' : ''} ORDER BY a.created_at DESC`)
      .all(...[jobId, status].filter(Boolean));
    res.json(rows.map((row) => present(row)));
  };

  const router = Router();
  router.use(auth.requireAuth);

  // GET /api/applications — candidates: their own applications (to track them); employers: all applications to their jobs
  router.get('/', (req, res) => {
    const column = req.user.role === 'employer' ? 'j.employer_id' : 'a.candidate_id';
    if (req.user.role === 'admin') throw new HttpError(400, 'Admins should use /api/admin/stats');
    const status = v.oneOf(req.query.status, 'status', [...EMPLOYER_STATUSES, 'applied', 'withdrawn'], { required: false });
    const rows = db
      .prepare(`${APPLICATION_SELECT} WHERE ${column} = ? ${status ? 'AND a.status = ?' : ''} ORDER BY a.updated_at DESC`)
      .all(...[req.user.id, status].filter(Boolean));
    res.json(rows.map((row) => present(row, { withHistory: true })));
  });

  router.get('/:id', (req, res) => {
    res.json(present(loadVisible(v.id(req.params.id), req.user), { withHistory: true }));
  });

  // PATCH /api/applications/:id/status { status, note? } — employer moves the candidate through the pipeline
  router.patch('/:id/status', auth.requireRole('employer', 'admin'), (req, res) => {
    const id = v.id(req.params.id);
    const status = v.oneOf(req.body?.status, 'status', EMPLOYER_STATUSES);
    const note = v.string(req.body?.note, 'note', { required: false, max: 1000 });

    transaction(db, () => {
      const row = loadVisible(id, req.user);
      if (FINAL_STATUSES.includes(row.status)) throw new HttpError(409, `This application is already ${row.status}`);
      if (row.status === status) throw new HttpError(409, `The application is already "${status}"`);
      q.setStatus.run(status, id);
      q.addEvent.run(id, status, note, req.user.id);
      notifier.notify(
        row.candidate_id,
        'application_status',
        `Your application for "${row.job_title}" at ${row.company_name} ${STATUS_TEXT[status]}`,
        `/applications/${id}`,
      );
    });
    res.json(present(q.one.get(id), { withHistory: true }));
  });

  // POST /api/applications/:id/withdraw — candidate pulls out
  router.post('/:id/withdraw', auth.requireRole('candidate'), (req, res) => {
    const id = v.id(req.params.id);
    transaction(db, () => {
      const row = loadVisible(id, req.user);
      if (FINAL_STATUSES.includes(row.status)) throw new HttpError(409, `This application is already ${row.status}`);
      q.setStatus.run('withdrawn', id);
      q.addEvent.run(id, 'withdrawn', null, req.user.id);
      notifier.notify(row.employer_id, 'application_withdrawn', `${row.candidate_name} withdrew from "${row.job_title}"`, `/jobs/${row.job_id}/applications`);
    });
    res.json(present(q.one.get(id), { withHistory: true }));
  });

  return { router, apply, listForJob };
}
