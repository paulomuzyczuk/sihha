'use client';

import { useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient, withViewAs } from '../lib/circles';
import { supabase } from './supabaseClient';
import type { CrisisPlan } from '../lib/crisisPlan/types';

// Loads the recipient's crisis plan for whichever panel is showing it. Returns
// null until the plan arrives, which the view renders as a loading line rather
// than an empty page — a blank crisis tab reads as "no plan exists", which is
// the wrong thing to believe mid-episode.
export function useCrisisPlan(
  recipientId: string | undefined,
  viewAs: string | null,
): CrisisPlan | null {
  const [plan, setPlan] = useState<CrisisPlan | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      const base = recipientId
        ? withRecipient(API_ROUTES.CRISIS_PLAN, recipientId)
        : API_ROUTES.CRISIS_PLAN;
      const res = await fetch(withViewAs(base, viewAs), {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok || cancelled) return;
      const body = await res.json();
      if (!cancelled) setPlan(body.plan ?? { protocols: [] });
    };
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [recipientId, viewAs]);

  return plan;
}
