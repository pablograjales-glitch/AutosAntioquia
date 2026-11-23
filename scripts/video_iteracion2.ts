import assert from 'node:assert/strict';
import { expect, type Dialog, type Page } from '@playwright/test';
import type { PoolClient } from 'pg';

export async function probarIteracion2(
  page: Page,
  db: PoolClient,
  mostrarPaso: (titulo: string, pausa?: number) => Promise<void>,
): Promise<string[]> {
  const tituloCeldas = page.getByRole('heading', { name: 'Gestión de celdas' });
  const sesion = page.locator('#auth-user-info');
  await expect(sesion).toContainText('OPERADOR');
  await expect(tituloCeldas).toBeHidden();
  const tokenOperador = await page.evaluate(() => sessionStorage.getItem('autos-token'));
  assert.ok(tokenOperador);
  const headers = { Authorization: 'Bearer ' + tokenOperador };
  const rutaCeldas = new URL('/api/celdas', page.url()).href;
  assert.equal((await page.request.get(rutaCeldas, { headers })).status(), 403);
  await sesion.scrollIntoViewIfNeeded();
  await mostrarPaso('Iteración 2 · El operador usa portería; el servidor protege el catálogo');

  await page.locator('#btn-cerrar-sesion').click();
  await expect(page.locator('#login-screen')).toBeVisible();
  assert.equal((await page.request.get(rutaCeldas, { headers })).status(), 401);
  await mostrarPaso('La sesión del operador se cerró y el token dejó de ser válido', 1500);
  await page.locator('#login-usuario').fill('admin.demo');
  await page.locator('#login-password').fill('PruebaAcademica2026');
  await page.locator('#form-login button[type=submit]').click();
  await expect(sesion).toContainText('ADMINISTRADOR');
  await expect(tituloCeldas).toBeVisible();
  await mostrarPaso('El administrador inicia sesión y ve los módulos protegidos', 1800);

  await page.locator('#cuenta-usuario').fill('operador.video');
  await page.locator('#cuenta-nombre').fill('Operador de la demostración');
  await page.locator('#cuenta-password').fill('ClaveDeVideo2026');
  await page.locator('#cuenta-rol').selectOption('OPERADOR');
  await page.locator('#operador-cedula').fill('22345680');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  const cuenta = page.locator('#cuentas-body tr').filter({ hasText: 'operador.video' });
  await expect(cuenta).toContainText('22345680');
  const { rows: [persistida] } = await db.query(
    `SELECT c.rol, c.password_hash <> $2 AS protegida, o.cedula
     FROM cuenta_acceso c JOIN operador o USING (id_cuenta) WHERE c.nombre_usuario = $1`,
    ['operador.video', 'ClaveDeVideo2026'],
  );
  assert.deepEqual(persistida, { rol: 'OPERADOR', protegida: true, cedula: '22345680' });
  await cuenta.scrollIntoViewIfNeeded();
  await mostrarPaso('Cuenta de operador creada con su perfil y contraseña protegida');

  const { rows: [historial] } = await db.query(
    `SELECT c.numero_celda, c.id_celda FROM celda c JOIN registro_acceso r USING (id_celda)
     WHERE r.placa = $1 AND r.fecha_hora_salida IS NOT NULL`, ['DEF456'],
  );
  assert.ok(historial, 'La salida de DEF456 debe tener una celda en el historial');
  const buscarCelda = page.locator('#filtro-celdas');
  const fila = (codigo: string) => page.locator('#celdas-body tr').filter({
    has: page.getByRole('cell', { name: codigo, exact: true }),
  });
  await buscarCelda.fill(historial.numero_celda);
  const celdaConHistorial = fila(historial.numero_celda);
  await expect(celdaConHistorial).toContainText('DISPONIBLE');
  const rechazos: string[] = [];
  const confirmarYRegistrar = async (dialogo: Dialog) => {
    if (dialogo.type() === 'alert') rechazos.push(dialogo.message());
    await dialogo.accept();
  };
  const eliminarConHistorial = celdaConHistorial.getByRole('button', { name: 'Eliminar', exact: true });
  page.on('dialog', confirmarYRegistrar);
  try {
    const [rechazo] = await Promise.all([
      page.waitForResponse(res => res.request().method() === 'DELETE' && res.url().endsWith('/api/celdas/' + historial.id_celda)),
      eliminarConHistorial.click(),
    ]);
    assert.equal(rechazo.status(), 409);
    await expect.poll(() => rechazos.at(-1)).toMatch(/historial/i);
  } finally {
    page.off('dialog', confirmarYRegistrar);
  }
  assert.equal((await db.query('SELECT 1 FROM celda WHERE id_celda = $1', [historial.id_celda])).rowCount, 1);
  await mostrarPaso('El servidor rechaza eliminar una celda con historial de accesos');

  // El catálogo parte con su capacidad completa. Retirar una celda de moto sin uso deja un cupo.
  await buscarCelda.fill('M-10');
  page.once('dialog', dialogo => dialogo.accept());
  await fila('M-10').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(fila('M-10')).toHaveCount(0);
  const crear = page.getByRole('button', { name: 'Crear celda', exact: true });
  await page.locator('#celda-codigo').fill('M-VIDEO');
  await page.locator('#celda-tipo').selectOption('MOTO');
  await crear.click();
  await buscarCelda.fill('M-VIDEO');
  await expect(fila('M-VIDEO')).toContainText('DISPONIBLE');
  await mostrarPaso('El administrador reemplazó una celda sin uso por M-VIDEO', 1800);
  await fila('M-VIDEO').getByRole('button', { name: 'Mantenimiento', exact: true }).click();
  await expect(fila('M-VIDEO')).toContainText('MANTENIMIENTO');
  const { rows: [celda] } = await db.query(
    'SELECT tipo_vehiculo, estado FROM celda WHERE numero_celda = $1', ['M-VIDEO'],
  );
  assert.deepEqual(celda, { tipo_vehiculo: 'MOTO', estado: 'MANTENIMIENTO' });
  await mostrarPaso('M-VIDEO quedó en mantenimiento y el estado se guardó en PostgreSQL');

  return [
    'I2 · Permisos por rol HTTP 403, cierre de sesión HTTP 401 y cuenta de operador guardada.',
    'I2 · Borrado con historial rechazado, reemplazo de celda y mantenimiento persistido.',
  ];
}
