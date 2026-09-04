import { z } from 'zod';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import { validateInitialImport } from '@/modules/sistema/domain/initial-import-validation';

export const runtime = 'nodejs';
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await authorize(request.headers, 'users', 'admin');
    const form = await request.formData();
    const parsed = z.instanceof(File).safeParse(form.get('file'));
    if (!parsed.success)
      return Response.json({ error: 'FILE_REQUIRED' }, { status: 400 });
    if (parsed.data.size > MAX_SIZE)
      return Response.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    if (!parsed.data.name.toLowerCase().endsWith('.xlsx'))
      return Response.json({ error: 'INVALID_FILE_TYPE' }, { status: 415 });
    const result = await validateInitialImport(
      Buffer.from(await parsed.data.arrayBuffer()),
    );
    return Response.json({ data: result });
  } catch (error) {
    const access = accessErrorResponse(error);
    if (access) return access;
    console.error('No fue posible validar la carga inicial.', error);
    return Response.json({ error: 'INVALID_WORKBOOK' }, { status: 400 });
  }
}
