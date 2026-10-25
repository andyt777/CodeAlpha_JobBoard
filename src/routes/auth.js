import { Router } from 'express';
import { hashPassword, verifyPassword } from '../auth.js';
import { HttpError } from '../errors.js';
import { transaction } from '../db.js';
import * as v from '../validate.js';

export function authRoutes(db, auth) {
  const router = Router();
  const q = {
    byEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    insertUser: db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'),
    employerProfile: db.prepare('SELECT * FROM employer_profiles WHERE user_id = ?'),
    candidateProfile: db.prepare('SELECT * FROM candidate_profiles WHERE user_id = ?'),
    insertEmployer: db.prepare('INSERT INTO employer_profiles (user_id, company_name, website, location, description) VALUES (?, ?, ?, ?, ?)'),
    insertCandidate: db.prepare('INSERT INTO candidate_profiles (user_id, headline, location, skills, bio) VALUES (?, ?, ?, ?, ?)'),
    updateEmployer: db.prepare('UPDATE employer_profiles SET company_name = ?, website = ?, location = ?, description = ? WHERE user_id = ?'),
    updateCandidate: db.prepare('UPDATE candidate_profiles SET headline = ?, location = ?, skills = ?, bio = ? WHERE user_id = ?'),
    updateName: db.prepare('UPDATE users SET name = ? WHERE id = ?'),
  };

  const profileOf = (user) => {
    if (user.role === 'employer') {
      const p = q.employerProfile.get(user.id);
      return p && { companyName: p.company_name, website: p.website, location: p.location, description: p.description };
    }
    if (user.role === 'candidate') {
      const p = q.candidateProfile.get(user.id);
      return p && { headline: p.headline, location: p.location, skills: p.skills, bio: p.bio };
    }
    return null;
  };

  const withProfile = ({ id, name, email, role }) => ({ id, name, email, role, profile: profileOf({ id, role }) });

  const readEmployer = (b) => [
    v.string(b.companyName, 'companyName', { max: 120 }),
    v.string(b.website, 'website', { required: false, max: 200 }),
    v.string(b.location, 'location', { required: false, max: 100 }),
    v.string(b.description, 'description', { required: false, max: 2000 }),
  ];
  const readCandidate = (b) => [
    v.string(b.headline, 'headline', { required: false, max: 120 }),
    v.string(b.location, 'location', { required: false, max: 100 }),
    v.string(b.skills, 'skills', { required: false, max: 500 }),
    v.string(b.bio, 'bio', { required: false, max: 2000 }),
  ];

  // POST /api/auth/register { name, email, password, role: "candidate"|"employer", companyName? }
  router.post('/auth/register', (req, res) => {
    const body = req.body ?? {};
    const name = v.string(body.name, 'name', { max: 100 });
    const email = v.email(body.email);
    const password = v.string(body.password, 'password', { min: 6, max: 128 });
    const role = v.oneOf(body.role, 'role', ['candidate', 'employer']);
    const profile = role === 'employer' ? readEmployer(body) : readCandidate(body);
    if (q.byEmail.get(email)) throw new HttpError(409, 'An account with this email already exists');

    const id = transaction(db, () => {
      const userId = Number(q.insertUser.run(name, email, hashPassword(password), role).lastInsertRowid);
      (role === 'employer' ? q.insertEmployer : q.insertCandidate).run(userId, ...profile);
      return userId;
    });
    res.status(201).json({ token: auth.issueToken(id), user: withProfile({ id, name, email, role }) });
  });

  router.post('/auth/login', (req, res) => {
    const email = v.email(req.body?.email);
    const password = v.string(req.body?.password, 'password', { max: 128 });
    const user = q.byEmail.get(email);
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, 'Invalid email or password');
    if (!user.is_active) throw new HttpError(403, 'This account has been deactivated');
    res.json({ token: auth.issueToken(user.id), user: withProfile(user) });
  });

  router.post('/auth/logout', auth.requireAuth, (req, res) => {
    auth.revoke(req);
    res.status(204).end();
  });

  router.get('/auth/me', auth.requireAuth, (req, res) => res.json(withProfile(req.user)));

  // PUT /api/profile — update your own name and role-specific profile.
  router.put('/profile', auth.requireRole('candidate', 'employer'), (req, res) => {
    const body = req.body ?? {};
    const name = v.string(body.name ?? req.user.name, 'name', { max: 100 });
    transaction(db, () => {
      q.updateName.run(name, req.user.id);
      if (req.user.role === 'employer') q.updateEmployer.run(...readEmployer(body), req.user.id);
      else q.updateCandidate.run(...readCandidate(body), req.user.id);
    });
    res.json(withProfile({ ...req.user, name }));
  });

  return router;
}
