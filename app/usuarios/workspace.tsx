'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  History,
  MailPlus,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';

const roleOptions = [
  ['ADMIN', 'Administrador'],
  ['PRODUCTION', 'Producción'],
  ['SALES', 'Ventas'],
  ['INVENTORY', 'Inventario'],
  ['FINANCE', 'Finanzas'],
  ['PLANNING', 'Planeación'],
] as const;
type Role = { code: string; name: string };
type Snapshot = {
  members: {
    id: string;
    name: string;
    email: string;
    active: boolean;
    emailVerified: boolean;
    createdAt: Date;
    roles: Role[];
  }[];
  invitations: {
    id: string;
    email: string;
    emailStatus: 'PENDING' | 'SENT' | 'FAILED' | 'ACCEPTED';
    expiresAt: Date;
    lastAttemptAt: Date | null;
    sentAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    roles: Role[];
  }[];
  audit: {
    id: string;
    operation: string;
    entityType: string;
    entityId: string;
    reason: string | null;
    occurredAt: Date;
    actorName: string | null;
    actorEmail: string | null;
  }[];
};

function bogotaDate(value: Date) {
  return new Date(value)
    .toLocaleString('es-CO', { timeZone: 'America/Bogota' })
    .replace(/[\u00a0\u202f]/g, ' ');
}

export function UsersWorkspace({
  snapshot,
  currentUserId,
}: {
  snapshot: Snapshot;
  currentUserId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'Usuarios' | 'Auditoría'>('Usuarios');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const editingUser = snapshot.members.find(
    (member) => member.id === editingUserId,
  );

  useEffect(() => {
    if (!editingUserId) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingUserId(null);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [editingUserId]);

  function errorMessage(code: string) {
    const messages: Record<string, string> = {
      SELF_DEACTIVATION_FORBIDDEN:
        'No puedes eliminar tu propio acceso mientras usas esta sesión.',
      SELF_ADMIN_LOCKOUT_FORBIDDEN:
        'No puedes retirar tu propio rol Administrador ni desactivarte.',
      LAST_ADMIN_REQUIRED: 'Debe permanecer al menos un administrador activo.',
      USER_NOT_FOUND: 'El usuario ya no existe.',
      VALIDATION_ERROR: 'Revisa el nombre, los roles y el motivo.',
    };
    return messages[code] ?? 'No fue posible modificar el usuario.';
  }

  async function request(
    url: string,
    method: 'PATCH' | 'DELETE',
    body: unknown,
    success: string,
  ) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(errorMessage(result.error));
      setMessage(success);
      setEditingUserId(null);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error inesperado.');
    } finally {
      setPending(false);
    }
  }

  async function updateUser(formData: FormData) {
    if (!editingUser) return;
    const selectedRoles = roleOptions
      .filter(([code]) => formData.get(code) === 'on')
      .map(([code]) => code);
    await request(
      `/api/v1/users/${editingUser.id}`,
      'PATCH',
      {
        name: formData.get('name'),
        roles: selectedRoles,
        active: editingUser.active,
        reason: formData.get('reason'),
      },
      `Usuario ${editingUser.name} actualizado.`,
    );
  }

  async function removeAccess(member: Snapshot['members'][number]) {
    const reason = window.prompt(
      `Indica el motivo para eliminar el acceso de ${member.name}:`,
    );
    if (!reason) return;
    if (
      !window.confirm(
        `Se cerrarán todas las sesiones de ${member.name}. Su historial se conservará. ¿Continuar?`,
      )
    )
      return;
    await request(
      `/api/v1/users/${member.id}`,
      'DELETE',
      { reason },
      `Acceso de ${member.name} eliminado.`,
    );
  }

  async function restoreAccess(member: Snapshot['members'][number]) {
    await request(
      `/api/v1/users/${member.id}`,
      'PATCH',
      {
        name: member.name,
        roles: member.roles.map((role) => role.code),
        active: true,
        reason: 'Restauración administrativa del acceso',
      },
      `Acceso de ${member.name} restaurado.`,
    );
  }
  async function invite(formData: FormData) {
    setPending(true);
    setError('');
    setMessage('');
    const roles = roleOptions
      .filter(([code]) => formData.get(code) === 'on')
      .map(([code]) => code);
    try {
      const response = await fetch('/api/v1/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          roles,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error === 'EMAIL_ALREADY_REGISTERED'
            ? 'El correo ya pertenece a un usuario.'
            : (result.error ?? 'No fue posible enviar la invitación.'),
        );
      setMessage(
        result.emailStatus === 'SENT'
          ? `Invitación enviada a ${result.email}.`
          : `La cuenta de ${result.email} fue creada, pero Gmail no pudo enviar el correo. Puedes reenviarlo desde invitaciones pendientes.`,
      );
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error inesperado.');
    } finally {
      setPending(false);
    }
  }
  async function resendInvitation(invitation: Snapshot['invitations'][number]) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        `/api/v1/invitations/${invitation.id}/resend`,
        { method: 'POST' },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? 'No fue posible reenviar.');
      setMessage(
        result.emailStatus === 'SENT'
          ? `Invitación reenviada a ${invitation.email}.`
          : `Gmail no pudo enviar la invitación a ${invitation.email}. Revisa la configuración SMTP.`,
      );
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error inesperado.');
    } finally {
      setPending(false);
    }
  }
  async function cancelInvitation(invitation: Snapshot['invitations'][number]) {
    if (!window.confirm(`¿Cancelar la invitación de ${invitation.email}?`))
      return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/invitations/${invitation.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? 'No fue posible cancelar.');
      setMessage(`Invitación de ${invitation.email} cancelada.`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error inesperado.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="min-h-screen bg-[var(--canvas)] p-4 text-foreground sm:p-8 lg:p-10">
      <div className="mx-auto max-w-[1450px]">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-brand">
              Acceso y trazabilidad
            </p>
            <h1 className="mt-2 font-heading text-4xl font-semibold">
              Equipo y auditoría
            </h1>
          </div>
          <Sparkles className="size-7 text-brand" />
        </header>
        <div className="mt-7 flex gap-2">
          {(['Usuarios', 'Auditoría'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === item ? 'bg-primary text-white' : 'border bg-background'}`}
            >
              {item}
            </button>
          ))}
        </div>
        {message && (
          <p className="mt-5 rounded-xl bg-[#e4f0e9] p-3 text-sm text-[#27684f]">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {tab === 'Usuarios' ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[390px_1fr]">
            <form action={invite} className="panel h-fit p-6">
              <MailPlus className="size-6 text-brand" />
              <h2 className="mt-4 font-heading text-xl font-semibold">
                Invitar integrante
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Recibirá un enlace para definir su contraseña. No existe
                registro público.
              </p>
              <label className="mt-5 block text-xs font-semibold">
                Nombre
                <input
                  required
                  minLength={2}
                  name="name"
                  className="input mt-2"
                />
              </label>
              <label className="mt-4 block text-xs font-semibold">
                Correo
                <input
                  required
                  type="email"
                  name="email"
                  className="input mt-2"
                />
              </label>
              <fieldset className="mt-5">
                <legend className="text-xs font-semibold">Roles</legend>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {roleOptions.map(([code, name]) => (
                    <label
                      key={code}
                      className="flex items-center gap-2 rounded-xl border bg-background p-3 text-xs"
                    >
                      <input type="checkbox" name={code} /> {name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                disabled={pending}
                className="mt-5 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? 'Enviando…' : 'Enviar invitación'}
              </button>
            </form>
            <section className="min-w-0 space-y-5">
              <div className="panel overflow-hidden">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">Acceso vigente</p>
                    <h2 className="panel-title">
                      Usuarios ({snapshot.members.length})
                    </h2>
                  </div>
                  <Users className="size-5 text-brand" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="p-4">Persona</th>
                        <th className="p-4">Roles</th>
                        <th className="p-4">Correo</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.members.map((member) => {
                        const pendingInvitation = snapshot.invitations.find(
                          (invitation) =>
                            invitation.email.toLowerCase() ===
                            member.email.toLowerCase(),
                        );
                        return (
                        <tr key={member.id} className="border-b last:border-0">
                          <td className="p-4 font-semibold">{member.name}</td>
                          <td className="p-4">
                            {member.roles.map((role) => role.name).join(', ') ||
                              'Sin rol'}
                          </td>
                          <td className="p-4 text-muted-foreground">
                            {member.email}
                          </td>
                          <td className="p-4">
                            <span
                              className={
                                member.active
                                  ? 'status status-green'
                                  : 'status status-gray'
                              }
                            >
                              <span />
                              {member.active
                                ? member.emailVerified
                                  ? 'Verificado'
                                  : pendingInvitation?.emailStatus === 'FAILED'
                                    ? 'Pendiente · Falló el correo'
                                    : 'Invitación pendiente'
                                : 'Inactivo'}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex justify-end gap-2">
                              {pendingInvitation && (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() =>
                                    resendInvitation(pendingInvitation)
                                  }
                                  aria-label={`Reenviar invitación a ${member.name}`}
                                  title={`Reenviar invitación a ${member.email}`}
                                  className="grid size-9 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary transition hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Send className="size-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditingUserId(member.id)}
                                aria-label={`Editar a ${member.name}`}
                                title={`Editar a ${member.name}`}
                                className="grid size-9 place-items-center rounded-lg border bg-background text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                              >
                                <Pencil className="size-4" />
                              </button>
                              {member.active ? (
                                <button
                                  type="button"
                                  disabled={
                                    pending || member.id === currentUserId
                                  }
                                  aria-label={`Eliminar acceso de ${member.name}`}
                                  title={
                                    member.id === currentUserId
                                      ? 'No puedes eliminar tu propia sesión'
                                      : 'Eliminar acceso conservando el historial'
                                  }
                                  onClick={() => removeAccess(member)}
                                  className="grid size-9 place-items-center rounded-lg border border-red-200 bg-background text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => restoreAccess(member)}
                                  aria-label={`Restaurar acceso de ${member.name}`}
                                  title={`Restaurar acceso de ${member.name}`}
                                  className="grid size-9 place-items-center rounded-lg border bg-background text-success transition hover:bg-success/10"
                                >
                                  <RotateCcw className="size-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {editingUser && (
                <>
                  <button
                    type="button"
                    aria-label="Cerrar modal de edición"
                    onClick={() => setEditingUserId(null)}
                    className="fixed inset-0 z-40 cursor-default bg-black/45 backdrop-blur-[2px]"
                  />
                  <dialog
                    open
                    aria-modal="true"
                    aria-labelledby="edit-user-title"
                    className="panel fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 shadow-2xl sm:p-7"
                  >
                    <form action={updateUser}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="panel-kicker">Modificar usuario</p>
                          <h2 id="edit-user-title" className="panel-title">
                            {editingUser.email}
                          </h2>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Para cambiar el correo, elimina este acceso y envía
                            una nueva invitación.
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Cerrar edición"
                          onClick={() => setEditingUserId(null)}
                          className="rounded-lg border p-2"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <label className="text-xs font-semibold">
                          Nombre
                          <input
                            required
                            minLength={2}
                            name="name"
                            defaultValue={editingUser.name}
                            autoFocus
                            className="input mt-2"
                          />
                        </label>
                        <label className="text-xs font-semibold">
                          Motivo del cambio
                          <input
                            required
                            minLength={3}
                            name="reason"
                            placeholder="Ej. Cambio de responsabilidades"
                            className="input mt-2"
                          />
                        </label>
                      </div>
                      <fieldset className="mt-5">
                        <legend className="text-xs font-semibold">Roles</legend>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {roleOptions.map(([code, name]) => (
                            <label
                              key={`${editingUser.id}-${code}`}
                              className="flex items-center gap-2 rounded-xl border bg-background p-3 text-xs"
                            >
                              <input
                                type="checkbox"
                                name={code}
                                defaultChecked={editingUser.roles.some(
                                  (role) => role.code === code,
                                )}
                              />{' '}
                              {name}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingUserId(null)}
                          className="rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold"
                        >
                          Cancelar
                        </button>
                        <button
                          disabled={pending}
                          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {pending ? 'Guardando…' : 'Guardar cambios'}
                        </button>
                      </div>
                    </form>
                  </dialog>
                </>
              )}
              {snapshot.invitations.length > 0 && (
                <div className="panel p-6">
                  <h2 className="font-heading text-xl font-semibold">
                    Invitaciones pendientes
                  </h2>
                  <div className="mt-4 space-y-3">
                    {snapshot.invitations.map((invitation) => {
                      const statusLabel = {
                        PENDING: 'Preparando',
                        SENT: 'Enviada',
                        FAILED: 'Error de envío',
                        ACCEPTED: 'Aceptada',
                      }[invitation.emailStatus];
                      const statusClass =
                        invitation.emailStatus === 'SENT'
                          ? 'status status-green'
                          : invitation.emailStatus === 'FAILED'
                            ? 'status bg-red-50 text-red-700'
                            : 'status status-amber';
                      return (
                        <div
                          key={invitation.id}
                          className="flex flex-col justify-between gap-4 rounded-xl border p-4 lg:flex-row lg:items-center"
                        >
                          <div className="min-w-0">
                            <b className="text-sm">{invitation.email}</b>
                            <p className="text-xs text-muted-foreground">
                              {invitation.roles
                                .map((role) => role.name)
                                .join(', ')}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Vence {bogotaDate(invitation.expiresAt)}
                              {invitation.sentAt
                                ? ` · Último envío ${bogotaDate(invitation.sentAt)}`
                                : ''}
                            </p>
                            {invitation.lastError && (
                              <p className="mt-2 text-xs text-red-700">
                                Gmail reportó un error. Revisa SMTP y vuelve a
                                intentar.
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className={statusClass}>
                              <span /> {statusLabel}
                            </span>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => resendInvitation(invitation)}
                              aria-label={`Reenviar invitación a ${invitation.email}`}
                              title="Reenviar invitación"
                              className="grid size-9 place-items-center rounded-lg border bg-background text-brand hover:bg-accent disabled:opacity-50"
                            >
                              <Send className="size-4" />
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => cancelInvitation(invitation)}
                              aria-label={`Cancelar invitación de ${invitation.email}`}
                              title="Cancelar invitación"
                              className="grid size-9 place-items-center rounded-lg border border-red-200 bg-background text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
          <section className="panel mt-5 overflow-hidden">
            <div className="panel-header">
              <div>
                <p className="panel-kicker">Últimos 100 eventos</p>
                <h2 className="panel-title">Bitácora inmutable</h2>
              </div>
              <History className="size-5 text-brand" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-4">Fecha</th>
                    <th className="p-4">Operación</th>
                    <th className="p-4">Entidad</th>
                    <th className="p-4">Responsable</th>
                    <th className="p-4">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.audit.map((event) => (
                    <tr key={event.id} className="border-b last:border-0">
                      <td className="p-4 text-xs">
                        {bogotaDate(event.occurredAt)}
                      </td>
                      <td className="p-4 font-semibold">{event.operation}</td>
                      <td className="p-4">
                        {event.entityType} · {event.entityId.slice(0, 8)}
                      </td>
                      <td className="p-4">
                        {event.actorName ?? event.actorEmail ?? 'Sistema'}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {event.reason ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {snapshot.audit.length === 0 && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  Aún no hay operaciones auditadas.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
