'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const email = form.get('email');
    const password = form.get('password');
    if (typeof email !== 'string' || typeof password !== 'string') {
      setPending(false);
      setError('Completa correo y contraseña.');
      return;
    }
    const result = await authClient.signIn.email({
      email,
      password,
      callbackURL: '/',
    });
    setPending(false);
    if (result.error)
      setError(
        'No fue posible iniciar sesión. Verifica tus datos y que la invitación esté activa.',
      );
    else {
      router.push('/');
      router.refresh();
    }
  }
  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <label className="block text-sm font-medium">
        Correo
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-2 h-11 w-full rounded-xl border bg-white px-3 outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>
      <label className="block text-sm font-medium">
        Contraseña
        <input
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="current-password"
          className="mt-2 h-11 w-full rounded-xl border bg-white px-3 outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-xs text-red-700"
        >
          {error}
        </p>
      )}
      <button
        disabled={pending}
        className="h-11 w-full rounded-xl bg-[#1f4b3c] text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Ingresando…' : 'Ingresar'}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        El acceso es únicamente por invitación. No hay registro público.
      </p>
    </form>
  );
}
