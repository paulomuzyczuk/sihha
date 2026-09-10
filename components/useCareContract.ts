'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient, withViewAs } from '../lib/circles';
import { supabase } from './supabaseClient';
import type { CareContract } from '../lib/careContract/types';

// Loads the care agreement for whichever panel is showing it, and re-fetches
// when a party picks a past version. Returns null until the first response, so
// the view can say "loading" rather than "no agreement recorded" — those two
// read very differently to someone checking what they committed to.

export function useCareContract(
  recipientId: string | undefined,
  viewAs: string | null,
): {
  contract: CareContract | null;
  selectedVersionId: string | null;
  selectVersion: (versionId: string) => void;
} {
  const [contract, setContract] = useState<CareContract | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      let base = recipientId
        ? withRecipient(API_ROUTES.CARE_CONTRACT, recipientId)
        : API_ROUTES.CARE_CONTRACT;
      base = withViewAs(base, viewAs);
      const url = selectedVersionId
        ? `${base}${base.includes('?') ? '&' : '?'}version=${encodeURIComponent(selectedVersionId)}`
        : base;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok || cancelled) return;
      const body = await res.json();
      if (!cancelled)
        setContract(body.contract ?? { version: null, versions: [] });
    };
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [recipientId, viewAs, selectedVersionId]);

  const selectVersion = useCallback((versionId: string) => {
    setSelectedVersionId(versionId);
  }, []);

  return { contract, selectedVersionId, selectVersion };
}
