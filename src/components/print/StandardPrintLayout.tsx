import React from 'react';
import { DEFAULT_LOGO } from '../../lib/default-logo';
import { cn, isInstitutionPhoneWhatsapp } from '../../lib/utils';

export function FooterWhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="#25D366"
      aria-label="WhatsApp"
      style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}
      className={cn('w-[11px] h-[11px] inline-block shrink-0 align-middle', className)}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.72.937 3.659 1.43 5.623 1.43h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

interface StandardHeaderProps {
  inst: any;
  title: string;
  filterText?: string;
}

export function StandardReportHeader({
  inst,
  title,
  filterText = ''
}: StandardHeaderProps) {
  return (
    <div className="shrink-0">
      {/* Institutional Top: Logo + Diocese + Escola + Subtítulo */}
      <div className="flex items-center gap-4 mb-2 pb-2 border-b-2 border-slate-900">
        <div className="flex-shrink-0 w-20 h-20 max-h-20 max-w-20 flex items-center justify-center">
          <img
            src={inst?.logo_url || DEFAULT_LOGO}
            className="w-full h-full object-contain max-h-20 max-w-20"
            referrerPolicy="no-referrer"
            alt="Brasão Diocesano"
          />
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <p className="text-[8.5pt] font-extrabold tracking-[0.2em] text-slate-600 uppercase leading-none mb-1">
            {inst?.city_uf ? `DIOCESE DE ${inst.city_uf.split('/')[0].toUpperCase()}` : (inst?.diocese_name || 'DIOCESE DE GUARULHOS')}
          </p>
          <h1 className="text-[14.5pt] font-black uppercase tracking-tight text-slate-950 leading-tight">
            {inst?.name || 'ESCOLA DIOCESANA DE MINISTÉRIO'}
          </h1>
          <p className="text-[9pt] font-bold text-slate-600 tracking-wider uppercase mt-1">
            {inst?.subtitle || 'PE. JOSÉ FERNANDO DE BRITO'}
          </p>
        </div>
      </div>

      {/* Centered Document Title with standard underline */}
      <div className="text-center mt-2.5 mb-2">
        <h2 className="text-[12pt] font-black uppercase tracking-[0.25em] text-slate-900 border-b-2 border-slate-900 pb-1 px-8 inline-block">
          {title}
        </h2>
      </div>

      {/* Context Metadata Line */}
      <div className="flex justify-between items-center text-[7pt] font-bold text-slate-600 mb-2 uppercase">
        <span className="truncate max-w-[70%]">{filterText}</span>
        <span className="shrink-0">EMISSÃO: {new Date().toLocaleString('pt-BR')}</span>
      </div>
    </div>
  );
}

interface StandardFooterProps {
  inst: any;
  pageNumber: number;
  totalPages: number;
}

export function StandardReportFooter({
  inst,
  pageNumber,
  totalPages
}: StandardFooterProps) {
  const address = inst?.address || 'Av. Venus, 195 - Itapegica';
  const cep = inst?.cep || '07044-170';
  const cityUf = inst?.city_uf || 'Guarulhos/SP';
  const phone = inst?.phone || '(11) 2421-2935';
  const secretary = inst?.secretary || 'quarta a sexta-feira das 14h às 18h';
  const email = (inst?.email || 'email@email.com.br').toLowerCase();
  const hasWhatsapp = isInstitutionPhoneWhatsapp(inst);

  return (
    <div className="mt-auto pt-2 shrink-0 printable-footer">
      <div className="border-t-2 border-slate-900 pt-2 pb-0 flex justify-between items-start text-slate-900 text-[7pt]">
        {/* Coluna Esquerda: Endereço, CEP / Cidade e Telefone (grafia e estilo idênticos ao cadastro em Configurações) */}
        <div className="flex-1 space-y-0.5 font-bold">
          <p className="leading-tight">
            {address}
          </p>
          <p className="leading-tight">
            CEP: {cep} - {cityUf}
          </p>
          <p className="leading-tight pt-0.5 inline-flex items-center gap-1">
            <span>Telefone: {phone}</span>
            {hasWhatsapp && <FooterWhatsAppIcon className="w-[10px] h-[10px]" />}
          </p>
        </div>

        {/* Coluna Direita: Atendimento Secretaria, Horários e E-mail / Página */}
        <div className="text-right max-w-[380px] leading-tight text-slate-900 font-bold text-[7pt] space-y-0.5 pr-1">
          <p className="uppercase underline underline-offset-2 mb-0.5">Atendimento Secretaria:</p>
          <p className="whitespace-pre-line text-[7pt] leading-tight font-bold">{secretary}</p>
          <p className="text-[7pt] pt-0.5 font-bold">
            {email}  •  Página {pageNumber} de {totalPages}
          </p>
        </div>
      </div>
    </div>
  );
}

interface StandardReportSheetProps {
  inst: any;
  title: string;
  filterText?: string;
  pageNumber: number;
  totalPages: number;
  children: React.ReactNode;
  className?: string;
}

export function StandardReportSheet({
  inst,
  title,
  filterText = '',
  pageNumber,
  totalPages,
  children,
  className
}: StandardReportSheetProps) {
  return (
    <div
      className={cn(
        'w-full max-w-[210mm] h-[297mm] min-h-[297mm] max-h-[297mm] bg-white p-[12mm_15mm_10mm_15mm] border border-slate-200 shadow-md flex flex-col justify-between text-slate-950 font-sans leading-tight relative box-border printable-report-sheet print:shadow-none print:border-none print:m-0 overflow-hidden',
        className
      )}
    >
      <StandardReportHeader inst={inst} title={title} filterText={filterText} />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {children}
      </div>
      <StandardReportFooter inst={inst} pageNumber={pageNumber} totalPages={totalPages} />
    </div>
  );
}
