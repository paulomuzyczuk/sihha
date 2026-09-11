// Push service worker (M15): renders fill-reminder notifications and opens the
// dashboard on tap. Registered on demand by PushReminderOptIn; kept
// dependency-free plain JS because it is served as-is from /public. When the app
// is installed as a PWA these render as native OS notifications.
//
// Analytics (M16): reports 'displayed' when a push fires and 'opened' on tap
// back to /api/push/event, keyed by the per-send notificationId in the payload.
// Best-effort — a failed report never blocks the notification.

function reportEvent(notificationId, event) {
  if (!notificationId) return Promise.resolve();
  return fetch('/api/push/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationId: notificationId, event: event }),
  }).catch(function () {});
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    // Non-JSON payload — show the generic notification below
  }
  const notificationId = data.notificationId;
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'sihha', {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: data.url || '/dashboard', notificationId: notificationId },
      }),
      reportEvent(notificationId, 'displayed'),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const info = event.notification.data || {};
  const url = info.url || '/';
  event.waitUntil(
    Promise.all([
      reportEvent(info.notificationId, 'opened'),
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((windows) => {
          for (const win of windows) {
            if ('focus' in win) return win.focus();
          }
          return self.clients.openWindow(url);
        }),
    ]),
  );
});
