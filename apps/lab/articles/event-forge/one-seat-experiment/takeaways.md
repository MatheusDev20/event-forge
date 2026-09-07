### Pessimistic locking on the allocation rows

The allocation rows returned are locked using the `FOR UPDATE` syntax, which scopes the contention to the allocation ids passed in the request to `/events/{eventId}/holds`

```sql
 SELECT "id", "event_id", "capacity", "held", "reserved"
  FROM "allocations"
  WHERE "id" = ANY($1::uuid[])
  ORDER BY "id"
  FOR UPDATE
```

This, together with the transaction opened by the `placeHold` service function, takes a lock on the rows returned by the SELECT statement.

This pessimistic lock is, in essence, the concurrency control.


### What the loser sees when the lock is released

Two transactions claim the same seat. `A` gets there first, `B` waits.

| step | `A` — the winner                        | `B` — the loser                                                        |
| :--: | :-------------------------------------- | :--------------------------------------------------------------------- |
| `t0` | `SELECT … FOR UPDATE` → locks, `held` 0 | —                                                                      |
| `t1` | —                                       | `SELECT … FOR UPDATE` → **blocks**                                     |
| `t2` | `UPDATE … SET held = 1`                 | ⋯ waiting                                                              |
| `t3` | `COMMIT` → lock released                | ⋯ wakes up                                                             |
| `t4` | —                                       | re-fetches the committed row, re-checks its `WHERE` → reads `held` **1** |

`t4` is the mechanism. `B` does not decide from the snapshot it took at `t1`;
it decides from what `A` committed. This is `READ COMMITTED` behaviour, and
only that: under `REPEATABLE READ` the same moment raises `40001` instead of
quietly moving to the newer row version.

### Who actually refuses

`refuseHold` then does its job, and it does it as a pure function: it never
reads the database and knows nothing about locks. It is *handed* the rows the
repository locked and re-read, which is why the `held = 1` it evaluates is
already the winner's committed value.

It does not throw. It **returns** a refusal — `insufficient_units` — and
`placeHold` is what turns that value into a thrown `HoldRefusedError`. The
throw is what rolls the transaction back, releasing `B`'s own locks and leaving
no trace of the rows it looked at.

### Only the named rows contend

The lock is row-level, so two requests for different seats never meet — they
block each other only when they name the same allocation. That is why the seed
has both kinds: four seats are four locks taken one at a time, while the
general-admission counter is a single hot row that every claim queues on.

### Two seats at once, and `ORDER BY "id"`

The `ORDER BY` in the locking SELECT is not cosmetic. Locks are taken in the
order rows come back, so two requests naming seats A and B in opposite orders
would each hold what the other wants. Postgres breaks that tie by killing one
transaction with a deadlock error — which, from outside, looks exactly like
losing a seat. Sorting by id gives every request in the system the same lock
order, so the deadlock is impossible rather than rare.

### Underneath all of it, the constraint

`allocations_no_oversell_check` — `held + reserved <= capacity` — is the actual
authority, not the lock. If every line of reasoning above is wrong, the write
is still refused by the database. That is the difference between an experiment
and a hope: a broken strategy here cannot oversell, it can only fail loudly.
Removing `FOR UPDATE` proves it — the test fails not with two winners, but with
losers failing for the wrong reason.

### What it costs

Losers wait, and they wait exactly as long as the winner's transaction lasts.
So the transaction body is the critical section, and any slow work inside it is
paid for by every other claimant — each of them blocked, and each holding a
pool connection while blocked. That is why the read-back in `placeHold` happens
after the commit rather than inside it.

This is also the cost the other strategies trade against: optimistic makes the
losers redo the work instead of waiting, and serializable makes Postgres detect
the conflict instead of the code describing it.
