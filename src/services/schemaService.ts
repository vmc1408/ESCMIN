import { supabase } from '../lib/supabase';
import blueprint from '../../blueprint.json';

export const schemaService = {
  /**
   * Performs a checkup of the current database schema by introspecting existing data.
   */
  async checkup() {
    const report: any = {};
    const entities = blueprint.entities;
    
    for (const [path, config] of Object.entries((blueprint as any).firestore || {})) {
      const entityName = typeof (config as any).schema === 'string' 
        ? (config as any).schema 
        : (config as any).schema.$ref.split('/').pop();
        
      const entityDef = (blueprint as any).entities[entityName];
      if (!entityDef) continue;

      const actualTableName = path.replace(/^\//, '').split('/')[0];
      
      try {
        const properties = (entityDef as any).properties || {};
        const expectedColumns = Object.keys(properties);
        const missing: string[] = [];
        const existing: string[] = [];

        // Correct table existence check: select 'id' and limit 1.
        // If the table is missing, Postgres throws 42P01.
        const { error: existError } = await supabase
          .from(actualTableName)
          .select('id')
          .limit(1);

        const isMissing = existError && (
          existError.code === '42P01' || 
          existError.message.toLowerCase().includes('does not exist') ||
          existError.message.toLowerCase().includes('não existe')
        );

        if (isMissing) {
          report[actualTableName] = {
            status: 'missing_table',
            existing: [],
            missing: expectedColumns,
            message: 'Tabela não encontrada.'
          };
          continue;
        }

        // If table exists, find existing columns reliably
        const colsToProbe = expectedColumns.filter(c => c !== 'id' && c !== 'created_at');
        const selectPayload = colsToProbe.length > 0 ? colsToProbe.join(',') : 'id';

        const { error: probeError } = await supabase
          .from(actualTableName)
          .select(selectPayload)
          .limit(0);

        if (probeError) {
          // If bulk select fails, check columns one by one
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
        
        report[actualTableName] = {
          status: missing.length === 0 ? 'up_to_date' : 'incomplete',
          existing,
          missing,
          message: missing.length > 0 ? `${missing.length} colunas faltando.` : 'Tudo em ordem.'
        };
      } catch (err: any) {
        report[actualTableName] = { status: 'fatal', message: err.message };
      }
    }
    
    return report;
  },

  generateFixSQL(report: any) {
    let sql = '-- SQL para alinhar o schema das tabelas\n\n';
    
    for (const [tableName, info] of Object.entries(report)) {
      const typedInfo = info as any;
      
      const getColType = (col: string) => {
        let type = 'TEXT';
        if (col === 'metadata') return 'JSONB DEFAULT \'{}\'::jsonb';
        if (col.includes('amount') || col.includes('price') || col === 'weight' || col === 'value' || col.includes('grade')) type = 'NUMERIC(10,2)';
        if (col.includes('is_') || col === 'pastoral_participates_bool') type = 'BOOLEAN';
        if (col === 'registration_number' || col === 'code') type = 'TEXT UNIQUE';
        if (col === 'days_of_week' || col === 'subject_ids') return 'TEXT[]';
        
        if (col === 'birth_date' || col === 'start_date' || col === 'payment_date' || col === 'foundation_date' || (col.endsWith('_date') && !col.includes('created') && !col.includes('updated'))) {
          type = 'DATE';
        } 
        else if (col.includes('timestamp') || col === 'created_at' || col === 'updated_at' || col.endsWith('_at')) {
          type = 'TIMESTAMP WITH TIME ZONE DEFAULT timezone(\'utc\'::text, now())';
        }
        return type;
      };

      if (typedInfo.status === 'missing_table') {
        sql += `-- Criar Tabela: ${tableName}\n`;
        // Adiciona um DROP VIEW por segurança caso exista uma view com o mesmo nome (comum em migrações)
        sql += `DROP VIEW IF EXISTS public.${tableName} CASCADE;\n`;
        sql += `CREATE TABLE IF NOT EXISTS public.${tableName} (\n`;
        sql += `  id TEXT PRIMARY KEY,\n`;
        
        const cols = typedInfo.missing.filter((c: string) => c !== 'id' && c !== 'created_at');
        cols.forEach((col: string, idx: number) => {
          const type = getColType(col);
          sql += `  ${col} ${type},\n`;
        });
        
        sql += `  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL\n`;
        sql += `);\n\n`;
        
        sql += `-- Habilitar RLS e Permissões para ${tableName}\n`;
        sql += `ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;\n`;
        sql += `DROP POLICY IF EXISTS "Public Access ${tableName}" ON public.${tableName};\n`;
        sql += `CREATE POLICY "Public Access ${tableName}" ON public.${tableName} FOR ALL USING (true) WITH CHECK (true);\n\n`;

      } else if (typedInfo.status === 'incomplete' && typedInfo.missing.length > 0) {
        sql += `-- Tabela: ${tableName}\n`;
        typedInfo.missing.forEach((col: string) => {
          const type = getColType(col);
          sql += `ALTER TABLE public.${tableName} ADD COLUMN IF NOT EXISTS ${col} ${type};\n`;
        });
        sql += '\n';
      }
    }
    
    return sql;
  }
};
