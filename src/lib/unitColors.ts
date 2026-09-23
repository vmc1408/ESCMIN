// Sistema de Identidade Visual e Cores Exclusivas por Unidade / Polo
export type UnitColorKey = 'blue' | 'emerald' | 'amber' | 'purple' | 'teal' | 'rose' | 'indigo' | 'cyan' | 'slate';

export interface UnitColorTheme {
  key: UnitColorKey;
  label: string;
  primary: string;         // Hexadecimal principal
  ringColor: string;
  // Classes para quadros e frames
  frameBg: string;         // Fundo suave do frame/seção
  frameBorder: string;     // Borda do frame
  frameBorderTop: string;  // Borda de topo do frame
  cardBg: string;          // Fundo suave dos quadros de síntese
  cardBorder: string;      // Borda dos quadros
  cardHoverBorder: string; // Borda de hover dos quadros
  // Badges e textos
  accentBar: string;       // Marcador vertical de seção
  textAccent: string;      // Texto de destaque
  textDark: string;        // Texto escuro
  badgeBg: string;         // Fundo de pill/badge
  badgeText: string;       // Texto de badge
  badgeBorder: string;     // Borda de badge
  // Caixas de ícones
  iconBox: string;         // Container do ícone
  iconText: string;        // Cor do ícone
  // Botões e controles
  buttonPrimary: string;   // Botão sólido
  buttonSecondary: string; // Botão suave / secundário
  buttonHover: string;
  // Barras de progresso e indicadores
  progressBar: string;     // Barra de ocupação
  dotIndicator: string;    // Indicador circular da unidade logada
  dotPing: string;         // Efeito pulsante suave
}

export const UNIT_COLOR_THEMES: Record<UnitColorKey, UnitColorTheme> = {
  // Azul Institucional - Padrão Sede / Matriz
  blue: {
    key: 'blue',
    label: 'Azul Institucional (Sede / Matriz)',
    primary: '#2563eb',
    ringColor: 'ring-blue-400',
    frameBg: 'bg-gradient-to-b from-blue-50/40 via-slate-50/20 to-white',
    frameBorder: 'border-blue-200/70',
    frameBorderTop: 'border-t-4 border-t-blue-600',
    cardBg: 'bg-gradient-to-br from-blue-50/30 via-white to-white',
    cardBorder: 'border-blue-200/80',
    cardHoverBorder: 'hover:border-blue-400',
    accentBar: 'bg-blue-600',
    textAccent: 'text-blue-700',
    textDark: 'text-blue-950',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200',
    iconBox: 'bg-blue-50 border border-blue-200/80 text-blue-600',
    iconText: 'text-blue-600',
    buttonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonSecondary: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200',
    buttonHover: 'hover:bg-blue-50 hover:text-blue-700',
    progressBar: 'bg-blue-600',
    dotIndicator: 'bg-blue-600',
    dotPing: 'bg-blue-400',
  },

  // Esmeralda / Verde Floresta - Excelente para Polo Grs Pimentas
  emerald: {
    key: 'emerald',
    label: 'Verde Esmeralda',
    primary: '#059669',
    ringColor: 'ring-emerald-400',
    frameBg: 'bg-gradient-to-b from-emerald-50/40 via-slate-50/20 to-white',
    frameBorder: 'border-emerald-200/80',
    frameBorderTop: 'border-t-4 border-t-emerald-600',
    cardBg: 'bg-gradient-to-br from-emerald-50/30 via-white to-white',
    cardBorder: 'border-emerald-200/80',
    cardHoverBorder: 'hover:border-emerald-400',
    accentBar: 'bg-emerald-600',
    textAccent: 'text-emerald-700',
    textDark: 'text-emerald-950',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-200',
    iconBox: 'bg-emerald-50 border border-emerald-200/90 text-emerald-700',
    iconText: 'text-emerald-700',
    buttonPrimary: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    buttonSecondary: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200',
    buttonHover: 'hover:bg-emerald-50 hover:text-emerald-800',
    progressBar: 'bg-emerald-600',
    dotIndicator: 'bg-emerald-600',
    dotPing: 'bg-emerald-400',
  },

  // Âmbar / Dourado Solar
  amber: {
    key: 'amber',
    label: 'Âmbar Dourado',
    primary: '#d97706',
    ringColor: 'ring-amber-400',
    frameBg: 'bg-gradient-to-b from-amber-50/40 via-slate-50/20 to-white',
    frameBorder: 'border-amber-200/80',
    frameBorderTop: 'border-t-4 border-t-amber-500',
    cardBg: 'bg-gradient-to-br from-amber-50/30 via-white to-white',
    cardBorder: 'border-amber-200/80',
    cardHoverBorder: 'hover:border-amber-400',
    accentBar: 'bg-amber-500',
    textAccent: 'text-amber-700',
    textDark: 'text-amber-950',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200',
    iconBox: 'bg-amber-50 border border-amber-200/90 text-amber-700',
    iconText: 'text-amber-700',
    buttonPrimary: 'bg-amber-600 hover:bg-amber-700 text-white',
    buttonSecondary: 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200',
    buttonHover: 'hover:bg-amber-50 hover:text-amber-800',
    progressBar: 'bg-amber-500',
    dotIndicator: 'bg-amber-500',
    dotPing: 'bg-amber-400',
  },

  // Púrpura / Violeta Real
  purple: {
    key: 'purple',
    label: 'Púrpura Imperial',
    primary: '#7c3aed',
    ringColor: 'ring-purple-400',
    frameBg: 'bg-gradient-to-b from-purple-50/40 via-slate-50/20 to-white',
    frameBorder: 'border-purple-200/80',
    frameBorderTop: 'border-t-4 border-t-purple-600',
    cardBg: 'bg-gradient-to-br from-purple-50/30 via-white to-white',
    cardBorder: 'border-purple-200/80',
    cardHoverBorder: 'hover:border-purple-400',
    accentBar: 'bg-purple-600',
    textAccent: 'text-purple-700',
    textDark: 'text-purple-950',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-800',
    badgeBorder: 'border-purple-200',
    iconBox: 'bg-purple-50 border border-purple-200/90 text-purple-700',
    iconText: 'text-purple-700',
    buttonPrimary: 'bg-purple-600 hover:bg-purple-700 text-white',
    buttonSecondary: 'bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200',
    buttonHover: 'hover:bg-purple-50 hover:text-purple-800',
    progressBar: 'bg-purple-600',
    dotIndicator: 'bg-purple-600',
    dotPing: 'bg-purple-400',
  },

  // Azul Petróleo / Teal
  teal: {
    key: 'teal',
    label: 'Verde Petróleo (Teal)',
    primary: '#0d9488',
    ringColor: 'ring-teal-400',
    frameBg: 'bg-gradient-to-b from-teal-50/40 via-slate-50/20 to-white',
    frameBorder: 'border-teal-200/80',
    frameBorderTop: 'border-t-4 border-t-teal-600',
    cardBg: 'bg-gradient-to-br from-teal-50/30 via-white to-white',
    cardBorder: 'border-teal-200/80',
    cardHoverBorder: 'hover:border-teal-400',
    accentBar: 'bg-teal-600',
    textAccent: 'text-teal-700',
    textDark: 'text-teal-950',
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-800',
    badgeBorder: 'border-teal-200',
    iconBox: 'bg-teal-50 border border-teal-200/90 text-teal-700',
    iconText: 'text-teal-700',
    buttonPrimary: 'bg-teal-600 hover:bg-teal-700 text-white',
    buttonSecondary: 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200',
    buttonHover: 'hover:bg-teal-50 hover:text-teal-800',
    progressBar: 'bg-teal-600',
    dotIndicator: 'bg-teal-600',
    dotPing: 'bg-teal-400',
  },

  // Carmim / Rose
  rose: {
    key: 'rose',
    label: 'Rosa / Carmim',
    primary: '#e11d48',
    ringColor: 'ring-rose-400',
    frameBg: 'bg-gradient-to-b from-rose-50/40 via-slate-50/20 to-white',
    frameBorder: 'border-rose-200/80',
    frameBorderTop: 'border-t-4 border-t-rose-600',
    cardBg: 'bg-gradient-to-br from-rose-50/30 via-white to-white',
    cardBorder: 'border-rose-200/80',
    cardHoverBorder: 'hover:border-rose-400',
    accentBar: 'bg-rose-600',
    textAccent: 'text-rose-700',
    textDark: 'text-rose-950',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    badgeBorder: 'border-rose-200',
    iconBox: 'bg-rose-50 border border-rose-200/90 text-rose-700',
    iconText: 'text-rose-700',
    buttonPrimary: 'bg-rose-600 hover:bg-rose-700 text-white',
    buttonSecondary: 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200',
    buttonHover: 'hover:bg-rose-50 hover:text-rose-800',
    progressBar: 'bg-rose-600',
    dotIndicator: 'bg-rose-600',
    dotPing: 'bg-rose-400',
  },

  // Índigo Clássico
  indigo: {
    key: 'indigo',
    label: 'Índigo Profundo',
    primary: '#4f46e5',
    ringColor: 'ring-indigo-400',
    frameBg: 'bg-gradient-to-b from-indigo-50/40 via-slate-50/20 to-white',
    frameBorder: 'border-indigo-200/80',
    frameBorderTop: 'border-t-4 border-t-indigo-600',
    cardBg: 'bg-gradient-to-br from-indigo-50/30 via-white to-white',
    cardBorder: 'border-indigo-200/80',
    cardHoverBorder: 'hover:border-indigo-400',
    accentBar: 'bg-indigo-600',
    textAccent: 'text-indigo-700',
    textDark: 'text-indigo-950',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-800',
    badgeBorder: 'border-indigo-200',
    iconBox: 'bg-indigo-50 border border-indigo-200/90 text-indigo-700',
    iconText: 'text-indigo-700',
    buttonPrimary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    buttonSecondary: 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200',
    buttonHover: 'hover:bg-indigo-50 hover:text-indigo-800',
    progressBar: 'bg-indigo-600',
    dotIndicator: 'bg-indigo-600',
    dotPing: 'bg-indigo-400',
  },

  // Ciano Céu
  cyan: {
    key: 'cyan',
    label: 'Azul Celeste (Ciano)',
    primary: '#0891b2',
    ringColor: 'ring-cyan-400',
    frameBg: 'bg-gradient-to-b from-cyan-50/40 via-slate-50/20 to-white',
    frameBorder: 'border-cyan-200/80',
    frameBorderTop: 'border-t-4 border-t-cyan-600',
    cardBg: 'bg-gradient-to-br from-cyan-50/30 via-white to-white',
    cardBorder: 'border-cyan-200/80',
    cardHoverBorder: 'hover:border-cyan-400',
    accentBar: 'bg-cyan-600',
    textAccent: 'text-cyan-700',
    textDark: 'text-cyan-950',
    badgeBg: 'bg-cyan-50',
    badgeText: 'text-cyan-800',
    badgeBorder: 'border-cyan-200',
    iconBox: 'bg-cyan-50 border border-cyan-200/90 text-cyan-700',
    iconText: 'text-cyan-700',
    buttonPrimary: 'bg-cyan-600 hover:bg-cyan-700 text-white',
    buttonSecondary: 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200',
    buttonHover: 'hover:bg-cyan-50 hover:text-cyan-800',
    progressBar: 'bg-cyan-600',
    dotIndicator: 'bg-cyan-600',
    dotPing: 'bg-cyan-400',
  },

  // Visão Geral / Todas as Unidades
  slate: {
    key: 'slate',
    label: 'Visão Global (Todas as Unidades)',
    primary: '#475569',
    ringColor: 'ring-slate-400',
    frameBg: 'bg-gradient-to-b from-slate-100/50 via-slate-50/20 to-white',
    frameBorder: 'border-slate-200',
    frameBorderTop: 'border-t-4 border-t-slate-700',
    cardBg: 'bg-gradient-to-br from-slate-50/40 via-white to-white',
    cardBorder: 'border-slate-200',
    cardHoverBorder: 'hover:border-slate-400',
    accentBar: 'bg-slate-700',
    textAccent: 'text-slate-700',
    textDark: 'text-slate-900',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    badgeBorder: 'border-slate-200',
    iconBox: 'bg-slate-100 border border-slate-200 text-slate-700',
    iconText: 'text-slate-700',
    buttonPrimary: 'bg-slate-800 hover:bg-slate-900 text-white',
    buttonSecondary: 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200',
    buttonHover: 'hover:bg-slate-100 hover:text-slate-800',
    progressBar: 'bg-slate-700',
    dotIndicator: 'bg-slate-600',
    dotPing: 'bg-slate-400',
  }
};

// Paleta de rotação para atribuição automática exclusiva para filiais
const BRANCH_PALETTE: UnitColorKey[] = ['emerald', 'amber', 'purple', 'teal', 'rose', 'indigo', 'cyan'];

/**
 * Obtém o tema de cor exclusivo de uma unidade.
 * @param unit Objeto Unit ou string com o unitId ou code
 */
export function getUnitColorTheme(unitOrId?: any): UnitColorTheme {
  if (!unitOrId) return UNIT_COLOR_THEMES.blue;

  // 1. Caso seja "all" (Todas as Unidades)
  if (typeof unitOrId === 'string' && unitOrId === 'all') {
    return UNIT_COLOR_THEMES.slate;
  }
  if (typeof unitOrId === 'object' && unitOrId.id === 'all') {
    return UNIT_COLOR_THEMES.slate;
  }

  // 2. Se a unidade possui cor explicitamente definida
  const explicitColor = typeof unitOrId === 'object' ? unitOrId.color : null;
  if (explicitColor && UNIT_COLOR_THEMES[explicitColor as UnitColorKey]) {
    return UNIT_COLOR_THEMES[explicitColor as UnitColorKey];
  }

  const id = typeof unitOrId === 'string' ? unitOrId : (unitOrId.id || unitOrId.code || '');
  const name = typeof unitOrId === 'object' ? (unitOrId.name || '') : '';
  const code = typeof unitOrId === 'object' ? (unitOrId.code || '') : '';
  const isMain = typeof unitOrId === 'object' ? Boolean(unitOrId.is_main) : false;

  const combined = `${id} ${name} ${code}`.toLowerCase();

  // 3. Se for Matriz / Sede / Principal
  if (id === 'matriz' || isMain || combined.includes('matriz') || combined.includes('sede')) {
    return UNIT_COLOR_THEMES.blue;
  }

  // 4. Se for Unidade Pimentas (atribui Emerald exclusivo vibrante)
  if (combined.includes('pimenta') || combined.includes('pimentas') || combined.includes('grs')) {
    return UNIT_COLOR_THEMES.emerald;
  }

  // 5. Se for Bonsucesso (atribui Âmbar)
  if (combined.includes('bonsucesso')) {
    return UNIT_COLOR_THEMES.amber;
  }

  // 6. Se for São João / Cecap / etc.
  if (combined.includes('joao') || combined.includes('cecap')) {
    return UNIT_COLOR_THEMES.purple;
  }

  // 7. Hash determinístico consistente para qualquer outra unidade cadastrada
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % BRANCH_PALETTE.length;
  const selectedKey = BRANCH_PALETTE[index];

  return UNIT_COLOR_THEMES[selectedKey];
}
