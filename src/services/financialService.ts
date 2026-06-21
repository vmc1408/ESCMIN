import { supabase, fetchRecursive, isSupabaseConfigured } from '../lib/supabase';

export interface PixReconciliationSQL {
  id: string;
  payer_name: string;
  payer_document: string;
  amount: number;
  status: 'pending' | 'matched' | 'disputed';
  created_at: string;
  matched_student_id?: string;
  school_id: string; // Tenant Isolation
}

/**
 * Financial Service - Camada de Integração Híbrida
 * Este serviço utiliza os nomes reais das tabelas identificados no banco:
 * - pix_reconciliations: Para auditoria e conciliação
 * - contributions: Para recebimentos confirmados
 */
export const financialService = {
  /**
   * Busca transações de conciliação Pix. (Ilimitado)
   */
  async getPixReconciliation() {
    try {
      if (isSupabaseConfigured) {
        return await fetchRecursive('pix_reconciliations', {
          select: '*, student:students(name)',
          orderCol: 'created_at',
          ascending: false
        });
      }
      return [];
    } catch (e: any) {
      console.warn('[financialService] Primeira tentativa de getPixReconciliation falhou:', e.message || e);
      if (isSupabaseConfigured) {
        try {
          // Fallback fallback simple select
          const { data, error } = await supabase
            .from('pix_reconciliations')
            .select(`
              *,
              student:students(name)
            `)
            .order('created_at', { ascending: false });

          if (error) {
            console.warn('[financialService] Fallback de getPixReconciliation falhou:', error.message);
            return [];
          }
          return data || [];
        } catch (innerErr: any) {
          console.warn('[financialService] Fatal ao tentar fallback de getPixReconciliation:', innerErr.message || innerErr);
          return [];
        }
      }
      return [];
    }
  },

  /**
   * Busca contribuições financeiras. (Ilimitado)
   */
  async getContributions() {
    try {
      if (isSupabaseConfigured) {
        return await fetchRecursive('contributions', {
          select: '*, student:students(name, registration_number)',
          orderCol: 'payment_date',
          ascending: false
        });
      }
      return [];
    } catch (e: any) {
      console.warn('[financialService] Primeira tentativa de getContributions falhou:', e.message || e);
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase
            .from('contributions')
            .select(`
              *,
              student:students(name, registration_number)
            `)
            .order('payment_date', { ascending: false });

          if (error) {
            console.warn('[financialService] Fallback de getContributions falhou:', error.message);
            return [];
          }
          return data || [];
        } catch (innerErr: any) {
          console.warn('[financialService] Fatal ao tentar fallback de getContributions:', innerErr.message || innerErr);
          return [];
        }
      }
      return [];
    }
  },

  /**
   * Busca as configurações da instituição do Supabase.
   */
  async getInstitutionSettings() {
    try {
      if (!isSupabaseConfigured) return null;
      
      const { data, error } = await supabase
        .from('institution_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
  
      if (error) {
        if (error.code === '42P01' || error.message?.includes('not found')) {
          return null;
        }
        throw error;
      }
      return data;
    } catch (err: any) {
      if (err.message?.includes('fetch') || err.message?.includes('TIMEOUT') || err.message?.includes('NetworkError')) {
        console.warn('[Supabase] Problema de conexão ao buscar instituição. Retornando null.');
        return null;
      }
      console.error('[financialService] Erro ao buscar instituição:', err.message);
      return null;
    }
  },

  /**
   * Agregação para receita total. (Lida com mais de 1000 registros)
   */
  async getMonthlyRevenue() {
    try {
      if (isSupabaseConfigured) {
        const data = await fetchRecursive('contributions', {
          select: 'amount',
          orderCol: 'payment_date',
          ascending: false
        });
        return data ? data.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0) : 0;
      }
      return 0;
    } catch (e: any) {
      console.warn('[financialService] Primeira tentativa de getMonthlyRevenue falhou:', e.message || e);
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase
            .from('contributions')
            .select('amount')
            .order('payment_date', { ascending: false });

          if (error) {
            console.warn('[financialService] Fallback de getMonthlyRevenue falhou:', error.message);
            return 0;
          }
          return data ? data.reduce((acc, curr) => acc + Number(curr.amount), 0) : 0;
        } catch (innerErr: any) {
          console.warn('[financialService] Fatal ao tentar fallback de getMonthlyRevenue:', innerErr.message || innerErr);
          return 0;
        }
      }
      return 0;
    }
  }
};
