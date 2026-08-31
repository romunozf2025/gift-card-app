let baseDeDatosTarjetas = {};
let escaneoPausado = false;
let html5QrcodeScanner = null;
let tarjetaActualId = null;

const modalOverlay = document.getElementById('modal-overlay');
const resultadoBox = document.getElementById('resultado-box');
const infoTarjetaBox = document.getElementById('info-tarjeta');

// URL del CSV Original de las Tarjetas maestras
const URL_GOOGLE_SHEET_TARJETAS = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSjIH2cId6_HAo4GWJvSkvmmyrwabBEp0HpV59dYtEjcK4EGOONCXBJqIX87TR74v82RDPNXePuMbgi/pub?output=csv"; 

// Tu enlace definitivo de Apps Script
const URL_APPS_SCRIPT_TRANSACCIONES = "https://script.google.com/macros/s/AKfycbyBlKVhSwyNxLt2xCzGRYw97Seo-9mHn0UKmFHYgdqyJ26V8wnV07ga6vuz5EzTVzU/exec"; 

window.onload = () => {
    cargarMemoriaLocal();
    iniciarLector();
};

function cargarMemoriaLocal() {
    try {
        const guardadas = localStorage.getItem('giftcardsDB');
        if (guardadas) {
            baseDeDatosTarjetas = JSON.parse(guardadas);
        }
    } catch (e) {
        baseDeDatosTarjetas = {};
    }
}

// Sincronización Inteligente: Recupera Tarjetas y Transacciones
async function sincronizarDesdeGoogle() {
    try {
        const btnSync = document.querySelector('button[onclick="sincronizarDesdeGoogle()"]');
        btnSync.textContent = "Sincronizando...";
        
        const respuestaTarjetas = await fetch(URL_GOOGLE_SHEET_TARJETAS);
        const datosCSV = await respuestaTarjetas.text();
        const lineas = datosCSV.replace(/\r/g, '').split('\n');
        
        let nuevas = 0;

        for (let i = 1; i < lineas.length; i++) {
            const lineaActual = lineas[i].trim();
            if (lineaActual === "") continue;

            const fila = lineaActual.split(',');
            if (fila.length >= 3) {
                const idTarjeta = fila[0].trim();
                const montoInicial = parseFloat(fila[1].trim());
                const fechaVencimiento = fila[2].trim(); 

                if (idTarjeta) {
                    if(!baseDeDatosTarjetas[idTarjeta]) nuevas++;
                    baseDeDatosTarjetas[idTarjeta] = {
                        id: idTarjeta,
                        monto_inicial: montoInicial,
                        saldo_actual: montoInicial,
                        vencimiento: fechaVencimiento,
                        historial_compras: []
                    };
                }
            }
        }

        try {
            const respuestaTx = await fetch(URL_APPS_SCRIPT_TRANSACCIONES);
            const transaccionesNube = await respuestaTx.json();
            
            transaccionesNube.forEach(tx => {
                if (baseDeDatosTarjetas[tx.id]) {
                    baseDeDatosTarjetas[tx.id].historial_compras.push(tx);
                    baseDeDatosTarjetas[tx.id].saldo_actual -= tx.monto;
                }
            });
        } catch (e) {
            console.log("No se pudieron cargar transacciones de la nube, trabajando en modo local.");
        }

        localStorage.setItem('giftcardsDB', JSON.stringify(baseDeDatosTarjetas));
        btnSync.innerHTML = "🔄 Sincronizar Tarjetas";
        alert(`✅ Sincronización exitosa. Base de datos actualizada con las últimas ventas en la nube.`);
        
    } catch (error) {
        alert("❌ Error de conexión al sincronizar.");
        document.querySelector('button[onclick="sincronizarDesdeGoogle()"]').innerHTML = "🔄 Sincronizar Tarjetas";
    }
}

function iniciarLector() {
    if (typeof Html5QrcodeScanner === 'undefined') return;
    try {
        if (!html5QrcodeScanner) {
            html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 15, qrbox: { width: 220, height: 220 } }, false);
            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
        }
    } catch (e) {}
}

function onScanFailure(error) {}

function onScanSuccess(decodedText) {
    if (escaneoPausado) return;
    escaneoPausado = true;
    
    if (html5QrcodeScanner) {
        html5QrcodeScanner.pause(true); 
    }
    validarTarjeta(decodedText);
}

function cerrarModal() {
    modalOverlay.style.display = 'none';
    tarjetaActualId = null;
    document.getElementById('charge-amount').value = '';
    
    if (html5QrcodeScanner) {
        html5QrcodeScanner.resume();
    }
    
    setTimeout(() => { escaneoPausado = false; }, 1000);
}

window.onclick = function(event) {
    if (event.target === modalOverlay) cerrarModal();
}

function validarTarjeta(textoDecodificado) {
    try {
        let idTarjeta = "";
        try {
            const datosQR = JSON.parse(textoDecodificado);
            idTarjeta = datosQR.id_tarjeta ? datosQR.id_tarjeta.toString().trim() : textoDecodificado.trim();
        } catch (e) {
            idTarjeta = textoDecodificado.trim();
        }

        let tarjeta = baseDeDatosTarjetas[idTarjeta];

        if (!tarjeta) {
            mostrarModal('error', '❌ Tarjeta no encontrada.<br><small>Sincronice o verifique el código.</small>', null);
            return;
        }

        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const fechaVen = new Date(tarjeta.vencimiento + "T00:00:00");

        if (hoy > fechaVen) {
            mostrarModal('error', `🚨 TARJETA VENCIDA<br><small>Caducó el ${tarjeta.vencimiento}</small>`, tarjeta);
            return;
        }

        if (tarjeta.saldo_actual <= 0) {
            mostrarModal('error', `⚠️ TARJETA AGOTADA<br><small>Ya no cuenta con saldo disponible.</small>`, tarjeta);
            return;
        }

        tarjetaActualId = idTarjeta;
        mostrarModal('ok', '✅ TARJETA VÁLIDA', tarjeta);
    } catch (error) {
        mostrarModal('error', '⚠️ Error al interpretar el código QR.', null);
    }
}

function mostrarModal(tipo, mensaje, tarjeta) {
    resultadoBox.className = tipo === 'ok' ? 'ok' : 'error';
    resultadoBox.innerHTML = mensaje;

    if (tarjeta) {
        document.getElementById('dato-id').textContent = tarjeta.id;
        document.getElementById('dato-inicial').textContent = tarjeta.monto_inicial;
        document.getElementById('dato-vencimiento').textContent = tarjeta.vencimiento;
        document.getElementById('dato-saldo').textContent = tarjeta.saldo_actual;
        infoTarjetaBox.style.display = (tarjeta.saldo_actual > 0 && tipo === 'ok') ? 'block' : 'none';
    } else {
        infoTarjetaBox.style.display = 'none';
    }
    modalOverlay.style.display = 'flex';
}

async function cobrarSaldo() {
    const inputMonto = document.getElementById('charge-amount');
    const montoCobro = parseFloat(inputMonto.value);

    if (!tarjetaActualId || !baseDeDatosTarjetas[tarjetaActualId]) return;
    let tarjeta = baseDeDatosTarjetas[tarjetaActualId];

    if (!montoCobro || montoCobro <= 0) return alert("Ingrese un monto válido a descontar.");
    if (montoCobro > tarjeta.saldo_actual) return alert("El monto supera el saldo disponible de la tarjeta.");

    const confirmar = confirm(`¿Confirmas el descuento de $${montoCobro}?\nSaldo actual: $${tarjeta.saldo_actual}\nNuevo saldo quedará en: $${tarjeta.saldo_actual - montoCobro}`);
    if (!confirmar) return; 

    tarjeta.saldo_actual -= montoCobro;
    
    const fechaActual = new Date().toLocaleString();
    const timestampActual = Date.now();
    
    const nuevaCompra = {
        id: tarjeta.id,
        fecha: fechaActual,
        timestamp: timestampActual, 
        monto: montoCobro,
        saldo_restante: tarjeta.saldo_actual
    };
    
    tarjeta.historial_compras.push(nuevaCompra);
    localStorage.setItem('giftcardsDB', JSON.stringify(baseDeDatosTarjetas));
    guardarEnNube(nuevaCompra);

    alert(`✅ Cobro exitoso. Nuevo saldo: $${tarjeta.saldo_actual}`);
    cerrarModal(); 
}

async function guardarEnNube(compraData) {
    try {
        await fetch(URL_APPS_SCRIPT_TRANSACCIONES, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(compraData),
            headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
    } catch(error) {
        console.error("Transacción guardada localmente.");
    }
}

function mostrarHistorial() {
    document.getElementById('panel-escaneo').style.display = 'none';
    document.getElementById('historial-panel').style.display = 'block';
    document.getElementById('btn-volver').style.display = 'block';

    const contenedor = document.getElementById('lista-tarjetas');
    contenedor.innerHTML = "";

    const keys = Object.keys(baseDeDatosTarjetas);
    if (keys.length === 0) {
        contenedor.innerHTML = "<p>No hay tarjetas registradas en la memoria local.</p>";
        return;
    }

    keys.forEach(k => {
        const t = baseDeDatosTarjetas[k];
        let historialHtml = t.historial_compras.length > 0 
            ? "<ul>" + t.historial_compras.map(c => `<li>${c.fecha}: -$${c.monto}</li>`).join('') + "</ul>" 
            : "<i>Sin movimientos</i>";

        const div = document.createElement('div');
        div.style.cssText = "border: 1px solid #ddd; padding: 12px; margin-bottom: 10px; border-radius: 8px; background: #fafafa;";
        div.innerHTML = `<strong>Tarjeta: ${t.id}</strong><br>Monto Inicial: $${t.monto_inicial} | Vence: ${t.vencimiento}<br>
            <span style="color: ${t.saldo_actual > 0 ? 'green' : 'red'}; font-weight: bold;">Saldo Actual: $${t.saldo_actual}</span>
            <div style="font-size: 0.85rem; margin-top: 5px;">Historial: ${historialHtml}</div>`;
        contenedor.appendChild(div);
    });
}

function cerrarHistorial() {
    document.getElementById('historial-panel').style.display = 'none';
    document.getElementById('btn-volver').style.display = 'none';
    document.getElementById('panel-escaneo').style.display = 'block';
    cerrarModal();
}

// ----------------------------------------------------
// EXPORTACIÓN A PRUEBA DE FALLOS CON EFECTO VISUAL
// ----------------------------------------------------
async function exportarReporte(formato) {
    // 1. Identificar botón y poner efecto de carga (como en la app de asistencia)
    const botones = document.querySelectorAll('.export-grid button');
    const btnActual = formato === 'csv' ? botones[0] : botones[1];
    const textoOriginal = btnActual.innerText;
    
    btnActual.innerText = "⌛ Procesando...";
    btnActual.disabled = true;

    // 2. Proteger todo el proceso por si hay un error oculto
    try {
        const filtro = document.getElementById('filtro-tiempo').value;
        const ahora = new Date();
        const limiteInicio = new Date();
        
        if (filtro === 'hoy') {
            limiteInicio.setHours(0,0,0,0);
        } else if (filtro === 'semana') {
            limiteInicio.setDate(ahora.getDate() - 7);
        } else if (filtro === 'quincena') {
            limiteInicio.setDate(ahora.getDate() - 15);
        } else if (filtro === 'mes') {
            limiteInicio.setMonth(ahora.getMonth() - 1);
        } else {
            limiteInicio.setTime(0);
        }

        let datosReporte = [];
        let totalDescontado = 0;

        for (const id in baseDeDatosTarjetas) {
            const tarjeta = baseDeDatosTarjetas[id];
            tarjeta.historial_compras.forEach(compra => {
                let fechaCompra = compra.timestamp ? new Date(compra.timestamp) : new Date();
                if (fechaCompra >= limiteInicio) {
                    datosReporte.push([
                        tarjeta.id, 
                        compra.fecha, 
                        `$${compra.monto.toFixed(2)}`,
                        `$${tarjeta.saldo_actual.toFixed(2)}`
                    ]);
                    totalDescontado += compra.monto;
                }
            });
        }

        if (datosReporte.length === 0) {
            alert("No hay transacciones registradas en el periodo seleccionado.");
            return; // Termina aquí si no hay datos
        }

        const fileName = `Reporte_GiftCards_${filtro}_${ahora.getTime()}`;

        if (formato === 'csv') {
            let csvContent = "ID Tarjeta,Fecha de Compra,Monto Descontado,Saldo Restante\n";
            datosReporte.forEach(row => { csvContent += `"${row[0]}","${row[1]}","${row[2]}","${row[3]}"\n`; });
            csvContent += `\n,,TOTAL DESCONTADO:, "$${totalDescontado.toFixed(2)}"\n`;
            
            const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
            const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
            await compartirArchivoNativo(blob, `${fileName}.csv`);
        } else {
            if (!window.jspdf) throw new Error('Librería jsPDF no se cargó correctamente en el HTML.');
            
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            doc.setFontSize(16);
            doc.text(`Reporte de Ventas Gift Cards (${filtro.toUpperCase()})`, 14, 15);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Generado: ${ahora.toLocaleString()}`, 14, 22);
            doc.text(`Total Generado en el periodo: $${totalDescontado.toFixed(2)}`, 14, 28);

            doc.autoTable({
                startY: 32,
                head: [['ID Tarjeta', 'Fecha de Compra', 'Monto Descontado', 'Saldo Restante']],
                body: datosReporte,
                theme: 'striped',
                headStyles: { fillColor: [0, 123, 255] } 
            });

            const pdfBuffer = doc.output('arraybuffer');
            const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
            await compartirArchivoNativo(blob, `${fileName}.pdf`);
        }
    } catch (error) {
        // SI ALGO FALLA, AHORA LO VERÁS EN PANTALLA
        alert("❌ Error interno: " + error.message);
    } finally {
        // 3. Devolver el botón a su estado normal
        btnActual.innerText = textoOriginal;
        btnActual.disabled = false;
    }
}

async function compartirArchivoNativo(blob, fileName) {
    try {
        if (window.Capacitor && window.Capacitor.isNative) {
            
            // Verificación estricta de que los plugins existan
            if (!window.Capacitor.Plugins.Filesystem || !window.Capacitor.Plugins.Share) {
                throw new Error("Los plugins de Capacitor no están integrados en el APK.");
            }

            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader(); 
                reader.onerror = () => reject(new Error("Error leyendo los datos del reporte."));
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(blob);
            });
            
            const Filesystem = window.Capacitor.Plugins.Filesystem;
            const Share = window.Capacitor.Plugins.Share;
            
            const writeResult = await Filesystem.writeFile({ 
                path: fileName, 
                data: base64Data, 
                directory: 'CACHE' 
            });
            
            await Share.share({
                title: 'Reporte de Ventas',
                text: `Adjunto el reporte de ventas de tus Gift Cards.`,
                url: writeResult.uri, 
                dialogTitle: 'Compartir con...'
            });
        } else {
            // Entorno Web (Pruebas en PC)
            const file = new File([blob], fileName, { type: blob.type });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ title: 'Reporte de Ventas', files: [file] });
            } else {
                const url = URL.createObjectURL(blob); 
                const a = document.createElement("a");
                a.href = url; a.download = fileName; 
                document.body.appendChild(a); a.click(); 
                document.body.removeChild(a); URL.revokeObjectURL(url);
            }
        }
    } catch (err) { 
        throw new Error("Error al compartir: " + err.message); 
    }
}