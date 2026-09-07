-- ============================================================
-- SISTEMA FISCAL — Estrutura do Banco v1.0
-- Execute no SQL Editor do Supabase (ícone <> no menu lateral)
-- ============================================================

-- 1. EMPRESAS
CREATE TABLE IF NOT EXISTS public.empresas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       text NOT NULL DEFAULT 'Minha Empresa',
  cnpj       text,
  regime     text DEFAULT 'simples',
  meta       jsonb DEFAULT '{}',
  ativo      boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_empresas" ON public.empresas
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. PLANO DE CONTAS
CREATE TABLE IF NOT EXISTS public.plano_contas (
  id         text NOT NULL,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  codigo     text,
  chamada    text,
  nome       text NOT NULL,
  grupo      text NOT NULL CHECK (grupo IN ('AC','ANC','PC','PNC','PL','REC','DESP')),
  tipo       text NOT NULL CHECK (tipo IN ('D','C','C_RETIF','D_RETIF')),
  ind_cta    text CHECK (ind_cta IN ('S','A')), -- S=Sintética (totalizadora) / A=Analítica (recebe lançamento)
  dre        text,
  retif      boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id, empresa_id)
);
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_plano" ON public.plano_contas
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. LANÇAMENTOS CONTÁBEIS
CREATE TABLE IF NOT EXISTS public.lancamentos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id   uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero       integer,
  data         date NOT NULL,
  debito_id    text NOT NULL,
  credito_id   text NOT NULL,
  debito_nome  text NOT NULL,
  credito_nome text NOT NULL,
  valor        numeric(15,2) NOT NULL CHECK (valor > 0),
  descricao    text DEFAULT 'Sem descrição',
  estornado    boolean DEFAULT false,
  tipo_estorno boolean DEFAULT false,
  ref_id       uuid REFERENCES public.lancamentos(id),
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_lancamentos" ON public.lancamentos
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. PERFIS DE USUÁRIO (controle de administrador)
CREATE TABLE IF NOT EXISTS public.perfis (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text,
  is_admin   boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- Cada usuário lê apenas o próprio perfil
CREATE POLICY "perfil_select_proprio" ON public.perfis
  FOR SELECT USING (auth.uid() = user_id);

-- Cada usuário pode criar o próprio perfil, mas NUNCA já como admin
-- (a promoção a admin é feita manualmente no painel do Supabase)
CREATE POLICY "perfil_insert_proprio" ON public.perfis
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_admin = false);

-- Não há política de UPDATE para usuários comuns: ninguém se autopromove pelo app.
-- Para tornar alguém admin: Table Editor > perfis > marque is_admin = true.

-- 5. ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_lanc_emp_data ON public.lancamentos(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plano_emp     ON public.plano_contas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lanc_user     ON public.lancamentos(user_id);
