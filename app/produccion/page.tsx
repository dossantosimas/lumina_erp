import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccessError, authorize } from '@/lib/authorization';
import { getProductionSnapshot } from '@/modules/produccion/queries/get-production-snapshot';
import { ProductionWorkspace } from './workspace';
import { AccessDenied } from '@/shared/components/access-denied';

export const dynamic = 'force-dynamic';

export default async function ProductionPage() {
  try {
    await authorize(await headers(), 'production', 'view');
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect('/login');
    if (error instanceof AccessError) return <AccessDenied />;
    throw error;
  }
  return <ProductionWorkspace snapshot={await getProductionSnapshot()} />;
}
