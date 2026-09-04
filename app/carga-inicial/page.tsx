import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccessError, authorize } from '@/lib/authorization';
import { InitialLoadWorkspace } from './workspace';
import { AccessDenied } from '@/shared/components/access-denied';

export default async function InitialLoadPage() {
  try {
    await authorize(await headers(), 'users', 'admin');
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect('/login');
    if (error instanceof AccessError) return <AccessDenied />;
    throw error;
  }
  return <InitialLoadWorkspace />;
}
