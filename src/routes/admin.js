import { Router } from 'express';
import { HttpError } from '../errors.js';
import * as v from '../validate.js';

export function adminRoutes(db, auth) {
  const router = Router();
  router.use(auth.requireRole('admin'));

  const q = {
    usersByRole: db.prepare('SELECT role, COUNT(*) AS n FROM users GROUP BY role'),
    jobsByStatus: db.prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status'),
    appsByStatus: db.prepare('SELECT status, COUNT(*) AS n FROM applications GROUP BY status'),
    appsPerDay: db.prepare(`
      SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM applications
      WHERE created_at >= ? GROUP BY day ORDER BY day`),
    topJobs: db.prepare(`
      SELECT j.id, j.title, ep.company_name AS company, COUNT(a.id) AS applications
      FROM jobs j JOIN employer_profiles ep ON ep.user_id = j.employer_id
      LEFT JOIN applications a ON a.job_id = j.id AND a.status != 'withdrawn'
      GROUP BY j.id ORDER BY applications DESC, j.id LIMIT 5`),
    resumes: db.prepare('SELECT COUNT(*) AS n FROM resumes'),
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
    setActive: db.prepare('UPDATE users SET is_active = ? WHERE id = ?'),
    dropSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  };

  const countMap = (rows) => Object.fromEntries(rows.map((r) => [r.status ?? r.role, r.n]));

  router.get('/stats', (req, res) => {
    const since = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const appsByStatus = countMap(q.appsByStatus.all());
    const totalApps = Object.values(appsByStatus).reduce((a, b) => a + b, 0);
    res.json({
      users: countMap(q.usersByRole.all()),
      jobs: countMap(q.jobsByStatus.all()),
      applications: {
        total: totalApps,
        byStatus: appsByStatus,
        hireRate: totalApps ? Math.round(((appsByStatus.hired ?? 0) / totalApps) * 1000) / 10 : 0,
        last7Days: q.appsPerDay.all(since).map((r) => ({ day: r.day, count: r.n })),
      },
      topJobs: q.topJobs.all(),
      resumesUploaded: q.resumes.get().n,
    });
  });

  // GET /api/admin/users?role=&q=
  router.get('/users', (req, res) => {
    const where = [];
    const params = [];
    if (req.query.role) {
      where.push('u.role = ?');
      params.push(v.oneOf(req.query.role, 'role', ['candidate', 'employer', 'admin']));
    }
    if (req.query.q) {
      where.push('(u.name LIKE ? OR u.email LIKE ? OR ep.company_name LIKE ?)');
      params.push(...Array(3).fill(`%${String(req.query.q).slice(0, 100)}%`));
    }
    const rows = db.prepare(`
      SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, ep.company_name,
        (SELECT COUNT(*) FROM jobs j WHERE j.employer_id = u.id) AS jobs,
        (SELECT COUNT(*) FROM applications a WHERE a.candidate_id = u.id) AS applications
      FROM users u LEFT JOIN employer_profiles ep ON ep.user_id = u.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY u.id`).all(...params);
    res.json(rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      isActive: !!r.is_active,
      company: r.company_name,
      jobs: r.jobs,
      applications: r.applications,
      createdAt: r.created_at,
    })));
  });

  // PATCH /api/admin/users/:id { isActive: false } — deactivating also logs the user out everywhere.
  router.patch('/users/:id', (req, res) => {
    const id = v.id(req.params.id);
    const user = q.user.get(id);
    if (!user) throw new HttpError(404, 'User not found');
    if (id === req.user.id) throw new HttpError(400, "You can't deactivate your own account");
    const isActive = v.boolean(req.body?.isActive, 'isActive');
    if (isActive === null) throw new HttpError(400, '"isActive" is required');
    q.setActive.run(isActive ? 1 : 0, id);
    if (!isActive) q.dropSessions.run(id);
    res.json({ id, isActive });
  });

  return router;
}
