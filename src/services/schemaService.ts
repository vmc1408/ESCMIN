import { supabase } from '../lib/supabase';
import blueprint from '../../blueprint.json';

export const schemaService = {
  /**
   * Retorna o tipo PostgreSQL apropriado para uma coluna baseando-se no nome e contexto
   */
  getColumnType(col: string, tableName?: string) {
    if (col === 'id') return 'TEXT PRIMARY KEY';
    if (col === 'metadata') return "JSONB DEFAULT '{}'::jsonb";
    
    // Booleans
    if (col === 'is_main' || col === 'is_former_student' || col === 'is_special' || col === 'is_manual' || col === 'unallocated') {
      return 'BOOLEAN DEFAULT false';
    }
    if (col === 'active') {
      return 'BOOLEAN DEFAULT true';
    }
    if (col.startsWith('is_') || col === 'app_lock_enabled' || col.endsWith('_whatsapp') || col === 'pastoral_participates_bool') {
      return 'BOOLEAN DEFAULT false';
    }

    // Integers
    if (
      col === 'reference_month' || 
      col === 'reference_year' || 
      col === 'duration_years' || 
      col === 'duration_semesters' || 
      col === 'meetings_per_week' || 
      col === 'workload_hours' || 
      col === 'app_lock_timeout' || 
      col === 'app_inactivity_timeout'
    ) {
      return 'INTEGER';
    }

    // Numerics
    if (col.includes('amount') || col.includes('price') || col === 'weight' || col === 'value' || col.includes('grade')) {
      return 'NUMERIC(10,2)';
    }

    // Uniques
    if (col === 'registration_number' || col === 'transaction_id') {
      return 'TEXT UNIQUE';
    }
    if (col === 'code' && tableName !== 'units') {
      return 'TEXT';
    }

    // Arrays
    if (col === 'days_of_week' || col === 'subject_ids' || col === 'meeting_days' || col === 'enabled_years') {
      return 'TEXT[]';
    }

    // Multitenancy / Polos
    if (col === 'unit_id') {
      if (tableName === 'users' || tableName === 'email_registry') {
        return "TEXT DEFAULT 'all'";
      }
      return "TEXT DEFAULT 'matriz'";
    }

    // Dates & Timestamps
    if (
      col === 'birth_date' || 
      col === 'start_date' || 
      col === 'payment_date' || 
      col === 'foundation_date' || 
      col === 'enrollment_date' ||
      col === 'issue_date' ||
      (col.endsWith('_date') && !col.includes('created') && !col.includes('updated'))
    ) {
      return 'TEXT'; // Usar TEXT ou DATE compatível com inputs ISO e máscaras
    } 
    else if (col.includes('timestamp') || col === 'created_at' || col === 'updated_at' || col.endsWith('_at')) {
      return "TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())";
    }

    return 'TEXT';
  },

  /**
   * Executa uma auditoria completa do schema no Supabase confrontando o modelo com a base real.
   */
  async checkup() {
    const report: any = {};
    const entities = (blueprint as any).entities || {};
    
    let totalTables = 0;
    let syncedTables = 0;
    let incompleteTables = 0;
    let missingTables = 0;

    for (const [path, config] of Object.entries((blueprint as any).firestore || {})) {
      totalTables++;
      const entityName = typeof (config as any).schema === 'string' 
        ? (config as any).schema 
        : (config as any).schema.$ref.split('/').pop();
        
      const entityDef = entities[entityName];
      if (!entityDef) continue;

      const actualTableName = path.replace(/^\//, '').split('/')[0];
      
      try {
        const properties = (entityDef as any).properties || {};
        const expectedColumns = Object.keys(properties);
        const missing: string[] = [];
        const existing: string[] = [];

        // Verifica existência da tabela via query simples
        const { error: existError } = await supabase
          .from(actualTableName)
          .select('id')
          .limit(1);

        const isMissing = existError && (
          existError.code === '42P01' || 
          existError.message.toLowerCase().includes('does not exist') ||
          existError.message.toLowerCase().includes('não existe') ||
          existError.message.toLowerCase().includes('relation')
        );

        if (isMissing) {
          missingTables++;
          report[actualTableName] = {
            status: 'missing_table',
            existing: [],
            missing: expectedColumns,
            message: 'Tabela não encontrada no banco de dados.'
          };
          continue;
        }

        // Se a tabela existe, testa se todas as colunas esperadas estão presentes
        const colsToProbe = expectedColumns.filter(c => c !== 'id' && c !== 'created_at');
        const selectPayload = colsToProbe.length > 0 ? colsToProbe.join(',') : 'id';

        const { error: probeError } = await supabase
          .from(actualTableName)
          .select(selectPayload)
          .limit(0);

        if (probeError) {
          // Se a seleção em lote falhou por coluna ausente, verifica individualmente
          for (const col of expectedColumns) {
            if (col === 'id' || col === 'created_at') {
              existing.push(col);
              continue;
            }
            try {
              const { error: colError } = await supabase
                .from(actualTableName)
                .select(col)
                .limit(0);
              
              if (colError) {
                missing.push(col);
              } else {
                existing.push(col);
              }
            } catch (e) {
              missing.push(col);
            }
          }
        } else {
          existing.push(...expectedColumns);
        }
        
        if (missing.length === 0) {
          syncedTables++;
          report[actualTableName] = {
            status: 'up_to_date',
            existing,
            missing: [],
            message: 'Tudo em ordem e sincronizado.'
          };
        } else {
          incompleteTables++;
          report[actualTableName] = {
            status: 'incomplete',
            existing,
            missing,
            message: `${missing.length} coluna(s) ausente(s).`
          };
        }
      } catch (err: any) {
        report[actualTableName] = { status: 'fatal', message: err.message };
      }
    }
    
    return {
      report,
      summary: {
        totalTables,
        syncedTables,
        incompleteTables,
        missingTables,
        isFullySynchronized: missingTables === 0 && incompleteTables === 0
      }
    };
  },

  /**
   * Gera o SQL de Correção contendo apenas as alterações necessárias (tabelas e colunas faltantes)
   */
  generateFixSQL(checkupResult: any) {
    const report = checkupResult?.report || checkupResult;
    let sql = '-- ============================================================================\n';
    sql += '-- SCRIPT DE CORREÇÃO E ALINHAMENTO DE SCHEMA (SUPABASE)\n';
    sql += '-- Gerado automaticamente pela ferramenta de Manutenção do Sistema\n';
    sql += '-- ============================================================================\n\n';

    let hasChanges = false;
    
    for (const [tableName, info] of Object.entries(report)) {
      const typedInfo = info as any;

      if (typedInfo.status === 'missing_table') {
        hasChanges = true;
        sql += `-- Criar Tabela: ${tableName}\n`;
        sql += `DROP VIEW IF EXISTS public.${tableName} CASCADE;\n`;
        sql += `CREATE TABLE IF NOT EXISTS public.${tableName} (\n`;
        sql += `  id TEXT PRIMARY KEY,\n`;
        
        const cols = typedInfo.missing.filter((c: string) => c !== 'id' && c !== 'created_at');
        cols.forEach((col: string) => {
          const type = schemaService.getColumnType(col, tableName);
          sql += `  ${col} ${type},\n`;
        });
        
        sql += `  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL\n`;
        sql += `);\n\n`;
        
        sql += `-- Permissões e RLS para ${tableName}\n`;
        sql += `ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;\n`;
        sql += `DROP POLICY IF EXISTS "Public Access ${tableName}" ON public.${tableName};\n`;
        sql += `CREATE POLICY "Public Access ${tableName}" ON public.${tableName} FOR ALL USING (true) WITH CHECK (true);\n`;
        sql += `GRANT ALL ON TABLE public.${tableName} TO anon, authenticated, service_role;\n\n`;

        if (tableName === 'units') {
          sql += `-- Inserir Unidade Sede Padrão\n`;
          sql += `INSERT INTO public.units (id, code, name, is_main, active)\n`;
          sql += `VALUES ('matriz', 'MAT', 'Sede / Matriz', true, true)\n`;
          sql += `ON CONFLICT (id) DO NOTHING;\n\n`;
        }

      } else if (typedInfo.status === 'incomplete' && typedInfo.missing.length > 0) {
        hasChanges = true;
        sql += `-- Ajustar Colunas na Tabela: ${tableName}\n`;
        typedInfo.missing.forEach((col: string) => {
          const type = schemaService.getColumnType(col, tableName);
          sql += `ALTER TABLE public.${tableName} ADD COLUMN IF NOT EXISTS ${col} ${type};\n`;
        });
        sql += `GRANT ALL ON TABLE public.${tableName} TO anon, authenticated, service_role;\n`;

        if (tableName === 'units') {
          sql += `INSERT INTO public.units (id, code, name, is_main, active)\n`;
          sql += `VALUES ('matriz', 'MAT', 'Sede / Matriz', true, true)\n`;
          sql += `ON CONFLICT (id) DO NOTHING;\n`;
        }
        sql += '\n';
      }
    }
    
    if (!hasChanges) {
      return '-- Nenhuma alteração pendente! Todas as tabelas e colunas estão 100% sincronizadas.';
    }

    return sql;
  },

  /**
   * Gera o script SQL mestre e idempotente com TODAS as tabelas, índices, permissões e dados base do sistema
   */
  getFullSchemaSQL() {
    let sql = '-- ============================================================================\n';
    sql += '-- SCHEMA COMPLETO DO SISTEMA (SCRIPT MESTRE IDEMPOTENTE)\n';
    sql += '-- Execute este script no SQL Editor do Supabase para criar/atualizar tudo\n';
    sql += '-- ============================================================================\n\n';

    const entities = (blueprint as any).entities || {};
    
    for (const [path, config] of Object.entries((blueprint as any).firestore || {})) {
      const entityName = typeof (config as any).schema === 'string' 
        ? (config as any).schema 
        : (config as any).schema.$ref.split('/').pop();
        
      const entityDef = entities[entityName];
      if (!entityDef) continue;

      const tableName = path.replace(/^\//, '').split('/')[0];
      const properties = (entityDef as any).properties || {};
      const cols = Object.keys(properties).filter(c => c !== 'id' && c !== 'created_at');

      sql += `-- Tabela: ${tableName}\n`;
      sql += `CREATE TABLE IF NOT EXISTS public.${tableName} (\n`;
      sql += `  id TEXT PRIMARY KEY,\n`;
      cols.forEach((col) => {
        const type = schemaService.getColumnType(col, tableName);
        sql += `  ${col} ${type},\n`;
      });
      sql += `  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL\n`;
      sql += `);\n\n`;

      // Garante colunas individuais para bancos preexistentes
      cols.forEach((col) => {
        const type = schemaService.getColumnType(col, tableName);
        sql += `ALTER TABLE public.${tableName} ADD COLUMN IF NOT EXISTS ${col} ${type};\n`;
      });

      sql += `ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;\n`;
      sql += `DROP POLICY IF EXISTS "Public Access ${tableName}" ON public.${tableName};\n`;
      sql += `CREATE POLICY "Public Access ${tableName}" ON public.${tableName} FOR ALL USING (true) WITH CHECK (true);\n`;
      sql += `GRANT ALL ON TABLE public.${tableName} TO anon, authenticated, service_role;\n\n`;
    }

    sql += `-- ============================================================================\n`;
    sql += `-- SEEDS E CONFIGURAÇÕES PADRÃO\n`;
    sql += `-- ============================================================================\n`;
    sql += `INSERT INTO public.units (id, code, name, is_main, active)\n`;
    sql += `VALUES ('matriz', 'MAT', 'Sede / Matriz', true, true)\n`;
    sql += `ON CONFLICT (id) DO NOTHING;\n\n`;

    return sql;
  }
};
