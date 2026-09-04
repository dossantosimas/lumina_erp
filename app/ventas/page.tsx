import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccessError, authorize } from '@/lib/authorization';
import { getSalesSnapshot } from '@/modules/ventas/queries/get-sales-snapshot';
import { SalesWorkspace } from './workspace';
import { AccessDenied } from '@/shared/components/access-denied';

export const dynamic = 'force-dynamic';
export default async function SalesPage() {
  try {
    await authorize(await headers(), 'orders', 'view');
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect('/login');
    if (error instanceof AccessError) return <AccessDenied />;
    throw error;
  }
  return <SalesWorkspace snapshot={await getSalesSnapshot()} />;
}
