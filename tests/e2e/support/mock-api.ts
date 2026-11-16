import type { Page, Route } from '@playwright/test';

export interface MockState {
  role: 'ADMINISTRADOR' | 'OPERADOR';
  ocupacionStatus?: number;
  clientes?: Array<Record<string, unknown>>;
  entrada?: Record<string, unknown>;
  salida?: Record<string, unknown>;
  matricula?: Record<string, unknown>;
  consultasOcupacion: number;
  cambiosMensualidad: Array<Record<string, unknown>>;
  actoresOperativos: Array<{ operacion: string; token: string | undefined }>;
}

export async function mockApi(page: Page, role: MockState['role'], options: { ocupacionStatus?: number; clientes?: MockState['clientes'] } = {}): Promise<MockState> {
  const state: MockState = {
    role,
    ocupacionStatus: options.ocupacionStatus,
    clientes: options.clientes || [],
    consultasOcupacion: 0,
    cambiosMensualidad: [],
    actoresOperativos: []
  };
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.pathname === '/api/auth/login' && method === 'POST') {
      return json({ token: `mock-${state.role}-token-1234567890123456789012345678901234567890`, usuario: { nombreCompleto: 'Usuario de prueba', rol: state.role } });
    }
    if (url.pathname === '/api/auth/me') return json({ nombreCompleto: 'Usuario de prueba', rol: state.role });
    if (url.pathname === '/api/auth/logout') return json({ ok: true });
    if (url.pathname === '/api/acceso/ocupacion') {
      state.consultasOcupacion += 1;
      if (state.ocupacionStatus && state.ocupacionStatus !== 200) return json({ error: 'Perfil sin permiso para consultar ocupación.' }, state.ocupacionStatus);
      return json({
        resumenCeldas: [
          { tipo_vehiculo: 'CARRO', ocupadas: '1', disponibles: '79', total: '80' },
          { tipo_vehiculo: 'MOTO', ocupadas: '2', disponibles: '8', total: '10' }
        ],
        vehiculosActivos: []
      });
    }
    if (url.pathname === '/api/clientes' && method === 'GET') return json(state.clientes);
    if (url.pathname === '/api/usuarios' && method === 'GET') return json([]);
    if (url.pathname === '/api/celdas/disponibles') return json([{ id_celda: 1, numero_celda: 'C-01', tipo_vehiculo: 'CARRO' }]);
    if (url.pathname === '/api/celdas' && method === 'GET') return json([]);
    if (url.pathname.endsWith('/mensualidad') && method === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.cambiosMensualidad.push(body);
      const cedula = decodeURIComponent(url.pathname.split('/')[3] || '');
      const cliente = state.clientes?.find(row => String(row.cedula) === cedula);
      if (cliente) cliente.mensualidad_activa = body.activa;
      return json({ ok: true });
    }
    if (url.pathname === '/api/vehiculo' && method === 'POST') {
      state.actoresOperativos.push({ operacion: 'matricula', token: request.headers()['authorization'] });
      state.matricula = request.postDataJSON();
      return json({ mensaje: 'Matrícula registrada.' }, 201);
    }
    if (url.pathname === '/api/acceso/entrada' && method === 'POST') {
      state.actoresOperativos.push({ operacion: 'entrada', token: request.headers()['authorization'] });
      state.entrada = request.postDataJSON();
      return json({ placa: state.entrada.placa, celdaAsignada: 'C-24', mensaje: 'Entrada autorizada.' });
    }
    if (url.pathname === '/api/acceso/salida' && method === 'POST') {
      state.actoresOperativos.push({ operacion: 'salida', token: request.headers()['authorization'] });
      state.salida = request.postDataJSON();
      return json({ placa: state.salida.placa, celdaAsignada: 'C-24', mensaje: 'Salida registrada.' });
    }
    if (url.pathname === '/api/clientes' && method === 'POST') return json({ ok: true }, 201);
    return json({ error: `Ruta no simulada: ${method} ${url.pathname}` }, 501);
  });
  return state;
}

export async function iniciarSesion(page: Page, user = 'prueba'): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#login-usuario').fill(user);
  await page.locator('#login-password').fill('ClavePrueba123');
  await page.locator('#form-login button[type="submit"]').click();
  await page.locator('#app-main').waitFor({ state: 'visible' });
}
