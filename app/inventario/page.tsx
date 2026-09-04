import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccessError, authorize } from '@/lib/authorization';
import { getInventorySnapshot } from '@/modules/inventario/queries/get-inventory-snapshot';
import { InventoryWorkspace } from './workspace';
import { AccessDenied } from '@/shared/components/access-denied';

export const dynamic = 'force-dynamic';

export default async function InventoryPage() {
  try {
    await authorize(await headers(), 'inventory', 'view');
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect('/login');
    if (error instanceof AccessError) return <AccessDenied />;
    throw error;
  }
  return <InventoryWorkspace snapshot={await getInventorySnapshot()} />;
}
