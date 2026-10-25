import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../errors.js';
import * as v from '../validate.js';

const MAX_RESUMES = 5;
const MAX_SIZE = 5 * 1024 * 1024;

// Allowed types, checked by extension AND by the file's first bytes, since the
// browser-supplied MIME type can't be trusted.
const FILE_TYPES = {
  '.pdf': { mime: 'application/pdf', magic: Buffer.from('%PDF') },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
  '.doc': { mime: 'application/msword', magic: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]) },
};

function startsWith(file, magic) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(magic.length);
    fs.readSync(fd, head, 0, magic.length, 0);
    return head.equals(magic);
  } finally {
    fs.closeSync(fd);
  }
}

export const presentResume = (row) => ({
  id: row.id,
  originalName: row.original_name,
  mimeType: row.mime_type,
  size: row.size,
  downloadUrl: `/api/resumes/${row.id}/download`,
  uploadedAt: row.created_at,
});

export function resumeRoutes(db, auth, uploadDir) {
  const router = Router();
  const q = {
    mine: db.prepare('SELECT * FROM resumes WHERE candidate_id = ? ORDER BY id DESC'),
    count: db.prepare('SELECT COUNT(*) AS n FROM resumes WHERE candidate_id = ?'),
    one: db.prepare('SELECT * FROM resumes WHERE id = ?'),
    insert: db.prepare('INSERT INTO resumes (candidate_id, original_name, stored_name, mime_type, size) VALUES (?, ?, ?, ?, ?)'),
    usedBy: db.prepare('SELECT COUNT(*) AS n FROM applications WHERE resume_id = ?'),
    // An employer may open a resume that was sent to one of their jobs.
    sentToEmployer: db.prepare(`
      SELECT 1 FROM applications a JOIN jobs j ON j.id = a.job_id
      WHERE a.resume_id = ? AND j.employer_id = ? LIMIT 1`),
    remove: db.prepare('DELETE FROM resumes WHERE id = ?'),
  };

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: MAX_SIZE, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!FILE_TYPES[path.extname(file.originalname).toLowerCase()]) {
        return cb(new HttpError(400, 'Only PDF, DOC or DOCX files are allowed'));
      }
      cb(null, true);
    },
  });

  const filePath = (row) => path.join(uploadDir, row.stored_name);

  router.get('/', auth.requireRole('candidate'), (req, res) => {
    res.json(q.mine.all(req.user.id).map(presentResume));
  });

  // POST /api/resumes (multipart/form-data, field "resume")
  router.post(
    '/',
    auth.requireRole('candidate'),
    (req, res, next) => {
      if (q.count.get(req.user.id).n >= MAX_RESUMES) {
        throw new HttpError(409, `You can keep at most ${MAX_RESUMES} resumes. Delete one first.`);
      }
      next();
    },
    upload.single('resume'),
    (req, res) => {
      if (!req.file) throw new HttpError(400, 'Attach a file in the "resume" field');
      const type = FILE_TYPES[path.extname(req.file.originalname).toLowerCase()];
      if (!startsWith(req.file.path, type.magic)) {
        fs.rmSync(req.file.path, { force: true });
        throw new HttpError(400, "The file content doesn't match its extension");
      }
      const originalName = path.basename(req.file.originalname).slice(0, 200);
      const id = Number(q.insert.run(req.user.id, originalName, req.file.filename, type.mime, req.file.size).lastInsertRowid);
      res.status(201).json(presentResume(q.one.get(id)));
    },
  );

  router.get('/:id/download', auth.requireAuth, (req, res) => {
    const row = q.one.get(v.id(req.params.id));
    const allowed =
      row &&
      (req.user.role === 'admin' ||
        row.candidate_id === req.user.id ||
        (req.user.role === 'employer' && q.sentToEmployer.get(row.id, req.user.id)));
    if (!allowed) throw new HttpError(404, 'Resume not found');
    res.type(row.mime_type);
    res.download(filePath(row), row.original_name);
  });

  router.delete('/:id', auth.requireRole('candidate'), (req, res) => {
    const row = q.one.get(v.id(req.params.id));
    if (!row || row.candidate_id !== req.user.id) throw new HttpError(404, 'Resume not found');
    if (q.usedBy.get(row.id).n) throw new HttpError(409, 'This resume was used in an application and must be kept');
    q.remove.run(row.id);
    fs.rmSync(filePath(row), { force: true });
    res.status(204).end();
  });

  return router;
}
