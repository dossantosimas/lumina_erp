import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccessError, authorize } from '@/lib/authorization';
import { getPurchasesSnapshot } from '@/modules/compras/queries/get-purchases-snapshot';
import { PurchasesWorkspace } from './workspace';
import { AccessDenied } from '@/shared/components/access-denied';

export const dynamic = 'force-dynamic';

export default async function PurchasesPage() {
  try {
    await authorize(await headers(), 'purchases', 'view');
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect('/login');
    if (error instanceof AccessError) return <AccessDenied />;
    throw error;
  }
  return <PurchasesWorkspace snapshot={await getPurchasesSnapshot()} />;
}
