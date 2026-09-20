/**
 * Utilitários para tratamento, máscara e cálculo de tamanho válido para RG (Registro Geral / CIN).
 * 
 * Regras e tipos de numeração de documentos de identidade no Brasil:
 * - Padrão Estadual Reduzido (antigo / alguns estados como DF, RJ): 7 a 8 caracteres (formatado: 10-11 caracteres).
 * - Padrão Estadual Tradicional (SP, RJ e maioria dos estados): 9 caracteres (8 dígitos + 1 DV numérico ou 'X') (formatado: 12 caracteres - 00.000.000-0 ou 00.000.000-X).
 * - Padrão Estadual Expandido (MG, RS, BA, PR): 10 caracteres (formatado: 13 caracteres - 00.000.000-00).
 * - Nova Carteira de Identidade Nacional (CIN - Lei 14.534/2023): 11 dígitos (formato unificado nacional pelo CPF - 000.000.000-00, 14 caracteres).
 * 
 * Limite de caracteres:
 * - Bruto: máx. 11 caracteres alfanuméricos (0-9 e X).
 * - Formatado com máscara: máx. 14 caracteres.
 */

export interface RGValidationResult {
  raw: string;
  rawLength: number;
  formattedLength: number;
  isValid: boolean;
  type: 'empty' | 'incomplete' | 'state_7_8' | 'state_sp_9' | 'state_sp_9_x' | 'state_10' | 'cin_11' | 'invalid';
  typeLabel: string;
  helperText: string;
  statusColor: 'neutral' | 'warning' | 'success' | 'error';
}

/**
 * Limpa o valor mantendo apenas números e 'X' (maiúsculo)
 */
export const cleanRG = (value: string): string => {
  if (!value) return '';
  return value.toUpperCase().replace(/[^0-9X]/g, '');
};

/**
 * Aplica máscara inteligente de RG de acordo com a quantidade de caracteres digitados,
 * respeitando o limite máximo absoluto de 11 dígitos (14 caracteres formatados).
 */
export const maskRG = (value: string): string => {
  if (!value) return '';
  const upper = value.toUpperCase();
  // Permite dígitos e 'X' (o 'X' só é válido como dígito verificador final em SP/RJ)
  const cleaned = upper.replace(/[^0-9X]/g, '');
  // Limita estritamente ao tamanho máximo oficial no Brasil (11 dígitos alfanuméricos)
  const raw = cleaned.slice(0, 11);

  if (raw.length <= 2) return raw;
  if (raw.length <= 5) return raw.replace(/^([0-9X]{2})([0-9X]{1,3})/, '$1.$2');
  if (raw.length <= 8) return raw.replace(/^([0-9X]{2})([0-9X]{3})([0-9X]{1,3})/, '$1.$2.$3');
  
  if (raw.length === 9) {
    // Padrão SP/RJ tradicional (8 dígitos + 1 DV dígito ou X): 00.000.000-0 ou 00.000.000-X
    return raw.replace(/^([0-9X]{2})([0-9X]{3})([0-9X]{3})([0-9X]{1})/, '$1.$2.$3-$4');
  }
  
  if (raw.length === 10) {
    // Padrão de 10 dígitos (MG, RS, PR): 00.000.000-00
    return raw.replace(/^([0-9X]{2})([0-9X]{3})([0-9X]{3})([0-9X]{2})/, '$1.$2.$3-$4');
  }

  // Padrão de 11 dígitos (Nova Carteira de Identidade Nacional - CIN, base CPF): 000.000.000-00
  return raw.replace(/^([0-9X]{3})([0-9X]{3})([0-9X]{3})([0-9X]{2})/, '$1.$2.$3-$4');
};

/**
 * Calcula o tamanho e identifica o tipo de numeração do documento de identidade informado.
 */
export const calculateRGValidation = (value: string): RGValidationResult => {
  const raw = cleanRG(value);
  const len = raw.length;
  const formattedLength = (value || '').length;

  if (len === 0) {
    return {
      raw,
      rawLength: 0,
      formattedLength: 0,
      isValid: true,
      type: 'empty',
      typeLabel: '',
      helperText: '7 a 11 dígitos (aceita dígito X ou Nova CIN)',
      statusColor: 'neutral'
    };
  }

  if (len < 7) {
    return {
      raw,
      rawLength: len,
      formattedLength,
      isValid: false,
      type: 'incomplete',
      typeLabel: 'Incompleto',
      helperText: `${len}/9 dígitos (mínimo de 7 dígitos para RG)`,
      statusColor: 'warning'
    };
  }

  if (len === 7 || len === 8) {
    return {
      raw,
      rawLength: len,
      formattedLength,
      isValid: true,
      type: 'state_7_8',
      typeLabel: `Estadual (${len} dígitos)`,
      helperText: `${len} dígitos • Válido (Padrão Estadual)`,
      statusColor: 'success'
    };
  }

  if (len === 9) {
    const isX = raw.endsWith('X');
    return {
      raw,
      rawLength: 9,
      formattedLength,
      isValid: true,
      type: isX ? 'state_sp_9_x' : 'state_sp_9',
      typeLabel: isX ? 'Estadual SP/RJ (com DV X)' : 'Estadual SP/RJ (9 dígitos)',
      helperText: isX ? '9 caracteres • Válido (Padrão SP com dígito X)' : '9 dígitos • Válido (Padrão SP/RJ tradicional)',
      statusColor: 'success'
    };
  }

  if (len === 10) {
    return {
      raw,
      rawLength: 10,
      formattedLength,
      isValid: true,
      type: 'state_10',
      typeLabel: 'Estadual (MG/RS/PR 10 dígitos)',
      helperText: '10 dígitos • Válido (Padrão Estadual MG/RS/PR)',
      statusColor: 'success'
    };
  }

  if (len === 11) {
    return {
      raw,
      rawLength: 11,
      formattedLength,
      isValid: true,
      type: 'cin_11',
      typeLabel: 'Nova Identidade Nacional (CIN)',
      helperText: '11 dígitos • Válido (Nova Identidade Nacional - CIN)',
      statusColor: 'success'
    };
  }

  return {
    raw,
    rawLength: len,
    formattedLength,
    isValid: false,
    type: 'invalid',
    typeLabel: 'Excede o limite',
    helperText: 'Tamanho excede o limite oficial de 11 dígitos',
    statusColor: 'error'
  };
};

/**
 * Limite máximo de caracteres formatados para o input no formulário
 */
export const RG_MAX_FORMATTED_LENGTH = 14;
