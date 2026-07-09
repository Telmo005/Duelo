# Requirements: Duelo

**Defined:** 2026-07-09
**Core Value:** Dois utilizadores conseguem apostar um contra o outro, com o dinheiro de ambos protegido em custódia e a liquidação do vencedor totalmente automática e confiável após o resultado oficial — sem que a plataforma corra qualquer risco financeiro.

## v1 Requirements

Escopo do primeiro milestone: o ciclo essencial (registar → depositar → criar/aceitar aposta → liquidar) funcionando de ponta a ponta, com um design bonito e de baixo atrito. Painel administrativo fica no nível mínimo necessário para operar com segurança (visibilidade de dinheiro), não uma suite completa de gestão.

### Autenticação (AUTH)

- [ ] **AUTH-01**: Utilizador regista-se com telefone (ou email) e password
- [ ] **AUTH-02**: Utilizador confirma ter 18+ anos no registo (checkbox, sem KYC documental)
- [ ] **AUTH-03**: Utilizador inicia sessão e a sessão persiste entre visitas
- [ ] **AUTH-04**: Utilizador pode repor a password

### Carteira (WALLET)

- [ ] **WALLET-01**: Utilizador vê saldo disponível e saldo bloqueado separadamente
- [ ] **WALLET-02**: Toda movimentação de saldo é registada em livro-razão auditável (append-only), sem coluna de saldo mutável isolada
- [ ] **WALLET-03**: Bloqueio/desbloqueio de saldo é atómico — impossível usar o mesmo saldo em duas apostas simultâneas (row locking / transação)
- [ ] **WALLET-04**: Utilizador vê histórico completo (depósitos, levantamentos, apostas, prémios, comissões, reembolsos)

### Pagamentos (PAY)

- [ ] **PAY-01**: Utilizador deposita via M-Pesa através do PaySuite
- [ ] **PAY-02**: Utilizador deposita via e-Mola através do PaySuite
- [ ] **PAY-03**: Webhook de confirmação de pagamento do PaySuite é validado (assinatura) e processado de forma idempotente (sem crédito duplicado em reentrega)
- [ ] **PAY-04**: Utilizador solicita levantamento do saldo disponível via mobile money

### Apostas (BET)

- [ ] **BET-01**: Utilizador cria uma aposta sobre um jogo (1X2), definindo previsão e valor
- [ ] **BET-02**: Criar uma aposta bloqueia automaticamente o saldo do criador
- [ ] **BET-03**: Outro utilizador aceita a aposta apostando o valor exato contra a previsão do criador
- [ ] **BET-04**: Aceitar uma aposta bloqueia automaticamente o saldo do adversário
- [ ] **BET-05**: Criador pode cancelar a aposta manualmente enquanto não houver adversário
- [ ] **BET-06**: Aposta é cancelada e reembolsada automaticamente se não encontrar adversário antes do início do jogo
- [ ] **BET-07**: Criar uma aposta demora menos de 30 segundos (UX de baixo atrito)

### Liquidação (SETL)

- [ ] **SETL-01**: Resultado oficial do jogo é obtido automaticamente via API externa de dados desportivos (ligas europeias cobertas no v1; Moçambola adiada — ver Out of Scope)
- [ ] **SETL-02**: Vencedor recebe automaticamente o pote menos 10% de comissão da plataforma
- [ ] **SETL-03**: Liquidação é processada de forma idempotente por jogo (nunca paga duas vezes o mesmo resultado)
- [ ] **SETL-04**: Jogo adiado/abandonado/sem resultado após janela de tolerância é tratado com regra definida (reembolso de ambas as partes, sem comissão)

### Perfil (PROF)

- [ ] **PROF-01**: Utilizador tem perfil com nome, username e estatísticas básicas (apostas, vitórias, derrotas)
- [ ] **PROF-02**: Utilizador recebe notificação quando a sua aposta é aceite, cancelada/reembolsada ou liquidada

### Administração (ADMIN)

- [ ] **ADMIN-01**: Admin visualiza todos os depósitos, levantamentos, apostas e o estado das carteiras (visibilidade financeira mínima para operar com segurança)
- [ ] **ADMIN-02**: Admin consegue rever apostas sinalizadas por heurística de fraude básica (mesmo dispositivo/IP apostando contra si mesmo)

### Design (DESIGN)

- [ ] **DESIGN-01**: Interface visualmente distinta e polida — não parece um dashboard genérico; usa identidade visual própria (cor, tipografia, micro-interações)
- [ ] **DESIGN-02**: Fluxo de criar/aceitar aposta é otimizado para telemóvel (mobile-first), incluindo redes/dispositivos mais fracos

## v2 Requirements

Reconhecido, mas fora do roadmap atual.

### Painel Administrativo Completo

- **ADMIN-03**: Gestão de campeonatos e partidas pelo admin
- **ADMIN-04**: Estatísticas gerais, receitas/comissão agregadas, auditoria e logs completos
- **ADMIN-05**: Bloqueio de utilizadores e gestão de denúncias

### Expansão de Cobertura

- **EXP-01**: Cobertura da Moçambola (depende de confirmação de fonte de dados — ver Out of Scope)
- **EXP-02**: Mercados adicionais (over/under, handicap)
- **EXP-03**: Outros desportos além de futebol

### Perfil e Social

- **PROF-03**: Ranking/leaderboard entre utilizadores
- **PROF-04**: Total ganho/perdido histórico detalhado, taxa de sucesso

### Anti-fraude Avançado

- **FRAUD-01**: Deteção de conluio por análise comportamental/ML

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-moeda / multi-país | Foco em Moçambique/MT no v1; expansão é visão de longo prazo |
| Multi-idioma | Português apenas no v1 |
| Outros desportos além de futebol | Reduz escopo de integração com API de resultados |
| KYC documental completo | Apenas confirmação de maioridade no v1; KYC completo fica para quando volume/regulação exigir |
| Cartão bancário / transferência tradicional | Mobile money é suficiente para v1 |
| Moçambola no v1 | Cobertura por API de dados desportivos não confirmada — adiada até validar fonte (fallback manual seria alternativa futura) |
| Licenciamento IGJ (Lei 1/2010) | Faixa jurídica paralela, fora do escopo de engenharia deste milestone — deve ser resolvida antes de operar com dinheiro real em produção |

## Traceability

Cada requisito v1 mapeia para exatamente uma fase (ver ROADMAP.md).

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| WALLET-01 | Phase 1 | Pending |
| WALLET-02 | Phase 1 | Pending |
| WALLET-03 | Phase 1 | Pending |
| WALLET-04 | Phase 1 | Pending |
| PAY-01 | Phase 1 | Pending |
| PAY-02 | Phase 1 | Pending |
| PAY-03 | Phase 1 | Pending |
| DESIGN-01 | Phase 1 | Pending |
| BET-01 | Phase 2 | Pending |
| BET-02 | Phase 2 | Pending |
| BET-03 | Phase 2 | Pending |
| BET-04 | Phase 2 | Pending |
| BET-05 | Phase 2 | Pending |
| BET-06 | Phase 2 | Pending |
| BET-07 | Phase 2 | Pending |
| DESIGN-02 | Phase 2 | Pending |
| SETL-01 | Phase 3 | Pending |
| SETL-02 | Phase 3 | Pending |
| SETL-03 | Phase 3 | Pending |
| SETL-04 | Phase 3 | Pending |
| PROF-02 | Phase 3 | Pending |
| PAY-04 | Phase 4 | Pending |
| PROF-01 | Phase 4 | Pending |
| ADMIN-01 | Phase 5 | Pending |
| ADMIN-02 | Phase 5 | Pending |

**Note:** device/IP fraud data capture is implemented in Phase 2 (bet create/accept); the flag-and-review capability (ADMIN-02) lands in Phase 5, which consumes that captured data.

**Coverage:**
- v1 requirements: 29 total (AUTH 4, WALLET 4, PAY 4, BET 7, SETL 4, PROF 2, ADMIN 2, DESIGN 2)
- Mapped to phases: 29 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-09*
*Last updated: 2026-07-09 after roadmap creation (traceability populated, 29/29 mapped)*
