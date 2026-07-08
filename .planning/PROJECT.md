# Duelo

## What This Is

Duelo é uma plataforma de apostas desportivas P2P (peer-to-peer) onde utilizadores apostam uns contra os outros — nunca contra a casa. Um utilizador cria uma aposta sobre um evento desportivo (partida de futebol) prevendo um resultado (vitória da casa / empate / vitória do visitante) e define um valor. Outro utilizador aceita, apostando exatamente contra essa previsão pelo mesmo valor. A plataforma bloqueia o dinheiro de ambos, aguarda o resultado oficial (via API de dados desportivos), e paga automaticamente ao vencedor o pote total menos a comissão da plataforma. A plataforma atua apenas como intermediária/custodiante — nunca assume risco financeiro nem participa como contraparte.

## Core Value

Dois utilizadores conseguem apostar um contra o outro, com o dinheiro de ambos protegido em custódia e a liquidação do vencedor totalmente automática e confiável após o resultado oficial — sem que a plataforma corra qualquer risco financeiro.

## Business Context

- **Customer**: Apostadores desportivos em Moçambique (inicialmente), que quiserem apostar contra outra pessoa em vez de contra uma casa de apostas.
- **Revenue model**: Comissão de 10% sobre o pote de cada aposta liquidada (cobrada ao vencedor no momento do pagamento do prémio).
- **Success metric**: Volume de apostas liquidadas com sucesso (pote total processado) e taxa de apostas que encontram adversário antes do início do jogo.
- **Strategy notes**: MVP focado em Moçambique/futebol; expansão futura para outros países, moedas, idiomas e desportos é intenção declarada mas fora do escopo do v1.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Cadastro e autenticação de utilizadores (com confirmação de maioridade 18+, sem KYC documental no MVP)
- [ ] Carteira virtual com saldo disponível, saldo bloqueado e saldo total
- [ ] Depósito via mobile money (M-Pesa / e-Mola / mKesh)
- [ ] Levantamento via mobile money
- [ ] Histórico financeiro completo (depósitos, levantamentos, prémios, comissões, reembolsos)
- [ ] Criação de aposta (partida, mercado, previsão, valor)
- [ ] Aceitação de aposta por um segundo utilizador (mesmo valor, previsão contrária)
- [ ] Bloqueio automático de saldo (criador ao criar, adversário ao aceitar)
- [ ] Consulta automática do resultado oficial via API externa de dados desportivos
- [ ] Liquidação automática do vencedor (pote menos comissão de 10%)
- [ ] Cancelamento automático + reembolso se a aposta não encontrar adversário antes do início do jogo
- [ ] Cancelamento manual pelo criador enquanto a aposta não foi aceite
- [ ] Perfil do utilizador (foto, nome, username, nível, estatísticas: apostas, vitórias, derrotas, taxa de sucesso, total ganho/perdido, ranking)
- [ ] Notificações (aposta aceite, aposta cancelada/reembolsada, resultado e liquidação)
- [ ] Painel administrativo (utilizadores, apostas, carteiras, depósitos, levantamentos, receitas/comissão, apostas abertas/encerradas, estatísticas gerais, gestão de campeonatos e partidas, auditoria, logs, alertas, denúncias, bloqueio de utilizadores)
- [ ] Mercados: vitória da casa / empate / vitória do visitante (futebol apenas)
- [ ] Cobertura de campeonatos: Moçambola + principais ligas europeias (Premier League, La Liga, Champions League)
- [ ] Auditoria e rastreabilidade completa de toda movimentação financeira
- [ ] Prevenção básica de fraude: bloqueio contra dupla utilização de saldo, deteção de padrões suspeitos (mesmo dispositivo/IP apostando contra si mesmo)

### Out of Scope

- Multi-moeda / multi-país — decidido fazer Moçambique/MT apenas no v1; expansão é visão de longo prazo, não v1
- Multi-idioma — português apenas no v1
- Outros desportos além de futebol — decidido manter escopo restrito para simplificar integração com API de resultados
- KYC documental completo (verificação de identidade com documento) — apenas confirmação de maioridade no v1; KYC completo fica para quando o volume/regulação exigir
- Mercados de apostas além de 1X2 (over/under, handicap, etc.) — mencionados como futuro pelo utilizador, não v1
- Cartão bancário / transferência bancária tradicional como método de depósito — mobile money é suficiente para v1
- Deteção avançada de conluio (collusion) por ML/análise comportamental — v1 tem apenas heurísticas básicas (mesmo dispositivo/IP); deteção avançada é trabalho futuro

## Context

- Mercado alvo inicial: Moçambique, moeda MT (Metical).
- Utilizadores esperados apostam valores pequenos entre si (exemplo dado: 5 MT), portanto UX de baixo atrito é crítica — criar uma aposta deve levar menos de 30 segundos.
- Não existe base de código prévia — projeto greenfield.
- Regulação de apostas/gambling em Moçambique deve ser considerada à medida que o volume cresce (fora do escopo de pesquisa técnica do MVP, mas relevante para decisões de KYC/idade mínima).

## Constraints

- **Mercado geográfico**: Moçambique apenas no v1 — pagamentos via mobile money local (M-Pesa/e-Mola/mKesh)
- **Moeda**: MT (Metical) apenas no v1
- **Desporto**: Futebol apenas no v1 — Moçambola + Premier League, La Liga, Champions League
- **Resultado oficial**: Dependência de API externa de dados desportivos (custo recorrente e disponibilidade/latência dos dados são um risco a mitigar)
- **Segurança financeira**: Toda movimentação de saldo deve ser transacional e auditável — nenhuma condição de corrida pode permitir dupla utilização do mesmo saldo bloqueado
- **Idade mínima**: 18+ obrigatório (checkbox de confirmação no registo, sem verificação documental no MVP)
- **Comissão**: 10% do pote, cobrada ao vencedor na liquidação

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Adversário aposta sempre "contra" a previsão do criador (não escolhe resultado específico) | Garante que há sempre um vencedor num mercado de 3 vias — elimina a necessidade de um estado de "reembolso por resultado imprevisto" e simplifica a liquidação | — Pending |
| Resultado oficial via API externa de dados desportivos (não inserção manual por admin) | Escalabilidade e confiança — evita depender de operação humana e reduz risco de manipulação/erro do admin, mesmo custando integração adicional no MVP | — Pending |
| Depósito/levantamento via mobile money (M-Pesa/e-Mola/mKesh) | É como a maioria dos moçambicanos movimenta dinheiro digital — essencial para adoção no mercado alvo | — Pending |
| Comissão de 10% sobre o pote | Margem mais agressiva escolhida deliberadamente pelo dono do produto face à alternativa de 5% | — Pending |
| Apenas futebol no v1, com Moçambola + principais ligas europeias | Reduz escopo de integração com API de resultados e foca no desporto mais seguido no mercado alvo | — Pending |
| Confirmação de idade sem KYC documental completo no v1 | Equilíbrio entre mitigação de risco legal básico e velocidade de lançamento do MVP | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-08 after initialization*
