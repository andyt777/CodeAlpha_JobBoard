import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.js';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('candidate', 'employer', 'admin')),
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT (${NOW})
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS employer_profiles (
    user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    website      TEXT,
    location     TEXT,
    description  TEXT
  );

  CREATE TABLE IF NOT EXISTS candidate_profiles (
    user_id  INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    headline TEXT,
    location TEXT,
    skills   TEXT,
    bio      TEXT
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    employer_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    description      TEXT NOT NULL,
    location         TEXT NOT NULL,
    employment_type  TEXT NOT NULL CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'internship')),
    experience_level TEXT NOT NULL DEFAULT 'mid' CHECK (experience_level IN ('entry', 'mid', 'senior')),
    is_remote        INTEGER NOT NULL DEFAULT 0,
    salary_min       INTEGER,
    salary_max       INTEGER,
    tags             TEXT NOT NULL DEFAULT '',   -- stored as ",node,express," for exact tag matching
    status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at       TEXT NOT NULL DEFAULT (${NOW}),
    updated_at       TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at);

  CREATE TABLE IF NOT EXISTS resumes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_name   TEXT NOT NULL UNIQUE,
    mime_type     TEXT NOT NULL,
    size          INTEGER NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (${NOW})
  );

  CREATE TABLE IF NOT EXISTS applications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id       INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id    INTEGER REFERENCES resumes(id) ON DELETE RESTRICT,
    cover_letter TEXT,
    status       TEXT NOT NULL DEFAULT 'applied'
                 CHECK (status IN ('applied', 'reviewing', 'interview', 'offered', 'hired', 'rejected', 'withdrawn')),
    created_at   TEXT NOT NULL DEFAULT (${NOW}),
    updated_at   TEXT NOT NULL DEFAULT (${NOW}),
    UNIQUE (job_id, candidate_id)
  );

  -- Full status history, so candidates can track every step.
  CREATE TABLE IF NOT EXISTS application_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    status         TEXT NOT NULL,
    note           TEXT,
    changed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at     TEXT NOT NULL DEFAULT (${NOW})
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    message    TEXT NOT NULL,
    link       TEXT,
    is_read    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (${NOW})
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
`;

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const encodeTags = (tags) => (tags.length ? `,${tags.join(',')},` : '');
export const decodeTags = (value) => value.split(',').filter(Boolean);

export function openDb(file, { seed = false } = {}) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  if (seed) seedDemoData(db);
  return db;
}

function seedDemoData(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;

  transaction(db, () => {
    const addUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    const addEmployer = db.prepare('INSERT INTO employer_profiles (user_id, company_name, website, location, description) VALUES (?, ?, ?, ?, ?)');
    const addCandidate = db.prepare('INSERT INTO candidate_profiles (user_id, headline, location, skills) VALUES (?, ?, ?, ?)');

    addUser.run('Site Admin', 'admin@jobs.com', hashPassword('admin123'), 'admin');
    const techCorp = addUser.run('Tara Recruiter', 'employer@jobs.com', hashPassword('employer123'), 'employer').lastInsertRowid;
    addEmployer.run(techCorp, 'TechCorp', 'https://techcorp.example.com', 'Bucharest', 'Product company building developer tools.');
    const greenSoft = addUser.run('Gabe Hiring', 'greensoft@jobs.com', hashPassword('employer123'), 'employer').lastInsertRowid;
    addEmployer.run(greenSoft, 'GreenSoft', 'https://greensoft.example.com', 'Cluj-Napoca', 'Software for renewable energy.');
    const candidate = addUser.run('Casey Candidate', 'candidate@jobs.com', hashPassword('candidate123'), 'candidate').lastInsertRowid;
    addCandidate.run(candidate, 'Junior Backend Developer', 'Bucharest', 'Node.js, Express, SQL');

    const addJob = db.prepare(`
      INSERT INTO jobs (employer_id, title, description, location, employment_type, experience_level, is_remote, salary_min, salary_max, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    addJob.run(techCorp, 'Backend Developer (Node.js)', 'Build and maintain REST APIs with Express and PostgreSQL. You will work on our core platform with a team of 6.', 'Bucharest', 'full_time', 'mid', 1, 3000, 4500, encodeTags(['node', 'express', 'postgresql']));
    addJob.run(techCorp, 'Backend Intern', 'Three-month paid internship. Learn API design, testing and databases with a mentor.', 'Bucharest', 'internship', 'entry', 0, 800, 1000, encodeTags(['node', 'sql', 'internship']));
    addJob.run(greenSoft, 'Python / Django Developer', 'Develop data pipelines and Django services for energy monitoring.', 'Cluj-Napoca', 'full_time', 'senior', 1, 4500, 6000, encodeTags(['python', 'django']));
    addJob.run(greenSoft, 'Part-time QA Tester', 'Manual and automated testing of web apps, 20h/week.', 'Remote', 'part_time', 'entry', 1, 900, 1200, encodeTags(['qa', 'testing']));
    addJob.run(techCorp, 'DevOps Engineer (Contract)', '6-month contract: CI/CD, Docker, cloud infrastructure.', 'Iasi', 'contract', 'senior', 0, 5000, 7000, encodeTags(['devops', 'docker', 'aws']));
  });
}
