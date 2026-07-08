import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercepta e normaliza redirecionamentos do Supabase para manter na rota de login (`#/login`)
(function handleSupabaseRedirects() {
  const hash = window.location.hash || '';
  const search = window.location.search || '';

  // Caso 1: Supabase retornou hash com tokens de recuperação diretamente na raiz (ex: /#access_token=...&type=recovery)
  if (hash && (hash.includes('access_token=') || hash.includes('type=recovery') || hash.includes('error_description='))) {
    if (!hash.startsWith('#/login')) {
      const cleanHash = hash.startsWith('#') ? hash.substring(1) : hash;
      
      if (cleanHash.includes('type=recovery') || cleanHash.includes('access_token=')) {
        localStorage.setItem('supabase_recovery_mode', 'true');
      }
      
      console.log('[Redirect Handler] Redirecionando hash do Supabase para a página de login:', cleanHash);
      window.location.hash = `#/login?${cleanHash}`;
    }
  }

  // Caso 2: Supabase retornou query params na raiz (ex: /?code=... ou /?type=recovery)
  if (search && (search.includes('code=') || search.includes('type=recovery'))) {
    const cleanSearch = search.startsWith('?') ? search.substring(1) : search;
    
    if (cleanSearch.includes('type=recovery') || cleanSearch.includes('code=')) {
      localStorage.setItem('supabase_recovery_mode', 'true');
    }
    
    console.log('[Redirect Handler] Redirecionando query params do Supabase para a página de login:', cleanSearch);
    
    // Limpa a query string do navegador para não sujar o histórico e redireciona via hash
    window.history.replaceState(null, '', window.location.pathname);
    window.location.hash = `#/login?${cleanSearch}`;
  }
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
