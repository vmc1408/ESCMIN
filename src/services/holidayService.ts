/**
 * Serviço de Feriados Nacionais, Estaduais e Municipais
 * Suporte a API Externa (BrasilAPI) com fallback resiliente e catálogo dinâmico de feriados móveis e regionais
 */

import { HolidayEntry, HolidayType } from '../types/annualCalendar';

// Algoritmo de Meeus/Jones/Butcher para cálculo da data da Páscoa (Gregoriano)
export function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = Março, 4 = Abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Formatação segura YYYY-MM-DD
function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Catálogo de feriados estaduais conhecidos no Brasil
export const STATE_HOLIDAYS_CATALOG: Record<string, Array<{ name: string; month: number; day: number }>> = {
  SP: [
    { name: 'Revolução Constitucionalista de 1932', month: 7, day: 9 }
  ],
  RJ: [
    { name: 'Dia de São Jorge', month: 4, day: 23 },
    { name: 'Dia do Servidor Público (Feriado Estadual RJ)', month: 10, day: 28 }
  ],
  MG: [
    { name: 'Data Magna de Minas Gerais', month: 4, day: 21 }
  ],
  BA: [
    { name: 'Independência da Bahia (Dois de Julho)', month: 7, day: 2 }
  ],
  RS: [
    { name: 'Revolução Farroupilha (Dia do Gaúcho)', month: 9, day: 20 }
  ],
  PE: [
    { name: 'Data Magna de Pernambuco (Revolução Pernambucana)', month: 3, day: 6 }
  ],
  CE: [
    { name: 'Data Magna do Ceará (Abolição da Escravidão no Ceará)', month: 3, day: 25 }
  ],
  PR: [
    { name: 'Emancipação Política do Paraná', month: 12, day: 19 }
  ],
  SC: [
    { name: 'Criação da Capitania de Santa Catarina (Data Magna)', month: 8, day: 11 }
  ],
  GO: [
    { name: 'Pedra Fundamental de Goiânia', month: 10, day: 24 }
  ],
  DF: [
    { name: 'Fundação de Brasília', month: 4, day: 21 },
    { name: 'Dia do Evangélico', month: 11, day: 30 }
  ],
  AM: [
    { name: 'Elevação do Amazonas a Província', month: 9, day: 5 }
  ],
  PA: [
    { name: 'Adesão do Grão-Pará à Independência', month: 8, day: 15 }
  ],
  MA: [
    { name: 'Adesão do Maranhão à Independência', month: 7, day: 28 }
  ],
  PB: [
    { name: 'Fundação da Paraíba', month: 8, day: 5 }
  ],
  RN: [
    { name: 'Mártires de Cunhaú e Uruuaçu', month: 10, day: 3 }
  ],
  AL: [
    { name: 'Emancipação Política de Alagoas', month: 9, day: 16 }
  ],
  PI: [
    { name: 'Dia do Piauí', month: 10, day: 19 }
  ],
  SE: [
    { name: 'Emancipação Política de Sergipe', month: 7, day: 8 }
  ],
  MS: [
    { name: 'Criação do Estado do Mato Grosso do Sul', month: 10, day: 11 }
  ],
  MT: [
    { name: 'Consciência Negra (Estadual MT)', month: 11, day: 20 }
  ],
  ES: [
    { name: 'Dia do Servidor Público (Feriado Estadual ES)', month: 10, day: 28 }
  ],
  TO: [
    { name: 'Criação do Estado do Tocantins', month: 10, day: 5 }
  ],
  RO: [
    { name: 'Criação do Estado de Rondônia', month: 1, day: 4 }
  ],
  AC: [
    { name: 'Aniversário do Acre', month: 6, day: 15 },
    { name: 'Dia da Amazônia', month: 9, day: 5 },
    { name: 'Tratado de Petrópolis', month: 11, day: 17 }
  ],
  AP: [
    { name: 'Dia de São José (Padroeiro do Amapá)', month: 3, day: 19 },
    { name: 'Criação do Território Federal do Amapá', month: 9, day: 13 },
    { name: 'Criação do Estado do Amapá', month: 10, day: 5 }
  ],
  RR: [
    { name: 'Criação do Estado de Roraima', month: 10, day: 5 }
  ]
};

// Catálogo de feriados municipais comuns (com possibilidade de edição)
export const MUNICIPAL_HOLIDAYS_CATALOG: Record<string, Array<{ name: string; month: number; day: number }>> = {
  'guarulhos': [
    { name: 'Nossa Senhora da Conceição (Padroeira e Aniversário de Guarulhos)', month: 12, day: 8 }
  ],
  'são paulo': [
    { name: 'Aniversário da Cidade de São Paulo', month: 1, day: 25 }
  ],
  'sao paulo': [
    { name: 'Aniversário da Cidade de São Paulo', month: 1, day: 25 }
  ],
  'rio de janeiro': [
    { name: 'Dia de São Sebastião (Padroeiro do Rio)', month: 1, day: 20 },
    { name: 'Aniversário da Cidade do Rio de Janeiro', month: 3, day: 1 }
  ],
  'belo horizonte': [
    { name: 'Nossa Senhora da Boa Viagem', month: 8, day: 15 },
    { name: 'Imaculada Conceição', month: 12, day: 8 }
  ],
  'curitiba': [
    { name: 'Nossa Senhora da Luz dos Pinhais (Padroeira de Curitiba)', month: 9, day: 8 }
  ],
  'salvador': [
    { name: 'Nossa Senhora da Conceição da Praia', month: 12, day: 8 }
  ],
  'recife': [
    { name: 'Nossa Senhora do Carmo', month: 7, day: 16 },
    { name: 'Nossa Senhora da Conceição', month: 12, day: 8 }
  ],
  'fortaleza': [
    { name: 'Aniversário de Fortaleza', month: 4, day: 13 },
    { name: 'Nossa Senhora da Assunção', month: 8, day: 15 }
  ],
  'campinas': [
    { name: 'Aniversário de Campinas', month: 7, day: 14 },
    { name: 'Nossa Senhora da Conceição', month: 12, day: 8 }
  ],
  'santo andré': [
    { name: 'Aniversário de Santo André', month: 4, day: 8 }
  ],
  'são bernardo do campo': [
    { name: 'Nossa Senhora da Boa Viagem / Aniversário de SBC', month: 8, day: 20 }
  ],
  'osasco': [
    { name: 'Emancipação de Osasco', month: 2, day: 19 }
  ]
};

export const BRAZILIAN_STATES = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
];

/**
 * Gera os feriados nacionais pelo algoritmo interno resiliente.
 * Funciona para qualquer ano passado ou futuro até 2100+ sem depender de rede.
 */
export function generateInternalNationalHolidays(year: number): HolidayEntry[] {
  const easter = calculateEaster(year);

  // Carnaval: Terça-feira (47 dias antes da Páscoa) e Segunda-feira de Carnaval (48 dias antes)
  const carnivalTue = new Date(easter);
  carnivalTue.setDate(easter.getDate() - 47);

  const carnivalMon = new Date(easter);
  carnivalMon.setDate(easter.getDate() - 48);

  // Sexta-feira Santa: 2 dias antes da Páscoa
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);

  // Corpus Christi: 60 dias após a Páscoa
  const corpusChristi = new Date(easter);
  corpusChristi.setDate(easter.getDate() + 60);

  const nowIso = new Date().toISOString();

  const list: HolidayEntry[] = [
    {
      id: `hol_nac_${year}_01_01`,
      name: 'Confraternização Universal (Ano Novo)',
      date: `${year}-01-01`,
      type: 'nacional',
      is_movable: false,
      origin: 'Cálculo Interno (Regra Nacional)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_carnaval_mon`,
      name: 'Carnaval (Segunda-feira)',
      date: formatDate(carnivalMon),
      type: 'nacional',
      is_movable: true,
      origin: 'Cálculo Interno (Móvel / Páscoa)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_carnaval_tue`,
      name: 'Carnaval (Terça-feira)',
      date: formatDate(carnivalTue),
      type: 'nacional',
      is_movable: true,
      origin: 'Cálculo Interno (Móvel / Páscoa)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_sexta_santa`,
      name: 'Sexta-feira Santa (Paixão de Cristo)',
      date: formatDate(goodFriday),
      type: 'nacional',
      is_movable: true,
      origin: 'Cálculo Interno (Móvel / Páscoa)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_pascoa`,
      name: 'Páscoa',
      date: formatDate(easter),
      type: 'nacional',
      is_movable: true,
      origin: 'Cálculo Interno (Móvel / Páscoa)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_tiradentes`,
      name: 'Tiradentes',
      date: `${year}-04-21`,
      type: 'nacional',
      is_movable: false,
      origin: 'Cálculo Interno (Regra Nacional)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_trabalho`,
      name: 'Dia Mundial do Trabalho',
      date: `${year}-05-01`,
      type: 'nacional',
      is_movable: false,
      origin: 'Cálculo Interno (Regra Nacional)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_corpus_christi`,
      name: 'Corpus Christi',
      date: formatDate(corpusChristi),
      type: 'nacional',
      is_movable: true,
      origin: 'Cálculo Interno (Móvel / Páscoa)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_independencia`,
      name: 'Independência do Brasil',
      date: `${year}-09-07`,
      type: 'nacional',
      is_movable: false,
      origin: 'Cálculo Interno (Regra Nacional)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_aparecida`,
      name: 'Nossa Senhora Aparecida (Padroeira do Brasil)',
      date: `${year}-10-12`,
      type: 'nacional',
      is_movable: false,
      origin: 'Cálculo Interno (Regra Nacional)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_finados`,
      name: 'Finados',
      date: `${year}-11-02`,
      type: 'nacional',
      is_movable: false,
      origin: 'Cálculo Interno (Regra Nacional)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_proclamacao`,
      name: 'Proclamação da República',
      date: `${year}-11-15`,
      type: 'nacional',
      is_movable: false,
      origin: 'Cálculo Interno (Regra Nacional)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_consciencia_negra`,
      name: 'Dia Nacional de Zumbi e da Consciência Negra',
      date: `${year}-11-20`,
      type: 'nacional',
      is_movable: false,
      origin: 'Cálculo Interno (Lei Federal 14.759/2023)',
      has_class: false,
      query_date: nowIso
    },
    {
      id: `hol_nac_${year}_natal`,
      name: 'Natal',
      date: `${year}-12-25`,
      type: 'nacional',
      is_movable: false,
      origin: 'Cálculo Interno (Regra Nacional)',
      has_class: false,
      query_date: nowIso
    }
  ];

  return list;
}

/**
 * Consulta feriados da API BrasilAPI com timeout e fallback suave.
 */
export async function fetchBrasilApiHolidays(year: number): Promise<{
  holidays: HolidayEntry[];
  usedApi: boolean;
  warning?: string;
}> {
  const queryDate = new Date().toISOString();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 segundos de timeout

    const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Status ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Formato inválido retornado pela API.');
    }

    const apiHolidays: HolidayEntry[] = data.map((item: any, idx: number) => {
      const date = item.date;
      const name = item.name;
      const isMovable = ['carnaval', 'páscoa', 'pascoa', 'sexta-feira santa', 'corpus christi'].some(m => 
        name.toLowerCase().includes(m)
      );

      return {
        id: `api_${year}_${date}_${idx}`,
        name: name,
        date: date,
        type: 'nacional',
        is_movable: isMovable,
        origin: 'API BrasilAPI',
        has_class: false,
        query_date: queryDate
      };
    });

    return {
      holidays: apiHolidays,
      usedApi: true
    };
  } catch (err: any) {
    console.warn(`[HolidayService] Falha ou timeout ao consultar BrasilAPI para o ano ${year}. Ativando cálculo interno:`, err?.message || err);

    const fallbackHolidays = generateInternalNationalHolidays(year);
    return {
      holidays: fallbackHolidays,
      usedApi: false,
      warning: 'API externa temporariamente indisponível. Feriados nacionais gerados pelo algoritmo interno. Por favor, confira a lista antes da publicação.'
    };
  }
}

/**
 * Gera feriados estaduais para a UF selecionada.
 */
export function getHolidaysForState(year: number, stateUf: string): HolidayEntry[] {
  const upperUf = (stateUf || '').toUpperCase().trim();
  const catalog = STATE_HOLIDAYS_CATALOG[upperUf] || [];
  const queryDate = new Date().toISOString();

  return catalog.map((item, idx) => {
    const mm = String(item.month).padStart(2, '0');
    const dd = String(item.day).padStart(2, '0');
    const dateStr = `${year}-${mm}-${dd}`;

    return {
      id: `hol_est_${upperUf}_${year}_${mm}_${dd}_${idx}`,
      name: item.name,
      date: dateStr,
      type: 'estadual' as HolidayType,
      state: upperUf,
      is_movable: false,
      origin: `Feriado Estadual (${upperUf})`,
      has_class: false,
      query_date: queryDate
    };
  });
}

/**
 * Gera feriados municipais para a cidade selecionada.
 */
export function getHolidaysForCity(year: number, cityName: string, stateUf?: string): HolidayEntry[] {
  const normalized = (cityName || '').toLowerCase().trim();
  const catalog = MUNICIPAL_HOLIDAYS_CATALOG[normalized] || [];
  const queryDate = new Date().toISOString();

  return catalog.map((item, idx) => {
    const mm = String(item.month).padStart(2, '0');
    const dd = String(item.day).padStart(2, '0');
    const dateStr = `${year}-${mm}-${dd}`;

    return {
      id: `hol_mun_${normalized.replace(/\s+/g, '_')}_${year}_${mm}_${dd}_${idx}`,
      name: item.name,
      date: dateStr,
      type: 'municipal' as HolidayType,
      state: stateUf,
      city: cityName,
      is_movable: false,
      origin: `Feriado Municipal (${cityName})`,
      has_class: false,
      query_date: queryDate
    };
  });
}

/**
 * Consolida feriados Nacionais, Estaduais e Municipais, eliminando duplicidades por data.
 * Se houver conflito na mesma data, preserva a prioridade ou une os nomes de forma legível.
 */
export function consolidateHolidays(holidays: HolidayEntry[]): HolidayEntry[] {
  const dateMap = new Map<string, HolidayEntry>();

  holidays.forEach(h => {
    if (!h.date) return;
    const existing = dateMap.get(h.date);
    if (!existing) {
      dateMap.set(h.date, { ...h });
      return;
    }

    // Se já existe um feriado nesta data:
    // Se o novo tiver prioridade ou nomes diferentes, combinamos informações
    if (existing.name.toLowerCase() !== h.name.toLowerCase()) {
      existing.name = `${existing.name} / ${h.name}`;
      existing.notes = [existing.notes, h.notes].filter(Boolean).join(' | ');
      // Se um deles for municipal ou estadual, mantém registro composto
      if (h.type === 'municipal' && existing.type !== 'municipal') {
        existing.city = h.city || existing.city;
      }
      if (h.type === 'estadual' && existing.type !== 'estadual') {
        existing.state = h.state || existing.state;
      }
    }
  });

  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Carrega a lista completa consolidada de feriados para um ano, estado e município.
 */
export async function loadConsolidatedHolidays(
  year: number, 
  stateUf: string, 
  cityName: string
): Promise<{
  holidays: HolidayEntry[];
  usedApi: boolean;
  warning?: string;
}> {
  // 1. Feriados Nacionais (API com fallback)
  const apiRes = await fetchBrasilApiHolidays(year);

  // 2. Feriados Estaduais
  const stateHols = getHolidaysForState(year, stateUf);

  // 3. Feriados Municipais
  const cityHols = getHolidaysForCity(year, cityName, stateUf);

  // 4. Consolidação e desduplicação
  const allHolidays = consolidateHolidays([...apiRes.holidays, ...stateHols, ...cityHols]);

  return {
    holidays: allHolidays,
    usedApi: apiRes.usedApi,
    warning: apiRes.warning
  };
}
