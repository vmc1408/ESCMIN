import { supabase, fetchRecursive } from '../lib/supabase';

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
      return await fetchRecursive('pix_reconciliations', {
        select: '*, student:students(name)',
        orderCol: 'created_at',
        ascending: false
      });
    } catch (e) {
      // Fallback fallback simple select
      const { data, error } = await supabase
        .from('pix_reconciliations')
        .select(`
          *,
          student:students(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    }
  },

  /**
   * Busca contribuições financeiras. (Ilimitado)
   */
  async getContributions() {
    try {
      return await fetchRecursive('contributions', {
        select: '*, student:students(name, registration_number)',
        orderCol: 'payment_date',
        ascending: false
      });
    } catch (e) {
      const { data, error } = await supabase
        .from('contributions')
        .select(`
          *,
          student:students(name, registration_number)
        `)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      return data;
    }
  },

  /**
   * Busca as configurações da instituição do Supabase.
   */
  async getInstitutionSettings() {
    const { data, error } = await supabase
      .from('institution_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Agregação para receita total. (Lida com mais de 1000 registros)
   */
  async getMonthlyRevenue() {
    try {
      const data = await fetchRecursive('contributions', {
        select: 'amount',
        orderCol: 'payment_date',
        ascending: false
      });
      return data ? data.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0) : 0;
    } catch (e) {
      const { data, error } = await supabase
        .from('contributions')
        .select('amount')
        .order('payment_date', { ascending: false });

      if (error) throw error;
      return data ? data.reduce((acc, curr) => acc + Number(curr.amount), 0) : 0;
    }
  }
};
