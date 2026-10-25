import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.js';
import { errorHandler, notFound } from './errors.js';
import { createNotifier } from './notifications.js';
import { authRoutes } from './routes/auth.js';
import { companyRoutes, employerRoutes, jobRoutes } from './routes/jobs.js';
import { resumeRoutes } from './routes/resumes.js';
import { applicationRoutes } from './routes/applications.js';
import { notificationRoutes } from './routes/notifications.js';
import { adminRoutes } from './routes/admin.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp(db, { uploadDir }) {
  fs.mkdirSync(uploadDir, { recursive: true });

  const app = express();
  const auth = createAuth(db);
  const notifier = createNotifier(db);
  const jobs = jobRoutes(db, auth);
  const applications = applicationRoutes(db, auth, notifier);

  app.use(express.json());
  app.use(express.static(publicDir));
  app.use('/api', auth.authenticate);

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api', authRoutes(db, auth));
  app.post('/api/jobs/:id/apply', auth.requireRole('candidate'), applications.apply);
  app.get('/api/jobs/:id/applications', auth.requireRole('employer', 'admin'), applications.listForJob);
  app.use('/api/jobs', jobs.router);
  app.use('/api/companies', companyRoutes(db));
  app.use('/api/employer', employerRoutes(db, auth, jobs.countsFor));
  app.use('/api/resumes', resumeRoutes(db, auth, uploadDir));
  app.use('/api/applications', applications.router);
  app.use('/api/notifications', notificationRoutes(db, auth));
  app.use('/api/admin', adminRoutes(db, auth));

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
