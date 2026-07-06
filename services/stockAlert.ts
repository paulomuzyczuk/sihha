import { SupabaseClient } from '@supabase/supabase-js';
import { sendEmailAlert } from './email';
import { calculateRemainingPills } from './stock';
import { getAlertRecipientEmails } from './careTeam';

const DAY_MS = 86_400_000;

// This check runs on every care-log submission, so without a throttle a single
// low medication would email the alert list once per submission (many per day
// across the care team). Suppress repeat alerts within this window so a low
// stock notifies at most ~once per day until it is restocked.
//   Ref: Nygard, Release It! — Force Multiplier (Ch.4) / Governor (Ch.5):
//   bound machine-speed automation to a human-perceptible time scale.
const ALERT_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export async function checkAndAlertLowStock(
  adminDb: SupabaseClient,
  recipientId: string,
  now: number = Date.now(),
): Promise<void> {
  // Threshold is per-recipient config (M3); null/absent = alerting off.
  const { data: config } = await adminDb
    .from('alert_configs')
    .select('low_stock_days')
    .eq('recipient_id', recipientId)
    .maybeSingle();
  const thresholdDays = config?.low_stock_days;
  if (thresholdDays == null) return;

  const { data: stocks } = await adminDb
    .from('medication_stocks')
    .select('*')
    .eq('recipient_id', recipientId);
  if (!stocks || stocks.length === 0) return;

  let emails: string[] | null = null; // resolved lazily, only when alerting

  for (const stock of stocks) {
    const daysSinceStart = Math.floor(
      (now - new Date(stock.package_start_date).getTime()) / DAY_MS,
    );
    const pillsRemaining = calculateRemainingPills(
      {
        id: stock.id,
        name: stock.name,
        packageStartDate: stock.package_start_date,
        totalPillsInPackage: stock.total_pills_in_package,
        dailyDosage: stock.daily_dosage,
      },
      daysSinceStart,
    );
    const daysRemaining = pillsRemaining / stock.daily_dosage;

    if (daysRemaining > thresholdDays) continue;

    // Throttle: skip if this medication was already alerted within the cooldown.
    const lastAlerted = stock.last_low_stock_alert_at
      ? new Date(stock.last_low_stock_alert_at).getTime()
      : 0;
    if (now - lastAlerted < ALERT_COOLDOWN_MS) continue;

    if (emails === null) {
      emails = await getAlertRecipientEmails(adminDb, recipientId);
    }
    for (const email of emails) {
      await sendEmailAlert(
        email,
        `[sihha] Estoque baixo: ${stock.name}`,
        buildLowStockBody(stock.name, daysRemaining, now),
      );
    }

    // Record the alert so subsequent submissions today do not re-notify.
    await adminDb
      .from('medication_stocks')
      .update({ last_low_stock_alert_at: new Date(now).toISOString() })
      .eq('id', stock.id);
  }
}

function buildLowStockBody(
  name: string,
  daysRemaining: number,
  now: number,
): string {
  const date = new Date(now).toISOString().split('T')[0];
  return `Medicamento: ${name}\nDias restantes: ${daysRemaining.toFixed(1)}\nData do cálculo: ${date}`;
}
