import { supabase } from '../lib/supabase';
import blueprint from '../../firebase-blueprint.json';

export const schemaService = {
  /**
   * Performs a checkup of the current database schema by introspecting existing data.
   */
  async checkup() {
    const report: any = {};
    const entities = blueprint.entities;
    
    for (const [entityName, entityDef] of Object.entries(entities)) {
      const tableName = blueprint.firestore[entityName as keyof typeof blueprint.firestore]?.schema === entityName 
        ? entityName.toLowerCase() + 's' 
        : entityName.toLowerCase();
      
      // Map entity names to actual table names if they differ
      let actualTableName = tableName;
      if (entityName === 'Student') actualTableName = 'students';
      if (entityName === 'Teacher') actualTableName = 'teachers';
      if (entityName === 'Class') actualTableName = 'classes';
      if (entityName === 'Subject') actualTableName = 'subjects';
      if (entityName === 'PixTransaction') actualTableName = 'pix_reconciliations';
      if (entityName === 'Contribution') actualTableName = 'contributions';
      if (entityName === 'UserProfile') actualTableName = 'profiles';
      if (entityName === 'InstitutionSettings') actualTableName = 'institution_settings';

      try {
        // Find existing columns more reliably by checking expected ones
        const expectedColumns = Object.keys((entityDef as any).properties);
        const missing: string[] = [];
        const existing: string[] = [];

        // Check columns in bulk or one by one if necessary
        // For performance and reliability, we try a combined select
        const { error: probeError } = await supabase
          .from(actualTableName)
          .select(expectedColumns.join(','))
          .limit(0);

        if (probeError) {
          // If bulk select fails, some columns are missing. Check one by one to identify which ones.
          for (const col of expectedColumns) {
            if (col === 'id' || col === 'created_at') {
              existing.push(col);
              continue;
            }
            const { error: colError } = await supabase
              .from(actualTableName)
              .select(col)
              .limit(0);
            
            if (colError) {
              missing.push(col);
            } else {
              existing.push(col);
            }
          }
        } else {
          // All expected columns exist!
          existing.push(...expectedColumns);
        }
        
        report[actualTableName] = {
          status: missing.length === 0 ? 'ok' : 'incomplete',
          existing: existing,
          missing: missing,
          message: missing.length > 0 ? `${missing.length} colunas faltando.` : 'Sincronizado.'
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
      if (typedInfo.status === 'incomplete' && typedInfo.missing.length > 0) {
        sql += `-- Tabela: ${tableName}\n`;
        typedInfo.missing.forEach((col: string) => {
          // Simplistic type mapping
          let type = 'TEXT';
          if (col.includes('amount') || col.includes('price')) type = 'NUMERIC';
          if (col.includes('is_') || col === 'pastoral_participates_bool') type = 'BOOLEAN';
          
          // Pure dates (no time)
          if (col === 'birth_date' || col === 'start_date' || col === 'payment_date' || (col.endsWith('_date') && !col.includes('created') && !col.includes('updated'))) {
            type = 'DATE';
          } 
          // Timestamps
          else if (col.includes('timestamp') || col === 'created_at' || col === 'updated_at' || col.endsWith('_at')) {
            type = 'TIMESTAMP WITH TIME ZONE';
          }
          
          sql += `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col} ${type};\n`;
        });
        sql += '\n';
      }
    }
    
    return sql;
  }
};
