import { Router } from 'express';
import { HttpError } from '../errors.js';
import { decodeTags, encodeTags } from '../db.js';
import * as v from '../validate.js';

const TYPES = ['full_time', 'part_time', 'contract', 'internship'];
const LEVELS = ['entry', 'mid', 'senior'];

const JOB_SELECT = `
  SELECT j.*, ep.company_name, ep.location AS company_location, ep.website AS company_website
  FROM jobs j JOIN employer_profiles ep ON ep.user_id = j.employer_id`;

export function presentJob(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    employmentType: row.employment_type,
    experienceLevel: row.experience_level,
    isRemote: !!row.is_remote,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    tags: decodeTags(row.tags),
    status: row.status,
    company: { id: row.employer_id, name: row.company_name, website: row.company_website },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function jobRoutes(db, auth) {
  const router = Router();
  const q = {
    one: db.prepare(`${JOB_SELECT} WHERE j.id = ?`),
    insert: db.prepare(`
      INSERT INTO jobs (employer_id, title, description, location, employment_type, experience_level, is_remote, salary_min, salary_max, tags)
      VALUES (:employer_id, :title, :description, :location, :employment_type, :experience_level, :is_remote, :salary_min, :salary_max, :tags)`),
    update: db.prepare(`
      UPDATE jobs SET title = :title, description = :description, location = :location,
        employment_type = :employment_type, experience_level = :experience_level, is_remote = :is_remote,
        salary_min = :salary_min, salary_max = :salary_max, tags = :tags, status = :status,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = :id`),
    remove: db.prepare('DELETE FROM jobs WHERE id = ?'),
    myApplication: db.prepare('SELECT id, status FROM applications WHERE job_id = ? AND candidate_id = ?'),
    applicationCounts: db.prepare('SELECT status, COUNT(*) AS n FROM applications WHERE job_id = ? GROUP BY status'),
  };

  const load = (id) => {
    const row = q.one.get(id);
    if (!row) throw new HttpError(404, 'Job not found');
    return row;
  };

  const canManage = (row, user) => user && (user.role === 'admin' || row.employer_id === user.id);

  const countsFor = (jobId) => {
    const counts = Object.fromEntries(q.applicationCounts.all(jobId).map((r) => [r.status, r.n]));
    const total = Object.entries(counts).reduce((sum, [status, n]) => (status === 'withdrawn' ? sum : sum + n), 0);
    return { total, byStatus: counts };
  };

  const readTags = (value) => {
    if (value === undefined || value === null) return [];
    const list = Array.isArray(value) ? value : String(value).split(',');
    const tags = [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
    if (tags.length > 10) throw new HttpError(400, 'At most 10 tags');
    if (tags.some((t) => t.length > 30 || t.includes(','))) throw new HttpError(400, 'Each tag must be at most 30 characters');
    return tags;
  };

  const readJob = (body = {}, current) => {
    const pick = (key, fallback) => (body[key] !== undefined ? body[key] : fallback);
    const job = {
      title: v.string(pick('title', current?.title), 'title', { min: 3, max: 120 }),
      description: v.string(pick('description', current?.description), 'description', { min: 20, max: 10000 }),
      location: v.string(pick('location', current?.location), 'location', { max: 100 }),
      employment_type: v.oneOf(pick('employmentType', current?.employment_type), 'employmentType', TYPES),
      experience_level: v.oneOf(pick('experienceLevel', current?.experience_level), 'experienceLevel', LEVELS, { fallback: 'mid' }),
      is_remote: v.boolean(body.isRemote, 'isRemote', { fallback: !!current?.is_remote }) ? 1 : 0,
      salary_min: v.integer(pick('salaryMin', current?.salary_min), 'salaryMin', { required: false, min: 0 }),
      salary_max: v.integer(pick('salaryMax', current?.salary_max), 'salaryMax', { required: false, min: 0 }),
      tags: body.tags !== undefined ? encodeTags(readTags(body.tags)) : (current?.tags ?? ''),
    };
    if (job.salary_min !== null && job.salary_max !== null && job.salary_min > job.salary_max) {
      throw new HttpError(400, '"salaryMin" cannot be greater than "salaryMax"');
    }
    return job;
  };

  /*
   * GET /api/jobs — public search
   *   q           text in title, description, company or tags
   *   location    partial match, e.g. "bucharest"
   *   type        full_time | part_time | contract | internship (comma-separated for several)
   *   experience  entry | mid | senior
   *   remote      true
   *   minSalary   jobs whose range reaches at least this value
   *   tag         exact tag, e.g. "node"
   *   employerId  jobs from one company
   *   sort        newest (default) | salary
   *   page, limit
   */
  router.get('/', (req, res) => {
    const query = req.query;
    const where = ["j.status = 'open'"];
    const params = [];

    const text = v.string(query.q, 'q', { required: false, max: 100 });
    if (text) {
      where.push('(j.title LIKE ? OR j.description LIKE ? OR ep.company_name LIKE ? OR j.tags LIKE ?)');
      params.push(...Array(4).fill(`%${text}%`));
    }
    const location = v.string(query.location, 'location', { required: false, max: 100 });
    if (location) {
      where.push('j.location LIKE ?');
      params.push(`%${location}%`);
    }
    if (query.type) {
      const types = String(query.type).split(',').map((t) => v.oneOf(t.trim(), 'type', TYPES));
      where.push(`j.employment_type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
    if (query.experience) {
      where.push('j.experience_level = ?');
      params.push(v.oneOf(query.experience, 'experience', LEVELS));
    }
    if (query.remote === 'true') where.push('j.is_remote = 1');
    const minSalary = v.integer(query.minSalary, 'minSalary', { required: false, min: 0 });
    if (minSalary !== null) {
      where.push('COALESCE(j.salary_max, j.salary_min) >= ?');
      params.push(minSalary);
    }
    if (query.tag) {
      where.push('j.tags LIKE ?');
      params.push(`%,${String(query.tag).trim().toLowerCase()},%`);
    }
    const employerId = v.integer(query.employerId, 'employerId', { required: false, min: 1 });
    if (employerId) {
      where.push('j.employer_id = ?');
      params.push(employerId);
    }

    const sort = v.oneOf(query.sort, 'sort', ['newest', 'salary'], { fallback: 'newest' });
    const orderBy = sort === 'salary' ? 'COALESCE(j.salary_max, j.salary_min, 0) DESC, j.id DESC' : 'j.created_at DESC, j.id DESC';
    const page = v.integer(query.page, 'page', { required: false, min: 1 }) ?? 1;
    const limit = v.integer(query.limit, 'limit', { required: false, min: 1, max: 100 }) ?? 20;

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) AS n FROM jobs j JOIN employer_profiles ep ON ep.user_id = j.employer_id ${whereSql}`).get(...params).n;
    const rows = db.prepare(`${JOB_SELECT} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);

    res.json({ data: rows.map(presentJob), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });

  router.get('/:id', (req, res) => {
    const row = load(v.id(req.params.id));
    const manager = canManage(row, req.user);
    if (row.status !== 'open' && !manager) throw new HttpError(404, 'Job not found');

    const job = presentJob(row);
    if (manager) job.applications = countsFor(row.id);
    if (req.user?.role === 'candidate') job.myApplication = q.myApplication.get(row.id, req.user.id) ?? null;
    res.json(job);
  });

  router.post('/', auth.requireRole('employer'), (req, res) => {
    const job = readJob(req.body);
    const id = Number(q.insert.run({ ...job, employer_id: req.user.id }).lastInsertRowid);
    res.status(201).json(presentJob(load(id)));
  });

  // PATCH /api/jobs/:id — partial update; { status: "closed" } closes the listing.
  router.patch('/:id', auth.requireRole('employer', 'admin'), (req, res) => {
    const id = v.id(req.params.id);
    const current = load(id);
    if (!canManage(current, req.user)) throw new HttpError(403, 'You can only edit your own job listings');
    const job = readJob(req.body, current);
    const status = v.oneOf(req.body?.status, 'status', ['open', 'closed'], { fallback: current.status });
    q.update.run({ ...job, status, id });
    res.json(presentJob(load(id)));
  });

  router.delete('/:id', auth.requireRole('employer', 'admin'), (req, res) => {
    const id = v.id(req.params.id);
    if (!canManage(load(id), req.user)) throw new HttpError(403, 'You can only delete your own job listings');
    q.remove.run(id);
    res.status(204).end();
  });

  return { router, countsFor };
}

// GET /api/companies/:id — public company page with its open jobs.
export function companyRoutes(db) {
  const router = Router();
  const q = {
    employer: db.prepare(`
      SELECT u.id, ep.company_name, ep.website, ep.location, ep.description
      FROM users u JOIN employer_profiles ep ON ep.user_id = u.id
      WHERE u.id = ? AND u.is_active = 1`),
    jobs: db.prepare(`${JOB_SELECT} WHERE j.employer_id = ? AND j.status = 'open' ORDER BY j.created_at DESC`),
  };
  router.get('/:id', (req, res) => {
    const company = q.employer.get(v.id(req.params.id));
    if (!company) throw new HttpError(404, 'Company not found');
    res.json({
      id: company.id,
      name: company.company_name,
      website: company.website,
      location: company.location,
      description: company.description,
      openJobs: q.jobs.all(company.id).map(presentJob),
    });
  });
  return router;
}

// GET /api/employer/jobs — the employer's own listings (open and closed) with application counts.
export function employerRoutes(db, auth, countsFor) {
  const router = Router();
  router.get('/jobs', auth.requireRole('employer'), (req, res) => {
    const rows = db.prepare(`${JOB_SELECT} WHERE j.employer_id = ? ORDER BY j.created_at DESC`).all(req.user.id);
    res.json(rows.map((row) => ({ ...presentJob(row), applications: countsFor(row.id) })));
  });
  return router;
}
