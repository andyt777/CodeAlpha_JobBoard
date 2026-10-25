import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(root, 'data', 'jobs.db');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(root, 'uploads');

const db = openDb(DB_FILE, { seed: process.env.SEED !== 'false' });
createApp(db, { uploadDir: UPLOAD_DIR }).listen(PORT, () => {
  console.log(`Job board API running on http://localhost:${PORT}`);
});
