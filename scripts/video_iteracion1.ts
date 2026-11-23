import assert from 'node:assert/strict';
import { expect, type Page } from '@playwright/test';
import type { PoolClient } from 'pg';

export async function probarIteracion1(
  page: Page,
  db: PoolClient,
  mostrarPaso: (title: string, pause?: number) => Promise<void>,
): Promise<string[]> {
  const cedula = '22345678';
  const placa = 'DEF456';
  const nombre = 'Cliente de portería';
  const usuario = 'operador.demo';

  await expect(page.locator('#login-screen')).toBeVisible();
  await mostrarPaso('Iteración 1 · Matrícula, entrada y salida del parqueadero', 2200);
  await page.locator('#login-usuario').fill(usuario);
  await page.locator('#login-password').fill('PruebaAcademica2026');
  await page.locator('#form-login button[type="submit"]').click();
  await expect(page.locator('#auth-user-info')).toContainText('OPERADOR');
  await expect(page.locator('#carros-ocupados')).toHaveText('0');

  await page.locator('#cedula-usuario').fill(cedula);
  await page.locator('#nombre-usuario').fill(nombre);
  await page.locator('#placa-registro').fill(placa);
  await mostrarPaso('I1 · El operador matricula al cliente y el vehículo', 1500);
  await page.locator('#form-registro button[type="submit"]').click();
  await expect(page.locator('#modal-mensualidad-exitosa')).toBeVisible();
  await expect(page.locator('#modal-placa-mat')).toHaveText(placa);
  await expect(page.locator('#modal-cliente-mat')).toHaveText(nombre);
  const matricula = await db.query(`
    SELECT u.nombre, u.mensualidad_activa,
           u.fecha_vencimiento_mensualidad >= CURRENT_DATE AS vigente,
           v.tipo_vehiculo, ca.nombre_usuario
    FROM usuario u
    JOIN vehiculo v ON v.id_usuario = u.id_usuario
    JOIN cuenta_acceso ca ON ca.id_cuenta = v.matriculado_por_cuenta
    WHERE u.cedula = $1 AND v.placa = $2
  `, [cedula, placa]);
  assert.deepEqual(matricula.rows, [{
    nombre, mensualidad_activa: true, vigente: true, tipo_vehiculo: 'CARRO', nombre_usuario: usuario,
  }]);
  await mostrarPaso('I1 · Matrícula confirmada y mensualidad vigente en PostgreSQL');
  await page.locator('#btn-cerrar-modal-mat').click();

  await page.locator('#placa-entrada').fill(placa);
  await mostrarPaso('I1 · Registrar la entrada del vehículo', 1400);
  await page.locator('#form-entrada button[type="submit"]').click();
  await expect(page.locator('#modal-autorizado')).toBeVisible();
  await expect(page.locator('#modal-placa-ok')).toHaveText(placa);
  const consultarAcceso = () => db.query(`
    SELECT ra.id_registro, ra.fecha_hora_salida, c.numero_celda, c.estado,
           entrada.nombre_usuario AS cuenta_entrada, salida.nombre_usuario AS cuenta_salida
    FROM registro_acceso ra
    JOIN celda c ON c.id_celda = ra.id_celda
    JOIN cuenta_acceso entrada ON entrada.id_cuenta = ra.id_cuenta_entrada
    LEFT JOIN cuenta_acceso salida ON salida.id_cuenta = ra.id_cuenta_salida
    WHERE ra.placa = $1
  `, [placa]);
  const ingreso = await consultarAcceso();
  assert.equal(ingreso.rowCount, 1);
  const acceso = ingreso.rows[0];
  assert.equal(acceso.estado, 'OCUPADA');
  assert.equal(acceso.fecha_hora_salida, null);
  assert.equal(acceso.cuenta_entrada, usuario);
  await expect(page.locator('#modal-celda-ok')).toHaveText(acceso.numero_celda);
  await mostrarPaso(`I1 · Entrada autorizada y celda ${acceso.numero_celda} ocupada`);
  await page.locator('#btn-cerrar-modal-ok').click();
  await expect(page.locator('#carros-ocupados')).toHaveText('1');
  await expect(page.locator('#tabla-body')).toContainText(placa);

  await page.locator('#placa-entrada').fill(placa);
  await page.locator('#form-entrada button[type="submit"]').click();
  await expect(page.locator('#modal-denegado')).toBeVisible();
  await expect(page.locator('#modal-causa-error')).toContainText('ya se encuentra dentro');
  assert.deepEqual((await consultarAcceso()).rows, ingreso.rows);
  await mostrarPaso('I1 · El servidor rechaza el ingreso duplicado sin registrar otro acceso');
  await page.locator('#btn-cerrar-modal-error').click();

  await page.locator('#placa-salida').fill(placa);
  await page.locator('#form-salida button[type="submit"]').click();
  await expect(page.locator('#modal-salida-exitosa')).toBeVisible();
  await expect(page.locator('#modal-celda-salida')).toHaveText(acceso.numero_celda);
  const salida = await consultarAcceso();
  assert.equal(salida.rowCount, 1);
  assert.equal(salida.rows[0].id_registro, acceso.id_registro);
  assert.ok(salida.rows[0].fecha_hora_salida);
  assert.equal(salida.rows[0].estado, 'DISPONIBLE');
  assert.equal(salida.rows[0].cuenta_salida, usuario);
  await mostrarPaso(`I1 · Salida confirmada, celda ${acceso.numero_celda} liberada e historial conservado`);
  await page.locator('#btn-cerrar-modal-salida').click();
  await expect(page.locator('#carros-ocupados')).toHaveText('0');
  await expect(page.locator('#tabla-body')).not.toContainText(placa);

  return [
    'I1 OK | Matrícula vigente, entrada con celda ocupada, duplicado rechazado y salida con celda liberada e historial persistido.',
  ];
}
