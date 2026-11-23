import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomInt, scryptSync } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ quiet: true });
const env = process.env;
const pool = new pg.Pool({
  host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD,
  database: env.DB_NAME, port: Number(env.DB_PORT),
});
const schema = 'prueba_i2_' + randomBytes(8).toString('hex');
const port = randomInt(33000, 45000);
const base = 'http://127.0.0.1:' + port;
const password = 'ClaveDePrueba2026';
const hashToken = token => createHash('sha256').update(token).digest('hex');

async function request(status, method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + '/api' + path, {
    method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, status, method + ' ' + path);
  return status === 204 ? undefined : response.json();
}

async function run(db) {
  const { rows: [version] } = await db.query('SHOW server_version');
  console.log('Express por HTTP y PostgreSQL ' + version.server_version);
  const login = (status, nombreUsuario, clave = password) =>
    request(status, 'POST', '/auth/login', null, { nombreUsuario, password: clave });
  await request(400, 'POST', '/auth/login', null, {});
  await login(401, 'admin.prueba', 'ClaveIncorrecta');
  assert.equal((await db.query('SELECT count(*)::int AS total FROM sesion_acceso')).rows[0].total, 0);
  const { token: admin } = await login(200, 'admin.prueba');
  const sesion = async token => (await db.query(
    'SELECT revocada_en, expira_en > now() AS vigente FROM sesion_acceso WHERE token_hash = $1', [hashToken(token)],
  )).rows[0];
  assert.deepEqual(await sesion(admin), { revocada_en: null, vigente: true });
  assert.equal((await request(200, 'GET', '/auth/me', admin)).rol, 'ADMINISTRADOR');
  const { token: temporal } = await login(200, 'admin.prueba');
  await request(204, 'POST', '/auth/logout', temporal);
  assert.ok((await sesion(temporal)).revocada_en);
  await request(401, 'GET', '/auth/me', temporal);
  const { token: vencido } = await login(200, 'admin.prueba');
  await db.query("UPDATE sesion_acceso SET creada_en = now() - interval '2 hours', expira_en = now() - interval '1 hour' WHERE token_hash = $1", [hashToken(vencido)]);
  await request(401, 'GET', '/auth/me', vencido);
  console.log('I2-B01 OK | login 400/401/200, sesión 204, revocación persistida y expiración 401');

  const operadorDatos = {
    nombreUsuario: 'operador.prueba', nombreCompleto: 'Operador de prueba',
    rol: 'OPERADOR', cedula: '12345679', password,
  };
  await request(422, 'POST', '/usuarios', admin, { ...operadorDatos, rol: 'OTRO' });
  const cuenta = await request(201, 'POST', '/usuarios', admin, operadorDatos);
  const otroAdmin = await request(201, 'POST', '/usuarios', admin, {
    ...operadorDatos, nombreUsuario: 'otro.admin', rol: 'ADMINISTRADOR',
  });
  assert.equal(otroAdmin.operador, null);
  await request(409, 'POST', '/usuarios', admin, operadorDatos);
  await request(409, 'POST', '/usuarios', admin, { ...operadorDatos, nombreUsuario: 'cedula.duplicada' });
  const { rows: [guardada] } = await db.query(
    'SELECT ca.password_hash, ca.password_salt, op.cedula FROM cuenta_acceso ca JOIN operador op USING(id_cuenta) WHERE ca.nombre_usuario = $1',
    [operadorDatos.nombreUsuario],
  );
  assert.equal(guardada.cedula, operadorDatos.cedula);
  assert.equal(guardada.password_hash, scryptSync(password, Buffer.from(guardada.password_salt, 'hex'), 64).toString('hex'));
  assert.equal((await db.query('SELECT count(*)::int AS total FROM cuenta_acceso')).rows[0].total, 3);
  const cuentas = await request(200, 'GET', '/usuarios?q=operador.prueba', admin);
  assert.equal(cuentas.length, 1);
  for (const datos of [cuenta, cuentas[0]]) {
    assert.ok(!('password_hash' in datos) && !('password_salt' in datos));
  }
  console.log('I2-B02 OK | altas, búsqueda, credenciales derivadas y duplicados sin escrituras parciales');

  const { token: operador } = await login(200, 'operador.prueba');
  for (const path of ['/usuarios', '/clientes', '/celdas']) {
    await request(401, 'GET', path);
    await request(403, 'GET', path, operador);
    await request(200, 'GET', path, admin);
  }
  await request(403, 'POST', '/celdas', operador, { numeroCelda: 'C-PRUEBA', tipoVehiculo: 'CARRO' });
  await request(200, 'GET', '/acceso/ocupacion', operador);
  console.log('I2-B03 OK | permisos 401/403 y acceso válido para ambos roles');

  const cliente = { cedula: '12345678', nombre: 'Cliente de prueba', placa: 'ABC123', tipoVehiculo: 'CARRO' };
  await request(201, 'POST', '/vehiculo', operador, cliente);
  const rutaCliente = '/clientes/' + cliente.cedula;
  await request(200, 'PUT', rutaCliente, admin, { nombre: 'Cliente actualizado' });
  const mensualidad = async () => (await db.query(
    'SELECT nombre, mensualidad_activa, fecha_vencimiento_mensualidad - CURRENT_DATE AS dias FROM usuario WHERE cedula = $1',
    [cliente.cedula],
  )).rows[0];
  const anterior = await mensualidad();
  assert.equal(anterior.nombre, 'Cliente actualizado');
  await request(403, 'PATCH', rutaCliente + '/mensualidad', admin, { activa: false, passwordAdministrador: 'Incorrecta' });
  assert.deepEqual(await mensualidad(), anterior);
  await request(200, 'PATCH', rutaCliente + '/mensualidad', admin, { activa: false, passwordAdministrador: password });
  assert.equal((await mensualidad()).mensualidad_activa, false);
  await db.query('UPDATE usuario SET mensualidad_activa = true, fecha_vencimiento_mensualidad = CURRENT_DATE - 1');
  await request(400, 'POST', '/acceso/entrada', operador, { placa: cliente.placa, tipoVehiculo: 'CARRO' });
  assert.equal((await db.query('SELECT count(*)::int AS total FROM registro_acceso')).rows[0].total, 0);
  await request(200, 'PATCH', rutaCliente + '/mensualidad', admin, { activa: true, passwordAdministrador: password });
  assert.equal((await mensualidad()).dias, 30);
  console.log('I2-B04 OK | matrícula, edición, contraseña de confirmación, vencimiento y renovación persistida');

  const celdas = await request(200, 'GET', '/celdas', admin);
  assert.equal(celdas.filter(c => c.tipo_vehiculo === 'CARRO').length, 80);
  assert.equal(celdas.filter(c => c.tipo_vehiculo === 'MOTO').length, 10);
  const carro = { numeroCelda: 'C-PRUEBA', tipoVehiculo: 'CARRO' };
  await request(422, 'POST', '/celdas', admin, { ...carro, numeroCelda: 'C/!' });
  await request(409, 'POST', '/celdas', admin, carro);
  for (const celda of celdas.filter(c => ['C-01', 'C-02'].includes(c.numero_celda))) {
    await request(204, 'DELETE', '/celdas/' + celda.id_celda, admin);
  }
  const creada = await request(201, 'POST', '/celdas', admin, carro);
  await request(409, 'POST', '/celdas', admin, carro);
  const rutaCelda = '/celdas/' + creada.id_celda;
  await request(200, 'PUT', rutaCelda, admin, { ...carro, numeroCelda: 'C-EDITADA' });
  assert.equal((await request(200, 'GET', rutaCelda, admin)).numero_celda, 'C-EDITADA');
  assert.equal((await request(200, 'GET', '/celdas?q=C-EDITADA&tipo=CARRO', admin)).length, 1);
  const celdaDb = async id => (await db.query('SELECT numero_celda, estado FROM celda WHERE id_celda = $1', [id])).rows[0];
  assert.equal((await celdaDb(creada.id_celda)).numero_celda, 'C-EDITADA');
  const borrar = await request(201, 'POST', '/celdas', admin, { ...carro, numeroCelda: 'C-BORRAR' });
  await request(204, 'DELETE', '/celdas/' + borrar.id_celda, admin);
  assert.equal(await celdaDb(borrar.id_celda), undefined);
  console.log('I2-B05 OK | inventario, capacidad, formato, duplicidad, búsqueda, edición y borrado físico');

  await request(200, 'PATCH', rutaCelda, admin, { estado: 'MANTENIMIENTO' });
  const disponibles = (await request(200, 'GET', '/celdas/disponibles?tipo=CARRO', operador)).map(c => c.id_celda);
  assert.ok(!disponibles.includes(creada.id_celda));
  assert.equal((await celdaDb(creada.id_celda)).estado, 'MANTENIMIENTO');
  assert.equal((await db.query("SELECT count(*)::int AS total FROM celda WHERE estado = 'OCUPADA'")).rows[0].total, 0);
  const entrada = placa => request(200, 'POST', '/acceso/entrada', operador, { placa, tipoVehiculo: 'CARRO' });
  await request(400, 'POST', '/acceso/entrada', operador, { placa: 'INVALIDA', tipoVehiculo: 'CARRO' });
  const resultados = await Promise.allSettled([entrada(cliente.placa), entrada(cliente.placa)]);
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1);
  const rechazo = resultados.find(r => r.status === 'rejected');
  assert.equal(rechazo.reason.actual, 400);
  const accesos = async () => (await db.query('SELECT * FROM registro_acceso WHERE placa = $1', [cliente.placa])).rows;
  const [acceso] = await accesos();
  assert.equal((await accesos()).length, 1);
  assert.equal(acceso.id_cuenta_entrada, cuenta.id_cuenta);
  assert.ok(disponibles.includes(acceso.id_celda));
  const ocupada = '/celdas/' + acceso.id_celda;
  const estadoAnterior = await celdaDb(acceso.id_celda);
  assert.equal(estadoAnterior.estado, 'OCUPADA');
  await request(409, 'PUT', ocupada, admin, carro);
  await request(409, 'DELETE', ocupada, admin);
  await request(500, 'PATCH', ocupada, admin, { estado: 'MANTENIMIENTO' });
  assert.deepEqual(await celdaDb(acceso.id_celda), estadoAnterior);
  assert.deepEqual(await accesos(), [acceso]);
  console.log('I2-B06 OK | mantenimiento, consulta sin reserva, placa inválida, concurrencia y protección de ocupación');

  // Provoca un fallo de PostgreSQL al liberar esta celda en el esquema temporal.
  await db.query(`ALTER TABLE celda ADD CONSTRAINT prueba_impedir_liberacion
    CHECK (id_celda <> ${Number(acceso.id_celda)} OR estado <> 'DISPONIBLE')`);
  await request(400, 'POST', '/acceso/salida', operador, { placa: cliente.placa });
  assert.deepEqual(await celdaDb(acceso.id_celda), estadoAnterior);
  assert.deepEqual(await accesos(), [acceso]);
  await db.query('ALTER TABLE celda DROP CONSTRAINT prueba_impedir_liberacion');
  await request(200, 'POST', '/acceso/salida', operador, { placa: cliente.placa });
  assert.equal((await celdaDb(acceso.id_celda)).estado, 'DISPONIBLE');
  const [cerrado] = await accesos();
  assert.ok(cerrado.fecha_hora_salida);
  assert.equal(cerrado.id_cuenta_salida, cuenta.id_cuenta);
  await request(409, 'DELETE', ocupada, admin);
  assert.equal((await celdaDb(acceso.id_celda)).estado, 'DISPONIBLE');
  assert.deepEqual(await accesos(), [cerrado]);
  console.log('I2-B07 OK | reversión ante fallo de liberación, salida, actor e historial protegidos');
}

let build, db, server;
let schemaCreated = false;
try {
  build = await mkdtemp(resolve('.prueba-i2-'));
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--outDir', build], { stdio: 'inherit' });
  db = await pool.connect();
  await db.query('CREATE SCHEMA ' + schema);
  schemaCreated = true;
  await db.query('SET search_path TO ' + schema);
  await db.query(await readFile('database/schema.sql', 'utf8'));
  const salt = randomBytes(16);
  await db.query(
    "INSERT INTO cuenta_acceso(nombre_usuario,nombre_completo,password_hash,password_salt,rol) VALUES ('admin.prueba','Admin de prueba',$1,$2,'ADMINISTRADOR')",
    [scryptSync(password, salt, 64).toString('hex'), salt.toString('hex')],
  );
  server = spawn(process.execPath, [resolve(build, 'app.js')], {
    env: { ...env, PORT: String(port), PGOPTIONS: '-c search_path=' + schema, PAGOS_MODO: 'demo' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let intento = 0; ; intento++) {
    if (server.exitCode !== null || intento === 50) throw new Error('Express no quedó disponible.');
    if ((await fetch(base + '/api/auth/me', { signal: AbortSignal.timeout(500) }).catch(() => null))?.status === 401) break;
    await delay(100);
  }
  await run(db);
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolveExit => server.once('exit', resolveExit));
    server.kill();
    await exited;
  }
  try {
    if (schemaCreated) await db.query('DROP SCHEMA ' + schema + ' CASCADE');
  } finally {
    db?.release();
    await pool.end();
    if (build) await rm(build, { recursive: true, force: true });
  }
}
