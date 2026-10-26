document.addEventListener('DOMContentLoaded', () => {
  const formRegistro = document.getElementById('form-registro');
  const formEntrada = document.getElementById('form-entrada');
  const formSalida = document.getElementById('form-salida');
  const tablaBody = document.getElementById('tabla-body');

  const modalAutorizado = document.getElementById('modal-autorizado');
  const modalDenegado = document.getElementById('modal-denegado');
  const modalMensualidad = document.getElementById('modal-mensualidad-exitosa');
  const modalSalida = document.getElementById('modal-salida-exitosa');

  // --- 1. CONTROLADORES SEGMENTADOS (Clic manual) ---
  document.querySelectorAll('.segmented-control').forEach(container => {
    container.addEventListener('click', (e) => {
      const selectedBtn = e.target.closest('.segment-btn');
      if (!selectedBtn) return;

      container.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      selectedBtn.classList.add('active');

      const targetInputId = selectedBtn.getAttribute('data-target');
      const value = selectedBtn.getAttribute('data-value');
      const targetInput = document.getElementById(targetInputId);
      if (targetInput) {
        targetInput.value = value;
      }
    });
  });

  // --- 2. DETECCIÓN AUTOMÁTICA DE PLACA (Forzada en tiempo real) ---
  function autoSeleccionarTipo(placaValue, hiddenInputId) {
    if (!placaValue) return;
    
    const limpia = placaValue.trim().toUpperCase();
    if (limpia.length === 0) return;

    // Extraer último dígito para validar la regla colombiana
    const ultimoCaracter = limpia.slice(-1);
    let tipoDetectado = null;

    if (/[0-9]/.test(ultimoCaracter)) {
      tipoDetectado = 'CARRO';
    } else if (/[A-Z]/.test(ultimoCaracter)) {
      tipoDetectado = 'MOTO';
    }

    if (tipoDetectado) {
      // 1. Actualizar el input oculto que se enviará al Backend
      const hiddenInput = document.getElementById(hiddenInputId);
      if (hiddenInput) {
        hiddenInput.value = tipoDetectado;
      }

      // 2. Forzar el cambio visual en los botones
      const btnCarro = document.querySelector(`.segment-btn[data-target="${hiddenInputId}"][data-value="CARRO"]`);
      const btnMoto = document.querySelector(`.segment-btn[data-target="${hiddenInputId}"][data-value="MOTO"]`);

      if (tipoDetectado === 'CARRO') {
        if (btnCarro) btnCarro.classList.add('active');
        if (btnMoto) btnMoto.classList.remove('active');
      } else if (tipoDetectado === 'MOTO') {
        if (btnMoto) btnMoto.classList.add('active');
        if (btnCarro) btnCarro.classList.remove('active');
      }
    }
  }

  // Escuchar múltiples eventos para evitar desfases del navegador
  const eventosEscucha = ['input', 'keyup', 'change'];

  const inputPlacaReg = document.getElementById('placa-registro');
  if (inputPlacaReg) {
    eventosEscucha.forEach(evt => {
      inputPlacaReg.addEventListener(evt, (e) => {
        autoSeleccionarTipo(e.target.value, 'tipo-registro');
      });
    });
  }

  const inputPlacaEnt = document.getElementById('placa-entrada');
  if (inputPlacaEnt) {
    eventosEscucha.forEach(evt => {
      inputPlacaEnt.addEventListener(evt, (e) => {
        autoSeleccionarTipo(e.target.value, 'tipo-vehiculo');
      });
    });
  }

  // --- 3. ACTUALIZAR DASHBOARD Y TABLA ---
  async function actualizarDashboard() {
    try {
      const res = await fetch('http://localhost:3000/api/acceso/ocupacion');
      const data = await res.json();
      if (!res.ok) return;

      const resumenCeldas = data.resumenCeldas || [];
      const c = data.carros || resumenCeldas.find(item => item.tipo_vehiculo === 'CARRO') || { ocupadas: 0, disponibles: 80, total: 80 };
      const m = data.motos || resumenCeldas.find(item => item.tipo_vehiculo === 'MOTO') || { ocupadas: 0, disponibles: 10, total: 10 };
      c.ocupadas = Number(c.ocupadas) || 0;
      c.disponibles = Number(c.disponibles) || 0;
      c.total = Number(c.total) || 80;
      m.ocupadas = Number(m.ocupadas) || 0;
      m.disponibles = Number(m.disponibles) || 0;
      m.total = Number(m.total) || 10;

      document.getElementById('carros-ocupados').textContent = c.ocupadas;
      document.getElementById('carros-disponibles').textContent = `${c.disponibles} celdas disponibles`;
      const pctC = Math.round((c.ocupadas / c.total) * 100) || 0;
      document.getElementById('carros-pct').textContent = `${pctC}% ocupado`;
      document.getElementById('bar-carros').style.width = `${pctC}%`;

      document.getElementById('motos-ocupadas').textContent = m.ocupadas;
      document.getElementById('motos-disponibles').textContent = `${m.disponibles} celdas disponibles`;
      const pctM = Math.round((m.ocupadas / m.total) * 100) || 0;
      document.getElementById('motos-pct').textContent = `${pctM}% ocupado`;
      document.getElementById('bar-motos').style.width = `${pctM}%`;

      const vehiculos = data.vehiculosActivos || data.vehiculosParqueados || [];
      document.getElementById('total-parqueados-badge').textContent = `(${vehiculos.length} vehículos)`;

      tablaBody.innerHTML = '';
      if (vehiculos.length === 0) {
        tablaBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No hay vehículos parqueados actualmente.</td></tr>`;
        return;
      }

      vehiculos.forEach(v => {
        const fechaRaw = v.fecha_hora_entrada || v.fechaEntrada || new Date();
        const fecha = new Date(fechaRaw).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
        const celdaVal = v.numero_celda || v.celda;
        const tipoVal = v.tipo_vehiculo || v.tipo;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="badge-placa-sm">${v.placa}</span></td>
          <td>${tipoVal === 'CARRO' ? 'Carro' : 'Moto'}</td>
          <td><strong>${celdaVal}</strong></td>
          <td>Hoy, ${fecha}</td>
          <td><span class="badge-al-dia">Al Día</span></td>
          <td><button class="btn-table-action" data-placa="${v.placa}">Marcar Salida</button></td>
        `;
        tablaBody.appendChild(tr);
      });

      document.querySelectorAll('.btn-table-action').forEach(btn => {
        btn.addEventListener('click', e => ejecutarSalida(e.target.getAttribute('data-placa')));
      });
    } catch (err) {
      console.error("Error cargando ocupación:", err);
    }
  }

  // --- 4. FUNCIONES DE MODALES ---
  function abrirModalEntradaExitosa(placa, celda, tipo) {
    document.getElementById('modal-placa-ok').textContent = placa;
    document.getElementById('modal-celda-ok').textContent = celda;
    document.getElementById('modal-celda-footnote').textContent = celda;
    document.getElementById('modal-tipo-ok').textContent = tipo === 'CARRO' ? 'Carro' : 'Moto';
    document.getElementById('modal-hora-ok').textContent = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    modalAutorizado.classList.remove('oculto');
  }

  function abrirModalMensualidadExitosa(placa, cliente, cedula, tipo) {
    document.getElementById('modal-placa-mat').textContent = placa;
    document.getElementById('modal-cliente-mat').textContent = cliente;
    document.getElementById('modal-cedula-mat').textContent = cedula;
    document.getElementById('modal-tipo-mat').textContent = tipo === 'CARRO' ? 'Carro' : 'Moto';
    modalMensualidad.classList.remove('oculto');
  }

  function abrirModalSalidaExitosa(placa, celda) {
    document.getElementById('modal-placa-salida').textContent = placa;
    document.getElementById('modal-celda-salida').textContent = celda || 'Liberada';
    document.getElementById('modal-hora-salida').textContent = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    modalSalida.classList.remove('oculto');
  }

  function abrirModalError(placa, causa, tipo) {
    document.getElementById('modal-placa-error').textContent = placa;
    document.getElementById('modal-tipo-error').textContent = tipo === 'CARRO' ? 'Carro' : 'Moto';
    document.getElementById('modal-causa-error').textContent = causa;
    modalDenegado.classList.remove('oculto');
  }

  document.getElementById('btn-cerrar-modal-ok').addEventListener('click', () => modalAutorizado.classList.add('oculto'));
  document.getElementById('btn-cancelar-modal-ok').addEventListener('click', () => modalAutorizado.classList.add('oculto'));
  document.getElementById('btn-cerrar-modal-mat').addEventListener('click', () => modalMensualidad.classList.add('oculto'));
  document.getElementById('btn-cerrar-modal-salida').addEventListener('click', () => modalSalida.classList.add('oculto'));
  document.getElementById('btn-cerrar-modal-error').addEventListener('click', () => modalDenegado.classList.add('oculto'));

  // --- 5. ENVIAR FORMULARIOS ---

  // Matricular Mensualidad
  let registroEnProceso = false;
  const btnRegistro = formRegistro.querySelector('button[type="submit"]');
  formRegistro.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (registroEnProceso) return;
    registroEnProceso = true;
    if (btnRegistro) btnRegistro.disabled = true;
    const cedula = document.getElementById('cedula-usuario').value;
    const nombre = document.getElementById('nombre-usuario').value;
    const placa = document.getElementById('placa-registro').value.trim().toUpperCase();
    const tipoVehiculo = document.getElementById('tipo-registro').value;

    try {
      const res = await fetch('http://localhost:3000/api/vehiculo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula, nombre, placa, tipoVehiculo })
      });
      const data = await res.json();
      if (res.ok) {
        abrirModalMensualidadExitosa(placa, nombre, cedula, tipoVehiculo);
        formRegistro.reset();
        autoSeleccionarTipo('1', 'tipo-registro'); // Resetea visualmente a Carro
        actualizarDashboard();
      } else {
        abrirModalError(placa, data.error || data.mensaje, tipoVehiculo);
      }
    } catch (err) {
      abrirModalError(placa, "Error de conexión con el servidor.", tipoVehiculo);
    }
    registroEnProceso = false;
    if (btnRegistro) btnRegistro.disabled = false;
  });

  // Registrar Entrada
  formEntrada.addEventListener('submit', async (e) => {
    e.preventDefault();
    const placa = document.getElementById('placa-entrada').value.trim().toUpperCase();
    const tipoVehiculo = document.getElementById('tipo-vehiculo').value;

    try {
      const res = await fetch('http://localhost:3000/api/acceso/entrada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa, tipoVehiculo })
      });
      const data = await res.json();

      if (res.ok) {
        const celda = data.celdaAsignada || data.celda;
        abrirModalEntradaExitosa(placa, celda, tipoVehiculo);
        formEntrada.reset();
        autoSeleccionarTipo('1', 'tipo-vehiculo'); // Resetea visualmente a Carro
        actualizarDashboard();
      } else {
        abrirModalError(placa, data.error || data.mensaje, tipoVehiculo);
      }
    } catch (err) {
      abrirModalError(placa, "Error de conexión al registrar entrada.", tipoVehiculo);
    }
  });

  // Registrar Salida
  async function ejecutarSalida(placa) {
    try {
      const res = await fetch('http://localhost:3000/api/acceso/salida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placa })
      });
      const data = await res.json();

      if (res.ok) {
        const celdaLiberada = data.celdaAsignada || data.celda || data.celdaLiberada;
        abrirModalSalidaExitosa(placa, celdaLiberada);
        formSalida.reset();
        actualizarDashboard();
      } else {
        abrirModalError(placa, data.error || data.mensaje, 'CARRO');
      }
    } catch (err) {
      abrirModalError(placa, "Error de conexión al registrar salida.", 'CARRO');
    }
  }

  formSalida.addEventListener('submit', e => {
    e.preventDefault();
    ejecutarSalida(document.getElementById('placa-salida').value.trim().toUpperCase());
  });

  actualizarDashboard();
});
