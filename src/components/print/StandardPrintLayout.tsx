import React from 'react';
import { DEFAULT_LOGO } from '../../lib/default-logo';
import { cn } from '../../lib/utils';

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
          <p className="leading-tight pt-0.5">
            Telefone: {phone}
          </p>
        </div>

        {/* Coluna Direita: Atendimento Secretaria, Horários e E-mail / Página */}
        <div className="text-right max-w-[380px] leading-tight text-slate-900 font-bold text-[7pt] space-y-0.5 pr-1">
          <p className="uppercase underline underline-offset-2 mb-0.5">Atendimento Secretaria:</p>
          <p className="whitespace-pre-line text-[7pt] leading-tight font-bold">{secretary}</p>
          <p className="text-[7pt] pt-0.5 font-bold">
            email: {email}  •  Página {pageNumber} de {totalPages}
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
