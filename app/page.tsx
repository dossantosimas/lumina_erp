import { getChatGPTUser } from './chatgpt-auth';
import { Dashboard } from './dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  return <Dashboard user={{ name: user?.displayName ?? 'Daniela Rojas', email: user?.email ?? 'administracion@luminacandlestudio.co', authenticated: Boolean(user) }} />;
}
