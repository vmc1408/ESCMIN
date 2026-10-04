import React, { useState, useEffect } from 'react';
import { X, Printer, CheckCircle2, Copy } from 'lucide-react';
import { formatCurrency, formatDateForDisplay, numberToPortugueseWords, formatRegistrationNumber, cn, safeFormat } from '../lib/utils';
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
  const [isPrintingDirect, setIsPrintingDirect] = useState<boolean>(false);

  useEffect(() => {
    if (institution) {
      setInstSettings(institution);
    } else {
      getInstitutionSettings()
        .then((data) => {
          if (data) setInstSettings(data);
        })
        .catch((err) => console.warn('Não foi possível carregar configurações da instituição:', err));
    }
  }, [institution]);

  if (!isOpen || !student) return null;

  const currentYear = classItem?.start_year || new Date().getFullYear();
  const rawReg = (student.registration_number || student.id.slice(0, 6)).replace(/\//g, '');
  const receiptNumber = `MAT-${rawReg}-${currentYear}`;
  const effectivePaymentDate = paymentDate || new Date().toISOString().split('T')[0];

  const dioceseTitle = instSettings?.city_uf 
    ? `DIOCESE DE ${instSettings.city_uf.split('/')[0].toUpperCase()}`
    : 'DIOCESE DE GUARULHOS';
  const instName = (instSettings?.name || 'ESCOLA DIOCESANA DE MINISTÉRIOS').toUpperCase();
  const instSubtitle = (instSettings?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO').toUpperCase();
  const instAddress = instSettings?.address || 'Av. Venus, 195 - Itapegica - Guarulhos - CEP 07044-170';
  const instLogo = instSettings?.logo_url || DEFAULT_LOGO;
  const instPhone = instSettings?.phone || '';
  const instEmail = instSettings?.email ? instSettings.email.toLowerCase() : '';
  const receiptMsg = instSettings?.receipt_message || 'Inscrição e matrícula confirmadas com gratidão. O(a) aluno(a) declara estar de acordo com o regimento escolar e as normas acadêmicas da instituição diocesana.';

  const viasToRender = copies === 1 ? [1] : [1, 2];

  /**
   * Constrói o HTML puro de uma via para envio direto à impressora via iframe.
   * Totalmente monocromático, calibrado em milímetros para encaixe exato em A4.
   */
  const generateViaHtml = (via: number, activeCopies: 1 | 2 = copies) => {
    const viaLabel = via === 1
      ? activeCopies === 1
        ? 'VIA ÚNICA - ALUNO'
        : 'VIA 1 - ESCOLA / SECRETARIA'
      : 'VIA 2 - ALUNO';

    const statusBadge = feeStatus === 'paid' 
      ? '✓ QUITADO' 
      : feeStatus === 'exempt' 
        ? 'ISENTO' 
        : 'PENDENTE';

    return `
      <div class="via-box">
        <!-- Cabeçalho Oficial Diocesano -->
        <div class="header-section">
          <div class="header-left">
            <div class="logo-box">
              <img src="${instLogo}" alt="Logo" class="logo-img" />
            </div>
            <div class="header-texts">
              <div class="diocese-name">${dioceseTitle}</div>
              <div class="inst-name">${instName}</div>
              <div class="inst-sub">${instSubtitle}</div>
              <div class="inst-addr">${instAddress}</div>
              <div class="inst-contact">
                ${instPhone ? `<span>TEL: ${instPhone}</span>` : ''}
                ${instEmail ? `<span>EMAIL: ${instEmail}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="header-right">
            <div class="via-badge">${viaLabel}</div>
          </div>
        </div>

        <!-- Título do Documento -->
        <div class="title-section">
          <div class="doc-title">RECIBO DE MATRÍCULA E INSCRIÇÃO</div>
          <div class="meta-row">
            <span>Nº COMPROVANTE: <strong>${receiptNumber}</strong></span>
            <span>DATA DE EMISSÃO: <strong>${formatDateForDisplay(new Date().toISOString())}</strong></span>
          </div>
        </div>

        <!-- Bloco 1: Aluno e Turma -->
        <div class="info-block">
          <div class="info-header">
            <span>IDENTIFICAÇÃO DO ALUNO(A)</span>
            <span class="status-indicator">SITUAÇÃO: ${student.status?.toUpperCase() || 'ATIVO'}</span>
          </div>
          <div class="student-name">${formatRegistrationNumber(student.registration_number)} - ${student.name.toUpperCase()}</div>
          <div class="student-meta">
            <span>CPF: <strong>${student.cpf || 'Não informado'}</strong></span>
            <span>RG: <strong>${student.rg || 'Não informado'}</strong></span>
            ${unitName ? `<span>Polo/Unidade: <strong>${unitName}</strong></span>` : ''}
          </div>
        </div>

        <!-- Bloco 2: Dados Acadêmicos -->
        <div class="academic-block">
          <div class="acad-row-1">
            <strong>CURSO:</strong> ${(classItem?.course || student.course || 'Curso Regular').toUpperCase()}
            <span style="float: right;"><strong>Ano Letivo:</strong> ${currentYear}</span>
          </div>
          <div class="acad-row-2">
            <span>Turma: <strong>${classItem?.name || 'Turma Regular'}</strong></span>
            <span>Turno: <strong>${classItem?.period || 'Regular'}</strong></span>
            <span>Início das Aulas: <strong>${classItem?.start_date ? formatDateForDisplay(classItem.start_date) : 'Conforme cronograma'}</strong></span>
          </div>
        </div>

        <!-- Bloco 3: Detalhamento Financeiro -->
        <div class="financial-block">
          <div class="fin-header">
            <span class="fin-title">DETALHAMENTO DA TAXA DE MATRÍCULA</span>
            <span class="fin-status">${statusBadge}</span>
          </div>
          <div class="fin-body">
            <div class="fin-desc">
              <div class="fin-ref">Taxa de Matrícula e Inscrição Acadêmica (${currentYear})</div>
              <div class="fin-words">Extenso: ${numberToPortugueseWords(feeAmount)}</div>
            </div>
            <div class="fin-amount">
              <div class="amount-label">VALOR DO LANÇAMENTO</div>
              <div class="amount-value">${formatCurrency(feeAmount)}</div>
            </div>
          </div>
          <div class="fin-footer">
            <span>Forma de Quitação: <strong>${paymentMethod}</strong></span>
            <span>Data do Pagamento: <strong>${formatDateForDisplay(effectivePaymentDate)}</strong></span>
            ${observations ? `<div class="fin-obs">Obs: ${observations}</div>` : ''}
          </div>
        </div>

        <!-- Bloco 4: Mensagem Institucional -->
        <div class="msg-block">
          "${receiptMsg}"
        </div>

        <!-- Bloco 5: Assinatura da Secretaria -->
        <div class="signatures-row">
          <div class="sig-col-single">
            <div class="sig-line"></div>
            <div class="sig-label">SECRETARIA ACADÊMICA / CARIMBO</div>
          </div>
        </div>

        <!-- Rodapé do Sistema -->
        <div class="footer-meta">
          <span>SISTEMA ${instName}</span>
          <span>REGISTRO: ${formatDateForDisplay(effectivePaymentDate)} • FORMA: ${paymentMethod.toUpperCase()}</span>
          <span>EMISSÃO: ${safeFormat(new Date(), 'dd/MM/yyyy HH:mm')}</span>
        </div>
      </div>
    `;
  };

  /**
   * Executa a impressão direta da opção escolhida (1 via ou 2 vias)
   * sem necessidade de repetir a ação com botões duplicados.
   */
  const triggerPrint = (selectedCopies: 1 | 2) => {
    setIsPrintingDirect(true);
    setCopies(selectedCopies);

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

      const via1 = generateViaHtml(1, selectedCopies);
      const via2 = selectedCopies === 2 ? generateViaHtml(2, selectedCopies) : '';

      const cutLineHtml = selectedCopies === 2 ? `
        <div class="cut-line">
          <span>✂ - - - - - - - - - - - - - - - - - - - CORTE AQUI - - - - - - - - - - - - - - - - - - - ✂</span>
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
              margin: 4mm 8mm 4mm 8mm;
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
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            }
            .page-container {
              width: 100%;
              max-width: 194mm;
              margin: 0 auto;
              box-sizing: border-box;
            }
            .via-box {
              border: 1.5px solid #000000;
              background: #ffffff;
              color: #000000;
              padding: 8px 10px;
              box-sizing: border-box;
              page-break-inside: avoid;
              break-inside: avoid;
              font-size: 10px;
              line-height: 1.25;
            }
            .header-section {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 1.5px solid #000000;
              padding-bottom: 5px;
              margin-bottom: 5px;
            }
            .header-left {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .logo-box {
              width: 44px;
              height: 44px;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            .logo-img {
              max-width: 100%;
              max-height: 100%;
              object-contain: contain;
              filter: grayscale(100%) contrast(150%);
            }
            .header-texts {
              display: flex;
              flex-direction: column;
              gap: 1px;
            }
            .diocese-name {
              font-size: 7.5px;
              font-weight: 900;
              letter-spacing: 0.5px;
              color: #333333;
              text-transform: uppercase;
            }
            .inst-name {
              font-size: 11px;
              font-weight: 900;
              color: #000000;
              text-transform: uppercase;
              letter-spacing: -0.2px;
            }
            .inst-sub {
              font-size: 8px;
              font-weight: 700;
              color: #333333;
              text-transform: uppercase;
            }
            .inst-addr {
              font-size: 7.5px;
              color: #444444;
            }
            .inst-contact {
              font-size: 7px;
              color: #555555;
              font-weight: 700;
              display: flex;
              gap: 8px;
              text-transform: uppercase;
            }
            .via-badge {
              border: 1px solid #000000;
              background: #f0f0f0;
              padding: 2px 6px;
              font-size: 7.5px;
              font-family: monospace;
              font-weight: 900;
              text-transform: uppercase;
              white-space: nowrap;
            }
            .title-section {
              text-align: center;
              margin-bottom: 5px;
            }
            .doc-title {
              font-size: 11px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 1px;
              display: inline-block;
              border-bottom: 1.5px solid #000000;
              padding-bottom: 1px;
            }
            .meta-row {
              display: flex;
              justify-content: space-between;
              font-size: 8px;
              font-family: monospace;
              margin-top: 3px;
              padding: 0 2px;
              color: #222222;
            }
            .info-block {
              border: 1px solid #000000;
              background: #fafafa;
              padding: 5px 7px;
              margin-bottom: 4px;
            }
            .info-header {
              display: flex;
              justify-content: space-between;
              font-size: 7.5px;
              font-weight: 900;
              color: #444444;
              margin-bottom: 2px;
            }
            .status-indicator {
              border: 1px solid #000000;
              background: #ffffff;
              padding: 0 4px;
              font-family: monospace;
              color: #000000;
            }
            .student-name {
              font-size: 11px;
              font-weight: 900;
              color: #000000;
            }
            .student-meta {
              display: flex;
              flex-wrap: wrap;
              gap: 12px;
              font-size: 8.5px;
              color: #222222;
              border-top: 1px solid #dddddd;
              margin-top: 3px;
              padding-top: 2px;
            }
            .academic-block {
              border: 1px solid #000000;
              background: #ffffff;
              padding: 5px 7px;
              margin-bottom: 4px;
            }
            .acad-row-1 {
              font-size: 9.5px;
              color: #000000;
              margin-bottom: 2px;
            }
            .acad-row-2 {
              display: flex;
              justify-content: space-between;
              font-size: 8.5px;
              color: #333333;
            }
            .financial-block {
              border: 1px solid #000000;
              background: #fafafa;
              padding: 5px 7px;
              margin-bottom: 4px;
            }
            .fin-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 1px solid #cccccc;
              padding-bottom: 3px;
              margin-bottom: 4px;
            }
            .fin-title {
              font-size: 7.5px;
              font-weight: 900;
              color: #000000;
              text-transform: uppercase;
            }
            .fin-status {
              border: 1px solid #000000;
              background: #ffffff;
              padding: 1px 5px;
              font-size: 7.5px;
              font-weight: 900;
              text-transform: uppercase;
            }
            .fin-body {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .fin-ref {
              font-size: 9.5px;
              font-weight: 800;
              color: #000000;
            }
            .fin-words {
              font-size: 8px;
              font-style: italic;
              color: #444444;
              margin-top: 2px;
            }
            .fin-amount {
              text-align: right;
            }
            .amount-label {
              font-size: 7px;
              font-weight: 700;
              color: #555555;
            }
            .amount-value {
              font-size: 13px;
              font-weight: 900;
              font-family: monospace;
              color: #000000;
            }
            .fin-footer {
              display: flex;
              flex-wrap: wrap;
              gap: 12px;
              font-size: 8.5px;
              border-top: 1px solid #dddddd;
              margin-top: 4px;
              padding-top: 3px;
              color: #222222;
            }
            .fin-obs {
              width: 100%;
              font-size: 7.5px;
              color: #555555;
            }
            .msg-block {
              border: 1px solid #cccccc;
              background: #ffffff;
              padding: 3px 5px;
              text-align: center;
              font-size: 7.5px;
              font-style: italic;
              color: #555555;
              margin-bottom: 5px;
              line-height: 1.2;
            }
            .signatures-row {
              display: flex;
              justify-content: flex-end;
              align-items: flex-end;
              padding-top: 8px;
              margin-bottom: 4px;
            }
            .sig-col-single {
              text-align: center;
              width: 230px;
            }
            .sig-line {
              border-bottom: 1px solid #000000;
              margin-bottom: 3px;
            }
            .sig-label {
              font-size: 8px;
              font-weight: 900;
              letter-spacing: 0.5px;
              color: #000000;
            }
            .footer-meta {
              border-top: 1px solid #cccccc;
              padding-top: 3px;
              display: flex;
              justify-content: space-between;
              font-size: 6.5px;
              font-family: monospace;
              color: #666666;
              text-transform: uppercase;
            }
            .cut-line {
              border-top: 1.5px dashed #000000;
              margin: 6px 0;
              text-align: center;
              height: 12px;
              line-height: 12px;
            }
            .cut-line span {
              background: #ffffff;
              padding: 0 10px;
              font-size: 7.5px;
              font-family: monospace;
              font-weight: 700;
              color: #000000;
              position: relative;
              top: -8px;
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

  // Componente de visualização na tela da via individual
  const renderPreviewVia = (via: number) => {
    const viaLabel = via === 1
      ? copies === 1
        ? 'VIA ÚNICA - ALUNO'
        : 'VIA 1 - ESCOLA / SECRETARIA'
      : 'VIA 2 - ALUNO';

    return (
      <div 
        key={via}
        className="bg-white border-2 border-black p-3.5 sm:p-4 text-black relative box-border shadow-xs"
      >
        {/* Cabeçalho Oficial Diocesano */}
        <div className="flex items-start justify-between border-b-2 border-black pb-2 mb-2 relative">
          <div className="flex items-center gap-3">
            {/* Logotipo Monocromático */}
            <div className="w-12 h-12 flex items-center justify-center shrink-0">
              <img
                src={instLogo}
                alt="Logo"
                className="w-full h-full object-contain grayscale contrast-150"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if ((e.currentTarget as HTMLImageElement).src !== DEFAULT_LOGO) {
                    (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO;
                  }
                }}
              />
            </div>

            {/* Texto Institucional em P&B */}
            <div className="space-y-0.5">
              <p className="text-[8.5px] font-black tracking-widest text-slate-800 uppercase leading-none">
                {dioceseTitle}
              </p>
              <h4 className="text-xs sm:text-sm font-black text-black uppercase tracking-tight leading-tight">
                {instName}
              </h4>
              <p className="text-[9px] font-bold text-slate-800 uppercase tracking-wider">
                {instSubtitle}
              </p>
              <p className="text-[8px] text-slate-700 font-medium leading-tight">
                {instAddress}
              </p>
              <div className="flex flex-wrap items-center gap-x-2 text-[7.5px] text-slate-600 font-bold uppercase">
                {instPhone && <span>TEL: {instPhone}</span>}
                {instEmail && <span>EMAIL: {instEmail}</span>}
              </div>
            </div>
          </div>

          {/* Etiqueta da Via */}
          <div className="text-right shrink-0">
            <span className="inline-block px-2 py-0.5 border border-black bg-slate-100 text-[8.5px] font-mono font-black text-black uppercase">
              {viaLabel}
            </span>
          </div>
        </div>

        {/* Título do Documento com Número e Data */}
        <div className="text-center mb-2">
          <h2 className="text-xs sm:text-sm font-black text-black uppercase tracking-[0.18em] inline-block border-b-2 border-black pb-0.5">
            Recibo de Matrícula e Inscrição
          </h2>
          <div className="flex items-center justify-between text-[9px] text-slate-800 font-mono mt-1 px-1">
            <span>Nº COMPROVANTE: <strong className="text-black">{receiptNumber}</strong></span>
            <span>DATA DE EMISSÃO: <strong className="text-black">{formatDateForDisplay(new Date().toISOString())}</strong></span>
          </div>
        </div>

        {/* Bloco 1: Identificação do Aluno */}
        <div className="border border-black bg-slate-50 p-2 mb-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-black text-slate-700 uppercase tracking-wider">
              Identificação do Aluno(a)
            </span>
            <span className="text-[8.5px] font-mono font-bold text-black border border-black bg-white px-1 py-0.2">
              SITUAÇÃO: {student.status?.toUpperCase() || 'ATIVO'}
            </span>
          </div>
          <p className="text-xs sm:text-sm font-black text-black uppercase pt-0.5">
            {formatRegistrationNumber(student.registration_number)} - {student.name}
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[9.5px] text-slate-800 pt-1 border-t border-slate-300 mt-1">
            <span>CPF: <strong className="text-black">{student.cpf || 'Não informado'}</strong></span>
            <span>RG: <strong className="text-black">{student.rg || 'Não informado'}</strong></span>
            {unitName && <span>Polo / Unidade: <strong className="text-black">{unitName}</strong></span>}
          </div>
        </div>

        {/* Bloco 2: Dados Acadêmicos da Turma */}
        <div className="border border-black p-2 mb-2 text-xs bg-white">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[8.5px] font-black text-slate-700 uppercase tracking-wider">
              Dados Acadêmicos e Turma Vinculada
            </span>
            <span className="text-[9px] font-bold text-black">
              Ano Letivo: {currentYear}
            </span>
          </div>
          <p className="text-xs font-black text-black uppercase">
            CURSO: {classItem?.course || student.course || 'Curso Regular'}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[9.5px] text-slate-800 pt-0.5">
            <span>Turma: <strong className="text-black">{classItem?.name || 'Turma Regular'}</strong></span>
            <span>Turno: <strong className="text-black">{classItem?.period || 'Regular'}</strong></span>
            <span>Início das Aulas: <strong className="text-black">{classItem?.start_date ? formatDateForDisplay(classItem.start_date) : 'Conforme cronograma'}</strong></span>
          </div>
        </div>

        {/* Bloco 3: Quadro Financeiro da Taxa de Matrícula */}
        <div className="border border-black p-2.5 mb-2 text-xs bg-slate-50">
          <div className="flex items-center justify-between border-b border-slate-400 pb-1 mb-1.5">
            <span className="text-[8.5px] font-black text-black uppercase tracking-wider">
              Detalhamento da Taxa de Matrícula
            </span>
            <span className="border border-black px-1.5 py-0.2 text-[8.5px] font-black text-black uppercase bg-white">
              {feeStatus === 'paid' ? '✓ QUITADO' : feeStatus === 'exempt' ? 'ISENTO' : 'PENDENTE'}
            </span>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <p className="text-[8px] font-bold text-slate-700 uppercase">Referência</p>
              <p className="text-xs font-black text-black">
                Taxa de Inscrição e Matrícula Acadêmica ({currentYear})
              </p>
              <p className="text-[9.5px] text-slate-800 italic pt-0.5">
                Extenso: {numberToPortugueseWords(feeAmount)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-bold text-slate-700 uppercase">Valor do Lançamento</p>
              <p className="text-base font-black text-black font-mono">
                {formatCurrency(feeAmount)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1.5 mt-1.5 border-t border-slate-300 text-[9.5px] text-slate-900">
            <div>Forma de Quitação: <strong className="text-black">{paymentMethod}</strong></div>
            <div>Data do Pagamento: <strong className="text-black">{formatDateForDisplay(effectivePaymentDate)}</strong></div>
            {observations && (
              <div className="col-span-2 text-[8.5px] text-slate-700 pt-0.5">
                Observações: {observations}
              </div>
            )}
          </div>
        </div>

        {/* Bloco 4: Declaração / Mensagem Institucional */}
        <div className="border border-slate-300 bg-white p-1 text-center mb-2.5">
          <p className="text-[8px] text-slate-700 italic leading-snug">
            &quot;{receiptMsg}&quot;
          </p>
        </div>

        {/* Bloco 5: Assinatura da Secretaria (aluno removido conforme solicitado) */}
        <div className="flex justify-end items-end pt-2 mb-1.5 text-xs">
          <div className="text-center w-52 sm:w-60">
            <div className="border-b border-black mb-1"></div>
            <p className="text-[8.5px] font-black uppercase tracking-wider text-black">
              Secretaria Acadêmica / Carimbo
            </p>
          </div>
        </div>

        {/* Rodapé Informativo */}
        <div className="pt-1 mt-1 border-t border-slate-300 flex items-center justify-between text-[7px] text-slate-600 font-mono uppercase">
          <span>SISTEMA {instName}</span>
          <span>REGISTRO: {formatDateForDisplay(effectivePaymentDate)} • FORMA: {paymentMethod.toUpperCase()}</span>
          <span>EMISSÃO: {safeFormat(new Date(), 'dd/MM/yyyy HH:mm')}</span>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* 1. Modal Interativo em Tela (Interface Clara, Amigável e Moderna) */}
      <div className="fixed inset-0 z-[250] flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 print:hidden">
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-4xl w-full my-auto overflow-hidden flex flex-col max-h-[96vh]">
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

          {/* BARRA SUPERIOR CLARA COM BOTÕES DIRETOS E FECHAR NA MESMA LINHA */}
          <div className="px-4 sm:px-6 py-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Título Limpo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-[#00174b] shrink-0 shadow-2xs">
                <Printer size={18} />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#00174b]">
                  Recibo de Matrícula
                </h3>
                <p className="text-[10px] text-slate-500 font-medium">
                  Selecione a opção desejada para imprimir o documento
                </p>
              </div>
            </div>

            {/* Ações Diretas: 1 Via + 2 Vias + Fechar (Tudo na mesma linha) */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {/* Botão de Ação Direta: 1 Via */}
              <button
                type="button"
                onClick={() => triggerPrint(1)}
                disabled={isPrintingDirect}
                className={cn(
                  "px-3.5 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all border shadow-xs rounded-lg disabled:opacity-50",
                  copies === 1
                    ? "bg-[#00174b] hover:bg-blue-900 text-white border-[#00174b]"
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-300"
                )}
                title="Imprimir 1 via avulsa do recibo"
              >
                <Printer size={14} />
                <span>1 Via</span>
              </button>

              {/* Botão de Ação Direta: 2 Vias (1 Página A4) */}
              <button
                type="button"
                onClick={() => triggerPrint(2)}
                disabled={isPrintingDirect}
                className={cn(
                  "px-3.5 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all border shadow-xs rounded-lg disabled:opacity-50",
                  copies === 2
                    ? "bg-[#00174b] hover:bg-blue-900 text-white border-[#00174b]"
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-300"
                )}
                title="Imprimir 2 vias (Escola e Aluno) na mesma página com linha de corte"
              >
                <Copy size={14} />
                <span>2 Vias (1 Página A4)</span>
              </button>

              {/* Botão Fechar - Elevado e Alinhado na Mesma Linha */}
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ml-1 shadow-2xs"
                title="Fechar janela"
              >
                <X size={15} />
                <span>Fechar</span>
              </button>
            </div>
          </div>

          {/* Área de Visualização com Fundo Claro e Agradável */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100">
            <div className="max-w-2xl mx-auto space-y-3">
              {viasToRender.map((via) => (
                <React.Fragment key={via}>
                  {renderPreviewVia(via)}

                  {via === 1 && copies === 2 && (
                    <div className="py-1 flex items-center justify-center my-1">
                      <div className="w-full border-b border-dashed border-black flex items-center justify-center">
                        <span className="bg-white px-3 text-[9px] font-mono font-bold text-black uppercase -translate-y-1/2">
                          ✂ - - - - - - - - - - - - - - - - - - - CORTE AQUI - - - - - - - - - - - - - - - - - - - ✂
                        </span>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. ÁREA DE IMPRESSÃO EMBARCADA NO DOM
          Utilizada caso o usuário utilize Ctrl+P diretamente pelo navegador.
          Completamente isolada e visível apenas durante @media print.
      */}
      <div id="printable-enrollment-receipt" className="hidden print:block bg-white text-black p-0 m-0 w-full">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            @page {
              size: A4 portrait;
              margin: 4mm 8mm 4mm 8mm !important;
            }
            #printable-enrollment-receipt {
              display: block !important;
              position: static !important;
              width: 100% !important;
              max-width: 194mm !important;
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
                {renderPreviewVia(via)}
              </div>

              {via === 1 && copies === 2 && (
                <div className="w-full border-b border-dashed border-black flex items-center justify-center my-1.5" style={{ height: '4mm' }}>
                  <span className="bg-white px-3 text-[8px] font-mono font-bold text-black uppercase -translate-y-1/2">
                    ✂ - - - - - - - - - - - - - - - - - - - - - - CORTE AQUI - - - - - - - - - - - - - - - - - - - - - - ✂
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
