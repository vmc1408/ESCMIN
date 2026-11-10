import { jsPDF } from 'jspdf';
import { DEFAULT_LOGO } from './default-logo';

interface InstitutionData {
  name?: string;
  subtitle?: string;
  diocese_name?: string;
  city_uf?: string;
  address?: string;
  cep?: string;
  phone?: string;
  secretary?: string;
  email?: string;
  logo_url?: string;
}

/**
 * Helper to compute dimensions preserving aspect ratio (object-contain)
 * within a maxBoxWidth x maxBoxHeight bounding box.
 */
export function getFittedImageDimensions(
  naturalWidth: number,
  naturalHeight: number,
  maxBoxWidth: number = 20,
  maxBoxHeight: number = 20
) {
  if (!naturalWidth || !naturalHeight) {
    return { width: maxBoxWidth, height: maxBoxHeight, offsetX: 0, offsetY: 0 };
  }
  const ratio = naturalWidth / naturalHeight;
  let width = maxBoxWidth;
  let height = maxBoxHeight;

  if (ratio > maxBoxWidth / maxBoxHeight) {
    // Image is wider than the box
    width = maxBoxWidth;
    height = maxBoxWidth / ratio;
  } else {
    // Image is taller or equal
    height = maxBoxHeight;
    width = maxBoxHeight * ratio;
  }

  const offsetX = (maxBoxWidth - width) / 2;
  const offsetY = (maxBoxHeight - height) / 2;

  return { width, height, offsetX, offsetY };
}

/**
 * Standard Institutional Header for all Cadastral and Academic Reports in jsPDF
 */
export function drawStandardReportHeader(
  doc: jsPDF,
  inst: InstitutionData | null | undefined,
  docTitle: string,
  filterText: string = 'FILTRO: TODOS',
  margin: number = 15
): number {
  const pageWidth = doc.internal.pageSize.width;
  const logoToUse = inst?.logo_url || DEFAULT_LOGO;
  let textStartX = margin;

  if (logoToUse) {
    try {
      // Natural dimensions of DEFAULT_LOGO are 204 x 191
      // If base64 or URL, compute or use natural circular ratio ~ 1.068
      const naturalW = 204;
      const naturalH = 191;
      const fitted = getFittedImageDimensions(naturalW, naturalH, 20, 20);

      doc.addImage(
        logoToUse,
        'PNG',
        margin + fitted.offsetX,
        12 + fitted.offsetY,
        fitted.width,
        fitted.height
      );
      textStartX = margin + 24;
    } catch (e) {
      try {
        doc.addImage(logoToUse, 'auto', margin, 12, 20, 20);
        textStartX = margin + 24;
      } catch (err2) {
        console.warn('Error rendering logo in report:', err2);
      }
    }
  }

  // Institutional Texts (3 Lines, exact vertical alignment)
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  const dioceseName = inst?.city_uf 
    ? `DIOCESE DE ${inst.city_uf.split('/')[0].toUpperCase()}` 
    : (inst?.diocese_name || 'DIOCESE DE GUARULHOS');
  doc.text(dioceseName.toUpperCase(), textStartX, 17);

  doc.setFontSize(14.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text((inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIO').toUpperCase(), textStartX, 23.5);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text((inst?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO').toUpperCase(), textStartX, 29.5);

  // Continuous Header Divider Line (0.8pt matching border-b-2 border-slate-900)
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.8);
  doc.line(margin, 34.5, pageWidth - margin, 34.5);

  // Document Title with Standard Underline Banner
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(docTitle, pageWidth / 2, 44, { align: 'center', charSpace: 1.0 });

  const titleWidth = doc.getTextWidth(docTitle);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.8);
  doc.line(pageWidth / 2 - (titleWidth / 2) - 10, 46.5, pageWidth / 2 + (titleWidth / 2) + 10, 46.5);

  // Context Metadata Line (Filter on left, timestamp on right)
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text(filterText.toUpperCase(), margin, 52.5);
  doc.text(`EMISSÃO: ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin, 52.5, { align: 'right' });

  // Return the start Y position for tables
  return 56.5;
}

/**
 * Standard Institutional Footer for all Cadastral and Academic Reports in jsPDF
 * Exact 2 Columns, 3 Lines (7pt bold, 0.8pt continuous stroke)
 */
export function drawStandardReportFooter(
  doc: jsPDF,
  inst: InstitutionData | null | undefined,
  margin: number = 15
) {
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const pages = (doc as any).internal.getNumberOfPages();

  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);

    // Continuous Footer Divider Line
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.8);
    doc.line(margin, pageHeight - 19, pageWidth - margin, pageHeight - 19);

    // Coluna da Esquerda (Dados Institucionais / Endereço) - Exatamente 3 linhas (Fonte 7pt, bold, #0f172a)
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');

    const addrLine1 = (inst?.address || 'AV. VENUS, 195 - ITAPEGICA - GUARULHOS/SP').toUpperCase();
    const addrLine2 = [
      inst?.cep ? `CEP: ${inst.cep}` : 'CEP: 07044-170',
      inst?.city_uf ? `- ${inst.city_uf}` : '- GUARULHOS/SP'
    ].filter(Boolean).join(' ').toUpperCase();
    const addrLine3 = `Telefone: ${inst?.phone || '(11) 2421-2935'}`;

    doc.text(addrLine1, margin, pageHeight - 14.5);
    doc.text(addrLine2, margin, pageHeight - 11);
    doc.text(addrLine3, margin, pageHeight - 7.5);

    // Coluna da Direita (Atendimento Secretaria & Paginação) - Exatamente 3 linhas (Fonte 7pt, bold, #0f172a)
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');

    doc.text('ATENDIMENTO SECRETARIA:', pageWidth - margin, pageHeight - 14.5, { align: 'right' });

    const secLine = inst?.secretary ? inst.secretary.replace(/\n/g, ' ') : 'quarta a sexta-feira das 14h as 18h';
    doc.text(secLine, pageWidth - margin, pageHeight - 11, { align: 'right' });

    const emailAndPage = [
      inst?.email ? `email: ${inst.email.toLowerCase()}` : 'email: email@email.com.br',
      `Página ${i} de ${pages}`
    ].join('  •  ');
    doc.text(emailAndPage, pageWidth - margin, pageHeight - 7.5, { align: 'right' });
  }
}
