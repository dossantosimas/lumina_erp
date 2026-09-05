import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INVITATION_TTL_SECONDS,
  invitationIsActionable,
  sanitizeEmailFailure,
} from '../../modules/sistema/domain/invitation-rules.ts';

void test('RN-USR-INV-01 el enlace de invitación dura exactamente 72 horas', () => {
  assert.equal(INVITATION_TTL_SECONDS, 72 * 60 * 60);
});

void test('RN-USR-INV-02 solo permite actuar sobre invitaciones vigentes', () => {
  const now = new Date('2026-09-05T12:00:00Z');
  assert.equal(
    invitationIsActionable(
      {
        acceptedAt: null,
        cancelledAt: null,
        expiresAt: new Date('2026-09-06T12:00:00Z'),
      },
      now,
    ),
    true,
  );
  assert.equal(
    invitationIsActionable(
      {
        acceptedAt: new Date('2026-09-05T11:00:00Z'),
        cancelledAt: null,
        expiresAt: new Date('2026-09-06T12:00:00Z'),
      },
      now,
    ),
    false,
  );
});

void test('RN-USR-INV-03 sanitiza errores SMTP antes de persistirlos', () => {
  const sanitized = sanitizeEmailFailure(
    new Error(`fallo\n${'x'.repeat(400)}`),
  );
  assert.equal(sanitized.includes('\n'), false);
  assert.equal(sanitized.length, 300);
});
