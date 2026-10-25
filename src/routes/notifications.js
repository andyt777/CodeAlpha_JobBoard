import { Router } from 'express';
import { HttpError } from '../errors.js';
import * as v from '../validate.js';

export function notificationRoutes(db, auth) {
  const router = Router();
  router.use(auth.requireAuth);

  const q = {
    unreadCount: db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0'),
    markRead: db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'),
    markAll: db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'),
  };

  const present = (n) => ({ id: n.id, type: n.type, message: n.message, link: n.link, isRead: !!n.is_read, createdAt: n.created_at });

  // GET /api/notifications?unread=true&limit=
  router.get('/', (req, res) => {
    const limit = v.integer(req.query.limit, 'limit', { required: false, min: 1, max: 100 }) ?? 30;
    const unreadOnly = req.query.unread === 'true';
    const rows = db
      .prepare(`SELECT * FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''} ORDER BY id DESC LIMIT ?`)
      .all(req.user.id, limit);
    res.json({ unreadCount: q.unreadCount.get(req.user.id).n, data: rows.map(present) });
  });

  router.patch('/:id/read', (req, res) => {
    const { changes } = q.markRead.run(v.id(req.params.id), req.user.id);
    if (!changes) throw new HttpError(404, 'Notification not found');
    res.status(204).end();
  });

  router.post('/read-all', (req, res) => {
    const { changes } = q.markAll.run(req.user.id);
    res.json({ marked: changes });
  });

  return router;
}
