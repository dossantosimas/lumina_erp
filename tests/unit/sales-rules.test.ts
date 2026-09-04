import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertDeliverable,
  assertPaymentAmount,
  assertReservable,
} from '../../modules/ventas/domain/sales-rules.ts';

void test('RN-VEN-01 reserva únicamente stock disponible', () => {
  assert.doesNotThrow(() => assertReservable(10, 3, 7));
  assert.throws(() => assertReservable(10, 3, 8), /insuficiente/);
});
void test('RN-VEN-02 exige reserva completa para entregar', () => {
  assert.doesNotThrow(() => assertDeliverable('APPROVED', 5, 5));
  assert.throws(() => assertDeliverable('APPROVED', 4, 5), /reserva completa/);
});
void test('RN-FIN-01 impide pagar por encima del saldo', () => {
  assert.doesNotThrow(() => assertPaymentAmount(100, 30, 70));
  assert.throws(() => assertPaymentAmount(100, 30, 71), /supera/);
});
