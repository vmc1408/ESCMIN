-- SCRIPT DE INFRAESTRUTURA SUPABASE - VERSÃO FINAL
-- Objetivo: Criar tabelas necessárias para o bloqueio de e-mails duplicados.
-- Role: Postgres / SQL Editor

-- 1. TABELA DE BLOQUEIO (CARTÓRIO DIGITAL)
-- Usamos 'id' como chave primária para compatibilidade com helpers do sistema.
CREATE TABLE IF NOT EXISTS public.email_registry (
    id TEXT PRIMARY KEY, -- Armazena o e-mail
    email TEXT UNIQUE NOT NULL,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'blocked',
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. TABELA DE USUÁRIOS (ESPELHO)
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY, 
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    full_name TEXT,
    role TEXT DEFAULT 'secretario',
    status TEXT DEFAULT 'active',
    avatar_url TEXT,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABELA DE CONFIGURAÇÕES
CREATE TABLE IF NOT EXISTS public.institution_settings (
    id TEXT PRIMARY KEY DEFAULT 'current',
    name TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HABILITAR SEGURANÇA (RLS)
ALTER TABLE public.email_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_settings ENABLE ROW LEVEL SECURITY;

-- CRIAR POLÍTICAS DE ACESSO PÚBLICO (PARA DESENVOLVIMENTO)
DO $$ 
BEGIN
    -- Política para email_registry
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access email_registry') THEN
        CREATE POLICY "Public Access email_registry" ON public.email_registry FOR ALL USING (true);
    END IF;

    -- Política para users
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access users') THEN
        CREATE POLICY "Public Access users" ON public.users FOR ALL USING (true);
    END IF;

    -- Política para institution_settings
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Access settings') THEN
        CREATE POLICY "Public Access settings" ON public.institution_settings FOR ALL USING (true);
    END IF;
END $$;
