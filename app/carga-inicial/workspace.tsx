'use client';

import { useState } from 'react';
import { Download, FileCheck2, Upload } from 'lucide-react';

type Result = {
  valid: boolean;
  summary: { sheet: string; rows: number; complete: number; pending: number }[];
  errors: { sheet: string; row?: number; message: string }[];
};

export function InitialLoadWorkspace() {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function validate(formData: FormData) {
    setPending(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch('/api/v1/imports/initial/validate', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? 'No fue posible validar el archivo.');
      setResult(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error inesperado.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="min-h-screen bg-[var(--canvas)] p-4 sm:p-8 lg:p-10">
      <div className="mx-auto max-w-6xl">
        <p className="mt-7 text-xs font-bold uppercase tracking-[.18em] text-brand">
          Puesta en marcha
        </p>
        <h1 className="mt-2 font-heading text-4xl font-semibold">
          Carga inicial
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Valida catálogo, BOM, conteo físico y saldos antes de escribir en
          PostgreSQL. Los registros pendientes bloquean la importación.
        </p>
        <div className="mt-7 grid gap-5 lg:grid-cols-[390px_1fr]">
          <section className="panel h-fit p-6">
            <Upload className="size-6 text-brand" />
            <h2 className="mt-4 font-heading text-xl font-semibold">
              Validar plantilla
            </h2>
            <a
              href="/plantillas/LUMINA_OS_Plantillas_Importacion.xlsx"
              download
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary"
            >
              <Download className="size-4" /> Descargar plantilla aprobada
            </a>
            <form action={validate} className="mt-6">
              <input
                required
                name="file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-muted file:px-3 file:py-2"
              />
              <button
                disabled={pending}
                className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? 'Validando…' : 'Validar archivo'}
              </button>
            </form>
            {error && (
              <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
          </section>
          <section className="min-w-0 space-y-5">
            {!result ? (
              <div className="panel grid min-h-72 place-items-center p-8 text-center">
                <div>
                  <FileCheck2 className="mx-auto size-8 text-brand" />
                  <h2 className="mt-4 font-heading text-xl font-semibold">
                    Sin archivo validado
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    La validación no modifica la base de datos.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`rounded-2xl border p-5 ${result.valid ? 'bg-success/10 text-success' : 'bg-[#f7ead8] text-[#8d5d27]'}`}
                >
                  <b>
                    {result.valid
                      ? 'Plantilla lista para aprobación'
                      : `${result.errors.length} bloqueos encontrados`}
                  </b>
                  <p className="mt-1 text-sm">
                    {result.valid
                      ? 'Los datos son coherentes. La confirmación de importación se habilitará en el paso de corte.'
                      : 'Corrige los pendientes y vuelve a validar; no se escribió ningún dato.'}
                  </p>
                </div>
                <div className="panel overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-left text-sm">
                      <thead className="border-b bg-muted/40 text-xs">
                        <tr>
                          <th className="p-4">Hoja</th>
                          <th className="p-4">Filas</th>
                          <th className="p-4">Completas</th>
                          <th className="p-4">Pendientes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.summary.map((item) => (
                          <tr
                            key={item.sheet}
                            className="border-b last:border-0"
                          >
                            <td className="p-4 font-semibold">{item.sheet}</td>
                            <td className="p-4">{item.rows}</td>
                            <td className="p-4">{item.complete}</td>
                            <td className="p-4">{item.pending}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {result.errors.length > 0 && (
                  <div className="panel p-5">
                    <h2 className="font-heading text-xl font-semibold">
                      Correcciones requeridas
                    </h2>
                    <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto text-sm">
                      {result.errors.slice(0, 100).map((item, index) => (
                        <li
                          key={`${item.sheet}-${item.row}-${index}`}
                          className="rounded-xl border p-3"
                        >
                          <b>
                            {item.sheet}
                            {item.row ? ` · fila ${item.row}` : ''}
                          </b>
                          <p className="text-muted-foreground">
                            {item.message}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
