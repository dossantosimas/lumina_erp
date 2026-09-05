'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = data.get('password');
    if (typeof password !== 'string' || password.length < 12 || !token) {
      setError('El enlace o la contraseña no son válidos.');
      return;
    }
    setPending(true);
    const result = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setPending(false);
    if (result.error) setError('El enlace venció o ya fue utilizado.');
    else router.push('/login');
  }
  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      <label className="block text-sm font-medium">
        Nueva contraseña
        <input
          name="password"
          type="password"
          minLength={12}
          required
          className="mt-2 h-11 w-full rounded-xl border px-3"
        />
      </label>
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>
      )}
      <button
        disabled={pending}
        className="h-11 w-full rounded-xl bg-primary text-sm font-semibold text-white"
      >
        {pending ? 'Guardando…' : 'Definir contraseña'}
      </button>
    </form>
  );
}
