-- Transient guards are inserted and removed in the same transaction.
-- A failed CHECK rolls back every reviewed change, checkpoint and receipt.
CREATE TABLE IF NOT EXISTS mutation_guards (
  id TEXT PRIMARY KEY,
  ok INTEGER NOT NULL CHECK(ok=1)
);
