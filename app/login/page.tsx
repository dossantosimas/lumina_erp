import { Sparkles } from 'lucide-react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5">
      <section className="w-full max-w-md rounded-3xl border bg-background p-8 shadow-xl">
        <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">
          <Sparkles />
        </span>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-[#9a775a]">
          LÚMINA Candle Studio
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
