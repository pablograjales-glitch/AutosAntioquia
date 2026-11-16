import { Page, TestInfo } from '@playwright/test';

export type Role = 'ADMINISTRADOR' | 'OPERADOR';
export type Scenario = {
  cells?: Array<Record<string, unknown>>;
  accounts?: Array<Record<string, unknown>>;
  clients?: Array<Record<string, unknown>>;
  membershipChanges: Array<Record<string, unknown>>;
};

const cell = (id: number, code: string, state = 'DISPONIBLE', type = 'CARRO') => ({
  id_celda: id, numero_celda: code, tipo_vehiculo: type, estado: state,
  placa_actual: state === 'OCUPADA' ? 'ABC123' : null
});

export async function scenario(page: Page, role: Role, options: Partial<Scenario> = {}) {
  const state: Scenario = {
    cells: options.cells ?? [cell(1, 'C-01'), cell(2, 'M-01', 'DISPONIBLE', 'MOTO')],
    accounts: options.accounts ?? [],
    clients: options.clients ?? [],
    membershipChanges: []
  };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const empty = () => route.fulfill({ status: 204, body: '' });
    if (url.pathname === '/api/auth/login' && request.method() === 'POST') return json({ token: `practical-${role}-token-12345678901234567890`, usuario: { nombreCompleto: role === 'ADMINISTRADOR' ? 'Administradora de prueba' : 'Operador de prueba', rol: role } });
    if (url.pathname === '/api/auth/logout') return json({ ok: true });
    if (url.pathname === '/api/auth/me') return json({ nombreCompleto: 'Usuario de prueba', rol: role });
    if (url.pathname === '/api/acceso/ocupacion') return json({ resumenCeldas: [
      { tipo_vehiculo: 'CARRO', ocupadas: '1', disponibles: '79', total: '80' },
      { tipo_vehiculo: 'MOTO', ocupadas: '0', disponibles: '10', total: '10' }
    ], vehiculosActivos: [] });
    if (url.pathname === '/api/usuarios' && request.method() === 'GET') return json(state.accounts);
    if (url.pathname === '/api/usuarios' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.accounts?.push({ nombre_usuario: body.nombreUsuario, nombre_completo: body.nombreCompleto, rol: body.rol, activo: true });
      return json({ ok: true }, 201);
    }
    if (url.pathname === '/api/clientes' && request.method() === 'GET') return json(state.clients);
    if (url.pathname === '/api/clientes' && request.method() === 'POST') return json({ ok: true }, 201);
    if (url.pathname.endsWith('/mensualidad') && request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.membershipChanges.push(body);
      const cedula = decodeURIComponent(url.pathname.split('/')[3] || '');
      const client = state.clients?.find(item => String(item.cedula) === cedula);
      if (client) client.mensualidad_activa = body.activa;
      return json({ ok: true });
    }
    if (url.pathname === '/api/celdas' && request.method() === 'GET') return json(state.cells);
    if (url.pathname === '/api/celdas' && request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.cells?.push(cell(state.cells.length + 1, String(body.numeroCelda), 'DISPONIBLE', String(body.tipoVehiculo)));
      return json({ ok: true }, 201);
    }
    if (url.pathname === '/api/celdas/disponibles') return json([{ numero_celda: 'C-01', tipo_vehiculo: 'CARRO' }]);
    if (url.pathname === '/api/vehiculo' && request.method() === 'POST') return json({ mensaje: 'Matrícula registrada.' }, 201);
    if (url.pathname === '/api/acceso/entrada' && request.method() === 'POST') return json({ placa: 'ABC123', celdaAsignada: 'C-01', mensaje: 'Entrada autorizada.' });
    if (url.pathname === '/api/acceso/salida' && request.method() === 'POST') return json({ placa: 'ABC123', celdaAsignada: 'C-01', mensaje: 'Salida registrada.' });
    return request.method() === 'DELETE' ? empty() : json({});
  });
  return state;
}

export async function signIn(page: Page, role: Role) {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#login-usuario').fill(role === 'ADMINISTRADOR' ? 'admin.demo' : 'operador.demo');
  await page.locator('#login-password').fill('ClavePrueba123');
  await page.locator('#form-login button[type="submit"]').click();
  await page.locator('#app-main').waitFor({ state: 'visible' });
}

export async function shot(page: Page, info: TestInfo, filename: string, selector: string) {
  await page.locator(selector).screenshot({ path: info.outputPath(`${filename}.png`), animations: 'disabled' });
}
