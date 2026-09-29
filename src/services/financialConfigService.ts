import { FinancialSettings, Class } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { saveData, fetchAll } from '../lib/database';
import { detectCourseFromClass } from '../lib/utils';

export const DEFAULT_FINANCIAL_SETTINGS: FinancialSettings = {
  id: 'current',
  default_monthly_fee: 100,
  due_day: 10,
  late_fee_percentage: 0,
  year_fees: [],
  course_fees: [],
  class_fees: [],
  subject_fees: [],
  period_fees: [],
  custom_rules: []
};

let cachedSettings: FinancialSettings | null = null;

const cleanString = (val?: string | null): string => {
  if (!val) return '';
  return val
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
};

const extractFinancialSettingsFromText = (text?: string | null): FinancialSettings | null => {
  if (!text) return null;
  const prefix = '[FINANCIAL_SETTINGS:';
  const startIdx = text.indexOf(prefix);
  if (startIdx === -1) return null;

  const contentStart = startIdx + prefix.length;
  let depth = 1;
  let endIdx = -1;
  for (let i = contentStart; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) return null;
  const rawJson = text.substring(contentStart, endIdx).trim();
  try {
    return JSON.parse(rawJson);
  } catch (e) {
    console.warn('Erro ao decodificar JSON de configurações financeiras:', e);
    return null;
  }
};

const replaceFinancialSettingsInText = (text: string, newSettings: FinancialSettings): string => {
  const prefix = '[FINANCIAL_SETTINGS:';
  const startIdx = text.indexOf(prefix);
  const tag = `${prefix}${JSON.stringify(newSettings)}]`;

  if (startIdx === -1) {
    return (text ? text + '\n' : '') + tag;
  }

  let depth = 1;
  let endIdx = -1;
  for (let i = startIdx + prefix.length; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }

  if (endIdx === -1) {
    return text + '\n' + tag;
  }

  return text.substring(0, startIdx) + tag + text.substring(endIdx + 1);
};

export const financialConfigService = {
  /**
   * Obtém a versão SQL da migração para criação/atualização da tabela no Supabase.
   */
  getMigrationSql(): string {
    return `-- =========================================================
-- Atualização da Base de Dados: Tabela de Configurações Financeiras
-- Define valores de referência por Ano Letivo e Mensalidades por Curso
-- =========================================================

CREATE TABLE IF NOT EXISTS public.financial_settings (
    id TEXT PRIMARY KEY,
    default_monthly_fee NUMERIC(10,2) DEFAULT 100.00,
    due_day INTEGER DEFAULT 10,
    late_fee_percentage NUMERIC(5,2) DEFAULT 0.00,
    year_fees JSONB DEFAULT '[]'::jsonb,
    course_fees JSONB DEFAULT '[]'::jsonb,
    class_fees JSONB DEFAULT '[]'::jsonb,
    subject_fees JSONB DEFAULT '[]'::jsonb,
    unit_id TEXT DEFAULT 'matriz',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Garantir que as colunas class_fees e subject_fees existam caso a tabela já tenha sido criada
ALTER TABLE public.financial_settings ADD COLUMN IF NOT EXISTS class_fees JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.financial_settings ADD COLUMN IF NOT EXISTS subject_fees JSONB DEFAULT '[]'::jsonb;

-- Habilitar RLS e criar política de acesso total para a aplicação
ALTER TABLE public.financial_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Access financial_settings" ON public.financial_settings;
CREATE POLICY "Public Access financial_settings" ON public.financial_settings FOR ALL USING (true) WITH CHECK (true);

-- Inserir configuração inicial padrão se ainda não existir
INSERT INTO public.financial_settings (id, default_monthly_fee, due_day, year_fees, course_fees, class_fees, subject_fees)
VALUES (
    'current',
    100.00,
    10,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
)
ON CONFLICT (id) DO NOTHING;`;
  },

  /**
   * Carrega as configurações financeiras vigentes (memória -> Supabase / institution_settings -> localStorage -> Padrão).
   */
  async getSettings(): Promise<FinancialSettings> {
    if (cachedSettings) {
      return cachedSettings;
    }

    let localData: FinancialSettings | null = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem('cached_financial_settings');
        if (raw) {
          localData = JSON.parse(raw);
        }
      } catch (e) {
        console.warn('Erro ao ler cached_financial_settings:', e);
      }
    }

    if (!isSupabaseConfigured) {
      cachedSettings = localData || DEFAULT_FINANCIAL_SETTINGS;
      return cachedSettings;
    }

    let dbData: any = null;
    // 1. Tentar ler da tabela dedicada financial_settings
    try {
      const { data, error } = await supabase
        .from('financial_settings')
        .select('*')
        .eq('id', 'current')
        .maybeSingle();

      if (!error && data) {
        dbData = data;
      }
    } catch (err) {
      // Ignora erro se a tabela não existir no Supabase
    }

    // 2. Fallback persistente de alta confiabilidade: ler de institution_settings
    let instParsed: FinancialSettings | null = null;
    try {
      const { data: instData } = await supabase
        .from('institution_settings')
        .select('presentation_info')
        .limit(1)
        .maybeSingle();

      if (instData?.presentation_info) {
        instParsed = extractFinancialSettingsFromText(instData.presentation_info);
      }
    } catch (instErr) {
      console.warn('Aviso ao consultar configurações financeiras em institution_settings:', instErr);
    }

    // Mescla dados de forma inteligente priorizando o banco real
    const base = localData || DEFAULT_FINANCIAL_SETTINGS;
    const yearFees = Array.isArray(dbData?.year_fees)
      ? dbData.year_fees
      : Array.isArray(instParsed?.year_fees)
        ? instParsed.year_fees
        : (base.year_fees || []);

    const courseFees = Array.isArray(dbData?.course_fees)
      ? dbData.course_fees
      : Array.isArray(instParsed?.course_fees)
        ? instParsed.course_fees
        : (base.course_fees || []);

    const classFees = Array.isArray(dbData?.class_fees)
      ? dbData.class_fees
      : Array.isArray(instParsed?.class_fees)
        ? instParsed.class_fees
        : (base.class_fees || []);

    const subjectFees = Array.isArray(dbData?.subject_fees)
      ? dbData.subject_fees
      : Array.isArray(instParsed?.subject_fees)
        ? instParsed.subject_fees
        : (base.subject_fees || []);

    const periodFees = Array.isArray(dbData?.period_fees)
      ? dbData.period_fees
      : Array.isArray(instParsed?.period_fees)
        ? instParsed.period_fees
        : (base.period_fees || []);

    const customRules = Array.isArray(dbData?.custom_rules)
      ? dbData.custom_rules
      : Array.isArray(instParsed?.custom_rules)
        ? instParsed.custom_rules
        : (base.custom_rules || []);

    const merged: FinancialSettings = {
      id: dbData?.id || instParsed?.id || 'current',
      default_monthly_fee: Number(dbData?.default_monthly_fee) || Number(instParsed?.default_monthly_fee) || Number(base.default_monthly_fee) || 100,
      due_day: Number(dbData?.due_day) || Number(instParsed?.due_day) || Number(base.due_day) || 10,
      late_fee_percentage: Number(dbData?.late_fee_percentage) || Number(instParsed?.late_fee_percentage) || Number(base.late_fee_percentage) || 0,
      year_fees: yearFees,
      course_fees: courseFees,
      class_fees: classFees,
      subject_fees: subjectFees,
      period_fees: periodFees,
      custom_rules: customRules,
      unit_id: dbData?.unit_id || instParsed?.unit_id || base.unit_id || 'matriz',
      updated_at: dbData?.updated_at || instParsed?.updated_at || new Date().toISOString()
    };

    cachedSettings = merged;
    try { localStorage.setItem('cached_financial_settings', JSON.stringify(merged)); } catch {}
    return merged;
  },

  /**
   * Salva as configurações financeiras e propaga no banco, cache e storage.
   */
  async saveSettings(settings: FinancialSettings): Promise<void> {
    const toSave: FinancialSettings = {
      ...settings,
      id: 'current',
      updated_at: new Date().toISOString()
    };

    cachedSettings = toSave;
    try {
      localStorage.setItem('cached_financial_settings', JSON.stringify(toSave));
    } catch {}

    if (isSupabaseConfigured) {
      // 1. Tentar persistir na tabela financial_settings apenas as colunas suportadas no schema real
      try {
        const dbPayload: any = {
          id: 'current',
          default_monthly_fee: Number(toSave.default_monthly_fee) || 100,
          due_day: Number(toSave.due_day) || 10,
          late_fee_percentage: Number(toSave.late_fee_percentage) || 0,
          year_fees: Array.isArray(toSave.year_fees) ? toSave.year_fees : [],
          course_fees: Array.isArray(toSave.course_fees) ? toSave.course_fees : [],
          class_fees: Array.isArray(toSave.class_fees) ? toSave.class_fees : [],
          unit_id: toSave.unit_id || 'matriz',
          updated_at: toSave.updated_at
        };
        await saveData('financial_settings', 'current', dbPayload);
      } catch (err: any) {
        // Tabela pode não existir no schema cache, prossegue com institution_settings
      }

      // 2. Persistir a configuração COMPLETA (incluindo subject_fees, custom_rules, etc.) em institution_settings
      try {
        const { data: instData } = await supabase
          .from('institution_settings')
          .select('id, presentation_info')
          .limit(1)
          .maybeSingle();

        if (instData?.id) {
          const updatedText = replaceFinancialSettingsInText(instData.presentation_info || '', toSave);
          await supabase
            .from('institution_settings')
            .update({ presentation_info: updatedText })
            .eq('id', instData.id);
        }
      } catch (instErr: any) {
        console.warn('Aviso ao sincronizar configurações financeiras em institution_settings:', instErr);
      }

      // 3. Sincronizar mensalidades de turmas específicas diretamente no metadata da turma
      if (toSave.class_fees && toSave.class_fees.length > 0) {
        try {
          for (const cf of toSave.class_fees) {
            if (!cf.class_id || !Number(cf.amount)) continue;
            const { data: clsData } = await supabase
              .from('classes')
              .select('id, observations')
              .eq('id', cf.class_id)
              .maybeSingle();
            
            if (clsData) {
              let obs = clsData.observations || '';
              const match = obs.match(/\[METADATA:(\{[\s\S]*?\})\]/);
              let meta: any = {};
              if (match && match[1]) {
                try { meta = JSON.parse(match[1]); } catch {}
              }
              meta.monthly_fee = Number(cf.amount);
              const newMetaStr = `[METADATA:${JSON.stringify(meta)}]`;
              if (match) {
                obs = obs.replace(/\[METADATA:\{[\s\S]*?\}\]/, newMetaStr);
              } else {
                obs = (obs ? obs + '\n' : '') + newMetaStr;
              }
              await supabase
                .from('classes')
                .update({ observations: obs })
                .eq('id', clsData.id);
            }
          }
        } catch (clsErr) {
          console.warn('Aviso ao sincronizar mensalidades das turmas:', clsErr);
        }
      }

      // 4. Sincronizar mensalidades de disciplinas específicas diretamente no metadata da disciplina
      if (toSave.subject_fees && toSave.subject_fees.length > 0) {
        try {
          for (const sf of toSave.subject_fees) {
            if (!sf.subject_id || !Number(sf.amount)) continue;
            const { data: subData } = await supabase
              .from('subjects')
              .select('id, program_content')
              .eq('id', sf.subject_id)
              .maybeSingle();
            
            if (subData) {
              let pc = subData.program_content || '';
              const match = pc.match(/\[METADATA:(\{[\s\S]*?\})\]/);
              let meta: any = {};
              if (match && match[1]) {
                try { meta = JSON.parse(match[1]); } catch {}
              }
              meta.monthly_fee = Number(sf.amount);
              const newMetaStr = `[METADATA:${JSON.stringify(meta)}]`;
              if (match) {
                pc = pc.replace(/\[METADATA:\{[\s\S]*?\}\]/, newMetaStr);
              } else {
                pc = (pc ? pc + '\n' : '') + newMetaStr;
              }
              await supabase
                .from('subjects')
                .update({ program_content: pc })
                .eq('id', subData.id);
            }
          }
        } catch (subErr) {
          console.warn('Aviso ao sincronizar mensalidades das disciplinas:', subErr);
        }
      }
    }

    // Dispara evento para atualização imediata de telas abertas
    try {
      window.dispatchEvent(new CustomEvent('financial_settings_updated', { detail: toSave }));
    } catch {}
  },

  /**
   * Resolve o valor oficial da contribuição mensal para um aluno/turma/disciplina/ano específico,
   * respeitando a seguinte hierarquia rigorosa:
   * 1. Definição específica para a Turma (monthly_fee na própria turma ou class_fees)
   * 2. Definição específica para a Disciplina (monthly_fee na disciplina ou subject_fees)
   * 3. Definição específica para o Curso (configurada em course_fees pelo administrador)
   * 4. CASO NÃO HAJA DEFINIÇÃO ESPECÍFICA (Regra Padrão Definida):
   *    - Aplica o valor de referência do ano letivo (year_fees se cadastrado)
   *    - Caso não definido para o ano, aplica a mensalidade padrão global definida (default_monthly_fee)
   */
  resolveFee(
    params: {
      year?: number | string | null;
      classId?: string | null;
      className?: string | null;
      courseId?: string | null;
      courseName?: string | null;
      subjectId?: string | null;
      subjectName?: string | null;
      subject?: any | null;
      period?: string | null;
      studentClass?: Class | null;
      student?: any | null;
    },
    settings?: FinancialSettings | null
  ): number {
    const config = settings || cachedSettings || DEFAULT_FINANCIAL_SETTINGS;
    const fallbackDefault = Number(config.default_monthly_fee) || 100;

    const studentClass = params.studentClass;
    const classId = params.classId || studentClass?.id || params.student?.class_id || '';
    const cleanClsName = cleanString(params.className || studentClass?.name);

    // -------------------------------------------------------------------------
    // 1. DEFINIÇÃO ESPECÍFICA PARA A TURMA
    // -------------------------------------------------------------------------
    // 1.1 Mensalidade definida diretamente no cadastro da Turma
    if (studentClass) {
      if (studentClass.monthly_fee !== undefined && studentClass.monthly_fee !== null && Number(studentClass.monthly_fee) > 0) {
        return Number(studentClass.monthly_fee);
      }

      // Verificação em metadados dentro das observações da turma caso não normalizado
      if (studentClass.observations) {
        try {
          const match = String(studentClass.observations).match(/\[METADATA:(\{[\s\S]*?\})\]/);
          if (match && match[1]) {
            const meta = JSON.parse(match[1]);
            if (meta.monthly_fee !== undefined && meta.monthly_fee !== null && Number(meta.monthly_fee) > 0) {
              return Number(meta.monthly_fee);
            }
          }
        } catch {}
      }
    }

    // 1.2 Mensalidade atribuída a uma Turma específica nas configurações (class_fees)
    if (config.class_fees && config.class_fees.length > 0 && (classId || cleanClsName)) {
      const classMatch = config.class_fees.find(cf => {
        if (classId && cf.class_id && cf.class_id === classId) return true;
        if (cleanClsName && cf.class_name) {
          const cfClean = cleanString(cf.class_name);
          if (cfClean === cleanClsName || cleanClsName.includes(cfClean) || cfClean.includes(cleanClsName)) return true;
        }
        return false;
      });

      if (classMatch && Number(classMatch.amount) > 0) {
        return Number(classMatch.amount);
      }
    }

    // Também verificar se por ventura alguma regra de turma foi gravada em course_fees
    if (config.course_fees && config.course_fees.length > 0 && (classId || cleanClsName)) {
      const matchInCourseFees = config.course_fees.find(cf => {
        if (classId && cf.course_id === classId) return true;
        if (cleanClsName && cf.course_name) {
          const cfClean = cleanString(cf.course_name);
          if (cfClean === cleanClsName || cleanClsName.includes(cfClean) || cfClean.includes(cleanClsName)) return true;
        }
        return false;
      });

      if (matchInCourseFees && Number(matchInCourseFees.amount) > 0) {
        return Number(matchInCourseFees.amount);
      }
    }

    // -------------------------------------------------------------------------
    // 2. DEFINIÇÃO ESPECÍFICA PARA A DISCIPLINA (Subject)
    // -------------------------------------------------------------------------
    const targetSubjectId = params.subjectId || params.subject?.id || studentClass?.subject_id || '';
    const cleanSubjName = cleanString(params.subjectName || params.subject?.name);
    const classSubjectIds: string[] = Array.isArray(studentClass?.subject_ids)
      ? studentClass.subject_ids
      : (studentClass?.subject_id ? [studentClass.subject_id] : []);

    // 2.1 Mensalidade definida diretamente no cadastro da Disciplina
    if (params.subject) {
      if (params.subject.monthly_fee !== undefined && params.subject.monthly_fee !== null && Number(params.subject.monthly_fee) > 0) {
        return Number(params.subject.monthly_fee);
      }
      const subContent = params.subject.program_content || params.subject.observations;
      if (subContent) {
        try {
          const match = String(subContent).match(/\[METADATA:(\{[\s\S]*?\})\]/);
          if (match && match[1]) {
            const meta = JSON.parse(match[1]);
            if (meta.monthly_fee !== undefined && meta.monthly_fee !== null && Number(meta.monthly_fee) > 0) {
              return Number(meta.monthly_fee);
            }
          }
        } catch {}
      }
    }

    // 2.2 Mensalidade atribuída a uma Disciplina específica nas configurações (subject_fees)
    if (config.subject_fees && config.subject_fees.length > 0 && (targetSubjectId || cleanSubjName || classSubjectIds.length > 0)) {
      const subjectMatch = config.subject_fees.find(sf => {
        if (targetSubjectId && sf.subject_id && sf.subject_id === targetSubjectId) return true;
        if (classSubjectIds.length > 0 && sf.subject_id && classSubjectIds.includes(sf.subject_id)) return true;
        if (cleanSubjName && sf.subject_name) {
          const sfClean = cleanString(sf.subject_name);
          if (sfClean === cleanSubjName || cleanSubjName.includes(sfClean) || sfClean.includes(cleanSubjName)) return true;
        }
        return false;
      });

      if (subjectMatch && Number(subjectMatch.amount) > 0) {
        return Number(subjectMatch.amount);
      }
    }

    // -------------------------------------------------------------------------
    // 3. DEFINIÇÃO ESPECÍFICA PARA O CURSO (course_fees)
    // -------------------------------------------------------------------------
    const detectedCourse = studentClass ? detectCourseFromClass(studentClass) : '';
    const cleanCrsName = cleanString(
      params.courseName || 
      studentClass?.course || 
      params.student?.course || 
      detectedCourse
    );

    const targetCourseId = params.courseId || (studentClass as any)?.course_id || '';

    if (config.course_fees && config.course_fees.length > 0 && (cleanCrsName || targetCourseId || cleanClsName)) {
      const courseMatch = config.course_fees.find(cf => {
        if (targetCourseId && cf.course_id && cf.course_id === targetCourseId) return true;
        if (!cf.course_name) return false;

        const cfClean = cleanString(cf.course_name);
        if (cleanCrsName && (cfClean === cleanCrsName || cleanCrsName.includes(cfClean) || cfClean.includes(cleanCrsName))) {
          return true;
        }

        // Se o nome da turma contiver o nome do curso (ex: "Turma Doutrina Social 2026" contém "Doutrina Social")
        if (cleanClsName && (cleanClsName.includes(cfClean) || cfClean.includes(cleanClsName))) {
          return true;
        }

        return false;
      });

      if (courseMatch && Number(courseMatch.amount) > 0) {
        return Number(courseMatch.amount);
      }
    }

    // -------------------------------------------------------------------------
    // 4. CASO NÃO HAJA DEFINIÇÃO ESPECÍFICA (Aplica o Valor Padrão Definido):
    // 4.1 Valor de referência definido para o Ano Letivo (year_fees)
    // 4.2 Valor padrão institucional global (default_monthly_fee)
    // -------------------------------------------------------------------------
    const targetYearNum = Number(
      params.year || 
      studentClass?.start_year || 
      (studentClass?.name ? studentClass.name.match(/\b(20\d\d)\b/)?.[1] : null) ||
      new Date().getFullYear()
    );

    if (config.year_fees && config.year_fees.length > 0 && targetYearNum) {
      const yearMatch = config.year_fees.find(yf => Number(yf.year) === targetYearNum);
      if (yearMatch && Number(yearMatch.amount) > 0) {
        return Number(yearMatch.amount);
      }
    }

    // -------------------------------------------------------------------------
    // 5. Aplica a mensalidade padrão institucional global (default_monthly_fee)
    // -------------------------------------------------------------------------
    return fallbackDefault;
  }
};
