import Image from 'next/image';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5">
      <section className="w-full max-w-md rounded-3xl border bg-background p-8 shadow-xl">
        <Image
          src="/brand/lumina-lockup.png"
          alt="LÚMINA Candle Studio"
          width={300}
          height={200}
          className="mx-auto h-36 w-auto object-contain"
          priority
        />
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-brand">
          Operación centralizada
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold">
          Acceso al ERP
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Ingresa con el correo que recibió la invitación del administrador.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
