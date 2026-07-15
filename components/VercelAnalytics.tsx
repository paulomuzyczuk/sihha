'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

// Defense-in-depth PII scrubbing for product analytics on a psychiatric-health
// app. Care-recipient IDs travel as ?recipient=<uuid>, so they could otherwise
// reach Vercel's analytics endpoint via the reported URL. Vercel already drops
// query strings, but we additionally strip the query ourselves and redact any
// UUID that appears in a path segment before the event leaves the browser.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function scrubUrl(url: string): string {
  const [path] = url.split('?');
  return path.replace(UUID, '[id]');
}

export default function VercelAnalytics() {
  return (
    <>
      <Analytics
        beforeSend={(event) => ({ ...event, url: scrubUrl(event.url) })}
      />
      <SpeedInsights
        beforeSend={(event) => ({ ...event, url: scrubUrl(event.url) })}
      />
    </>
  );
}
