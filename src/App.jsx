import React, { useState, useEffect, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Símbolos de Monedas restringidos a Dólares y Bolívares
const CURRENCIES = {
  USD: { symbol: '$', label: 'USD (Dólares)', locale: 'en-US' },
  VES: { symbol: 'Bs.', label: 'VES (Bolívares)', locale: 'es-VE' }
};

export default function App() {
  // --- Estados de Datos de Entrada (Formulario) ---
  const [clienteName, setClienteName] = useState('');
  const [vehiculoModelo, setVehiculoModelo] = useState('');
  const [montoVenta, setMontoVenta] = useState(42000);
  const [montoInicial, setMontoInicial] = useState(12000);
  
  // Estados para comisiones y gastos
  const [porcentajeFlat, setPorcentajeFlat] = useState(0); 
  const [gastosAdmin, setGastosAdmin] = useState(0);

  const [tasaMensual, setTasaMensual] = useState(1.5); 
  const [plazo, setPlazo] = useState(36); 
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().substring(0, 10)); 
  
  // Condiciones particulares del crédito
  const [condiciones, setCondiciones] = useState('Ingrese Condiciones');
  const [sistema, setSistema] = useState('frances'); // 'frances' o 'aleman'
  
  // --- Estados de Configuración ---
  const [currencyKey, setCurrencyKey] = useState('USD');
  const [concesionariaName, setConcesionariaName] = useState('Grupo de Empresas Atef Nemer');
  const [activeTab, setActiveTab] = useState('resumen'); // 'resumen' o 'tabla'
  const [pdfGenerating, setPdfGenerating] = useState(false);
  
  // --- Estados de Control de Descarga del PDF ---
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pendingPdfBlobUrl, setPendingPdfBlobUrl] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  
  // --- Estado de Sistema de Alertas (Toast) ---
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  // Función utilitaria para lanzar alertas
  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 4500);
  };

  // --- CÁLCULOS PRINCIPALES ---
  // 1. Monto base (Vehículo - Pago Inicial) Aseguramos que los inputs puedan ser texto vacío temporalmente
  const montoFinanciarBase = useMemo(() => {
    const venta = Number(montoVenta) || 0;
    const inicial = Number(montoInicial) || 0;
    return Math.max(0, venta - inicial);
  }, [montoVenta, montoInicial]);

  // 2. Comisión Flat calculada sobre el monto base
  const montoComisionFlat = useMemo(() => {
    const Flat = Number(porcentajeFlat) || 0;
    return montoFinanciarBase * (Flat / 100);
  }, [montoFinanciarBase, porcentajeFlat]);

  // 3. Monto total a financiar (Base + Comisión Flat + Gastos Administrativos)
  const montoFinanciar = useMemo(() => {
    const gastos = Number(gastosAdmin) || 0;
    return montoFinanciarBase + montoComisionFlat + gastos;
  }, [montoFinanciarBase, montoComisionFlat, gastosAdmin]);

  const formatCurrency = (value) => {
    const cfg = CURRENCIES[currencyKey] || CURRENCIES.USD;
    return new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: currencyKey,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const financialData = useMemo(() => {
    const P = montoFinanciar;
    const r = (Number(tasaMensual) || 0) / 100;
    const n = Math.max(1, parseInt(plazo) || 1);

    if (P <= 0 || n <= 0) {
      return { schedule: [], totalIntereses: 0, totalPagado: 0, cuotaMensualEstimada: 0 };
    }

    let schedule = [];
    let totalIntereses = 0;
    let saldoCapital = P;

    if (sistema === 'frances') {
      let cuotaFija = 0;
      if (r > 0) {
        cuotaFija = P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      } else {
        cuotaFija = P / n;
      }

      for (let i = 1; i <= n; i++) {
        const interesOrdinario = saldoCapital * r;
        let abonoCapital = cuotaFija - interesOrdinario;
        let cuotaAPagar = cuotaFija;

        if (i === n) {
          abonoCapital = saldoCapital;
          cuotaAPagar = abonoCapital + interesOrdinario;
        }

        const saldoFinal = saldoCapital - abonoCapital;
        totalIntereses += interesOrdinario;

        schedule.push({
          cuotaNro: i,
          saldoCapital,
          abonoCapital,
          interesOrdinario,
          cuotaAPagar,
          saldoFinal: Math.max(0, saldoFinal)
        });

        saldoCapital = saldoFinal;
      }
    } 
    else {
      // Plan B con fórmula especifica utilizada en oshima
      const interesMensualFijo = P * r;
      const abonoCapitalFijo = P / n;
      const cuotaFijaB = abonoCapitalFijo + interesMensualFijo; 

      for (let i = 1; i <= n; i++) {
        let interesOrdinario = interesMensualFijo;
        let abonoCapital = abonoCapitalFijo;
        let cuotaAPagar = cuotaFijaB;
        
        if (i === n) {
          abonoCapital = saldoCapital;
          cuotaAPagar = abonoCapital + interesOrdinario;
        }

        const saldoFinal = saldoCapital - abonoCapital;
        totalIntereses += interesOrdinario;

        schedule.push({
          cuotaNro: i,
          saldoCapital,
          abonoCapital,
          interesOrdinario,
          cuotaAPagar,
          saldoFinal: Math.max(0, saldoFinal)
        });

        saldoCapital = saldoFinal;
      }
    }

    const totalPagado = P + totalIntereses;
    const cuotaMensualEstimada = schedule[0]?.cuotaAPagar || 0;

    return { schedule, totalIntereses, totalPagado, cuotaMensualEstimada };
  }, [montoFinanciar, tasaMensual, plazo, sistema]);

  const getFechaVencimiento = (baseDate, cuotaIndex) => {
    if (!baseDate) return 'N/A';
    try {
      const [year, month, day] = baseDate.split('-').map(Number);
      const targetDate = new Date(year, month - 1 + cuotaIndex, day);
      if (targetDate.getDate() !== day) targetDate.setDate(0);
      return targetDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return baseDate;
    }
  };

  const exportToPDF = () => {
    setPdfGenerating(true);
    showToast('Procesando datos y estructurando reporte...', 'info');

    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // Tema de color Navy por defecto
      const primaryColorRGB = [15, 23, 42];
      const accentColorRGB = [37, 99, 235];

      // --- 1. ENCABEZADO ---
      doc.setFillColor(...primaryColorRGB);
      doc.rect(0, 0, 210, 8, 'F');
      
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...primaryColorRGB);
      doc.text(concesionariaName.toUpperCase(), 15, 20);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Fecha Emisión: ${new Date().toLocaleDateString('es-ES', {hour: '2-digit', minute:'2-digit'})}`, 15, 25);
      doc.text(`Código Control: #AUTO-${Math.floor(100000 + Math.random() * 900000)}`, 15, 29);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...primaryColorRGB);
      doc.text('PLAN DE FINANCIAMIENTO', 15, 42);

      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(...accentColorRGB);
      const strMetodo = sistema === 'frances' ? 'Plan de Financiamiento A' : 'Plan de Financiamiento B';
      doc.text(`Método Aplicado: ${strMetodo}`, 15, 47);

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(15, 51, 195, 51);

      // --- 2. RESUMEN TÉCNICO ---
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...primaryColorRGB);
      doc.text('1. INFORMACIÓN DE LA OPERACIÓN', 15, 58);

      const realMontoVenta = Number(montoVenta) || 0;
      const realMontoInicial = Number(montoInicial) || 0;
      const pFlat = Number(porcentajeFlat) || 0;

      const infoData = [
        [
          { content: 'CLIENTE:', fontStyle: 'bold', textColor: [71, 85, 105] }, clienteName.toUpperCase(),
          { content: 'VEHÍCULO COTIZADO:', fontStyle: 'bold', textColor: [71, 85, 105] }, vehiculoModelo
        ],
        [
          { content: 'VALOR VEHÍCULO:', fontStyle: 'bold', textColor: [71, 85, 105] }, formatCurrency(realMontoVenta),
          { content: 'Pago Inicial (INICIAL):', fontStyle: 'bold', textColor: [71, 85, 105] }, `${formatCurrency(realMontoInicial)} (${((realMontoInicial/(realMontoVenta || 1))*100).toFixed(1)}%)`
        ],
        [
          { content: `COMISIÓN Flat (${pFlat}%):`, fontStyle: 'bold', textColor: [71, 85, 105] }, formatCurrency(montoComisionFlat),
          { content: 'GASTOS ADMINISTRATIVOS:', fontStyle: 'bold', textColor: [71, 85, 105] }, formatCurrency(Number(gastosAdmin) || 0)
        ],
        [
          { content: 'MONTO TOTAL A FINANCIAR:', fontStyle: 'bold', textColor: [15, 23, 42] }, formatCurrency(montoFinanciar),
          { content: 'PLAZO TOTAL:', fontStyle: 'bold', textColor: [71, 85, 105] }, `${plazo} Meses`
        ],
        [
          { content: 'TASA INTERÉS PACTADA:', fontStyle: 'bold', textColor: [71, 85, 105] }, `${Number(tasaMensual) || 0}% Mensual`,
          { content: 'PRIMER VENCIMIENTO:', fontStyle: 'bold', textColor: [71, 85, 105] }, getFechaVencimiento(fechaInicio, 1)
        ]
      ];

      autoTable(doc, {
        body: infoData,
        startY: 61,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2, font: 'Helvetica' },
        columnStyles: { 0: { width: 50, fontStyle: 'bold' }, 1: { width: 45 }, 2: { width: 50, fontStyle: 'bold' }, 3: { width: 45 } }
      });

      let currentY = doc.lastAutoTable.finalY + 4;

      // --- 3. DESTACADO FINANCIERO ---
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(...accentColorRGB);
      doc.setLineWidth(0.4);
      doc.roundedRect(15, currentY, 180, 22, 2, 2, 'FD');

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('ESTIMACIÓN DE CUOTA MENSUAL', 22, currentY + 7);
      doc.text('TOTAL INTERESES GENERADOS', 82, currentY + 7);
      doc.text('TOTAL DE DESEMBOLSO', 142, currentY + 7);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...primaryColorRGB);
      doc.text(formatCurrency(financialData.cuotaMensualEstimada), 22, currentY + 15);
      doc.setTextColor(...accentColorRGB);
      doc.text(formatCurrency(financialData.totalIntereses), 82, currentY + 15);
      doc.setTextColor(...primaryColorRGB);
      doc.text(formatCurrency(financialData.totalPagado), 142, currentY + 15);

      currentY += 28;

      if (condiciones && condiciones.trim() !== '') {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...primaryColorRGB);
        doc.text('CONDICIONES PARTICULARES:', 15, currentY);
        doc.setFont('Helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const splitText = doc.splitTextToSize(condiciones, 180);
        doc.text(splitText, 15, currentY + 4);
        currentY += (splitText.length * 4) + 6;
      }

      // --- 4. TABLA DE AMORTIZACIÓN ---
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...primaryColorRGB);
      doc.text('2. PLAN DE AMORTIZACIÓN DETALLADO', 15, currentY);
      currentY += 3;

      const formatPDFValue = (val) => {
        const cfg = CURRENCIES[currencyKey] || CURRENCIES.USD;
        return new Intl.NumberFormat(cfg.locale, { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
      };

      const headPDF = [['CUOTA NRO.', 'MES VENCIMIENTO', 'SALDO CAPITAL', 'ABONO A CAPITAL', 'INTERESES ORDINARIOS', 'CUOTA A PAGAR']];
      
      const rowsPDF = financialData.schedule.map((row) => [
        row.cuotaNro.toString(),
        getFechaVencimiento(fechaInicio, row.cuotaNro),
        `${CURRENCIES[currencyKey].symbol}${formatPDFValue(row.saldoCapital)}`,
        `${CURRENCIES[currencyKey].symbol}${formatPDFValue(row.abonoCapital)}`,
        `${CURRENCIES[currencyKey].symbol}${formatPDFValue(row.interesOrdinario)}`,
        `${CURRENCIES[currencyKey].symbol}${formatPDFValue(row.cuotaAPagar)}`
      ]);

      const footPDF = [[
        { content: 'TOTALES', colSpan: 2, styles: { halign: 'center' } },
        { content: '', styles: { halign: 'right' } }, // Saldo Capital no se suma
        { content: `${CURRENCIES[currencyKey].symbol}${formatPDFValue(montoFinanciar)}`, styles: { halign: 'right' } }, 
        { content: `${CURRENCIES[currencyKey].symbol}${formatPDFValue(financialData.totalIntereses)}`, styles: { halign: 'right' } },
        { content: `${CURRENCIES[currencyKey].symbol}${formatPDFValue(financialData.totalPagado)}`, styles: { halign: 'right', fontStyle: 'bold' } }
      ]];

      autoTable(doc, {
        head: headPDF, body: rowsPDF, foot: footPDF, startY: currentY, theme: 'striped',
        showFoot: 'lastPage',
        headStyles: { fillColor: primaryColorRGB, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold', halign: 'center', valign: 'middle' },
        bodyStyles: { fontSize: 7.5, font: 'Helvetica', textColor: [51, 65, 85] },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold', halign: 'right' },
        columnStyles: { 0: { halign: 'center', cellWidth: 20 }, 1: { halign: 'center', cellWidth: 35 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
        margin: { top: 15, left: 15, right: 15, bottom: 25 },
        didDrawPage: (data) => {
          doc.setFontSize(7.5); doc.setFont('Helvetica', 'normal'); doc.setTextColor(148, 163, 184);
          doc.setDrawColor(241, 245, 249); doc.setLineWidth(0.3); doc.line(15, 280, 195, 280);
          doc.text('*Precio sujeto a cambio sin previo aviso.', 15, 284);
          doc.text(`Página ${data.pageNumber} de${doc.internal.getNumberOfPages()}`, 195, 284, { align: 'right' });
        }
      });

      let finalY = doc.lastAutoTable.finalY;

      // --- 5. FIRMAS ---
      if (finalY > 230) { doc.addPage(); finalY = 25; } else { finalY += 15; }

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...primaryColorRGB);
      doc.text('3. CONFORMIDAD Y FIRMAS', 15, finalY);

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      
      doc.line(20, finalY + 22, 90, finalY + 22);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('FIRMA CLIENTE SOLICITANTE', 55, finalY + 26, { align: 'center' });
      doc.setFont('Helvetica', 'bold');
      doc.text(clienteName.toUpperCase(), 55, finalY + 30, { align: 'center' });

      doc.line(120, finalY + 22, 190, finalY + 22);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('REPRESENTANTE FINANCIERO', 155, finalY + 26, { align: 'center' });
      doc.setFont('Helvetica', 'bold');
      doc.text(concesionariaName.toUpperCase(), 155, finalY + 30, { align: 'center' });

      const cleanFileName = `Plan de Financimiento ${clienteName.replace(/\s+/g, ' ') || 'Auto'}.pdf`;
      const blob = doc.output('blob');
      const blobURL = URL.createObjectURL(blob);

      setPendingPdfBlobUrl(blobURL);
      setPdfFileName(cleanFileName);
      setShowPdfModal(true);
      showToast('Documento PDF compilado con éxito.', 'success');

    } catch (error) {
      console.error('Error generando PDF:', error);
      showToast('Error en la estructura interna del PDF. Reintente.', 'error');
    } finally {
      setPdfGenerating(false);
    }
  };

  const triggerDirectDownload = () => {
    if (!pendingPdfBlobUrl) return;
    const downloadLink = document.createElement('a');
    downloadLink.href = pendingPdfBlobUrl;
    downloadLink.download = pdfFileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    showToast('Descarga del PDF iniciada.', 'success');
  };

  const triggerOpenTab = () => {
    if (!pendingPdfBlobUrl) return;
    const newWindow = window.open(pendingPdfBlobUrl, '_blank');
    if (!newWindow) window.location.href = pendingPdfBlobUrl;
  };

  const realMontoVenta = Number(montoVenta) || 0;
  const realMontoInicial = Number(montoInicial) || 0;
  const montoTotalReferencia = (realMontoVenta + montoComisionFlat + (Number(gastosAdmin) || 0) + financialData.totalIntereses) || 1;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col">
      <header className="bg-slate-900 text-white shadow-xl py-5 px-6 transition-colors duration-300">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2">
                APP WEB<span className="font-light text-slate-300">FINANCIERA</span>
              </h1>
              <p className="text-xs text-slate-300">Plataforma para Cálculo & Planificación Financiera</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/10">
            <div className="flex items-center space-x-1">
              <span className="text-[10px] uppercase font-bold text-slate-300 px-1">Divisa:</span>
              <select 
                value={currencyKey} 
                onChange={(e) => setCurrencyKey(e.target.value)}
                className="bg-slate-800 text-xs text-white rounded-lg border border-slate-700 py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
              >
                {Object.keys(CURRENCIES).map((key) => (
                  <option key={key} value={key}>{key} ({CURRENCIES[key].symbol})</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 xl:col-span-4 flex flex-col gap-5">
          <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
              <h2 className="font-bold text-sm tracking-wide uppercase flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Parámetros del Crédito
              </h2>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono">Entrada</span>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre Completo del Cliente</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <input type="text" value={clienteName} onChange={(e) => setClienteName(e.target.value)} placeholder="Ej. Alejandro Silva" className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Concesionaria Emisora</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </span>
                  <input type="text" value={concesionariaName} onChange={(e) => setConcesionariaName(e.target.value)} placeholder="Nombre del Concesionario" className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Vehículo (Marca / Modelo)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <input type="text" value={vehiculoModelo} onChange={(e) => setVehiculoModelo(e.target.value)} placeholder="Ej. Toyota RAV4 Hybrid" className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors focus:outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Monto de Venta</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 text-xs font-bold">{CURRENCIES[currencyKey].symbol}</span>
                    <input 
                      type="number" 
                      value={montoVenta} 
                      onChange={(e) => { 
                        const val = e.target.value;
                        if(val === '') { setMontoVenta(''); return; }
                        const num = parseFloat(val); 
                        setMontoVenta(num); 
                        if ((Number(montoInicial) || 0) > num) setMontoInicial(num); 
                      }} 
                      className="w-full pl-7 pr-2 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none font-bold" 
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Monto Inicial</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 text-xs font-bold">{CURRENCIES[currencyKey].symbol}</span>
                    <input 
                      type="number" 
                      value={montoInicial} 
                      onChange={(e) => { 
                        const val = e.target.value;
                        if(val === '') { setMontoInicial(''); return; }
                        const num = parseFloat(val); 
                        if (num <= (Number(montoVenta) || 0)) { 
                          setMontoInicial(num); 
                        } else { 
                          setMontoInicial(Number(montoVenta) || 0); 
                          showToast('El Pago Inicial no puede superar el costo.', 'warning'); 
                        } 
                      }} 
                      className="w-full pl-7 pr-2 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none font-bold text-emerald-700" 
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-3">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-500">Pago Inicial:</span>
                    <span className="font-bold text-emerald-600">{((realMontoInicial / (realMontoVenta || 1)) * 100).toFixed(1)}% del valor</span>
                  </div>
                  {/* Slider arreglado: con step="1" para que no salte, ni fuerce el redondeo en bloques raros */}
                  <input 
                    type="range" 
                    min="0" 
                    max={realMontoVenta} 
                    step="1" 
                    value={realMontoInicial} 
                    onChange={(e) => setMontoInicial(parseFloat(e.target.value) || 0)} 
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600" 
                  />
                </div>
              </div>

              {/* SECCIÓN NUEVA: Gastos extra que se suman al financiamiento */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Comisión Flat (%)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="0.1" 
                      value={porcentajeFlat} 
                      onChange={(e) => {
                        const val = e.target.value;
                        if(val === '') { setPorcentajeFlat(''); return; }
                        setPorcentajeFlat(Math.max(0, parseFloat(val)));
                      }} 
                      className="w-full pl-3 pr-7 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none font-bold text-slate-700" 
                      placeholder="0.0" 
                    />
                    <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 text-xs font-bold">%</span>
                  </div>
                  {Number(porcentajeFlat) > 0 && (
                    <div className="text-[10px] text-slate-500 font-medium mt-1 text-right">
                      + {formatCurrency(montoComisionFlat)}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Gastos Admin.</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 text-xs font-bold">{CURRENCIES[currencyKey].symbol}</span>
                    <input 
                      type="number" 
                      value={gastosAdmin} 
                      onChange={(e) => {
                        const val = e.target.value;
                        if(val === '') { setGastosAdmin(''); return; }
                        setGastosAdmin(Math.max(0, parseFloat(val)));
                      }} 
                      className="w-full pl-7 pr-2 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none font-bold text-slate-700" 
                      placeholder="0" 
                    />
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex justify-between items-center shadow-inner">
                <div>
                  <span className="block text-[10px] font-bold text-blue-500 uppercase tracking-wider">Monto a Financiar</span>
                  <span className="text-[10px] text-slate-500 leading-tight block">(Base + Comisiones + Admin)</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-blue-700 font-mono">{formatCurrency(montoFinanciar)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tasa Interés (% Mensual)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={tasaMensual} 
                      onChange={(e) => {
                        const val = e.target.value;
                        if(val === '') { setTasaMensual(''); return; }
                        setTasaMensual(Math.max(0, parseFloat(val)));
                      }} 
                      className="w-full pl-3 pr-7 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none font-bold" 
                    />
                    <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 text-xs font-bold">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Plazo (Meses)</label>
                  <input 
                    type="number" 
                    min="1" max="120" 
                    value={plazo} 
                    onChange={(e) => { 
                      const val = e.target.value;
                      if(val === '') { setPlazo(''); return; }
                      const num = parseInt(val); 
                      setPlazo(isNaN(num) ? '' : Math.max(1, num)); 
                    }} 
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none font-bold" 
                    placeholder="Mínimo 1 mes" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Plan de Financiamiento</label>
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button type="button" onClick={() => setSistema('frances')} className={`flex-1 text-center py-2 px-1 text-[10px] rounded-lg font-bold transition-all leading-tight ${sistema === 'frances' ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700' : 'text-slate-600 hover:text-slate-900'}`}>
                      Plan de Financiamiento A
                    </button>
                    <button type="button" onClick={() => setSistema('aleman')} className={`flex-1 text-center py-2 px-1 text-[10px] rounded-lg font-bold transition-all leading-tight ${sistema === 'aleman' ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700' : 'text-slate-600 hover:text-slate-900'}`}>
                      Plan de Financiamiento B
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha de Primer Pago</label>
                  <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full px-2.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none cursor-pointer" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Condiciones del Financiamiento</label>
                <textarea value={condiciones} onChange={(e) => setCondiciones(e.target.value)} rows="3" className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 focus:outline-none text-slate-600" placeholder="Condiciones o normativas aplicables..." />
              </div>
            </div>
          </div>
        </section>

        <section className="lg:col-span-7 xl:col-span-8 flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-2 rounded-2xl shadow-sm border border-slate-200 gap-3">
            <div className="flex space-x-1.5 bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setActiveTab('resumen')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'resumen' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                Resumen Financiero y Gráficos
              </button>
              <button onClick={() => setActiveTab('tabla')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === 'tabla' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                Plan de Amortización ({plazo || 0})
              </button>
            </div>

            <button onClick={exportToPDF} disabled={pdfGenerating || financialData.schedule.length === 0} className={`px-4 py-2.5 rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 ${pdfGenerating ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
              {pdfGenerating ? 'Creando Reporte...' : 'Exportar a PDF'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wide">Cuota ({sistema === 'frances' ? 'Plan A' : 'Plan B Fija'})</span>
              <span className="text-lg font-extrabold text-slate-900 block mt-1.5 font-mono">{formatCurrency(financialData.cuotaMensualEstimada)}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wide">Financiado Total</span>
              <span className="text-lg font-extrabold text-slate-900 block mt-1.5 font-mono">{formatCurrency(montoFinanciar)}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wide">Intereses</span>
              <span className="text-lg font-extrabold text-blue-600 block mt-1.5 font-mono">{formatCurrency(financialData.totalIntereses)}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wide">Desembolso Total</span>
              <span className="text-lg font-extrabold text-slate-900 block mt-1.5 font-mono">{formatCurrency(financialData.totalPagado)}</span>
            </div>
          </div>

          {activeTab === 'resumen' && (
            <div className="flex flex-col gap-5">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <h3 className="font-bold text-sm uppercase tracking-wider text-slate-700 mb-3">Datos de Control</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Cliente Solicitante:</span>
                    <strong className="text-slate-800 uppercase">{clienteName || 'No indicado'}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Vehículo:</span>
                    <strong className="text-slate-800">{vehiculoModelo || 'No indicado'}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Precio Venta:</span>
                    <strong className="text-slate-800">{formatCurrency(realMontoVenta)}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Pago Inicial:</span>
                    <strong className="text-slate-800">{formatCurrency(realMontoInicial)}</strong>
                  </div>
                  
                  {/* Filas de datos de control para las comisiones */}
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Comisión Flat ({Number(porcentajeFlat) || 0}%):</span>
                    <strong className="text-slate-800">{formatCurrency(montoComisionFlat)}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Gastos Administrativos:</span>
                    <strong className="text-slate-800">{formatCurrency(Number(gastosAdmin) || 0)}</strong>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Total a Financiar:</span>
                    <strong className="text-blue-600 font-bold">{formatCurrency(montoFinanciar)}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">Plazo:</span>
                    <strong className="text-slate-800">{plazo || 0} Meses</strong>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <h4 className="font-bold text-xs uppercase text-slate-500 tracking-wider mb-4">Estructura Global de Costos</h4>
                <div className="flex flex-col space-y-4 py-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Pago Inicial (Pago Inicial)</span>
                      <span className="font-bold">{formatCurrency(realMontoInicial)}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full" style={{ width: `${(realMontoInicial/montoTotalReferencia)*100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Capital Financiado (Base + Comisiones)</span>
                      <span className="font-bold">{formatCurrency(montoFinanciar)}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full" style={{ width: `${(montoFinanciar/montoTotalReferencia)*100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Intereses Totales</span>
                      <span className="font-bold text-amber-600">{formatCurrency(financialData.totalIntereses)}</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full" style={{ width: `${(financialData.totalIntereses/montoTotalReferencia)*100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tabla' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4 text-center">Cuota Nro.</th>
                      <th className="py-3 px-4">Mes Vencimiento</th>
                      <th className="py-3 px-4 text-right">Saldo Capital</th>
                      <th className="py-3 px-4 text-right">Abono a Capital</th>
                      <th className="py-3 px-4 text-right">Intereses Ordinarios</th>
                      <th className="py-3 px-4 text-right bg-slate-150 font-bold">Cuota a Pagar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-mono">
                    {financialData.schedule.map((row) => (
                      <tr key={row.cuotaNro} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-center font-bold text-slate-400">{row.cuotaNro}</td>
                        <td className="py-3 px-4 font-semibold text-slate-700 font-sans">{getFechaVencimiento(fechaInicio, row.cuotaNro)}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(row.saldoCapital)}</td>
                        <td className="py-3 px-4 text-right text-emerald-700 font-bold">{formatCurrency(row.abonoCapital)}</td>
                        <td className="py-3 px-4 text-right text-amber-600 font-bold">{formatCurrency(row.interesOrdinario)}</td>
                        <td className="py-3 px-4 text-right font-extrabold text-slate-950 bg-slate-50/50">{formatCurrency(row.cuotaAPagar)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-150 border-t-2 border-slate-300 text-xs font-mono">
                    <tr className="font-extrabold text-slate-800">
                      <td colSpan="2" className="py-3 px-4 text-center font-sans uppercase">TOTALES</td>
                      <td className="py-3 px-4 text-right"></td>
                      <td className="py-3 px-4 text-right text-emerald-700">{formatCurrency(montoFinanciar)}</td>
                      <td className="py-3 px-4 text-right text-amber-700">{formatCurrency(financialData.totalIntereses)}</td>
                      <td className="py-3 px-4 text-right bg-slate-200/50">{formatCurrency(financialData.totalPagado)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="bg-slate-900 border-t border-slate-800 py-6 px-6 mt-10 text-slate-400 text-xs text-center">
        <p>© 2026 Plan de Financiamiento JP.</p>
      </footer>

      {showPdfModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 text-center overflow-hidden">
            <h3 className="text-lg font-bold text-slate-900">¡Plan de Amortización Generado!</h3>
            <p className="text-xs text-slate-500 mt-2 px-2">Se ha preparado la estructura completa del plan de financiamiento para <strong className="text-slate-800">{clienteName}</strong>.</p>
            <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3 my-4 text-left font-mono text-[11px] text-slate-600 flex flex-col gap-1.5">
              <div><strong>Archivo:</strong> {pdfFileName}</div>
              <div><strong>Cliente:</strong> {clienteName.toUpperCase()}</div>
              <div><strong>Monto:</strong> {formatCurrency(montoFinanciar)} ({plazo} meses)</div>
            </div>
            <div className="flex flex-col gap-2.5">
              <button onClick={triggerDirectDownload} className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors">Descargar Documento PDF</button>
              <button onClick={triggerOpenTab} className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors">Ver / Compartir en Nueva Pestaña</button>
              <button onClick={() => { setShowPdfModal(false); if (pendingPdfBlobUrl) { URL.revokeObjectURL(pendingPdfBlobUrl); setPendingPdfBlobUrl(''); } }} className="w-full py-2.5 px-4 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">Cerrar Ventana</button>
            </div>
          </div>
        </div>
      )}

      {toast.show && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 px-5 py-4 max-w-sm flex items-start space-x-3">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Mensaje del Sistema</p>
            <p className="text-xs text-slate-400 mt-0.5">{toast.message}</p>
          </div>
          <button onClick={() => setToast(prev => ({ ...prev, show: false }))} className="text-slate-400 hover:text-white text-xs font-bold px-1">×</button>
        </div>
      )}
    </div>
  );
}