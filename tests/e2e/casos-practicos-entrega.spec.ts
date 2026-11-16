import { expect, Page, test } from '@playwright/test';
import { Role, Scenario, scenario, signIn, shot } from './support/practical-app';

const cliente = (cedula: string, nombre: string, activa: boolean) => ({
  cedula, nombre, mensualidad_activa: activa,
  fecha_vencimiento_mensualidad: '2026-12-15',
  vehiculos: [{ placa: 'ABC123', tipoVehiculo: 'CARRO' }]
});

async function iniciar(page: Page, rol: Role, options: Partial<Scenario> = {}) {
  const state = await scenario(page, rol, options);
  await signIn(page, rol, rol === 'ADMINISTRADOR' ? 'admin.demo' : 'operador.demo');
  return state;
}

test('P-01 El administrador consulta los contadores de ocupación', async ({ page }, info) => {
  await iniciar(page, 'ADMINISTRADOR');
  await expect(page.locator('#dashboard-error')).toBeHidden();
  await expect(page.locator('#carros-ocupados')).toHaveText('1');
  await expect(page.locator('#motos-ocupadas')).toHaveText('0');
  await expect(page.locator('#carros-disponibles')).toContainText('79');
  await shot(page, info, 'P-01-ocupacion-admin', '.resumen-grid');
});

test('P-02 El administrador registra una entrada cuando cubre portería', async ({ page }, info) => {
  await iniciar(page, 'ADMINISTRADOR');
  await page.locator('#placa-entrada').fill('ABC123');
  await page.locator('#form-entrada button[type="submit"]').click();
  await expect(page.locator('#modal-autorizado')).toBeVisible();
  await expect(page.locator('#modal-celda-ok')).toHaveText('C-01');
  await shot(page, info, 'P-02-admin-entrada', '#modal-autorizado');
});

test('P-03 El operador matricula un cliente y su vehículo', async ({ page }, info) => {
  await iniciar(page, 'OPERADOR');
  await page.locator('#cedula-usuario').fill('12345678');
  await page.locator('#nombre-usuario').fill('Cliente de prueba');
  await page.locator('#placa-registro').fill('DEF456');
  await page.locator('#form-registro button[type="submit"]').click();
  await expect(page.locator('#modal-mensualidad-exitosa')).toBeVisible();
  await shot(page, info, 'P-03-matricula-operador', '#modal-mensualidad-exitosa');
});

test('P-04 El operador registra la entrada y ve la celda asignada', async ({ page }, info) => {
  await iniciar(page, 'OPERADOR');
  await page.locator('#placa-entrada').fill('ABC123');
  await page.locator('#form-entrada button[type="submit"]').click();
  await expect(page.locator('#modal-autorizado')).toBeVisible();
  await expect(page.locator('#modal-celda-ok')).toHaveText('C-01');
  await shot(page, info, 'P-04-entrada-celda', '#modal-autorizado');
});

test('P-05 El operador registra la salida y confirma la liberación', async ({ page }, info) => {
  await iniciar(page, 'OPERADOR');
  await page.locator('#placa-salida').fill('ABC123');
  await page.locator('#form-salida button[type="submit"]').click();
  await expect(page.locator('#modal-salida-exitosa')).toBeVisible();
  await expect(page.locator('#modal-celda-salida')).toContainText('C-01');
  await shot(page, info, 'P-05-salida-liberacion', '#modal-salida-exitosa');
});

test('P-06 El administrador crea una cuenta de operador', async ({ page }, info) => {
  const state = await iniciar(page, 'ADMINISTRADOR');
  await page.locator('#cuenta-usuario').fill('operador.puerta');
  await page.locator('#cuenta-nombre').fill('Operador Puerta');
  await page.locator('#cuenta-password').fill('ClavePrueba123');
  await page.locator('#cuenta-rol').selectOption('OPERADOR');
  await page.locator('#operador-cedula').fill('1098765432');
  await page.locator('#form-cuenta-admin button[type="submit"]').click();
  await expect(page.locator('#cuentas-body')).toContainText('operador.puerta');
  await expect(page.locator('#cuentas-body')).toContainText('Operador');
  await shot(page, info, 'P-06-cuenta-operador', 'section:has(#form-cuenta-admin)');
});

test('P-07 El operador solo ve las opciones de su trabajo diario', async ({ page }, info) => {
  await iniciar(page, 'OPERADOR');
  await expect(page.locator('#form-registro')).toBeVisible();
  await expect(page.locator('#form-entrada')).toBeVisible();
  await expect(page.locator('#form-salida')).toBeVisible();
  await expect(page.locator('#form-cuenta-admin')).toBeHidden();
  await expect(page.locator('#form-celda-admin')).toBeHidden();
  await shot(page, info, 'P-07-vista-operador', '.card-panel');
});

test('P-08 El administrador crea una celda y la encuentra en el inventario', async ({ page }, info) => {
  await iniciar(page, 'ADMINISTRADOR');
  await page.locator('#celda-codigo').fill('C-88');
  await page.locator('#form-celda-admin button[type="submit"]').click();
  await expect(page.locator('#celdas-body')).toContainText('C-88');
  await shot(page, info, 'P-08-inventario-celdas', 'section:has(#form-celda-admin)');
});

test('P-09 El administrador renueva la mensualidad confirmando su contraseña', async ({ page }, info) => {
  await iniciar(page, 'ADMINISTRADOR', { clients: [cliente('11111111', 'Cliente inactivo', false)] });
  await page.getByRole('button', { name: 'Renovar 30 dias' }).click();
  await expect(page.locator('#dialogo-confirmar-renovacion')).toBeVisible();
  await page.locator('#password-confirmar-renovacion').fill('ClaveAdmin123');
  await expect(page.locator('#password-confirmar-renovacion')).toHaveValue('ClaveAdmin123');
  await shot(page, info, 'P-09-renovar-mensualidad', '#dialogo-confirmar-renovacion');
  await page.locator('#enviar-renovacion').click();
  await expect(page.locator('#dialogo-confirmar-renovacion')).toBeHidden();
});

test('P-10 El administrador desactiva la mensualidad confirmando su contraseña', async ({ page }, info) => {
  await iniciar(page, 'ADMINISTRADOR', { clients: [cliente('22222222', 'Cliente activo', true)] });
  const row = page.locator('#clientes-body tr').filter({ hasText: 'Cliente activo' });
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await expect(page.locator('#titulo-confirmar-renovacion')).toHaveText('Confirmar desactivación');
  await page.locator('#password-confirmar-renovacion').fill('ClaveAdmin123');
  await shot(page, info, 'P-10-desactivar-mensualidad', '#dialogo-confirmar-renovacion');
  await page.locator('#enviar-renovacion').click();
  await expect(page.locator('#dialogo-confirmar-renovacion')).toBeHidden();
});

test('P-11 El administrador distingue celdas disponibles y ocupadas', async ({ page }, info) => {
  await iniciar(page, 'ADMINISTRADOR', { cells: [
    { id_celda: 1, numero_celda: 'C-01', tipo_vehiculo: 'CARRO', estado: 'OCUPADA', placa_actual: 'ABC123' },
    { id_celda: 2, numero_celda: 'C-02', tipo_vehiculo: 'CARRO', estado: 'DISPONIBLE', placa_actual: null }
  ] });
  const cellsSection = page.locator('section').filter({ has: page.locator('#form-celda-admin') });
  await expect(cellsSection).toContainText('OCUPADA');
  await expect(cellsSection).toContainText('DISPONIBLE');
  await expect(cellsSection).toContainText('ABC123');
  await shot(page, info, 'P-11-estado-celdas', 'section:has(#form-celda-admin)');
});
