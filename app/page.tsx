import { redirect } from 'next/navigation';

/**
 * Root page component that automatically routes visitors
 * from the index path (/) directly to the authentication gateway (/login).
 */
export default function RootPage(): never {
  redirect('/login');
}
