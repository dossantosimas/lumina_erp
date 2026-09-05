import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverEmail, type SendMail } from '../../lib/email.ts';

const message = {
  to: 'destino@example.com',
  subject: 'Invitación de prueba',
  html: '<p>Prueba</p>',
  text: 'Prueba',
};

void test('SMTP simulado registra aceptados sin enviar correo real', async () => {
  let captured: Parameters<SendMail>[0] | undefined;
  const result = await deliverEmail(
    message,
    { from: 'LÚMINA <lumina@example.com>', user: 'lumina@example.com' },
    async (mail) => {
      captured = mail;
      return {
        messageId: 'smtp-test-1',
        accepted: ['destino@example.com'],
        rejected: [],
      };
    },
  );

  assert.equal(captured?.replyTo, 'lumina@example.com');
  assert.equal(result.messageId, 'smtp-test-1');
  assert.deepEqual(result.accepted, ['destino@example.com']);
  assert.deepEqual(result.rejected, []);
});

void test('SMTP simulado propaga el rechazo de Gmail', async () => {
  await assert.rejects(
    deliverEmail(
      message,
      { from: 'LÚMINA <lumina@example.com>', user: 'lumina@example.com' },
      async () => {
        throw new Error('EAUTH: credenciales rechazadas');
      },
    ),
    /EAUTH/,
  );
});
