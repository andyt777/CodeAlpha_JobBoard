// In-app notifications. Every notification goes through notify(), so this is the one place
// to also send an email or a push message later.
export function createNotifier(db) {
  const insert = db.prepare('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)');
  return {
    notify(userId, type, message, link = null) {
      insert.run(userId, type, message, link);
    },
  };
}
