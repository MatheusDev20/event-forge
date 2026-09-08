# One Seat Experiment

> This article is a part of a series of "experiments" that i run against a lab project Event Forge a fake ticket-selling plataform to study and test concepts

## Ideia principal

Plataformas de ingressos recebem um número de acesso incostante, que podem variar de acordo com a alta demanda de eventos específicos, meu objetivo é verificar comportamentos concorrentes em eventos com baixa de disponibilidade de ingressos e alta demanda.

Um mesmo assento sendo requisitado N ou mais vezes.


## Entendimento básico do modelo de dados.

O Event Forge tem algumas outras tabelas das que aparecem aqui, organizador,
locais, mapa de assentos, faixas de preço. Nada disso importa pra esse
experimento em específico. Só três tabelas entram me interessam, e a briga pela escrita em uma delas especialmente.

### Tabela **allocations** e a row disputada.

Uma linha por unidade de capacidade à venda em um evento. Pra assento numerado
isso é literalmente uma linha por assento, e a capacidade dela é `1` — não por
convenção, mas por constraint (`allocations_seat_identity_matches_kind_check`
não deixa um assento existir com outro valor).

![As três tabelas que esse experimento toca: allocations, holds e hold_lines.](/media/assets/data-model.png)

As colunas que interessam são três:

| coluna | o que é |
| --- | --- |
| `capacity` | quantas unidades existem. `1` pra um assento. |
| `held` | reivindicado, ainda não pago. Volta a sair em expiração, cancelamento ou falha. |
| `reserved` | pago. Terminal. |

Quando oito requisições disputam o mesmo assento, elas estão disputando **uma
linha só** dessa tabela. É esse o ponto: reduzir a disputa ao menor objeto
possível — uma linha com `capacity = 1` — e contar quantas conseguem sair de lá
com o assento na mão.

### A invariante mora no banco, não no código

A regra que esse contexto inteiro existe pra manter é uma só:

```
held + reserved <= capacity
```

E ela não é um `if` no serviço. É um CHECK constraint na tabela,
`allocations_no_oversell_check`.

Essa diferença é o que dá sentido ao experimento. Se a invariante vivesse no
código da aplicação, um teste verde provaria "o código que eu escrevi hoje está
certo" — o que vale pouco, porque a promessa precisa sobreviver justamente ao
código errado. Como CHECK, quem recusa a escrita é o Postgres. Uma estratégia de
lock quebrada não consegue vender o mesmo assento duas vezes; ela só consegue
falhar, e falhar de um jeito que aparece.

É a diferença entre um experimento e uma torcida: eu não preciso confiar no meu
próprio código pra confiar no resultado.

### `holds` e `hold_lines` — quem ficou com o assento

`holds` é a reivindicação em si: `holder_id` (quem está pegando), `status` e
`expires_at`. `hold_lines` diz o que foi pego — qual `allocation_id` e quantas
unidades.

Nenhuma das duas impede oversell. Isso é trabalho do CHECK e do lock. O que elas
permitem é a pergunta que o experimento faz *depois* da corrida: **quem ganhou?**
Contar quantos `201` e quantos `409` voltaram mede a API. Conseguir apontar no
banco o único dono daquele assento, com nome, mede o sistema.

Um detalhe honesto sobre `expires_at`: a coluna é escrita, mas ninguém lê. Não
existe sweeper e nenhuma consulta de disponibilidade desconta hold vencido, então
hoje um hold expirado segura o assento pra sempre. Isso é uma lacuna conhecida e
proposital — expiração é outro experimento — e não afeta esse aqui, que roda
sempre contra um assento novo.

The seed prints the whole walk-through. Short version, after `pnpm dev`:

```bash
# publish (Inventory snapshots the layout), then open the doors
curl -s -X POST localhost:3001/api/v1/events/$E/publish  | jq '.status'
curl -s -X POST localhost:3001/api/v1/events/$E/on-sale  | jq '.status'

# grab an allocation id, then fire 8 claims at it at once
seq 8 | xargs -P8 -I@ curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST localhost:3001/api/v1/events/$E/holds \
  -H 'content-type: application/json' \
  -d '{"lines":[{"allocationId":"'$A'","quantity":1}]}' | sort | uniq -c
```

```
   1 201
   7 409
```

## Run it for real

```bash
pnpm --filter @repo/server test:e2e
```

`test/hold-race.e2e-spec.ts` fires **16 simultaneous claims at one seat, 50
rounds over**, and asserts exactly one `201` and exactly 15 `409`s — each one
carrying `ALLOCATION_UNAVAILABLE` rather than merely failing. Afterwards the
seat is held by exactly one holder, named, in the database.

## Why the green means anything

It was checked against a deliberately broken strategy: with `FOR UPDATE`
removed, the test fails. Note *how* it fails — not with an oversell, because
`allocations_no_oversell_check` still refuses that write, but with losers
failing for the wrong reason. The constraint makes the bug impossible and the
assertions make it visible.

## Four things that silently invalidate this test

1. **Pool size must exceed N.** TypeORM defaults to 10. Fire 200 concurrent
   holds and 190 queue in the pool before reaching Postgres — you would be
   measuring pool queueing and drawing conclusions about locks.
2. **Loop it.** Interleavings are sampled, not enumerated. A race that passes
   once proves nothing, and a flaky pass is a failure.
3. **Assert the losers' reason.** N−1 requests failing is not the same as N−1
   requests failing *because the seat was taken*. A dropped connection counts
   as a loss and would hide a broken lock.
4. **The rate limiter counts too.** `ThrottlerGuard` at 60/minute turns the
   losers into `429`s — a guard doing its job, read as a lock doing its job.