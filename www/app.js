let baseDeDatosTarjetas = {};
let escaneoPausado = false;
let html5QrcodeScanner = null;
let tarjetaActualId = null;

const modalOverlay = document.getElementById('modal-overlay');
const resultadoBox = document.getElementById('resultado-box');
const infoTarjetaBox = document.getElementById('info-tarjeta');

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

async function sincronizarDesdeGoogle() {
    const urlGoogleSheet = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSjIH2cId6_HAo4GWJvSkvmmyrwabBEp0HpV59dYtEjcK4EGOONCXBJqIX87TR74v82RDPNXePuMbgi/pub?output=csv"; 
    try {
        const respuesta = await fetch(urlGoogleSheet);
        const datosCSV = await respuesta.text();
        const lineas = datosCSV.replace(/\r/g, '').split('\n');
        let agregadas = 0;

        for (let i = 1; i < lineas.length; i++) {
            const lineaActual = lineas[i].trim();
            if (lineaActual === "") continue;

            const fila = lineaActual.split(',');
            if (fila.length >= 3) {
                const idTarjeta = fila[0].trim();
                const montoInicial = parseFloat(fila[1].trim());
                const fechaVencimiento = fila[2].trim(); 

                if (idTarjeta && !baseDeDatosTarjetas[idTarjeta]) {
                    baseDeDatosTarjetas[idTarjeta] = {
                        id: idTarjeta,
                        monto_inicial: montoInicial,
                        saldo_actual: montoInicial,
                        vencimiento: fechaVencimiento,
                        historial_compras: []
                    };
                    agregadas++;
                }
            }
        }
        localStorage.setItem('giftcardsDB', JSON.stringify(baseDeDatosTarjetas));
        alert(`✅ Sincronización exitosa. Se añadieron ${agregadas} tarjetas nuevas.`);
    } catch (error) {
        alert("❌ Error de conexión al sincronizar con Google Sheets.");
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
    validarTarjeta(decodedText);
    setTimeout(() => { escaneoPausado = false; }, 2000);
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
        document.getElementById('charge-amount').value = '';
        infoTarjetaBox.style.display = (tarjeta.saldo_actual > 0 && tipo === 'ok') ? 'block' : 'none';
    } else {
        infoTarjetaBox.style.display = 'none';
    }
    modalOverlay.style.display = 'flex';
}

function cobrarSaldo() {
    const inputMonto = document.getElementById('charge-amount');
    const montoCobro = parseFloat(inputMonto.value);

    if (!tarjetaActualId || !baseDeDatosTarjetas[tarjetaActualId]) return;
    let tarjeta = baseDeDatosTarjetas[tarjetaActualId];

    if (!montoCobro || montoCobro <= 0) return alert("Ingrese un monto válido a descontar.");
    if (montoCobro > tarjeta.saldo_actual) return alert("El monto supera el saldo disponible de la tarjeta.");

    tarjeta.saldo_actual -= montoCobro;
    
    // Se añade el timestamp matemático para poder filtrar por fechas sin errores
    tarjeta.historial_compras.push({
        fecha: new Date().toLocaleString(),
        timestamp: Date.now(), 
        monto: montoCobro
    });

    localStorage.setItem('giftcardsDB', JSON.stringify(baseDeDatosTarjetas));
    alert(`✅ Cobro exitoso. Nuevo saldo: $${tarjeta.saldo_actual}`);
    modalOverlay.style.display = 'none';
    tarjetaActualId = null;
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
    modalOverlay.style.display = 'none';
}

window.onclick = function(event) {
    if (event.target === modalOverlay) modalOverlay.style.display = 'none';
}

// ----------------------------------------------------
// SISTEMA DE EXPORTACIÓN Y FILTROS DE TIEMPO
// ----------------------------------------------------
async function exportarReporte(formato) {
    const filtro = document.getElementById('filtro-tiempo').value;
    const ahora = new Date();
    const limiteInicio = new Date();
    
    // Configuración del filtro de tiempo matemático
    if (filtro === 'hoy') {
        limiteInicio.setHours(0,0,0,0);
    } else if (filtro === 'semana') {
        limiteInicio.setDate(ahora.getDate() - 7);
    } else if (filtro === 'quincena') {
        limiteInicio.setDate(ahora.getDate() - 15);
    } else if (filtro === 'mes') {
        limiteInicio.setMonth(ahora.getMonth() - 1);
    } else {
        limiteInicio.setTime(0); // Todo el historial
    }

    let datosReporte = [];
    let totalDescontado = 0;

    for (const id in baseDeDatosTarjetas) {
        const tarjeta = baseDeDatosTarjetas[id];
        tarjeta.historial_compras.forEach(compra => {
            // Evaluamos la fecha de la compra mediante el timestamp o como texto
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

    if (datosReporte.length === 0) return alert("No hay transacciones registradas en el periodo seleccionado.");

    const fileName = `Reporte_GiftCards_${filtro}_${ahora.getTime()}`;

    if (formato === 'csv') {
        let csvContent = "ID Tarjeta,Fecha de Compra,Monto Descontado,Saldo Restante\n";
        datosReporte.forEach(row => { csvContent += `"${row[0]}","${row[1]}","${row[2]}","${row[3]}"\n`; });
        csvContent += `\n,,TOTAL DESCONTADO:, "$${totalDescontado.toFixed(2)}"\n`;
        
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        await compartirArchivoNativo(blob, `${fileName}.csv`);
    } else {
        if (!window.jspdf) return alert('Librería PDF no detectada.');
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
}

// Emulador Híbrido: Descarga web y puente nativo hacia Android
async function compartirArchivoNativo(blob, fileName) {  
    try {  
        if (window.Capacitor && window.Capacitor.isNative) {  
            const base64Data = await new Promise((resolve, reject) => {  
                const reader = new FileReader(); reader.onerror = reject;  
                reader.onload = () => resolve(reader.result.split(',')[1]);  
                reader.readAsDataURL(blob);  
            });  
            const Filesystem = window.Capacitor.Plugins.Filesystem;  
            const Share = window.Capacitor.Plugins.Share;  
            const writeResult = await Filesystem.writeFile({ path: fileName, data: base64Data, directory: 'CACHE' });  
            await Share.share({  
                title: 'Reporte de Ventas Gift Cards',  
                text: `Se adjunta el reporte solicitado: ${fileName}`,  
                url: writeResult.uri, dialogTitle: 'Compartir Reporte'  
            });  
        } else {  
            const url = URL.createObjectURL(blob); 
            const a = document.createElement("a");  
            a.href = url; a.download = fileName; 
            document.body.appendChild(a); 
            a.click(); 
            document.body.removeChild(a); 
            URL.revokeObjectURL(url);  
        }  
    } catch (err) { alert("Hubo un error al intentar exportar el reporte."); }  
}