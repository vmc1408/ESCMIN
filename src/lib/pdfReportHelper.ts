import { jsPDF } from 'jspdf';
import { DEFAULT_LOGO } from './default-logo';
import { isInstitutionPhoneWhatsapp } from './utils';

interface InstitutionData {
  name?: string;
  subtitle?: string;
  diocese_name?: string;
  city_uf?: string;
  address?: string;
  cep?: string;
  phone?: string;
  phone_is_whatsapp?: boolean | string;
  secretary?: string;
  email?: string;
  logo_url?: string;
}

const logoDataUrlCache = new Map<string, string>();

/**
 * Preloads and caches an external or base64 logo URL into a DataURL once,
 * preventing slow synchronous network fetches or repeated embedding during PDF generation.
 */
export async function preloadReportLogoDataUrl(logoUrl?: string | null): Promise<string> {
  if (!logoUrl) return DEFAULT_LOGO;
  if (logoUrl.startsWith('data:image/')) return logoUrl;

  const cached = logoDataUrlCache.get(logoUrl);
  if (cached) return cached;

  try {
    const dataUrl = await new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => resolve(DEFAULT_LOGO), 3000);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 256;
          const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || maxDim, img.naturalHeight || maxDim));
          canvas.width = Math.max(1, Math.round((img.naturalWidth || 200) * scale));
          canvas.height = Math.max(1, Math.round((img.naturalHeight || 200) * scale));
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/png'));
          } else {
            resolve(DEFAULT_LOGO);
          }
        } catch {
          resolve(DEFAULT_LOGO);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(DEFAULT_LOGO);
      };

      img.src = logoUrl;
    });

    logoDataUrlCache.set(logoUrl, dataUrl);
    return dataUrl;
  } catch {
    return DEFAULT_LOGO;
  }
}

/**
 * Draws a crisp vector green WhatsApp icon in jsPDF right after a footer phone string.
 */
export function drawPdfWhatsAppIcon(
  doc: jsPDF,
  startX: number,
  baselineY: number,
  size: number = 2.6
) {
  const r = size / 2;
  const cx = startX + r;
  const cy = baselineY - r * 0.62;

  // Green circular bubble (#25D366) + speech tail
  doc.setFillColor(37, 211, 102);
  doc.circle(cx, cy, r, 'F');
  doc.triangle(
    cx - r * 0.85,
    cy + r * 0.42,
    cx - r * 1.02,
    cy + r * 1.02,
    cx - r * 0.3,
    cy + r * 0.85,
    'F'
  );

  // Inner white curved telephone handset silhouette
  doc.setDrawColor(255, 255, 255);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(Math.max(0.28, size * 0.14));
  doc.line(cx - r * 0.36, cy - r * 0.42, cx - r * 0.42, cy - r * 0.12);
  doc.line(cx - r * 0.42, cy - r * 0.12, cx - r * 0.08, cy + r * 0.22);
  doc.line(cx - r * 0.08, cy + r * 0.22, cx + r * 0.34, cy + r * 0.38);
  doc.circle(cx - r * 0.34, cy - r * 0.42, r * 0.15, 'F');
  doc.circle(cx + r * 0.36, cy + r * 0.36, r * 0.15, 'F');

  // Restore standard dark text/draw state
  doc.setDrawColor(15, 23, 42);
  doc.setFillColor(15, 23, 42);
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
  margin: number = 15,
  preloadedLogoDataUrl?: string
): number {
  const pageWidth = doc.internal.pageSize.width;
  const rawLogo = preloadedLogoDataUrl || (inst?.logo_url ? logoDataUrlCache.get(inst.logo_url) || inst.logo_url : DEFAULT_LOGO);
  const logoToUse = rawLogo || DEFAULT_LOGO;
  let textStartX = margin;

  if (logoToUse) {
    const imgFormat = logoToUse.startsWith('data:image/jpeg') || logoToUse.startsWith('data:image/jpg') ? 'JPEG' : 'PNG';
    const alias = logoToUse === DEFAULT_LOGO ? 'escmin-default-logo' : 'escmin-inst-logo';
    try {
      const naturalW = 204;
      const naturalH = 191;
      const fitted = getFittedImageDimensions(naturalW, naturalH, 20, 20);

      doc.addImage(
        logoToUse,
        imgFormat,
        margin + fitted.offsetX,
        12 + fitted.offsetY,
        fitted.width,
        fitted.height,
        alias,
        'FAST'
      );
      textStartX = margin + 24;
    } catch {
      try {
        doc.addImage(DEFAULT_LOGO, 'PNG', margin, 12, 20, 18.7, 'escmin-default-logo', 'FAST');
        textStartX = margin + 24;
      } catch (err2) {
        console.warn('Error rendering logo in report:', err2);
      }
    }
  }

  // Institutional Texts (3 Lines, exact vertical alignment, bounded inside right margin)
  const textMaxW = Math.max(60, pageWidth - margin - textStartX);
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  const dioceseName = inst?.city_uf
    ? `DIOCESE DE ${inst.city_uf.split('/')[0].toUpperCase()}`
    : (inst?.diocese_name || 'DIOCESE DE GUARULHOS');
  doc.text(dioceseName.toUpperCase(), textStartX, 17, { maxWidth: textMaxW });

  doc.setFontSize(14.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text((inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIO').toUpperCase(), textStartX, 23.5, { maxWidth: textMaxW });

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text((inst?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO').toUpperCase(), textStartX, 29.5, { maxWidth: textMaxW });

  // Continuous Header Divider Line (0.8pt matching border-b-2 border-slate-900)
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.8);
  doc.line(margin, 34.5, pageWidth - margin, 34.5);

  // Document Title with Standard Underline Banner
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(docTitle, pageWidth / 2, 43.5, { align: 'center', charSpace: 0.7 });

  const titleWidth = Math.min(pageWidth - margin * 2 - 20, doc.getTextWidth(docTitle) + (docTitle.length * 0.7));
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.8);
  doc.line(pageWidth / 2 - (titleWidth / 2) - 6, 46, pageWidth / 2 + (titleWidth / 2) + 6, 46);

  // Context Metadata Line (Filter on left, timestamp on right, bounded to avoid collision)
  const emissionText = `EMISSÃO: ${new Date().toLocaleString('pt-BR')}`;
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  const emissionW = doc.getTextWidth(emissionText);
  const maxFilterW = Math.max(40, pageWidth - margin * 2 - emissionW - 6);
  const filterUpper = filterText.toUpperCase();
  const fittedFilter = doc.splitTextToSize(filterUpper, maxFilterW)[0] || '';
  doc.text(fittedFilter, margin, 52);
  doc.text(emissionText, pageWidth - margin, 52, { align: 'right' });

  // Return the start Y position for tables
  return 56;
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

    const addrLine1 = inst?.address || 'Av. Venus, 195 - Itapegica';
    const addrLine2 = [
      inst?.cep ? `CEP: ${inst.cep}` : 'CEP: 07044-170',
      inst?.city_uf ? `- ${inst.city_uf}` : '- Guarulhos/SP'
    ].filter(Boolean).join(' ');
    const addrLine3 = `Telefone: ${inst?.phone || '(11) 2421-2935'}`;

    doc.text(addrLine1, margin, pageHeight - 14.5);
    doc.text(addrLine2, margin, pageHeight - 11);
    doc.text(addrLine3, margin, pageHeight - 7.5);
    if (isInstitutionPhoneWhatsapp(inst)) {
      const phoneW = doc.getTextWidth(addrLine3);
      drawPdfWhatsAppIcon(doc, margin + phoneW + 1.4, pageHeight - 7.5, 2.5);
    }

    // Coluna da Direita (Atendimento Secretaria & Paginação) - Exatamente 3 linhas (Fonte 7pt, bold, #0f172a)
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');

    doc.text('ATENDIMENTO SECRETARIA:', pageWidth - margin, pageHeight - 14.5, { align: 'right' });

    const secLine = inst?.secretary ? inst.secretary.replace(/\n/g, ' ') : 'quarta a sexta-feira das 14h às 18h';
    doc.text(secLine, pageWidth - margin, pageHeight - 11, { align: 'right' });

    const emailAndPage = [
      (inst?.email || 'email@email.com.br').toLowerCase(),
      `Página ${i} de ${pages}`
    ].join('  •  ');
    doc.text(emailAndPage, pageWidth - margin, pageHeight - 7.5, { align: 'right' });
  }
}
