/**
 * Utilitários para busca e preenchimento automático de endereço via CEP (ViaCEP).
 */

export interface ViaCEPResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge?: string;
  gia?: string;
  ddd?: string;
  siafi?: string;
  erro?: boolean;
}

export async function fetchAddressByCEP(cep: string): Promise<ViaCEPResponse | null> {
  const clean = (cep || '').replace(/\D/g, '');
  if (clean.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    if (!res.ok) return null;
    const data: ViaCEPResponse = await res.json();
    if (data.erro) return null;
    return data;
  } catch (err) {
    console.warn('Falha ao consultar ViaCEP:', err);
    return null;
  }
}
