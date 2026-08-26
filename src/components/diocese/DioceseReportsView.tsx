import React from 'react';
import { 
  Printer, 
  FileDown, 
  Bookmark, 
  Target, 
  LayoutGrid, 
  Filter, 
  Search, 
  Church, 
  Map as MapIcon, 
  MapPin, 
  ArrowUpDown,
  Layers,
  ShieldCheck,
  User
} from 'lucide-react';
import { PageHeader } from '../PageHeader';
import { Parish, Foraria, ClergyLeity, InstitutionSettings } from '../../types';
import { cn } from '../../lib/utils';
import { formatCNPJ, getParishClergy, DioceseReportType, getClergyRoleRank, formatClergyRoleLabel } from '../../types/diocese';

interface DioceseReportsViewProps {
  parishes: Parish[];
  foraries: Foraria[];
  clergy: ClergyLeity[];
  institution: InstitutionSettings | null;
  reportType: DioceseReportType;
  setReportType: (type: DioceseReportType) => void;
  reportForaniaFilter: string;
  setReportForaniaFilter: (filter: string) => void;
  reportSearch: string;
  setReportSearch: (search: string) => void;
  reportParishesByForaniaSort: 'name' | 'cnpj';
  setReportParishesByForaniaSort: (sort: 'name' | 'cnpj') => void;
  reportClergyRoleFilter: string;
  setReportClergyRoleFilter: (role: string) => void;
  reportClergyGroupBy: 'none' | 'forania' | 'role';
  setReportClergyGroupBy: (group: 'none' | 'forania' | 'role') => void;
  reportParishesCnpjSort: 'name' | 'cnpj';
  setReportParishesCnpjSort: (sort: 'name' | 'cnpj') => void;
  handlePrint: () => void;
  handleExportPDF: () => void;
  getFilteredReportStats: () => {
    foraniasCount: number;
    parishesCount: number;
    priestsCount: number;
    deaconsCount: number;
  };
  getReportTitle: () => string;
}

export function DioceseReportsView({
  parishes,
  foraries,
  clergy,
  institution,
  reportType,
  setReportType,
  reportForaniaFilter,
  setReportForaniaFilter,
  reportSearch,
  setReportSearch,
  reportParishesByForaniaSort,
  setReportParishesByForaniaSort,
  reportClergyRoleFilter,
  setReportClergyRoleFilter,
  reportClergyGroupBy,
  setReportClergyGroupBy,
  reportParishesCnpjSort,
  setReportParishesCnpjSort,
  handlePrint,
  handleExportPDF,
  getFilteredReportStats,
  getReportTitle,
}: DioceseReportsViewProps) {
  const stats = getFilteredReportStats();

  // Extract distinct roles for the clergy role filter sorted by Canonical Hierarchy
  const distinctRoles = Array.from(
    new Set(clergy.map(c => (c.role || '').trim()).filter(Boolean))
  ).sort((a, b) => {
    const rankA = getClergyRoleRank(a);
    const rankB = getClergyRoleRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });

  // Helper to filter and sort clergy for directory
  const getFilteredClergy = () => {
    return clergy.filter(c => {
      // Forania filter
      if (reportForaniaFilter !== 'all') {
        const parish = parishes.find(p => p.id === c.parish_id);
        const foraniaId = parish?.forania_id || c.forania_id;
        if (foraniaId !== reportForaniaFilter) return false;
      }

      // Role filter
      if (reportClergyRoleFilter !== 'all') {
        const role = (c.role || '').toLowerCase();
        if (role !== reportClergyRoleFilter.toLowerCase()) return false;
      }

      // Search query
      const q = reportSearch.toLowerCase().trim();
      if (!q) return true;

      const parish = parishes.find(p => p.id === c.parish_id);
      const parishName = parish?.name?.toLowerCase() || '';
      return (
        c.name.toLowerCase().includes(q) ||
        (c.role && c.role.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        parishName.includes(q)
      );
    });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <PageHeader
        title="Relatórios e Impressão"
        description="Centro oficial de emissão, visualização e impressão de relatórios da Diocese de Guarulhos."
        icon={Printer}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="h-10 px-4 bg-white border border-slate-200 text-slate-700 rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            title="Imprimir documento via navegador"
          >
            <Printer size={14} className="text-slate-600" />
            Imprimir Relatório
          </button>
          <button
            onClick={handleExportPDF}
            className="h-10 px-4 bg-slate-900 text-white rounded-none text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            title="Baixar arquivo PDF formatado"
          >
            <FileDown size={14} className="text-blue-400" />
            Gerar PDF Oficial
          </button>
        </div>
      </PageHeader>

      {/* 4 Selectable Format Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 print:hidden">
        {[
          { 
            id: 'parishes_by_forania' as DioceseReportType, 
            title: 'Relatório por Foranias', 
            icon: FileDown, 
            desc: 'Quadro completo por foranias com CNPJ, padres e diáconos.' 
          },
          { 
            id: 'forania_summary' as DioceseReportType, 
            title: 'Quadro de Foranias', 
            icon: Bookmark, 
            desc: 'Resumo executivo de Foranias, Vigários Forâneos e totalização.' 
          },
          { 
            id: 'clergy_directory' as DioceseReportType, 
            title: 'Diretório do Clero', 
            icon: Target, 
            desc: 'Relação nominal de Padres, Vigários e Diáconos com atribuições.' 
          },
          { 
            id: 'parishes_cnpj_list' as DioceseReportType, 
            title: 'Paróquias & CNPJ', 
            icon: LayoutGrid, 
            desc: 'Relação cadastral oficial de Paróquias com CNPJ e contatos.' 
          }
        ].map((option, optIdx) => (
          <button
            key={`dio-rep-opt-${option.id || optIdx}-${optIdx}`}
            onClick={() => setReportType(option.id)}
            className={cn(
              "p-4 sm:p-5 rounded-none border-2 transition-all text-left flex flex-col gap-2.5 group cursor-pointer",
              reportType === option.id 
                ? "bg-slate-800 border-blue-600 text-white shadow-xl scale-[1.02]" 
                : "bg-white border-slate-200 hover:border-slate-300 text-slate-600 shadow-sm"
            )}
          >
            <option.icon size={22} className={reportType === option.id ? "text-white" : "text-slate-700"} />
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-widest leading-tight">{option.title}</h3>
              <p className={cn("text-[8.5px] mt-1.5 font-medium leading-relaxed", reportType === option.id ? "text-blue-100" : "text-slate-400")}>
                {option.desc}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Filters Configuration Box */}
      <div className="space-y-4 p-4 sm:p-6 bg-white rounded-none border border-slate-200 shadow-sm print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Filter size={14} /> Filtros e Personalização do Relatório
          </h4>
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50 px-2.5 py-1 border border-slate-200 w-fit">
            {stats.parishesCount} Paróquias • {stats.priestsCount + stats.deaconsCount} Clérigos
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Forania Filter (Common to all) */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Forania Específica</label>
            <select 
              value={reportForaniaFilter}
              onChange={(e) => setReportForaniaFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-none px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
            >
              <option value="all">Todas as Foranias ({foraries.length})</option>
              {foraries.map((f, fIdx) => (
                <option key={`dio-rep-for-opt-${f.id || fIdx}-${fIdx}`} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic Filter 1 based on Report Type */}
          {reportType === 'parishes_by_forania' && (
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-1">
                <ArrowUpDown size={11} className="text-slate-400" />
                Ordem das Paróquias
              </label>
              <select
                value={reportParishesByForaniaSort}
                onChange={(e) => setReportParishesByForaniaSort(e.target.value as 'name' | 'cnpj')}
                className="w-full bg-slate-50 border border-slate-200 rounded-none px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
              >
                <option value="name">Ordem Alfabética (Nome A-Z)</option>
                <option value="cnpj">Ordem por Número de CNPJ</option>
              </select>
            </div>
          )}

          {reportType === 'clergy_directory' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-1">
                  <ShieldCheck size={11} className="text-slate-400" />
                  Filtrar por Função / Título
                </label>
                <select
                  value={reportClergyRoleFilter}
                  onChange={(e) => setReportClergyRoleFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-none px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
                >
                  <option value="all">Todas as Funções ({clergy.length})</option>
                  {distinctRoles.map((role, rIdx) => (
                    <option key={`dio-rep-role-opt-${role || rIdx}-${rIdx}`} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-1">
                  <Layers size={11} className="text-slate-400" />
                  Separar / Agrupar Por
                </label>
                <select
                  value={reportClergyGroupBy}
                  onChange={(e) => setReportClergyGroupBy(e.target.value as 'none' | 'forania' | 'role')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-none px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
                >
                  <option value="none">Lista Geral Corrida (A-Z)</option>
                  <option value="forania">Separar por Forania</option>
                  <option value="role">Separar por Função / Título</option>
                </select>
              </div>
            </>
          )}

          {reportType === 'parishes_cnpj_list' && (
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1 flex items-center gap-1">
                <ArrowUpDown size={11} className="text-slate-400" />
                Ordem da Lista
              </label>
              <select
                value={reportParishesCnpjSort}
                onChange={(e) => setReportParishesCnpjSort(e.target.value as 'name' | 'cnpj')}
                className="w-full bg-slate-50 border border-slate-200 rounded-none px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
              >
                <option value="name">Por Nome da Paróquia (A-Z)</option>
                <option value="cnpj">Por Número do CNPJ (0-9)</option>
              </select>
            </div>
          )}

          {/* Quick Search */}
          <div className={cn(
            "space-y-1.5",
            reportType === 'forania_summary' ? "sm:col-span-1 lg:col-span-3" :
            reportType === 'parishes_by_forania' || reportType === 'parishes_cnpj_list' ? "sm:col-span-2 lg:col-span-2" :
            "sm:col-span-2 lg:col-span-1"
          )}>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] ml-1">Filtro Rápido (Texto / Busca)</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text"
                placeholder="Nome, CNPJ, Padre, Diácono..."
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-none pl-9 pr-3 py-2 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live Document Preview */}
      <div className="bg-slate-100 border border-slate-200 p-4 md:p-8 print:hidden shadow-inner">
        <div className="max-w-5xl mx-auto bg-white rounded-none shadow-xl border border-slate-300 p-6 md:p-10 text-slate-900">
          {/* Header Banner */}
          <div className="bg-white border-b-2 border-slate-900 pb-5 mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              {institution?.logo_url ? (
                <img
                  src={institution.logo_url}
                  alt="Logotipo"
                  className="w-14 h-14 object-contain rounded"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <div>
                <h2 className="text-base sm:text-lg font-black uppercase tracking-wider text-slate-900 leading-tight">
                  {institution?.name?.toUpperCase() || 'ESCOLA DIOCESANA DE MINISTÉRIO'}
                </h2>
                <p className="text-xs sm:text-sm font-bold text-slate-600 uppercase tracking-widest">
                  DIOCESE DE GUARULHOS
                </p>
                <p className="text-xs font-bold text-blue-700 uppercase mt-1">
                  {getReportTitle()}
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right space-y-1 text-xs text-slate-500">
              <p className="font-semibold text-slate-600">
                Emissão: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="font-bold text-slate-800 uppercase tracking-wide">
                {stats.parishesCount} {stats.parishesCount === 1 ? 'Paróquia' : 'Paróquias'} • {stats.priestsCount} Padres • {stats.deaconsCount} Diáconos
              </p>
            </div>
          </div>

          {/* Model 1: parishes_by_forania */}
          {reportType === 'parishes_by_forania' && (
            <div className="space-y-8">
              {(reportForaniaFilter === 'all' ? foraries : foraries.filter(f => f.id === reportForaniaFilter)).map((forania, fIdx) => {
                const foraniaParishes = parishes.filter(p => p.forania_id === forania.id);
                const filteredForaniaParishes = (reportSearch.trim()
                  ? foraniaParishes.filter(p => {
                      const q = reportSearch.toLowerCase().trim();
                      const cData = getParishClergy(p, clergy);
                      const priestMatch = cData.priests.some(pr => pr.name.toLowerCase().includes(q));
                      const deaconMatch = cData.deacons.some(d => d.toLowerCase().includes(q));
                      return p.name.toLowerCase().includes(q) || (p.cnpj && p.cnpj.toLowerCase().includes(q)) || priestMatch || deaconMatch;
                    })
                  : foraniaParishes
                ).slice().sort((a, b) => {
                  if (reportParishesByForaniaSort === 'cnpj') {
                    const cnpjA = (a.cnpj || '').replace(/\D/g, '');
                    const cnpjB = (b.cnpj || '').replace(/\D/g, '');
                    return cnpjA.localeCompare(cnpjB);
                  }
                  return a.name.localeCompare(b.name);
                });

                if (filteredForaniaParishes.length === 0 && reportSearch.trim()) return null;

                return (
                  <div key={`dio-rep-for-${forania.id || fIdx}-${fIdx}`} className="border border-slate-300 rounded-none overflow-hidden">
                    <div className="bg-slate-100 text-slate-900 px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-300">
                      <div className="flex items-center gap-3">
                        <MapIcon size={18} className="text-slate-700" />
                        <div>
                          <span className="font-bold text-sm uppercase tracking-wide">
                            FORANIA {forania.name}
                          </span>
                          {forania.priest_name && (
                            <span className="text-xs text-slate-600 ml-3 font-normal">
                              • Padre Forâneo: <strong className="text-slate-900 font-bold">Pe. {forania.priest_name}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">
                          Ordem: {reportParishesByForaniaSort === 'cnpj' ? 'CNPJ' : 'Nome'}
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider bg-white px-2.5 py-1 rounded-none text-slate-800 border border-slate-300">
                          {filteredForaniaParishes.length} {filteredForaniaParishes.length === 1 ? 'Paróquia' : 'Paróquias'}
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-300 text-slate-800 font-bold uppercase text-[10px]">
                            <th className="py-3 px-4 w-[34%] border-r border-slate-200">Paróquia / Localização</th>
                            <th className="py-3 px-4 w-[20%] border-r border-slate-200">CNPJ</th>
                            <th className="py-3 px-4 w-[26%] border-r border-slate-200">Padre(s) Responsável(is)</th>
                            <th className="py-3 px-4 w-[20%]">Diácono(s)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredForaniaParishes.length > 0 ? (
                            filteredForaniaParishes.map((parish, pIdx) => {
                              const clergyData = getParishClergy(parish, clergy);
                              return (
                                <tr key={`dio-rep-par-${parish.id || pIdx}-${pIdx}`} className="hover:bg-slate-50 transition-colors">
                                  <td className="py-3 px-4 align-top border-r border-slate-200">
                                    <div className="flex items-start gap-2">
                                      <Church size={15} className="text-blue-600 shrink-0 mt-0.5" />
                                      <div>
                                        <p className="font-bold text-slate-900 uppercase text-xs leading-tight">
                                          {parish.name}
                                        </p>
                                        {(parish.address_neighborhood || parish.address_city) && (
                                          <p className="text-[10px] text-slate-600 mt-1 flex items-center gap-1">
                                            <MapPin size={11} className="text-slate-400" />
                                            {[parish.address_neighborhood, parish.address_city ? `${parish.address_city}${parish.address_state ? `/${parish.address_state}` : ''}` : ''].filter(Boolean).join(' • ')}
                                          </p>
                                        )}
                                        {(parish.phone || parish.email) && (
                                          <p className="text-[9.5px] text-slate-500 mt-0.5">
                                            {[parish.phone ? `Tel: ${parish.phone}` : '', parish.email].filter(Boolean).join(' | ')}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 align-top border-r border-slate-200">
                                    <span className="font-mono font-semibold text-slate-800 text-[11px] bg-slate-100 px-2 py-0.5 rounded-none border border-slate-200 inline-block">
                                      {formatCNPJ(parish.cnpj)}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 align-top border-r border-slate-200">
                                    {clergyData.priests.length > 0 ? (
                                      <div className="space-y-1.5">
                                        {clergyData.priests.map((p, idx) => (
                                          <div key={`dio-priest-${p.name}-${idx}`} className="leading-tight">
                                            <p className="font-bold text-slate-800 text-xs">{p.name}</p>
                                            <span className="inline-block text-[9px] font-semibold uppercase px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded-none border border-blue-100">
                                              {p.role}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 italic text-xs">A designar</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 align-top">
                                    {clergyData.deacons.length > 0 ? (
                                      <div className="space-y-1">
                                        {clergyData.deacons.map((d, idx) => (
                                          <p key={`dio-deacon-${d}-${idx}`} className="font-semibold text-slate-700 text-xs leading-tight">{d}</p>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 text-xs">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} className="py-4 text-center text-slate-400 italic text-xs">
                                Nenhuma paróquia vinculada a esta forania.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Model 2: forania_summary */}
          {reportType === 'forania_summary' && (
            <div className="border border-slate-300 rounded-none overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-900 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4 border-r border-slate-200">Nome da Forania</th>
                    <th className="py-3 px-4 border-r border-slate-200">Vigário Forâneo</th>
                    <th className="py-3 px-4 text-center w-32">Qtd. Paróquias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(reportForaniaFilter === 'all' ? foraries : foraries.filter(f => f.id === reportForaniaFilter)).map((forania, fIdx) => {
                    const foraniaParishes = parishes.filter(p => p.forania_id === forania.id);
                    return (
                      <tr key={`dio-rep-sum-for-${forania.id || fIdx}-${fIdx}`} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-bold text-slate-900 uppercase border-r border-slate-200">{forania.name}</td>
                        <td className="py-3 px-4 text-slate-800 border-r border-slate-200">
                          {forania.priest_name ? `Pe. ${forania.priest_name}` : <span className="text-slate-400 italic">Não designado</span>}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-800">{foraniaParishes.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Model 3: clergy_directory */}
          {reportType === 'clergy_directory' && (() => {
            const filteredClergy = getFilteredClergy();

            // 1. Group by Forania
            if (reportClergyGroupBy === 'forania') {
              const foraniasToDisplay = reportForaniaFilter === 'all' 
                ? foraries 
                : foraries.filter(f => f.id === reportForaniaFilter);

              return (
                <div className="space-y-8">
                  {foraniasToDisplay.map((forania, fIdx) => {
                    const clergyInForania = filteredClergy.filter(c => {
                      const parish = parishes.find(p => p.id === c.parish_id);
                      const fId = parish?.forania_id || c.forania_id;
                      return fId === forania.id;
                    }).sort((a, b) => {
                      const rankA = getClergyRoleRank(a.role);
                      const rankB = getClergyRoleRank(b.role);
                      if (rankA !== rankB) return rankA - rankB;
                      return a.name.localeCompare(b.name);
                    });

                    if (clergyInForania.length === 0 && reportSearch.trim()) return null;

                    return (
                      <div key={`dio-rep-c-for-${forania.id || fIdx}-${fIdx}`} className="border border-slate-300 rounded-none overflow-hidden">
                        <div className="bg-slate-100 text-slate-900 px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-300">
                          <div className="flex items-center gap-3">
                            <MapIcon size={18} className="text-slate-700" />
                            <div>
                              <span className="font-bold text-sm uppercase tracking-wide">
                                FORANIA {forania.name}
                              </span>
                              {forania.priest_name && (
                                <span className="text-xs text-slate-600 ml-3 font-normal">
                                  • Vigário Forâneo: <strong className="text-slate-900 font-bold">Pe. {forania.priest_name}</strong>
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-wider bg-white px-2.5 py-1 rounded-none text-slate-800 border border-slate-300">
                            {clergyInForania.length} {clergyInForania.length === 1 ? 'Clérigo' : 'Clérigos'}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-300 text-slate-800 font-bold uppercase text-[10px]">
                                <th className="py-3 px-4 border-r border-slate-200 w-[30%]">Nome do Clérigo</th>
                                <th className="py-3 px-4 border-r border-slate-200 w-[20%]">Função / Título</th>
                                <th className="py-3 px-4 border-r border-slate-200 w-[30%]">Paróquia de Atuação</th>
                                <th className="py-3 px-4 w-[20%]">Contato / E-mail</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {clergyInForania.length > 0 ? (
                                clergyInForania.map((c, cIdx) => {
                                  const parish = parishes.find(p => p.id === c.parish_id);
                                  return (
                                    <tr key={`dio-rep-c-row-${c.id || cIdx}-${cIdx}`} className="hover:bg-slate-50">
                                      <td className="py-3 px-4 font-bold text-slate-900 border-r border-slate-200">{c.name}</td>
                                      <td className="py-3 px-4 font-semibold text-slate-700 uppercase text-[10px] border-r border-slate-200">
                                        <span className="inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 bg-blue-50 text-blue-800 rounded-none border border-blue-100">
                                          {c.role || 'Membro do Clero'}
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 text-slate-800 border-r border-slate-200">
                                        {parish ? (
                                          <div>
                                            <span className="font-semibold">{parish.name}</span>
                                            {parish.address_neighborhood && (
                                              <p className="text-[10px] text-slate-500">{parish.address_neighborhood}</p>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-slate-400 italic">Geral / Sem Paróquia</span>
                                        )}
                                      </td>
                                      <td className="py-3 px-4 text-slate-600 text-[11px]">
                                        {[c.phone, c.email].filter(Boolean).join(' • ') || '—'}
                                      </td>
                                    </tr>
                                  );
                                })
                              ) : (
                                <tr>
                                  <td colSpan={4} className="py-4 text-center text-slate-400 italic text-xs">
                                    Nenhum clérigo com os filtros selecionados nesta forania.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            // 2. Group by Role / Function
            if (reportClergyGroupBy === 'role') {
              const rolesList = Array.from(new Set(filteredClergy.map(c => c.role || 'Outros'))).sort((a, b) => {
                const rankA = getClergyRoleRank(a);
                const rankB = getClergyRoleRank(b);
                if (rankA !== rankB) return rankA - rankB;
                return a.localeCompare(b);
              });
              return (
                <div className="space-y-8">
                  {rolesList.map((roleName, rIdx) => {
                    const clergyInRole = filteredClergy.filter(c => (c.role || 'Outros') === roleName).sort((a, b) => a.name.localeCompare(b.name));
                    return (
                      <div key={`dio-rep-role-box-${roleName || rIdx}-${rIdx}`} className="border border-slate-300 rounded-none overflow-hidden">
                        <div className="bg-slate-100 text-slate-900 px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-300">
                          <div className="flex items-center gap-3">
                            <ShieldCheck size={18} className="text-blue-700" />
                            <span className="font-bold text-sm uppercase tracking-wide">
                              {roleName.toUpperCase()}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-wider bg-white px-2.5 py-1 rounded-none text-slate-800 border border-slate-300">
                            {clergyInRole.length} {clergyInRole.length === 1 ? 'Membro' : 'Membros'}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-300 text-slate-800 font-bold uppercase text-[10px]">
                                <th className="py-3 px-4 border-r border-slate-200 w-[30%]">Nome do Clérigo</th>
                                <th className="py-3 px-4 border-r border-slate-200 w-[30%]">Paróquia de Atuação</th>
                                <th className="py-3 px-4 border-r border-slate-200 w-[20%]">Forania</th>
                                <th className="py-3 px-4 w-[20%]">Contato / E-mail</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {clergyInRole.map((c, cIdx) => {
                                const parish = parishes.find(p => p.id === c.parish_id);
                                const forania = foraries.find(f => f.id === (parish?.forania_id || c.forania_id));
                                return (
                                  <tr key={`dio-rep-role-c-${c.id || cIdx}-${cIdx}`} className="hover:bg-slate-50">
                                    <td className="py-3 px-4 font-bold text-slate-900 border-r border-slate-200">{c.name}</td>
                                    <td className="py-3 px-4 text-slate-800 border-r border-slate-200">
                                      {parish ? parish.name : <span className="text-slate-400 italic">Geral / Sem Paróquia</span>}
                                    </td>
                                    <td className="py-3 px-4 text-slate-700 border-r border-slate-200">
                                      {forania ? forania.name : '—'}
                                    </td>
                                    <td className="py-3 px-4 text-slate-600 text-[11px]">
                                      {[c.phone, c.email].filter(Boolean).join(' • ') || '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }

            // 3. Default: Flat List (No Grouping)
            return (
              <div className="border border-slate-300 rounded-none overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-900 font-bold uppercase text-[10px]">
                      <th className="py-3 px-4 border-r border-slate-200 w-[30%]">Nome do Clérigo</th>
                      <th className="py-3 px-4 border-r border-slate-200 w-[18%]">Função / Título</th>
                      <th className="py-3 px-4 border-r border-slate-200 w-[32%]">Paróquia de Atuação</th>
                      <th className="py-3 px-4 w-[20%]">Contato / E-mail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredClergy.length > 0 ? (
                      filteredClergy
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((c, cIdx) => {
                          const parish = parishes.find(p => p.id === c.parish_id);
                          return (
                            <tr key={`dio-rep-flat-c-${c.id || cIdx}-${cIdx}`} className="hover:bg-slate-50">
                              <td className="py-3 px-4 font-bold text-slate-900 border-r border-slate-200">{c.name}</td>
                              <td className="py-3 px-4 font-semibold text-slate-700 uppercase text-[10px] border-r border-slate-200">{c.role || 'Membro do Clero'}</td>
                              <td className="py-3 px-4 text-slate-800 border-r border-slate-200">{parish ? parish.name : <span className="text-slate-400 italic">Geral / Sem Paróquia</span>}</td>
                              <td className="py-3 px-4 text-slate-600 text-[11px]">{[c.phone, c.email].filter(Boolean).join(' • ') || '—'}</td>
                            </tr>
                          );
                        })
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-400 italic text-xs">
                          Nenhum clérigo encontrado com os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Model 4: parishes_cnpj_list */}
          {reportType === 'parishes_cnpj_list' && (
            <div className="border border-slate-300 rounded-none overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-900 font-bold uppercase text-[10px]">
                    <th className="py-3 px-4 border-r border-slate-200 w-[35%]">Paróquia</th>
                    <th className="py-3 px-4 border-r border-slate-200 w-[18%]">CNPJ</th>
                    <th className="py-3 px-4 border-r border-slate-200 w-[20%]">Forania</th>
                    <th className="py-3 px-4 w-[27%]">Bairro / Cidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {parishes
                    .filter(p => {
                      if (reportForaniaFilter !== 'all' && p.forania_id !== reportForaniaFilter) return false;
                      const q = reportSearch.toLowerCase().trim();
                      if (!q) return true;
                      return p.name.toLowerCase().includes(q) || (p.cnpj && p.cnpj.toLowerCase().includes(q));
                    })
                    .sort((a, b) => {
                      if (reportParishesCnpjSort === 'cnpj') {
                        const cnpjA = (a.cnpj || '').replace(/\D/g, '');
                        const cnpjB = (b.cnpj || '').replace(/\D/g, '');
                        return cnpjA.localeCompare(cnpjB);
                      }
                      return a.name.localeCompare(b.name);
                    })
                    .map((p, pIdx) => {
                      const f = foraries.find(forania => forania.id === p.forania_id);
                      return (
                        <tr key={`dio-rep-cnpj-p-${p.id || pIdx}-${pIdx}`} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-bold text-slate-900 border-r border-slate-200">{p.name}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800 border-r border-slate-200">{formatCNPJ(p.cnpj)}</td>
                          <td className="py-3 px-4 text-slate-700 border-r border-slate-200">{f ? f.name : 'Sem Forania'}</td>
                          <td className="py-3 px-4 text-slate-600">{[p.address_neighborhood, p.address_city].filter(Boolean).join(' - ') || '—'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* Document Footer */}
          <div className="mt-10 pt-4 border-t-2 border-slate-300 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
            <div>
              <p className="font-bold text-slate-800 uppercase">
                {institution?.name?.toUpperCase() || 'ESCOLA DIOCESANA DE MINISTÉRIO'} • DIOCESE DE GUARULHOS
              </p>
              <p className="text-[11px]">Documento oficial para consulta e fins administrativos</p>
            </div>
            <div className="text-right text-[11px] text-slate-500 font-medium">
              Documento Administrativo Oficial
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
