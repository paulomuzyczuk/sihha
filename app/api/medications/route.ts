import { NextRequest, NextResponse } from 'next/server';
import { MedicationOption } from '../../../lib/types';
import { getAdminDbClient } from '../../../services/db';
import { authorizeCareRequest } from '../../../services/careTeam';
import { logger } from '../../../services/logger';

type MedicationStockRow = { name: string; daily_dosage: number };

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Caregivers need the checklist to log; owners need it for the audit views
  const auth = await authorizeCareRequest(req, ['caregiver', 'owner']);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  const adminDb = getAdminDbClient();
  const { data, error: dbError } = await adminDb
    .from('medication_stocks')
    .select('name, daily_dosage')
    .eq('recipient_id', recipient.id);

  if (dbError) {
    logger.error(
      'medications: medication_stocks query failed',
      { route: '/api/medications', action: 'select' },
      dbError,
    );
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }

  const medications: MedicationOption[] = (
    (data ?? []) as MedicationStockRow[]
  ).map((row) => ({ name: row.name, dailyDosage: row.daily_dosage }));

  return NextResponse.json({ medications });
}
