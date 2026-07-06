import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const VALID_ROLES = ['THERAPIST', 'PATIENT', 'ADMIN', 'DOCTOR'] as const;
type Role = (typeof VALID_ROLES)[number];

// tsx doesn't auto-load .env; parse it manually so the script is self-contained
function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split(
      '\n',
    );
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env absent — rely on environment variables already being set
  }
}

async function main(): Promise<void> {
  loadEnv();

  const [, , email, role] = process.argv;

  if (!email || !role) {
    console.error('Usage: pnpm tsx scripts/set-user-role.ts <email> <role>');
    console.error(`Roles: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role as Role)) {
    console.error(
      `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`,
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env',
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: list, error: listError } =
    await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to list users:', listError.message);
    process.exit(1);
  }

  const user = list.users.find((u) => u.email === email);
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const previousRole = user.app_metadata?.role ?? '(none)';

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    {
      app_metadata: { role },
    },
  );

  if (updateError) {
    console.error('Failed to update role:', updateError.message);
    process.exit(1);
  }

  const { error: approvalError } = await supabase
    .from('user_profiles')
    .update({ approved: true })
    .eq('user_id', user.id);

  if (approvalError) {
    console.warn(
      'Could not update user_profiles approval:',
      approvalError.message,
    );
  }

  console.log(`OK  ${email}`);
  console.log(`    ${previousRole} -> ${role}`);
  console.log(`    user_id: ${user.id}`);
  console.log(`Usuário ${email} aprovado como ${role}`);
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
