import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

function solucionSugerida(test: TestCase, result: TestResult): string {
  const texto = `${test.title} ${result.error?.message || ''}`.toLowerCase();
  if (/econnrefused|err_connection_refused|net::err/.test(texto)) {
    return 'Inicia la aplicación con `npm run start` y confirma que responda en http://localhost:3000.';
  }
  if (/renov|desactiv|password|contrase/.test(texto)) {
    return 'Comprueba que el diálogo solicite la clave del administrador y que la petición PATCH incluya passwordAdministrador.';
  }
  if (/operador|mensualidad|entrada|salida|portería/.test(texto)) {
    return 'Confirma el perfil de la sesión y que administrador/operador vean portería; solo el administrador debe gestionar cuentas y renovar o desactivar.';
  }
  if (/ocupaci|contador|celdas/.test(texto)) {
    return 'Revisa GET /api/acceso/ocupacion, reinicia el servidor después de cambiar permisos y compara celdas ocupadas con accesos activos.';
  }
  return 'Abre el trace de Playwright y la consola del servidor; corrige el primer error de la petición o selector que falló y vuelve a ejecutar.';
}

class DiagnosticReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'passed' || result.status === 'skipped') return;
    console.log(`\nERROR DETECTADO: ${test.titlePath().join(' › ')}`);
    console.log(`Detalle: ${result.error?.message || result.status}`);
    console.log(`Solución sugerida: ${solucionSugerida(test, result)}\n`);
  }
}

export default DiagnosticReporter;
