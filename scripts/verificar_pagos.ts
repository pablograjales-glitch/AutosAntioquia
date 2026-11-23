import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes, randomInt, scryptSync } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { pool } from '../src/config/db';

async function main() {
  const schema = 'prueba_pagos_' + randomBytes(6).toString('hex');
  const db = await pool.connect();
  const port = process.env.PAGOS_TEST_PORT || String(randomInt(33000, 45000));
  const base = 'http://127.0.0.1:' + port;
  const videoFinal = process.env.AUTOS_TEST_VIDEO_FINAL === '1';
  const evidence = process.env.PAGOS_TEST_EVIDENCE
    || (videoFinal ? 'test-results/video-iteraciones-1-a-3' : 'test-results/pagos-iteracion-3');
  const grabar = videoFinal || process.env.PAGOS_TEST_VIDEO === '1';
  let server: ReturnType<typeof spawn> | undefined;
  let browser;
  try {
    await db.query('CREATE SCHEMA ' + schema);
    await db.query('SET search_path TO ' + schema);
    await db.query(await readFile('database/schema.sql', 'utf8'));
    await db.query(await readFile('database/migrations/006_pagos.sql', 'utf8'));
    for (const [usuario, nombre, rol] of [
      ['admin.demo', 'Administradora de prueba', 'ADMINISTRADOR'],
      ['operador.demo', 'Operador de prueba', 'OPERADOR'],
    ]) {
      const salt = randomBytes(16);
      const hash = scryptSync('PruebaAcademica2026', salt, 64).toString('hex');
      const { rows: [cuenta] } = await db.query(
        'INSERT INTO cuenta_acceso (nombre_usuario, nombre_completo, password_hash, password_salt, rol) VALUES ($1,$2,$3,$4,$5) RETURNING id_cuenta',
        [usuario, nombre, hash, salt.toString('hex'), rol],
      );
      if (rol === 'OPERADOR') await db.query('INSERT INTO operador (id_cuenta,cedula,nombre) VALUES ($1,$2,$3)', [cuenta.id_cuenta, '12345679', nombre]);
    }
    await db.query("INSERT INTO usuario(cedula,nombre,mensualidad_activa,fecha_vencimiento_mensualidad) VALUES ('12345678','Cliente de prueba',false,CURRENT_DATE - 1)");
    const serverArgs = __filename.endsWith('.ts')
      ? ['--import', 'tsx', 'src/app.ts']
      : [resolve(__dirname, '../src/app.js')];
    server = spawn(process.execPath, serverArgs, {
      env: { ...process.env, PORT: port, PGOPTIONS: '-c search_path=' + schema, PAGOS_MODO: 'demo', PAGOS_MONTO_COP: '50000' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    for (let intento = 0; ; intento++) {
      if (server.exitCode !== null || intento === 50) throw new Error('Express no quedó disponible.');
      const respuesta = await fetch(base, { signal: AbortSignal.timeout(500) }).catch(() => null);
      if (respuesta?.ok) break;
      await delay(100);
    }
    browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {});
    const { rows: [version] } = await db.query('SHOW server_version');
    const resultados = ['Navegador: ' + browser.version() + ' | PostgreSQL: ' + version.server_version + ' | Modo demo'];
    await mkdir(evidence, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      recordVideo: grabar ? { dir: 'test-results/pagos-iteracion-3', size: { width: 1280, height: 900 } } : undefined,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    // El modo demo usa recursos locales. Evita que una fuente remota bloquee la carga.
    await page.route('**/*', route => new URL(route.request().url()).origin === base
      ? route.continue()
      : route.abort());
    await page.goto(base);
    const mostrarPaso = async (titulo: string, pausa = videoFinal ? 3600 : 2600) => {
      if (!grabar) return;
      await page.evaluate(texto => {
        const anterior = document.getElementById('paso-de-prueba');
        anterior?.remove();
        const aviso = document.createElement('div');
        aviso.id = 'paso-de-prueba';
        aviso.textContent = texto;
        aviso.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;background:#10213a;color:#fff;border:1px solid #688cb9;border-radius:8px;padding:12px 20px;font:600 17px Arial,sans-serif;box-shadow:0 2px 9px #0006';
        document.body.append(aviso);
      }, titulo);
      await delay(pausa);
    };
    let porteria: string[] = [];
    let administracion: string[] = [];
    if (videoFinal) {
      const { probarIteracion1 } = await import('./video_iteracion1');
      const { probarIteracion2 } = await import('./video_iteracion2');
      await mostrarPaso('Autos Antioquia · Pruebas de las iteraciones 1, 2 y 3', 3800);
      porteria = await probarIteracion1(page, db, mostrarPaso);
      administracion = await probarIteracion2(page, db, mostrarPaso);
      await mostrarPaso('Iteración 3 · Gestión de pagos de mensualidad en modo demo', 3400);
    } else {
      await mostrarPaso('Iteración 3 · Inicio de sesión como administradora');
      await page.locator('#login-usuario').fill('admin.demo');
      await page.locator('#login-password').fill('PruebaAcademica2026');
      await page.locator('#form-login button[type=submit]').click();
    }
    const clientes = page.locator('#clientes-body');
    await expect(clientes).toContainText('Cliente de prueba');
    const foto = (n: string) => page.screenshot({
      path: evidence + '/' + n + '.png', animations: 'disabled',
      style: '#paso-de-prueba { visibility: hidden !important; }',
    });
    const filaPagos = clientes.getByRole('row').filter({ hasText: '12345678' });
    await filaPagos.getByRole('button', { name: 'Pagos', exact: true }).click();
    const dialogo = page.getByRole('dialog', { name: 'Pagos de Cliente de prueba' });
    const crear = dialogo.getByRole('button', { name: 'Crear pago de prueba' });
    await expect(crear).toBeEnabled();
    await foto('01-inicio');
    await mostrarPaso('T01 · Abrir el historial de pagos del cliente');
    const verificarFecha = async (dias: number) => {
      const { rows } = await db.query('SELECT fecha_vencimiento_mensualidad - CURRENT_DATE AS dias, mensualidad_activa FROM usuario WHERE cedula = $1', ['12345678']);
      assert.equal(rows[0].dias, dias);
      assert.equal(rows[0].mensualidad_activa, dias > 0);
    };
    const historial = async () => (await db.query(
      'SELECT referencia, estado, monto, moneda, aplicado_en FROM pago_mensualidad ORDER BY creado_en',
    )).rows;

    await crear.click();
    await expect(dialogo.getByRole('list')).toContainText('PENDIENTE');
    await verificarFecha(-1);
    const [pendiente] = await historial();
    assert.equal(pendiente.estado, 'PENDIENTE');
    assert.equal(pendiente.monto, 50000);
    assert.equal(pendiente.moneda, 'COP');
    resultados.push('T01 OK | PENDIENTE · 50000 COP · vencimiento en -1 día.');
    await foto('02-pendiente');
    await mostrarPaso('T01 aprobado · Pago pendiente de $50.000 COP');

    await dialogo.getByRole('button', { name: 'Simular rechazo' }).click();
    await expect(dialogo.getByRole('list')).toContainText('RECHAZADO');
    await verificarFecha(-1);
    assert.deepEqual(await historial(), [{ ...pendiente, estado: 'RECHAZADO' }]);
    resultados.push('T02 OK | RECHAZADO · vencimiento en -1 día.');
    await foto('03-rechazado');
    await mostrarPaso('T02 aprobado · Pago rechazado, vencimiento conservado');

    await crear.click();
    await dialogo.getByRole('button', { name: 'Simular aprobación' }).click();
    await expect(dialogo.getByRole('list')).toContainText('APROBADO');
    await verificarFecha(30);
    resultados.push('T03 OK | APROBADO · mensualidad activa · vencimiento en 30 días.');
    await foto('04-aprobado');
    await mostrarPaso('T03 aprobado · Mensualidad activa por 30 días');
    await mostrarPaso('T04 y T05 · Verificación de concurrencia y permisos por API', 1500);

    const pagos = await historial();
    const aprobados = pagos.filter(pago => pago.estado === 'APROBADO');
    assert.equal(aprobados.length, 1);
    assert.ok(aprobados[0].aplicado_en);
    const url = base + '/api/pagos/' + aprobados[0].referencia + '/demo';
    const token = await page.evaluate(() => sessionStorage.getItem('autos-token'));
    const login = async (nombreUsuario: string) => {
      const respuesta = await fetch(base + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreUsuario, password: 'PruebaAcademica2026' }),
      });
      assert.equal(respuesta.status, 200);
      return (await respuesta.json()).token as string;
    };
    const admin = token || await login('admin.demo');
    const confirmacion = (sesion: string) => fetch(url, {
      method: 'POST', headers: { Authorization: 'Bearer ' + sesion, 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'APROBADO' }),
    });
    const respuestas = await Promise.all([confirmacion(admin), confirmacion(admin)]);
    assert.deepEqual(respuestas.map(res => res.status), [200, 200]);
    await verificarFecha(30);
    assert.deepEqual(await historial(), pagos);
    resultados.push('T04 OK | Reenvíos simultáneos HTTP 200/200 · una aprobación · misma fecha de aplicación y vencimiento.');
    assert.equal((await confirmacion(await login('operador.demo'))).status, 403);
    assert.equal((await fetch(base + '/api/pagos/cliente/12345678')).status, 401);
    assert.deepEqual(await historial(), pagos);
    await verificarFecha(30);
    resultados.push('T05 OK | Consulta anónima HTTP 401 · operador HTTP 403 · historial y vencimiento conservados.');
    const reporte = [resultados[0], ...porteria, ...administracion, ...resultados.slice(1)].join('\n') + '\n';
    await writeFile(resolve(evidence, 'resultados.txt'), reporte, 'utf8');
    if (grabar) {
      const titulo = videoFinal ? 'Resultados de las tres iteraciones' : '5 de 5 pruebas locales aprobadas';
      const grupos: Array<[string, string[]]> = videoFinal ? [
        ['Iteración 1 · Portería', porteria],
        ['Iteración 2 · Sesiones y administración', administracion],
        ['Iteración 3 · Pagos', resultados.slice(1)],
      ] : [['Iteración 3 · Pagos', resultados.slice(1)]];
      await page.setContent(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Resultados de Playwright</title>
        <body style="margin:0;background:#101c2f;color:#f2f6fc;font:17px Arial,sans-serif">
          <main style="max-width:1090px;margin:45px auto">
            <p style="color:#9abfe9">Autos Antioquia · Playwright, Express y PostgreSQL</p>
            <h1 style="margin:12px 0 24px;font-size:38px">${titulo}</h1>
            <div id="resultado"></div>
            <p style="margin-top:24px;color:#aac3de">Pagos en modo demo · Checkout y confirmación en sandbox de ePayco pendientes.</p>
          </main>
        </body></html>`);
      await page.locator('#resultado').evaluate((resultado, secciones) => {
        for (const [nombre, casos] of secciones) {
          const encabezado = document.createElement('h2');
          encabezado.style.cssText = 'margin:17px 0 6px;font-size:22px;color:#9abfe9';
          encabezado.textContent = nombre;
          const lista = document.createElement('ul');
          lista.style.cssText = 'margin:0;padding-left:23px;line-height:1.5';
          for (const caso of casos) {
            const item = document.createElement('li');
            item.textContent = caso;
            lista.append(item);
          }
          resultado.append(encabezado, lista);
        }
      }, grupos);
      await delay(videoFinal ? 12500 : 9000);
    }
    await context.close();
    const video = page.video();
    if (video) {
      await video.saveAs(resolve(evidence, videoFinal ? 'Recorrido-Iteraciones-1-a-3.webm' : 'Recorrido-Playwright.webm'));
      await unlink(await video.path());
    }
    console.log(reporte.trim());
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server?.kill();
    try {
      await db.query('RESET search_path');
      await db.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
    } finally {
      db.release();
      await pool.end();
      await browser?.close();
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
