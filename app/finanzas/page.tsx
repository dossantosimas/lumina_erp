import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccessError, authorize } from '@/lib/authorization';
import { getFinanceSnapshot } from '@/modules/finanzas/queries/get-finance-snapshot';
import { FinanceWorkspace } from './workspace';
import { AccessDenied } from '@/shared/components/access-denied';

export const dynamic = 'force-dynamic';
export default async function FinancePage() {
  try {
    await authorize(await headers(), 'accounts', 'view');
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect('/login');
    if (error instanceof AccessError) return <AccessDenied />;
    throw error;
  }
  return <FinanceWorkspace snapshot={await getFinanceSnapshot()} />;
}
