let tarjetaActual = null;
const html5QrCode = new Html5Qrcode("reader");
const configLector = { fps: 10, qrbox: { width: 250, height: 250 } };

function alEscanear(textoDecodificado) {
    try {
        const datosQR = JSON.parse(textoDecodificado);
        if(datosQR.id_tarjeta && datosQR.monto_inicial) {
            cargarTarjeta(datosQR);
            html5QrCode.pause(); 
        }
    } catch (error) {
        console.log("El QR escaneado no es válido.");
    }
}

html5QrCode.start({ facingMode: "environment" }, configLector, alEscanear)
    .catch(err => console.error("Error al iniciar cámara", err));

function cargarTarjeta(datos) {
    let tarjetaGuardada = JSON.parse(localStorage.getItem(datos.id_tarjeta));
    if (!tarjetaGuardada) {
        tarjetaGuardada = { id: datos.id_tarjeta, monto_inicial: datos.monto_inicial, saldo_actual: datos.monto_inicial, historial_compras: [] };
        localStorage.setItem(datos.id_tarjeta, JSON.stringify(tarjetaGuardada));
    }
    tarjetaActual = tarjetaGuardada;
    actualizarInterfaz();
}

function actualizarInterfaz() {
    document.getElementById("card-panel").style.display = "block";
    document.getElementById("card-id").innerText = tarjetaActual.id;
    document.getElementById("card-initial").innerText = tarjetaActual.monto_inicial;
    document.getElementById("card-balance").innerText = tarjetaActual.saldo_actual;
}

function cobrar() {
    const inputMonto = document.getElementById("charge-amount");
    const montoCobro = parseFloat(inputMonto.value);

    if (!montoCobro || montoCobro <= 0) return alert("Ingresa un monto válido.");
    if (montoCobro > tarjetaActual.saldo_actual) return alert("Saldo insuficiente.");

    tarjetaActual.saldo_actual -= montoCobro;
    tarjetaActual.historial_compras.push({ fecha: new Date().toLocaleString(), monto: montoCobro });
    localStorage.setItem(tarjetaActual.id, JSON.stringify(tarjetaActual));

    inputMonto.value = "";
    alert("Cobro realizado. Nuevo saldo: $" + tarjetaActual.saldo_actual);
    html5QrCode.resume();
    document.getElementById("card-panel").style.display = "none";
}

function mostrarHistorial() {
    document.getElementById("reader").style.display = "none";
    document.getElementById("card-panel").style.display = "none";
    html5QrCode.pause();
    document.getElementById("historial-panel").style.display = "block";
    document.getElementById("btn-cerrar-hist").style.display = "block";

    const contenedorLista = document.getElementById("lista-tarjetas");
    contenedorLista.innerHTML = "";
    let hayTarjetas = false;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
            const data = JSON.parse(localStorage.getItem(key));
            if (data && data.id && data.monto_inicial) {
                hayTarjetas = true;
                let detalleCompras = data.historial_compras.length > 0 ? "<ul>" + data.historial_compras.map(c => `<li>${c.fecha}: <b>-$${c.monto}</b></li>`).join('') + "</ul>" : "<p><i>Sin movimientos</i></p>";
                
                const divTarjeta = document.createElement("div");
                divTarjeta.style.cssText = "border: 1px solid #ccc; padding: 10px; margin-bottom: 10px; border-radius: 5px;";
                divTarjeta.innerHTML = `<h4>Tarjeta: ${data.id}</h4><p>Monto Inicial: $${data.monto_inicial}</p><p style="color: ${data.saldo_actual > 0 ? 'green' : 'red'}; font-weight: bold;">Saldo Disponible: $${data.saldo_actual}</p><h5>Historial:</h5>${detalleCompras}`;
                contenedorLista.appendChild(divTarjeta);
            }
        } catch (e) { continue; }
    }
    if (!hayTarjetas) contenedorLista.innerHTML = "<p>No hay tarjetas registradas.</p>";
}

function cerrarHistorial() {
    document.getElementById("historial-panel").style.display = "none";
    document.getElementById("btn-cerrar-hist").style.display = "none";
    document.getElementById("reader").style.display = "block";
    html5QrCode.resume();
}