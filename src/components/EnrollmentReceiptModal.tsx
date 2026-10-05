import React, { useState, useEffect } from 'react';
import { X, Printer, CheckCircle2, Copy, FileText } from 'lucide-react';
import { formatCurrency, formatDateForDisplay, formatRegistrationNumber, cn } from '../lib/utils';
import { Student, Class } from '../types';
import { DEFAULT_LOGO } from '../lib/default-logo';
import { getInstitutionSettings } from '../lib/database';

interface EnrollmentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  classItem?: Class | null;
  institution?: any;
  feeAmount: number;
  feeStatus: 'paid' | 'pending' | 'exempt';
  paymentMethod?: string;
  paymentDate?: string;
  observations?: string;
  unitName?: string;
  isNew?: boolean;
}

export const EnrollmentReceiptModal: React.FC<EnrollmentReceiptModalProps> = ({
  isOpen,
  onClose,
  student,
  classItem,
  institution,
  feeAmount,
  feeStatus,
  paymentMethod = 'Dinheiro',
  paymentDate,
  observations,
  unitName,
  isNew = false
}) => {
  const [copies, setCopies] = useState<1 | 2>(2);
  const [instSettings, setInstSettings] = useState<any>(institution || null);
  const [includeMessage, setIncludeMessage] = useState<boolean>(true);
  const [isPrintingDirect, setIsPrintingDirect] = useState<boolean>(false);

  useEffect(() => {
    if (institution) {
      setInstSettings(institution);
      if (institution.show_enrollment_receipt_message !== undefined) {
        setIncludeMessage(institution.show_enrollment_receipt_message !== false);
      }
    } else {
      getInstitutionSettings()
        .then((data) => {
          if (data) {
            setInstSettings(data);
            if (data.show_enrollment_receipt_message !== undefined) {
              setIncludeMessage(data.show_enrollment_receipt_message !== false);
            }
          }
        })
        .catch((err) => console.warn('Não foi possível carregar configurações da instituição:', err));
    }
  }, [institution]);

  if (!isOpen || !student) return null;

  const currentYear = classItem?.start_year || new Date().getFullYear();
  const rawReg = (student.registration_number || student.id.slice(0, 6)).replace(/\//g, '');
  const receiptNumber = `MAT-${rawReg}-${currentYear}`;
  const effectivePaymentDate = paymentDate || new Date().toISOString().split('T')[0];

  const instName = (instSettings?.name || 'ESCOLA DIOCESANA DE MINISTÉRIO').toUpperCase();
  const instAddress = instSettings?.address || 'Av. Venus, 195 - Itapegica - Guarulhos/SP';
  const instLogo = instSettings?.logo_url || DEFAULT_LOGO;
  const instPhone = instSettings?.phone || '(11) 2421-2935';
  const instEmail = instSettings?.email ? instSettings.email.toLowerCase() : 'email@email.com.br';
  const receiptMsg = instSettings?.enrollment_receipt_message || instSettings?.receipt_message || 'Contribuição recebida com gratidão para a formação teológica e espiritual. Este valor apoia a missão educativa da escola e o desenvolvimento dos alunos. Deus lhe recompense pela generosidade e confiança.';

  const viasToRender = copies === 1 ? [1] : [1, 2];

  /**
   * Constrói o HTML puro de uma via no padrão idêntico ao Recibo de Contribuição (Contributions.tsx)
   * Sem as duas linhas de registro do sistema e emissão.
   */
  const generateViaHtml = (via: number, activeCopies: 1 | 2 = copies) => {
    const viaLabel = activeCopies === 1
      ? 'VIA ÚNICA'
      : via === 1
        ? 'VIA ESCOLA'
        : 'VIA ALUNO';

    const courseName = (classItem?.course || student.course || 'TEOLOGIA').toUpperCase();
    const className = (classItem?.name || `${courseName} ${currentYear}`).toUpperCase();
    const studentFullName = student.name.toUpperCase();
    const studentReg = formatRegistrationNumber(student.registration_number);

    return `
      <div class="receipt-via">
        <!-- Header Recibo -->
        <div class="receipt-header">
          <div class="receipt-header-left">
            <div class="receipt-logo">
              <img src="${instLogo}" alt="Logo" class="logo-img" />
            </div>
            <div class="receipt-inst-info">
              <h4 class="inst-title">${instName}</h4>
              <p class="inst-addr">${instAddress}</p>
              <div class="inst-contacts">
                ${instPhone ? `<span>TEL: ${instPhone}</span>` : ''}
                ${instEmail ? `<span>email: ${instEmail}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="receipt-vertical-via">
            <span>${viaLabel}</span>
          </div>
        </div>

        <div class="header-divider"></div>

        <!-- Título Centralizado -->
        <div class="receipt-title-box">
          <h2 class="receipt-title">RECIBO DE MATRÍCULA</h2>
        </div>

        <div class="receipt-body">
          <!-- Box Aluno e Turma -->
          <div class="student-card">
            <div class="card-accent-bar"></div>
            <div class="student-col">
              <p class="col-label">MATRICULA / ALUNO(A)</p>
              <p class="col-value">${studentReg} - ${studentFullName}</p>
            </div>
            <div class="turma-col">
              <p class="col-label">TURMA ACADÊMICA</p>
              <p class="col-value">${className}</p>
            </div>
          </div>

          <!-- Grid Financeiro -->
          <div class="grid-finance">
            <div class="table-container">
              <table class="finance-table">
                <thead>
                  <tr>
                    <th>MÊS / ANO</th>
                    <th>VALOR</th>
                    <th>MODO</th>
                    <th>DATA PAGTO.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="td-bold">Matr. / ${currentYear}</td>
                    <td class="td-bold">${formatCurrency(feeAmount)}</td>
                    <td class="td-muted">${paymentMethod}</td>
                    <td class="td-date">${formatDateForDisplay(effectivePaymentDate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="table-container">
              <table class="finance-table empty-table">
                <thead>
                  <tr>
                    <th>MÊS / ANO</th>
                    <th>VALOR</th>
                    <th>MODO</th>
                    <th>DATA PAGTO.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colspan="4" style="color: transparent;">&nbsp;</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Mensagem e Total (Mensagem condicional com base na chave de configuração) -->
          ${includeMessage ? `
            <div class="grid-summary">
              <div class="msg-box">
                <span class="msg-label">MENSAGEM / AVISO DE MATRÍCULA</span>
                <p class="msg-text">${receiptMsg}</p>
              </div>
              <div class="total-box">
                <span class="total-label">TOTAL DAS CONTRIBUIÇÕES</span>
                <span class="total-value">${formatCurrency(feeAmount)}</span>
              </div>
            </div>
          ` : `
            <div class="grid-summary-single">
              <div class="total-box full-width">
                <span class="total-label">TOTAL DA TAXA DE MATRÍCULA</span>
                <span class="total-value">${formatCurrency(feeAmount)}</span>
              </div>
            </div>
          `}

          <div class="footer-divider"></div>

          <!-- Rodapé de Recebimento e Assinatura (Sem as linhas de Registro no Sistema e Emissão) -->
          <div class="receipt-footer">
            <div class="footer-meta-texts">
              <p>Data do Recebimento: ${formatDateForDisplay(effectivePaymentDate)}</p>
              <p>Modo de Pagamento: Pagamento Direto (${paymentMethod})</p>
            </div>
            <div class="signature-box">
              <div class="sig-line"></div>
              <p class="sig-label">RESPONSÁVEL / TESOURARIA</p>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  /**
   * Executa a impressão física da opção de vias escolhida
   */
  const handleConfirmPrint = () => {
    setIsPrintingDirect(true);

    try {
      let iframe = document.getElementById('enrollment-print-iframe') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'enrollment-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.zIndex = '-9999';
        document.body.appendChild(iframe);
      }

      const via1 = generateViaHtml(1, copies);
      const via2 = copies === 2 ? generateViaHtml(2, copies) : '';

      const cutLineHtml = copies === 2 ? `
        <div class="cut-divider">
          <div class="cut-dashed-line">
            <span class="cut-text">✂️ CORTE AQUI ✂️</span>
          </div>
        </div>
      ` : '';

      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Recibo de Matrícula - ${student.name}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm 12mm 8mm 12mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #000000;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            .page-container {
              width: 100%;
              max-width: 190mm;
              margin: 0 auto;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
            }
            .receipt-via {
              background: #ffffff;
              padding: 12px 16px;
              position: relative;
              page-break-inside: avoid;
              break-inside: avoid;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              margin-bottom: ${copies === 2 ? '4px' : '0'};
            }
            .receipt-header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              position: relative;
              margin-bottom: 6px;
            }
            .receipt-header-left {
              display: flex;
              align-items: center;
              gap: 16px;
            }
            .receipt-logo {
              width: 52px;
              height: 52px;
              flex-shrink: 0;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .logo-img {
              max-width: 100%;
              max-height: 100%;
              object-fit: contain;
            }
            .receipt-inst-info {
              display: flex;
              flex-direction: column;
              gap: 2px;
            }
            .inst-title {
              font-size: 15px;
              font-weight: 900;
              color: #00174b;
              text-transform: uppercase;
              letter-spacing: -0.3px;
              margin: 0;
              line-height: 1.1;
            }
            .inst-addr {
              font-size: 9px;
              font-weight: 700;
              color: #64748b;
              margin: 0;
              line-height: 1.2;
            }
            .inst-contacts {
              font-size: 8px;
              font-weight: 700;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              display: flex;
              gap: 12px;
              margin: 0;
            }
            .receipt-vertical-via {
              position: absolute;
              right: 0;
              top: 50%;
              transform: translateY(-50%);
              opacity: 0.35;
              user-select: none;
            }
            .receipt-vertical-via span {
              font-size: 8px;
              font-weight: 900;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.4em;
              writing-mode: vertical-rl;
              transform: rotate(180deg);
              display: block;
              padding: 8px 0;
            }
            .header-divider {
              width: 100%;
              height: 1px;
              background-color: #f1f5f9;
              margin-bottom: 6px;
            }
            .receipt-title-box {
              text-align: center;
              margin-bottom: 8px;
            }
            .receipt-title {
              font-size: 15px;
              font-weight: 900;
              color: #00174b;
              text-transform: uppercase;
              letter-spacing: 0.2em;
              display: inline-block;
              border-bottom: 2px solid #00174b;
              padding-bottom: 2px;
              margin: 0;
            }
            .receipt-body {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .student-card {
              background-color: #f8fafc;
              padding: 10px 14px;
              border-radius: 10px;
              border: 1px solid #f1f5f9;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 16px;
              position: relative;
              overflow: hidden;
            }
            .card-accent-bar {
              position: absolute;
              left: 0;
              top: 0;
              width: 5px;
              height: 100%;
              background-color: #2563eb;
            }
            .col-label {
              font-size: 9px;
              font-weight: 900;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              margin: 0 0 3px 0;
            }
            .col-value {
              font-size: 12px;
              font-weight: 900;
              color: #00174b;
              margin: 0;
              text-transform: uppercase;
            }
            .grid-finance {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }
            .table-container {
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              overflow: hidden;
              min-height: 80px;
              background: #ffffff;
            }
            .finance-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10px;
              text-align: center;
              height: 100%;
            }
            .finance-table thead {
              background-color: #f8fafc;
              border-bottom: 1px solid #e2e8f0;
            }
            .finance-table th {
              padding: 6px 4px;
              font-weight: 900;
              color: #64748b;
              text-transform: uppercase;
              font-size: 8.5px;
              line-height: 1;
              border-left: 1px solid #e2e8f0;
            }
            .finance-table th:first-child {
              border-left: none;
            }
            .finance-table td {
              padding: 8px 4px;
              border-left: 1px solid #f1f5f9;
            }
            .finance-table td:first-child {
              border-left: none;
            }
            .td-bold {
              font-weight: 900;
              color: #131b2e;
            }
            .td-muted {
              font-size: 9px;
              font-weight: 600;
              color: #475569;
            }
            .td-date {
              font-weight: 900;
              color: #00174b;
            }
            .grid-summary {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }
            .grid-summary-single {
              display: flex;
              width: 100%;
            }
            .msg-box {
              background-color: #f8fafc;
              padding: 8px 12px;
              border-radius: 10px;
              border: 1px solid #f1f5f9;
              display: flex;
              flex-direction: column;
              justify-content: center;
              min-height: 52px;
            }
            .msg-label {
              font-size: 7.5px;
              font-weight: 900;
              color: #94a3b8;
              text-transform: uppercase;
              margin-bottom: 3px;
            }
            .msg-text {
              font-size: 8.5px;
              font-weight: 600;
              color: #475569;
              line-height: 1.25;
              margin: 0;
            }
            .total-box {
              background-color: #eff6ff;
              padding: 8px 16px;
              border-radius: 10px;
              border: 1px solid #dbeafe;
              display: flex;
              justify-content: space-between;
              align-items: center;
              min-height: 52px;
            }
            .total-box.full-width {
              width: 100%;
            }
            .total-label {
              font-size: 9.5px;
              font-weight: 900;
              color: #1e3a8a;
              text-transform: uppercase;
            }
            .total-value {
              font-size: 17px;
              font-weight: 900;
              color: #1e3a8a;
              font-family: monospace;
            }
            .footer-divider {
              width: 100%;
              height: 1px;
              background-color: #f1f5f9;
              margin: 6px 0;
            }
            .receipt-footer {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              padding-top: 2px;
            }
            .footer-meta-texts {
              display: flex;
              flex-direction: column;
              gap: 2px;
            }
            .footer-meta-texts p {
              margin: 0;
              font-size: 8.5px;
              font-weight: 700;
              color: #64748b;
            }
            .signature-box {
              text-align: center;
              width: 190px;
            }
            .sig-line {
              border-bottom: 1px solid #94a3b8;
              margin-bottom: 3px;
            }
            .sig-label {
              margin: 0;
              font-size: 8px;
              font-weight: 900;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .cut-divider {
              width: 100%;
              margin: 8px 0;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .cut-dashed-line {
              width: 100%;
              border-bottom: 1.5px dashed #94a3b8;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .cut-text {
              background: #ffffff;
              padding: 0 12px;
              font-size: 8px;
              font-weight: 900;
              color: #64748b;
              text-transform: uppercase;
              transform: translateY(50%);
            }
          </style>
        </head>
        <body>
          <div class="page-container">
            ${via1}
            ${cutLineHtml}
            ${via2}
          </div>
        </body>
        </html>
      `;

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(fullHtml);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (err) {
            console.warn('Erro ao acionar impressão via iframe, executando window.print():', err);
            window.print();
          } finally {
            setIsPrintingDirect(false);
          }
        }, 250);
      } else {
        window.print();
        setIsPrintingDirect(false);
      }
    } catch (error) {
      console.error('Falha na impressão isolada, recorrendo a window.print():', error);
      window.print();
      setIsPrintingDirect(false);
    }
  };

  /**
   * Componente de visualização do recibo na tela com o visual idêntico ao modelo de contribuição
   * Sem as duas linhas de registro no sistema e emissão.
   */
  const renderContributionPatternVia = (via: number) => {
    const viaLabel = copies === 1
      ? 'VIA ÚNICA'
      : via === 1
        ? 'VIA ESCOLA'
        : 'VIA ALUNO';

    const courseName = (classItem?.course || student.course || 'TEOLOGIA').toUpperCase();
    const className = (classItem?.name || `${courseName} ${currentYear}`).toUpperCase();
    const studentFullName = student.name.toUpperCase();
    const studentReg = formatRegistrationNumber(student.registration_number);

    return (
      <div 
        key={via}
        className="bg-white p-6 sm:p-8 border border-slate-200 rounded-xl relative overflow-hidden shadow-xs mb-3"
      >
        {/* Header Recibo Oficial */}
        <div className="flex items-start justify-between relative mb-2">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 shrink-0 flex items-center justify-center">
              <img 
                src={instLogo} 
                alt="Logo" 
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if ((e.currentTarget as HTMLImageElement).src !== DEFAULT_LOGO) {
                    (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO;
                  }
                }}
              />
            </div>
            
            <div className="space-y-0.5">
              <h4 className="text-base sm:text-lg font-black text-[#00174b] uppercase tracking-tight leading-tight">
                {instName}
              </h4>
              <p className="text-[9px] text-slate-500 font-bold max-w-md leading-relaxed">
                {instAddress}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[8px] text-slate-400 font-bold uppercase tracking-wider">
                {instPhone && <span>TEL: {instPhone}</span>}
                {instEmail && <span className="lowercase">email: {instEmail}</span>}
              </div>
            </div>
          </div>
          
          {/* Rótulo da Via em texto vertical na lateral direita */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-35 select-none pointer-events-none">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.4em] [writing-mode:vertical-rl] rotate-180 py-4 block">
              {viaLabel}
            </span>
          </div>
        </div>

        <div className="w-full h-px bg-slate-100 mb-2" />
      
        {/* Título Centralizado com Borda */}
        <div className="text-center mb-3">
          <h2 className="text-base sm:text-lg font-black text-[#00174b] uppercase tracking-[0.2em] inline-block border-b-2 border-[#00174b] pb-0.5">
            Recibo de Matrícula
          </h2>
        </div>

        <div className="space-y-3">
          {/* Card Aluno e Turma com Barra Azul Lateral */}
          <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 relative overflow-hidden">
            <div className="absolute left-0 top-0 w-1.5 h-full bg-blue-600"></div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] mb-1">
                Matricula / Aluno(a)
              </p>
              <p className="text-xs sm:text-sm font-black text-[#00174b]">
                {studentReg} - {studentFullName}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] mb-1">
                Turma Acadêmica
              </p>
              <p className="text-xs sm:text-sm font-black text-[#00174b]">
                {className}
              </p>
            </div>
          </div>

          {/* Grid de 2 Colunas com a Tabela de Pagamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="border border-slate-200 rounded-xl overflow-hidden min-h-[100px] bg-white">
              <table className="w-full text-xs text-center h-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-2 font-black text-slate-500 uppercase leading-none text-[9px]">Mês / Ano</th>
                    <th className="py-2.5 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Valor</th>
                    <th className="py-2.5 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Modo</th>
                    <th className="py-2.5 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Data Pagto.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-bold text-[#131b2e]">
                    <td className="py-2.5 px-2 text-[10px]">Matr. / {currentYear}</td>
                    <td className="py-2.5 px-2 border-l border-slate-100 text-[10px]">{formatCurrency(feeAmount)}</td>
                    <td className="py-2.5 px-2 border-l border-slate-100 text-[9px] font-semibold text-slate-600">
                      {paymentMethod}
                    </td>
                    <td className="py-2.5 px-2 border-l border-slate-100 text-[#00174b] text-[10px]">{formatDateForDisplay(effectivePaymentDate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden min-h-[100px] bg-white hidden sm:block">
              <table className="w-full text-xs text-center h-full opacity-60">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-2 font-black text-slate-500 uppercase leading-none text-[9px]">Mês / Ano</th>
                    <th className="py-2.5 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Valor</th>
                    <th className="py-2.5 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Modo</th>
                    <th className="py-2.5 px-2 font-black text-slate-500 uppercase border-l border-slate-200 leading-none text-[9px]">Data Pagto.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={4} className="py-5 text-slate-300 font-mono text-[9px]">
                      ---
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Mensagem Institucional e Total */}
          {includeMessage ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col justify-center px-4 min-h-[55px]">
                <span className="text-[8px] font-black text-slate-400 uppercase mb-1">Mensagem / Aviso de Matrícula</span>
                <p className="text-[9px] font-semibold text-slate-600 leading-tight">
                  {receiptMsg}
                </p>
              </div>
              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 flex justify-between items-center px-5 sm:px-6 min-h-[55px]">
                <span className="text-[10px] font-black text-blue-900 uppercase">Total das Contribuições</span>
                <span className="text-lg sm:text-xl font-black text-blue-900">{formatCurrency(feeAmount)}</span>
              </div>
            </div>
          ) : (
            <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-100 flex justify-between items-center px-6">
              <span className="text-xs font-black text-blue-900 uppercase">Total da Taxa de Matrícula</span>
              <span className="text-xl font-black text-blue-900">{formatCurrency(feeAmount)}</span>
            </div>
          )}

          <div className="w-full h-px bg-slate-100 my-2" />

          {/* Metadados de Recebimento e Assinatura (Removidas as duas linhas de Registro no Sistema e Emissão) */}
          <div className="flex justify-between items-end pt-1">
            <div className="space-y-0.5">
              <p className="text-[8px] font-bold text-slate-500">Data do Recebimento: {formatDateForDisplay(effectivePaymentDate)}</p>
              <p className="text-[8px] font-bold text-slate-500">Modo de Pagamento: Pagamento Direto ({paymentMethod})</p>
            </div>
            <div className="text-center">
              <div className="w-48 border-b border-slate-400 mb-1"></div>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Responsável / Tesouraria</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 1. Modal Interativo com Escolha de Vias Exatamente como em Recibos e Visualização */}
      <div className="fixed inset-0 z-[250] flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 print:hidden">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full my-auto overflow-hidden flex flex-col max-h-[96vh]">
          {/* Alerta de Sucesso se Recém-Inscrito */}
          {isNew && (
            <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-between shrink-0">
              <span className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-700" />
                Aluno Inscrito e Taxa de Matrícula Registrada com Sucesso!
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded font-bold">Novo Aluno</span>
            </div>
          )}

          {/* CABEÇALHO DO MODAL */}
          <div className="px-6 py-4 bg-white border-b border-slate-100 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Printer size={22} />
              </div>
              <div className="space-y-0.5">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Como deseja emitir o recibo?
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase">
                  Recibo Nº {receiptNumber}
                </p>
              </div>
            </div>

            {/* Botão de Fechar */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              title="Fechar janela"
            >
              <X size={20} />
            </button>
          </div>

          {/* PAINEL DE ESCOLHA DAS VIAS (EXATAMENTE COMO EM RECIBOS - IMAGEM 4) */}
          <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-100 shrink-0 space-y-3">
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Escolha a quantidade de vias para gerar o documento de <span className="font-semibold text-slate-700">{student.name}</span> no valor de <span className="font-semibold text-slate-700">{formatCurrency(feeAmount)}</span>:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Opção 1: 1 Via */}
              <button 
                type="button"
                onClick={() => setCopies(1)}
                className={cn(
                  "flex items-start gap-3.5 p-3.5 rounded-xl border text-left transition-all cursor-pointer",
                  copies === 1
                    ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 hover:bg-white bg-white/70"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg transition-colors shrink-0",
                  copies === 1 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  <FileText size={18} />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    1 Via <span className="text-[9px] font-bold bg-slate-100 text-slate-600 py-0.5 px-2 rounded-md">Meia Página</span>
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-normal font-medium">
                    Gera uma única via ocupando exatamente a metade superior de uma folha A4 retrato.
                  </p>
                </div>
              </button>

              {/* Opção 2: 2 Vias */}
              <button 
                type="button"
                onClick={() => setCopies(2)}
                className={cn(
                  "flex items-start gap-3.5 p-3.5 rounded-xl border text-left transition-all cursor-pointer",
                  copies === 2
                    ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20 shadow-xs"
                    : "border-slate-200 hover:border-slate-300 hover:bg-white bg-white/70"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg transition-colors shrink-0",
                  copies === 2 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  <Copy size={18} />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    2 Vias <span className="text-[9px] font-bold bg-blue-50 text-blue-600 py-0.5 px-2 rounded-md">Página Inteira</span>
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-normal font-medium">
                    Gera duas vias idênticas (Secretaria e Aluno) na mesma folha A4 com linha tracejada para recorte no meio.
                  </p>
                </div>
              </button>
            </div>

            {/* CHAVE DE CONTROLE RÁPIDO PARA INCLUIR OU NÃO A MENSAGEM NO RECIBO */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={includeMessage}
                  onChange={(e) => setIncludeMessage(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span>Incluir mensagem / aviso de matrícula no recibo</span>
              </label>
              <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                Configurável em Configurações &gt; Geral
              </span>
            </div>
          </div>

          {/* ÁREA DE VISUALIZAÇÃO PRÉVIA (OCUPANDO O ESPAÇO HARMONIOSO DA FOLHA A4) */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100/60">
            <div className="max-w-3xl mx-auto">
              {viasToRender.map((via) => (
                <React.Fragment key={via}>
                  {renderContributionPatternVia(via)}

                  {via === 1 && copies === 2 && (
                    <div className="w-full border-b-2 border-dashed border-slate-400 my-4 flex items-center justify-center">
                      <span className="bg-white px-4 text-[8px] font-black text-slate-500 uppercase -translate-y-[1px] flex items-center gap-1">
                        ✂️ CORTE AQUI ✂️
                      </span>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* BARRA INFERIOR DE CONFIRMAÇÃO DA IMPRESSÃO */}
          <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
            <button 
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirmPrint}
              disabled={isPrintingDirect}
              className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2.5 cursor-pointer shadow-lg transition-all disabled:opacity-50"
            >
              <Printer size={18} />
              <span>{isPrintingDirect ? 'Enviando...' : `Confirmar Impressão (${copies} ${copies === 1 ? 'Via' : 'Vias'})`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. ÁREA DE IMPRESSÃO EMBARCADA NO DOM */}
      <div id="printable-enrollment-receipt" className="hidden print:block bg-white text-black p-0 m-0 w-full">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: A4 portrait;
              margin: 8mm 12mm 8mm 12mm !important;
            }
            #printable-enrollment-receipt {
              display: block !important;
              position: static !important;
              width: 100% !important;
              max-width: 190mm !important;
              margin: 0 auto !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              overflow: visible !important;
            }
            #printable-enrollment-receipt * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
          }
        `}} />

        <div className="w-full flex flex-col justify-between" style={{ boxSizing: 'border-box' }}>
          {viasToRender.map((via) => (
            <React.Fragment key={`prt-dom-via-${via}`}>
              <div style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                {renderContributionPatternVia(via)}
              </div>

              {via === 1 && copies === 2 && (
                <div className="w-full border-b-2 border-dashed border-slate-400 my-4 flex items-center justify-center">
                  <span className="bg-white px-4 text-[8px] font-black text-slate-500 uppercase -translate-y-[1px] flex items-center gap-1">
                    ✂️ CORTE AQUI ✂️
                  </span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  );
};
