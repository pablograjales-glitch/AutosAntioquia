let cargarEpayco;

async function abrirPagos(cliente, apiFetch, actualizarAdministracion) {
  const dialogo = document.getElementById('dialogo-pagos');
  const mensaje = document.getElementById('pago-mensaje');
  const tarifa = document.getElementById('pago-tarifa');
  const iniciar = document.getElementById('pago-iniciar');
  const historial = document.getElementById('pago-historial');
  const ruta = '/api/pagos/cliente/' + encodeURIComponent(cliente.cedula);
  const formato = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const sesion = Symbol();
  dialogo.sesionPago = sesion;
  const vigente = () => dialogo.open && dialogo.sesionPago === sesion;
  let modo;
  let ocupado = false;

  async function pedir(url, body) {
    const res = await apiFetch(url, body ? { method: 'POST', body: JSON.stringify(body) } : {});
    if (!res.ok) {
      const datos = await res.json().catch(() => ({}));
      throw new Error(datos.error || 'No se pudo completar la operación de pago.');
    }
    return res.json();
  }

  async function cargarHistorial() {
    const pagos = await pedir(ruta);
    if (!vigente()) return;
    historial.replaceChildren();
    if (!pagos.length) {
      const item = document.createElement('li');
      item.textContent = 'Sin pagos registrados.';
      historial.append(item);
    }
    for (const pago of pagos) {
      const item = document.createElement('li');
      const detalle = document.createElement('span');
      detalle.textContent = formato.format(pago.monto) + ' · ' + pago.estado + ' · ' + pago.origen;
      detalle.title = pago.referencia;
      item.append(detalle);
      if (modo === 'demo' && pago.origen === 'demo' && pago.estado === 'PENDIENTE') {
        for (const [estado, etiqueta] of [['APROBADO', 'Simular aprobación'], ['RECHAZADO', 'Simular rechazo']]) {
          const boton = document.createElement('button');
          boton.type = 'button';
          boton.className = 'admin-action';
          boton.textContent = etiqueta;
          boton.onclick = () => ejecutar(async () => {
            const resultado = await pedir('/api/pagos/' + pago.referencia + '/demo', { estado });
            await actualizarAdministracion();
            if (vigente()) mensaje.textContent = 'Resultado registrado: ' + resultado.estado;
          });
          item.append(boton);
        }
      }
      historial.append(item);
    }
  }

  async function ejecutar(accion) {
    if (ocupado || !vigente()) return;
    ocupado = true;
    iniciar.disabled = true;
    mensaje.textContent = '';
    try {
      await accion();
      if (vigente()) await cargarHistorial();
    } catch (error) {
      if (vigente()) mensaje.textContent = error.message;
    } finally {
      ocupado = false;
      if (vigente()) iniciar.disabled = !modo;
    }
  }

  document.getElementById('titulo-pagos').textContent = 'Pagos de ' + cliente.nombre;
  tarifa.textContent = '';
  mensaje.textContent = 'Cargando pagos…';
  historial.replaceChildren();
  iniciar.disabled = true;
  dialogo.showModal();
  iniciar.onclick = () => ejecutar(async () => {
    if (modo === 'epayco') await cargarCheckoutEpayco();
    const pago = await pedir(ruta, {});
    if (!vigente()) return;
    if (pago.modo === 'epayco') {
      window.ePayco.checkout.configure({ sessionId: pago.sessionId, type: 'standard', test: true }).open();
    } else {
      mensaje.textContent = 'Pago de prueba creado. Puedes simular su resultado.';
    }
  });
  try {
    const config = await pedir('/api/pagos/config');
    if (!vigente()) return;
    modo = config.modo;
    if (!modo) {
      mensaje.textContent = 'Los pagos de prueba están deshabilitados.';
      return;
    }
    tarifa.textContent = formato.format(config.monto) + ' COP · ' + (modo === 'demo' ? 'Simulación local' : 'ePayco en pruebas');
    await cargarHistorial();
    if (vigente()) {
      iniciar.disabled = false;
      mensaje.textContent = '';
    }
  } catch (error) {
    if (vigente()) mensaje.textContent = error.message;
  }
}

function cargarCheckoutEpayco() {
  cargarEpayco ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.epayco.co/checkout-v2.js';
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      cargarEpayco = undefined;
      reject(new Error('No se pudo cargar el checkout de ePayco.'));
    };
    document.head.append(script);
  });
  return cargarEpayco;
}
