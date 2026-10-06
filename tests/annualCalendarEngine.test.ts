/**
 * Testes Unitários e de Integração: Motor de Calendário Anual de Aulas
 * Executado via tsx: npx tsx tests/annualCalendarEngine.test.ts
 */

import {
  isLeapYear,
  getDaysInMonth,
  generateAnnualCalendarDays,
  calculateCalendarSummary,
  validateCalendarParameters,
  applyManualOverrideToDate,
  removeManualOverrideFromDate,
  regenerateMonthDays,
  regeneratePeriodDays
} from '../src/services/annualCalendarEngine';

import {
  calculateEaster,
  consolidateHolidays,
  generateInternalNationalHolidays,
  getHolidaysForState,
  getHolidaysForCity
} from '../src/services/holidayService';

import {
  CalendarGenerationParameters,
  HolidayEntry,
  AcademicPeriod,
  RecessInterval
} from '../src/types/annualCalendar';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exit(1);
  }
  console.log(`✅ SUCESSO: ${message}`);
}

console.log('--- INICIANDO TESTES DO MOTOR DE CALENDÁRIO LETIVO ---\n');

// 1. Teste de Anos Bissextos
console.log('1. Verificação de Anos Bissextos e Quantidade de Dias por Mês');
assert(isLeapYear(2024) === true, '2024 deve ser bissexto');
assert(isLeapYear(2025) === false, '2025 NÃO deve ser bissexto');
assert(isLeapYear(2026) === false, '2026 NÃO deve ser bissexto');
assert(isLeapYear(2028) === true, '2028 deve ser bissexto');
assert(isLeapYear(2100) === false, '2100 NÃO deve ser bissexto (divisível por 100 mas não 400)');
assert(isLeapYear(2000) === true, '2000 deve ser bissexto (divisível por 400)');

assert(getDaysInMonth(2024, 1) === 29, 'Fevereiro de 2024 deve ter 29 dias');
assert(getDaysInMonth(2025, 1) === 28, 'Fevereiro de 2025 deve ter 28 dias');
assert(getDaysInMonth(2028, 1) === 29, 'Fevereiro de 2028 deve ter 29 dias');
assert(getDaysInMonth(2025, 0) === 31, 'Janeiro deve ter 31 dias');
assert(getDaysInMonth(2025, 3) === 30, 'Abril deve ter 30 dias');

// 2. Teste de Feriados Móveis (Páscoa)
console.log('\n2. Verificação de Feriados Móveis (Algoritmo de Páscoa)');
const easter2024 = calculateEaster(2024);
assert(easter2024.getMonth() === 2 && easter2024.getDate() === 31, 'Páscoa de 2024 deve ser em 31/03/2024');
const easter2025 = calculateEaster(2025);
assert(easter2025.getMonth() === 3 && easter2025.getDate() === 20, 'Páscoa de 2025 deve ser em 20/04/2025');
const easter2026 = calculateEaster(2026);
assert(easter2026.getMonth() === 3 && easter2026.getDate() === 5, 'Páscoa de 2026 deve ser em 05/04/2026');

// 3. Teste de Consolidação e Eliminação de Duplicidades de Feriados
console.log('\n3. Consolidação de Feriados e Tratamento de Duplicidades');
const rawHolidays: HolidayEntry[] = [
  { id: '1', name: 'Tiradentes', date: '2025-04-21', type: 'nacional', origin: 'API BrasilAPI', has_class: false },
  { id: '2', name: 'Data Magna MG', date: '2025-04-21', type: 'estadual', origin: 'Tabela Estadual', has_class: false }
];
const consolidated = consolidateHolidays(rawHolidays);
assert(consolidated.length === 1, 'Feriados na mesma data devem ser consolidados sem duplicar');
assert(consolidated[0].name.includes('Tiradentes') && consolidated[0].name.includes('Data Magna MG'), 'Nomes de feriados na mesma data devem ser combinados');

// 4. Teste de Validação de Parâmetros
console.log('\n4. Validação de Parâmetros do Calendário');
const invalidParams: CalendarGenerationParameters = {
  year: 2025,
  state: 'SP',
  city: 'Guarulhos',
  start_date: '2025-12-01',
  end_date: '2025-02-01', // Data inicial posterior à final
  weekdays: [], // Nenhum dia
  minimum_class_days_target: 200,
  periods: [],
  recesses: [],
  holidays: []
};
const valResult = validateCalendarParameters(invalidParams);
assert(!valResult.isValid, 'Parâmetros com data invertida e sem dias devem ser inválidos');
assert(valResult.errors.length >= 3, 'Deve reportar erros específicos de data, períodos e dias da semana');

// 5. Teste da Ordem de Precedência das Regras
console.log('\n5. Verificação da Ordem de Precedência das Regras de Negócio');
const testYear = 2026;
const periods: AcademicPeriod[] = [
  { id: 'p1', name: '1º Semestre', start_date: '2026-02-02', end_date: '2026-06-30', is_active: true }
];
const recesses: RecessInterval[] = [
  { id: 'r1', name: 'Férias de Julho', start_date: '2026-07-01', end_date: '2026-07-31', type: 'ferias' },
  { id: 'r2', name: 'Suspensão Excepcional', start_date: '2026-03-10', end_date: '2026-03-10', type: 'suspensao' }
];
const hols: HolidayEntry[] = [
  { id: 'h1', name: 'Tiradentes', date: '2026-04-21', type: 'nacional', origin: 'Nacional', has_class: false },
  { id: 'h2', name: 'Feriado Municipal', date: '2026-03-05', type: 'municipal', origin: 'Municipal', has_class: false }
];

const params: CalendarGenerationParameters = {
  year: testYear,
  state: 'SP',
  city: 'Guarulhos',
  start_date: '2026-02-02',
  end_date: '2026-12-15',
  weekdays: [1, 2, 3, 4, 5], // Seg a Sex
  minimum_class_days_target: 100,
  periods,
  recesses,
  holidays: hols
};

let generatedDays = generateAnnualCalendarDays(params);

// 2026-02-04 é Quarta-feira, dentro de p1: deve ser class_day
assert(generatedDays['2026-02-04'].classification === 'class_day', 'Dia regular dentro do período deve ser class_day');
assert(generatedDays['2026-02-04'].is_class_day === true, 'Dia regular deve ter is_class_day = true');

// 2026-02-07 é Sábado: deve ser weekend_off
assert(generatedDays['2026-02-07'].classification === 'weekend_off', 'Sábado não configurado deve ser weekend_off');
assert(generatedDays['2026-02-07'].is_class_day === false, 'Sábado não configurado deve ter is_class_day = false');

// 2026-04-21 é Terça-feira (dia regular), mas é Feriado Nacional Tiradentes:
assert(generatedDays['2026-04-21'].classification === 'holiday_nac', 'Feriado tem precedência sobre dia semanal regular');
assert(generatedDays['2026-04-21'].is_class_day === false, 'Feriado nacional não pode ser dia letivo regular');

// 2026-03-05 é Quinta-feira, mas é Feriado Municipal:
assert(generatedDays['2026-03-05'].classification === 'holiday_mun', 'Feriado municipal tem precedência sobre dia semanal');

// 2026-03-10 é Terça-feira, mas possui Suspensão Institucional:
assert(generatedDays['2026-03-10'].classification === 'suspension', 'Suspensão institucional tem precedência sobre dia de aula');

// 2026-07-08 é Quarta-feira, mas está dentro de Férias:
assert(generatedDays['2026-07-08'].classification === 'vacation', 'Férias têm precedência sobre configuração semanal');

// 2026-01-15 é fora do período letivo p1:
assert(generatedDays['2026-01-15'].is_class_day === false, 'Data fora de períodos letivos não deve ser letiva');

// 6. Teste de Ajuste Manual (Prioridade Máxima) e Preservação
console.log('\n6. Ajuste Manual de Data e Preservação em Regeneração');
// Transforma 2026-04-21 (Tiradentes) em dia letivo excepcional por ajuste manual
generatedDays = applyManualOverrideToDate(
  generatedDays,
  '2026-04-21',
  'custom_class',
  true,
  'Reposição de aula autorizada pela direção',
  'Coordenação Pedagógica'
);
assert(generatedDays['2026-04-21'].is_manual_override === true, 'Data deve registrar is_manual_override = true');
assert(generatedDays['2026-04-21'].is_class_day === true, 'Data ajustada manualmente deve ser dia letivo');
assert(generatedDays['2026-04-21'].override_reason === 'Reposição de aula autorizada pela direção', 'Motivo do ajuste deve ser gravado para auditoria');

// Regeneração mantendo ajustes manuais (padrão)
const regeneratedPreserving = generateAnnualCalendarDays(params, generatedDays);
assert(regeneratedPreserving['2026-04-21'].is_manual_override === true, 'Ajuste manual DEVE ser preservado em regeneração');
assert(regeneratedPreserving['2026-04-21'].is_class_day === true, 'Ajuste manual mantido como letivo');

// Regeneração substituindo ajustes manuais
const regeneratedReplacing = generateAnnualCalendarDays({ ...params, preserve_manual_overrides: false }, generatedDays);
assert(regeneratedReplacing['2026-04-21'].is_manual_override === false, 'Ajuste manual deve ser substituído quando expressamente desmarcado');
assert(regeneratedReplacing['2026-04-21'].classification === 'holiday_nac', 'Data volta a ser feriado nacional');

// 7. Teste de Regeneração Seletiva de Mês e de Período
console.log('\n7. Regeneração Seletiva de Mês e Período');
const monthRegen = regenerateMonthDays(params, generatedDays, 4, true);
assert(monthRegen['2026-04-21'].is_manual_override === true, 'Regeneração do mês 4 deve manter ajuste manual quando solicitado');
assert(monthRegen['2026-02-04'].date === '2026-02-04', 'Dias dos outros meses permanecem intactos');

const periodRegen = regeneratePeriodDays(params, generatedDays, 'p1', true);
assert(periodRegen['2026-03-05'].classification === 'holiday_mun', 'Regeneração de período recalcula datas do período');

// 8. Teste de Sumário do Calendário e Comparação com Meta Mínima
console.log('\n8. Cálculo de Sumário, Totais e Comparação com a Meta Mínima');
const summary = calculateCalendarSummary(testYear, generatedDays, 100, periods);
assert(typeof summary.total_class_days === 'number' && summary.total_class_days > 0, 'Total de dias letivos deve ser um número positivo');
assert(summary.by_month.length === 12, 'Sumário mensal deve cobrir exatamente os 12 meses');
assert(summary.by_period.length === 1, 'Sumário por período deve listar os períodos configurados');
assert(summary.total_manual_overrides === 1, 'Total de ajustes manuais deve refletir a quantidade real');
assert(summary.difference_from_target === summary.total_class_days - 100, 'Diferença da meta deve ser calculada corretamente');

console.log(`\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO! TOTAL DE DIAS LETIVOS CALCULADOS: ${summary.total_class_days}`);
