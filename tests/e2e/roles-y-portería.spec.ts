import { expect, test } from '@playwright/test';
import { iniciarSesion, mockApi } from './support/mock-api';

test('administrador puede cubrir portería con su cuenta y además gestionar', async ({ page }, testInfo) => {
  const state = await mockApi(page, 'ADMINISTRADOR');
  await iniciarSesion(page, 'admin-prueba');

  await expect(page.locator('#form-registro')).toBeVisible();
  await expect(page.locator('#form-entrada')).toBeVisible();
  await expect(page.locator('#form-salida')).toBeVisible();
  await expect(page.locator('#form-cuenta-admin')).toBeVisible();
  await expect(page.locator('#form-celda-admin')).toBeVisible();
  expect(state.consultasOcupacion).toBeGreaterThan(0);
  await page.locator('#form-entrada').screenshot({ path: testInfo.outputPath('admin-porteria-entrada.png') });
  await page.locator('#placa-entrada').fill('ABC123');
  await page.locator('#form-entrada button[type="submit"]').click();
  await expect(page.locator('#modal-autorizado')).toBeVisible();
  await expect(page.locator('#modal-celda-ok')).toHaveText('C-24');
  await page.locator('#btn-cerrar-modal-ok').click();
  await page.locator('#placa-salida').fill('ABC123');
  await page.locator('#form-salida button[type="submit"]').click();
  await expect(page.locator('#modal-salida-exitosa')).toBeVisible();
  expect(state.actoresOperativos).toEqual([
    { operacion: 'entrada', token: 'Bearer mock-ADMINISTRADOR-token-1234567890123456789012345678901234567890' },
    { operacion: 'salida', token: 'Bearer mock-ADMINISTRADOR-token-1234567890123456789012345678901234567890' }
  ]);
  await page.locator('#form-celda-admin').screenshot({ path: testInfo.outputPath('admin-gestion-celdas.png') });
});

test('operador matricula, registra entrada/salida y no administra cuentas ni celdas', async ({ page }, testInfo) => {
  const state = await mockApi(page, 'OPERADOR');
  await iniciarSesion(page, 'operador-prueba');

  await expect(page.locator('#form-registro')).toBeVisible();
  await expect(page.locator('#form-entrada')).toBeVisible();
  await expect(page.locator('#form-salida')).toBeVisible();
  await expect(page.locator('#form-cuenta-admin')).toBeHidden();
  await expect(page.locator('#form-celda-admin')).toBeHidden();
  await page.locator('.card-panel').screenshot({ path: testInfo.outputPath('operador-formularios.png') });

  await page.locator('#cedula-usuario').fill('12345678');
  await page.locator('#nombre-usuario').fill('Cliente de prueba');
  await page.locator('#placa-registro').fill('DEF456');
  await page.locator('#form-registro button[type="submit"]').click();
  await expect(page.locator('#modal-mensualidad-exitosa')).toBeVisible();
  expect(state.matricula).toMatchObject({ cedula: '12345678', placa: 'DEF456', tipoVehiculo: 'CARRO' });
  await page.locator('#modal-mensualidad-exitosa').screenshot({ path: testInfo.outputPath('operador-matricula-confirmada.png') });
  await page.locator('#btn-cerrar-modal-mat').click();

  await page.locator('#placa-entrada').fill('ABC123');
  await page.locator('#form-entrada button[type="submit"]').click();
  await expect(page.locator('#modal-autorizado')).toBeVisible();
  await expect(page.locator('#modal-celda-ok')).toHaveText('C-24');
  expect(state.entrada).toMatchObject({ placa: 'ABC123', tipoVehiculo: 'CARRO' });
  await page.locator('#modal-autorizado').screenshot({ path: testInfo.outputPath('operador-entrada-celda-asignada.png') });
  await page.locator('#btn-cerrar-modal-ok').click();

  await page.locator('#placa-salida').fill('ABC123');
  await page.locator('#form-salida button[type="submit"]').click();
  await expect(page.locator('#modal-salida-exitosa')).toBeVisible();
  expect(state.salida).toEqual({ placa: 'ABC123' });
  expect(state.actoresOperativos.map(actor => actor.token)).toEqual(Array(3).fill('Bearer mock-OPERADOR-token-1234567890123456789012345678901234567890'));
  await page.locator('#modal-salida-exitosa').screenshot({ path: testInfo.outputPath('operador-salida-celda-liberada.png') });
});

test('renovar y desactivar solicitan y envían clave de administrador', async ({ page }, testInfo) => {
  const state = await mockApi(page, 'ADMINISTRADOR', { clientes: [
    { cedula: '11111111', nombre: 'Cliente inactivo', mensualidad_activa: false, fecha_vencimiento_mensualidad: '2026-11-15', vehiculos: [] },
    { cedula: '22222222', nombre: 'Cliente activo', mensualidad_activa: true, fecha_vencimiento_mensualidad: '2026-12-15', vehiculos: [] }
  ] });
  await iniciarSesion(page, 'admin-prueba');

  await page.getByRole('button', { name: 'Renovar 30 dias' }).click();
  await expect(page.locator('#dialogo-confirmar-renovacion')).toBeVisible();
  await expect(page.locator('#password-confirmar-renovacion')).toBeVisible();
  await page.locator('#dialogo-confirmar-renovacion').screenshot({ path: testInfo.outputPath('admin-confirmar-renovacion.png') });
  await page.locator('#password-confirmar-renovacion').fill('ClaveAdminSegura123');
  await page.locator('#enviar-renovacion').click();
  await expect(page.locator('#dialogo-confirmar-renovacion')).toBeHidden();
  expect(state.cambiosMensualidad[0]).toEqual({ activa: true, passwordAdministrador: 'ClaveAdminSegura123' });

  const clienteActivo = page.locator('#clientes-body tr').filter({ hasText: 'Cliente activo' });
  await clienteActivo.getByRole('button', { name: 'Desactivar' }).click();
  await expect(page.locator('#dialogo-confirmar-renovacion')).toBeVisible();
  await expect(page.locator('#titulo-confirmar-renovacion')).toHaveText('Confirmar desactivación');
  await page.locator('#dialogo-confirmar-renovacion').screenshot({ path: testInfo.outputPath('admin-confirmar-desactivacion.png') });
  await page.locator('#password-confirmar-renovacion').fill('ClaveAdminSegura123');
  await page.locator('#enviar-renovacion').click();
  await expect(page.locator('#dialogo-confirmar-renovacion')).toBeHidden();
  expect(state.cambiosMensualidad[1]).toEqual({ activa: false, passwordAdministrador: 'ClaveAdminSegura123' });
});

test('si falla la consulta de ocupación del operador, muestra error y pasos sugeridos', async ({ page }, testInfo) => {
  await mockApi(page, 'OPERADOR', { ocupacionStatus: 403 });
  await iniciarSesion(page, 'operador-prueba');
  await expect(page.locator('#dashboard-error')).toBeVisible();
  await expect(page.locator('#dashboard-error')).toContainText('Reinicia el servidor');
  await expect(page.locator('#carros-ocupados')).toHaveText('—');
  await page.locator('.resumen-grid').screenshot({ path: testInfo.outputPath('diagnostico-ocupacion.png') });
});
