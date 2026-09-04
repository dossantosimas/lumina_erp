import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccessError, authorize } from '@/lib/authorization';
import { getUsersSnapshot } from '@/modules/sistema/queries/get-users-snapshot';
import { UsersWorkspace } from './workspace';
import { AccessDenied } from '@/shared/components/access-denied';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  let actorId = '';
  try {
    const actor = await authorize(await headers(), 'users', 'view');
    actorId = actor.id;
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect('/login');
    if (error instanceof AccessError) return <AccessDenied />;
    throw error;
  }
  return (
    <UsersWorkspace
      snapshot={await getUsersSnapshot()}
      currentUserId={actorId}
    />
  );
}
