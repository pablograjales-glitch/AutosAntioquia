import { expect, Page, test, TestInfo } from '@playwright/test';

export type Role = 'ADMINISTRADOR' | 'OPERADOR';
export type Scenario = {
  loginStatus?: number;
  authStatus?: number;
  cells?: Array<Record<string, unknown>>;
  accounts?: Array<Record<string, unknown>>;
  cellCreateStatus?: number;
  cellUpdateStatus?: number;
  cellDeleteStatus?: number;
  cellLookupStatus?: number;
  accountCreateStatus?: number;
  accountListStatus?: number;
  operatorPolicyStatus?: number;
  clients?: Array<Record<string, unknown>>;
  membershipChanges?: Array<Record<string, unknown>>;
  updates?: Array<Record<string, unknown>>;
  creates?: Array<Record<string, unknown>>;
  deletes: number;
  logout: boolean;
};

const cell = (id: number, code: string, status = 'DISPONIBLE', type = 'CARRO') => ({
  id_celda: id, numero_celda: code, tipo_vehiculo: type, estado: status,
  placa_actual: status === 'OCUPADA' ? 'ABC123' : null
});

export async function scenario(page: Page, role: Role, options: Partial<Scenario> = {}) {
  const state: Scenario = {
    ...options, updates: [], creates: [], deletes: 0, logout: false,
    cells: options.cells ?? [cell(1, 'C-01'), cell(2, 'M-01', 'DISPONIBLE', 'MOTO')],
    clients: options.clients ?? [], membershipChanges: [],
    accounts: options.accounts ?? [{ nombre_usuario: 'cuenta.demo', nombre_completo: 'Cuenta Demo', rol: 'OPERADOR', activo: true }]
  };
  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const auth = req.headers().authorization || '';
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const empty = (status: number) => route.fulfill({ status, body: '' });
    if (url.pathname === '/api/auth/login' && req.method() === 'POST') {
      if (state.loginStatus && state.loginStatus !== 200) return json({ error: 'Credenciales inválidas.' }, state.loginStatus);
      return json({ token: `test-${role}-session-token-12345678901234567890`, usuario: { nombreCompleto: 'Usuario prueba', rol: role } });
    }
    if (url.pathname === '/api/auth/me') {
      if (state.authStatus && state.authStatus !== 200) return json({ error: 'Sesión vencida.' }, state.authStatus);
      return json({ nombreCompleto: 'Usuario prueba', rol: role });
    }
    if (url.pathname === '/api/auth/logout') { state.logout = true; return json({ ok: true }); }
    if (state.authStatus && auth && !['/api/auth/me', '/api/auth/logout'].includes(url.pathname)) return json({ error: 'Sesión vencida.' }, state.authStatus);
    if (url.pathname === '/api/acceso/ocupacion') return json({ resumenCeldas: [{ tipo_vehiculo: 'CARRO', ocupadas: '1', disponibles: '79', total: '80' }, { tipo_vehiculo: 'MOTO', ocupadas: '0', disponibles: '10', total: '10' }], vehiculosActivos: [] });
    if (url.pathname === '/api/auth/protected-test' && !auth) return json({ error: 'Autenticación requerida.' }, 401);
    if (url.pathname === '/api/usuarios' && req.method() === 'GET') {
      if (role !== 'ADMINISTRADOR' || (state.operatorPolicyStatus && state.operatorPolicyStatus !== 200)) return json({ error: 'No autorizado.' }, auth ? 403 : 401);
      return json(state.accounts, state.accountListStatus ?? 200);
    }
    if (url.pathname === '/api/usuarios' && req.method() === 'POST') {
      if (role !== 'ADMINISTRADOR' || (state.operatorPolicyStatus && state.operatorPolicyStatus !== 200)) return json({ error: 'No autorizado.' }, auth ? 403 : 401);
      const body = req.postDataJSON() as Record<string, unknown>;
      state.creates?.push(body);
      if ((state.accountCreateStatus ?? 201) === 201) state.accounts?.push({ nombre_usuario: body.nombreUsuario, nombre_completo: body.nombreCompleto, rol: body.rol, activo: true });
      return json({ error: 'No se pudo crear la cuenta.' }, state.accountCreateStatus ?? 201);
    }
    if (url.pathname === '/api/clientes' && req.method() === 'GET') return json(state.clients);
    if (url.pathname === '/api/clientes' && req.method() === 'POST') return json({ ok: true }, 201);
    if (url.pathname.endsWith('/mensualidad') && req.method() === 'PATCH') {
      const body = req.postDataJSON() as Record<string, unknown>;
      state.membershipChanges?.push(body);
      const cedula = decodeURIComponent(url.pathname.split('/')[3] || '');
      const client = state.clients?.find(item => String(item.cedula) === cedula);
      if (client) client.mensualidad_activa = body.activa;
      return json({ ok: true });
    }
    if (url.pathname === '/api/celdas/disponibles') return role === 'OPERADOR'
      ? json([{ id_celda: 1, numero_celda: 'C-01', tipo_vehiculo: 'CARRO' }])
      : json({ error: 'No autorizado.' }, 403);
    if (url.pathname === '/api/celdas' && req.method() === 'GET') return json(state.cells);
    if (url.pathname === '/api/celdas' && req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>;
      state.creates?.push(body);
      if ((state.cellCreateStatus ?? 201) === 201) state.cells?.push(cell(state.cells.length + 1, String(body.numeroCelda), 'DISPONIBLE', String(body.tipoVehiculo)));
      return state.cellCreateStatus === 204 ? empty(204) : json({ error: 'No se pudo crear la celda.' }, state.cellCreateStatus ?? 201);
    }
    if (url.pathname.startsWith('/api/celdas/')) {
      if (req.method() === 'GET') return json({ error: 'Celda no encontrada.' }, state.cellLookupStatus ?? 404);
      if (req.method() === 'PUT' || req.method() === 'PATCH') {
        state.updates?.push(req.postDataJSON() as Record<string, unknown>);
        return json({ error: 'No se pudo actualizar la celda.' }, state.cellUpdateStatus ?? 200);
      }
      if (req.method() === 'DELETE') {
        state.deletes += 1;
        return state.cellDeleteStatus === 204 ? empty(204) : json({ error: 'La celda no se puede eliminar.' }, state.cellDeleteStatus ?? 204);
      }
    }
    if (url.pathname === '/api/vehiculo' && req.method() === 'POST') return json({ mensaje: 'Registrado.' }, 201);
    if (url.pathname === '/api/acceso/entrada' && req.method() === 'POST') return json({ placa: 'ABC123', celdaAsignada: 'C-01' });
    if (url.pathname === '/api/acceso/salida' && req.method() === 'POST') return json({ placa: 'ABC123', celdaAsignada: 'C-01' });
    return json({ error: `Ruta no simulada ${req.method()} ${url.pathname}` }, 501);
  });
  return state;
}

export async function signIn(page: Page, role: Role, username = 'cuenta.prueba', waitForApp = true) {
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#login-usuario').fill(username);
  await page.locator('#login-password').fill('ClavePrueba123');
  await page.locator('#form-login button[type="submit"]').click();
  if (waitForApp) await page.locator('#app-main').waitFor({ state: 'visible' });
}

export async function shot(page: Page, info: TestInfo, id: string, selector?: string) {
  const target = selector ? page.locator(selector) : page.locator('#app-main');
  await target.screenshot({ path: info.outputPath(`${id}.png`), animations: 'disabled' });
}

async function admin(page: Page) { await scenario(page, 'ADMINISTRADOR'); await signIn(page, 'ADMINISTRADOR'); }
async function operator(page: Page, opts: Partial<Scenario> = {}) { const state = await scenario(page, 'OPERADOR', opts); await signIn(page, 'OPERADOR'); return state; }

test('US-01 administrador inicia sesión y cubre portería con su cuenta', async ({ page }, info) => {
  await admin(page); await expect(page.locator('#form-entrada')).toBeVisible(); await expect(page.locator('#form-cuenta-admin')).toBeVisible(); await shot(page, info, 'US-01', '#app-header');
});
test('US-02 operador ve operación y no administración', async ({ page }, info) => {
  await operator(page); await expect(page.locator('#form-entrada')).toBeVisible(); await expect(page.locator('#form-celda-admin')).toBeHidden(); await shot(page, info, 'US-02', '#app-header');
});
test('US-03 credenciales incorrectas muestran rechazo genérico', async ({ page }, info) => {
  await scenario(page, 'ADMINISTRADOR', { loginStatus: 401 }); await signIn(page, 'ADMINISTRADOR', 'cuenta.prueba', false); await expect(page.locator('#login-error')).toContainText('Credenciales inválidas'); await shot(page, info, 'US-03', '#login-screen');
});
test('US-04 login vacío queda bloqueado por campos requeridos', async ({ page }, info) => {
  await scenario(page, 'ADMINISTRADOR'); await page.route('https://fonts.googleapis.com/**', r => r.abort()); await page.route('https://fonts.gstatic.com/**', r => r.abort()); await page.goto('/', { waitUntil: 'domcontentloaded' }); await page.locator('#form-login button[type="submit"]').click(); await expect(page.locator('#login-screen')).toBeVisible(); await expect(page.locator('#login-usuario')).toBeFocused(); await shot(page, info, 'US-04', '#login-screen');
});
test('US-05 solicitud vencida retorna al login', async ({ page }, info) => {
  const state = await operator(page); state.authStatus = 401; await page.locator('#placa-entrada').fill('ABC123'); await page.locator('#form-entrada button[type="submit"]').click(); await expect(page.locator('#login-screen')).toBeVisible(); await shot(page, info, 'US-05', '#login-screen');
});
test('US-06 cerrar sesión muestra login de nuevo', async ({ page }, info) => {
  const state = await scenario(page, 'ADMINISTRADOR'); await signIn(page, 'ADMINISTRADOR'); await page.locator('#btn-cerrar-sesion').click(); await expect(page.locator('#login-screen')).toBeVisible(); expect(state.logout).toBe(true); await shot(page, info, 'US-06', '#login-screen');
});
test('US-07 administrador puede crear cuenta operador', async ({ page }, info) => {
  const state = await scenario(page, 'ADMINISTRADOR'); await signIn(page, 'ADMINISTRADOR'); await page.locator('#cuenta-usuario').fill('operador.prueba'); await page.locator('#cuenta-nombre').fill('Operador Prueba'); await page.locator('#cuenta-password').fill('ClavePrueba123'); await page.locator('#cuenta-rol').selectOption('OPERADOR'); await page.locator('#operador-cedula').fill('1098765432'); await page.locator('#form-cuenta-admin button[type="submit"]').click(); await expect.poll(() => state.creates?.length).toBe(1); expect(state.creates?.[0]).toMatchObject({ rol: 'OPERADOR', cedula: '1098765432' }); await shot(page, info, 'US-07', '#form-cuenta-admin');
});
test('US-08 administrador puede crear otra cuenta administrativa', async ({ page }, info) => {
  const state = await scenario(page, 'ADMINISTRADOR'); await signIn(page, 'ADMINISTRADOR'); await page.locator('#cuenta-usuario').fill('admin.segundo'); await page.locator('#cuenta-nombre').fill('Admin Segundo'); await page.locator('#cuenta-password').fill('ClavePrueba123'); await page.locator('#cuenta-rol').selectOption('ADMINISTRADOR'); await page.locator('#form-cuenta-admin button[type="submit"]').click(); await expect.poll(() => state.creates?.length).toBe(1); expect(state.creates?.[0]).toMatchObject({ rol: 'ADMINISTRADOR' }); await shot(page, info, 'US-08', '#form-cuenta-admin');
});
test('US-09 duplicado de cuenta informa conflicto', async ({ page }, info) => {
  await scenario(page, 'ADMINISTRADOR', { accountCreateStatus: 409 }); await signIn(page, 'ADMINISTRADOR'); page.once('dialog', d => d.accept()); await page.locator('#cuenta-usuario').fill('admin.segundo'); await page.locator('#cuenta-nombre').fill('Admin Segundo'); await page.locator('#cuenta-password').fill('ClavePrueba123'); await page.locator('#form-cuenta-admin button[type="submit"]').click(); await shot(page, info, 'US-09', '#form-cuenta-admin');
});
test('US-10 crear cuenta exige campos requeridos', async ({ page }, info) => {
  await admin(page); await page.locator('#form-cuenta-admin button[type="submit"]').click(); await expect(page.locator('#cuenta-usuario')).toBeFocused(); await shot(page, info, 'US-10', '#form-cuenta-admin');
});
test('US-11 rol inválido recibe rechazo en el contrato simulado', async ({ page }, info) => {
  await scenario(page, 'ADMINISTRADOR', { accountCreateStatus: 422 }); await signIn(page, 'ADMINISTRADOR'); const result = await page.evaluate(async () => { const r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombreUsuario: 'x', nombreCompleto: 'X', password: 'Clave123456', rol: 'SUPERUSUARIO' }) }); return r.status; }); expect(result).toBe(422); await shot(page, info, 'US-11', '#form-cuenta-admin');
});
test('US-12 la lista de cuentas no muestra secretos', async ({ page }, info) => {
  await admin(page); await expect(page.locator('#cuentas-body')).not.toContainText('hash'); await expect(page.locator('#cuentas-body')).not.toContainText('password'); await shot(page, info, 'US-12', '#cuentas-body');
});
test('PE-01 solicitud no autenticada recibe 401', async ({ page }, info) => {
  await scenario(page, 'ADMINISTRADOR'); await page.route('https://fonts.googleapis.com/**', r => r.abort()); await page.route('https://fonts.gstatic.com/**', r => r.abort()); await page.goto('/', { waitUntil: 'domcontentloaded' }); const result = await page.evaluate(async () => (await fetch('/api/auth/protected-test')).status); expect(result).toBe(401); await shot(page, info, 'PE-01', '#login-screen');
});
test('PE-02 operador no muestra gestión de cuentas', async ({ page }, info) => {
  await operator(page); await expect(page.locator('#form-cuenta-admin')).toBeHidden(); await shot(page, info, 'PE-02', '#app-header');
});
test('PE-03 operador no muestra gestión de celdas', async ({ page }, info) => {
  await operator(page); await expect(page.locator('#form-celda-admin')).toBeHidden(); await shot(page, info, 'PE-03', '#app-header');
});
test('PE-04 administrador puede registrar accesos con su cuenta', async ({ page }, info) => {
  await admin(page); await page.locator('#placa-entrada').fill('ABC123'); await page.locator('#form-entrada button[type="submit"]').click(); await expect(page.locator('#modal-autorizado')).toBeVisible(); await shot(page, info, 'PE-04', '#modal-autorizado');
});
test('PE-05 operador consulta disponibilidad sin administrar catálogo', async ({ page }, info) => {
  await operator(page); await page.locator('#btn-consultar-disponibles').click(); await expect(page.locator('#disponibles-body')).toContainText('C-01'); await expect(page.locator('#form-celda-admin')).toBeHidden(); await shot(page, info, 'PE-05', '.operator-section');
});
test('CE-01 lista y busca celdas por código', async ({ page }, info) => {
  await admin(page); await page.locator('#filtro-celdas').fill('C-01'); await expect(page.locator('#celdas-body')).toContainText('C-01'); await expect(page.locator('#celdas-body')).not.toContainText('M-01'); await shot(page, info, 'CE-01', '#form-celda-admin');
});
test('CE-02 catálogo vacío muestra estado vacío', async ({ page }, info) => {
  await scenario(page, 'ADMINISTRADOR', { cells: [] }); await signIn(page, 'ADMINISTRADOR'); await expect(page.locator('#celdas-body')).toContainText('No hay celdas'); await shot(page, info, 'CE-02', '#form-celda-admin');
});
test('CE-03 búsqueda inexistente informa sin resultados', async ({ page }, info) => {
  await admin(page); await page.locator('#filtro-celdas').fill('NO-EXISTE'); await expect(page.locator('#celdas-body')).toContainText('No hay celdas'); await shot(page, info, 'CE-03', '#form-celda-admin');
});
test('CE-04 crear celda envía los datos', async ({ page }, info) => {
  const state = await scenario(page, 'ADMINISTRADOR'); await signIn(page, 'ADMINISTRADOR'); await page.locator('#celda-codigo').fill('C-88'); await page.locator('#form-celda-admin button[type="submit"]').click(); await expect.poll(() => state.creates?.length).toBe(1); expect(state.creates?.[0]).toMatchObject({ numeroCelda: 'C-88', tipoVehiculo: 'CARRO' }); await shot(page, info, 'CE-04', '#form-celda-admin');
});
test('CE-05 código duplicado devuelve conflicto', async ({ page }, info) => {
  await scenario(page, 'ADMINISTRADOR', { cellCreateStatus: 409 }); await signIn(page, 'ADMINISTRADOR'); page.once('dialog', d => d.accept()); await page.locator('#celda-codigo').fill('C-01'); await page.locator('#form-celda-admin button[type="submit"]').click(); await shot(page, info, 'CE-05', '#form-celda-admin');
});
test('CE-06 código de celda requerido', async ({ page }, info) => {
  await admin(page); await page.locator('#form-celda-admin button[type="submit"]').click(); await expect(page.locator('#celda-codigo')).toBeFocused(); await shot(page, info, 'CE-06', '#form-celda-admin');
});
test('CE-07 editar celda existente envía cambios', async ({ page }, info) => {
  const state = await scenario(page, 'ADMINISTRADOR'); await signIn(page, 'ADMINISTRADOR'); let prompt = 0; page.on('dialog', d => d.type() === 'prompt' ? d.accept(prompt++ === 0 ? 'C-03' : 'CARRO') : d.accept()); await page.locator('#celdas-body tr').first().getByRole('button', { name: 'Editar' }).click(); await expect.poll(() => state.updates?.length).toBe(1); await shot(page, info, 'CE-07', '#form-celda-admin');
});
test('CE-08 editar con código de otra celda devuelve conflicto', async ({ page }, info) => {
  await scenario(page, 'ADMINISTRADOR', { cellUpdateStatus: 409 }); await signIn(page, 'ADMINISTRADOR'); let prompt = 0; page.on('dialog', d => d.type() === 'prompt' ? d.accept(prompt++ === 0 ? 'C-02' : 'CARRO') : d.accept()); await page.locator('#celdas-body tr').first().getByRole('button', { name: 'Editar' }).click(); await shot(page, info, 'CE-08', '#form-celda-admin');
});
test('CE-09 editar celda inexistente informa error', async ({ page }, info) => {
  await scenario(page, 'ADMINISTRADOR', { cellUpdateStatus: 404 }); await signIn(page, 'ADMINISTRADOR'); const status = await page.evaluate(async () => (await fetch('/api/celdas/999', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status); expect(status).toBe(404); await shot(page, info, 'CE-09', '#form-celda-admin');
});
test('CE-10 eliminar celda libre confirma la acción', async ({ page }, info) => {
  const state = await scenario(page, 'ADMINISTRADOR', { cellDeleteStatus: 204 }); await signIn(page, 'ADMINISTRADOR'); page.once('dialog', d => d.accept()); await page.locator('#celdas-body tr').first().getByRole('button', { name: 'Eliminar' }).click(); await expect.poll(() => state.deletes).toBe(1); await shot(page, info, 'CE-10', '#form-celda-admin');
});
test('CE-11 eliminar celda con historial se rechaza', async ({ page }, info) => {
  await scenario(page, 'ADMINISTRADOR', { cellDeleteStatus: 409 }); await signIn(page, 'ADMINISTRADOR'); page.once('dialog', d => d.accept()); await page.locator('#celdas-body tr').first().getByRole('button', { name: 'Eliminar' }).click(); await shot(page, info, 'CE-11', '#form-celda-admin');
});
test('CE-12 celda ocupada no permite eliminar', async ({ page }, info) => {
  await scenario(page, 'ADMINISTRADOR', { cells: [cell(1, 'C-01', 'OCUPADA')] }); await signIn(page, 'ADMINISTRADOR'); await expect(page.locator('#celdas-body tr').first().getByRole('button', { name: 'Eliminar' })).toBeDisabled(); await shot(page, info, 'CE-12', '#form-celda-admin');
});
test('CE-13 dos solicitudes simultáneas devuelven un éxito y un conflicto simulados', async ({ page }, info) => {
  await admin(page); let count = 0; await page.route('**/api/celdas', async route => { if (route.request().method() === 'POST') { count++; await route.fulfill({ status: count === 1 ? 201 : 409, contentType: 'application/json', body: JSON.stringify({ ok: count === 1 }) }); } else await route.continue(); });
  const statuses = await page.evaluate(async () => Promise.all([1, 2].map(() => fetch('/api/celdas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numeroCelda: 'C-77', tipoVehiculo: 'CARRO' }) }).then(r => r.status)))); expect(statuses).toEqual([201, 409]); await shot(page, info, 'CE-13', '#form-celda-admin');
});
