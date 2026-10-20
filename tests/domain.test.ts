import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balances,
  emptyData,
  parseMoney,
  suggest,
  validate,
  isData,
  type Operation,
} from "../src/domain.ts";
const operation = (p: Partial<Operation> = {}): Operation => ({
  id: "1",
  kind: "expense",
  title: "Кофе",
  amount: 25000,
  accountId: "main",
  toAccountId: "",
  category: "Кафе и рестораны",
  subcategory: "Кофе",
  date: "2026-10-20",
  note: "",
  ...p,
});
test("money uses exact kopecks and rejects ambiguous precision", () => {
  assert.equal(parseMoney("1 234,56"), 123456);
  assert.equal(parseMoney("0.29"), 29);
  assert.ok(Number.isNaN(parseMoney("12.999")));
  assert.ok(Number.isNaN(parseMoney("-1")));
  assert.ok(Number.isNaN(parseMoney("Infinity")));
});
test("transfer conserves total while credit is a separate inflow", () => {
  const d = emptyData();
  d.accounts[0].opening = 100000;
  d.operations = [
    operation({
      kind: "transfer",
      amount: 20000,
      toAccountId: "cash",
      category: "",
      subcategory: "",
    }),
    operation({
      id: "2",
      kind: "credit",
      amount: 50000,
      category: "",
      subcategory: "",
    }),
    operation({ id: "3", amount: 10000 }),
  ];
  assert.deepEqual(balances(d), { main: 120000, cash: 20000 });
});
test("validation rejects same-account transfer, zero, missing account and impossible date", () => {
  const a = emptyData().accounts;
  assert.ok(validate(operation({ kind: "transfer", toAccountId: "main" }), a));
  assert.ok(validate(operation({ amount: 0 }), a));
  assert.ok(validate(operation({ accountId: "unknown" }), a));
  assert.ok(validate(operation({ date: "2026-02-30" }), a));
  assert.equal(validate(operation(), a), "");
});
test("suggestion returns only best match within the selected type", () => {
  const exact = operation();
  const other = operation({ id: "2", title: "Кофе на работу" });
  assert.equal(suggest("кофе", "expense", [other, exact])?.id, "1");
  assert.equal(suggest("кофе", "income", [exact]), undefined);
  assert.equal(suggest("абракадабра", "expense", [exact]), undefined);
  assert.equal(
    suggest("Кофе", "expense", [operation({ subcategory: "" })])?.subcategory,
    "",
  );
});
test("storage schema rejects damaged records and unknown operation types", () => {
  const d = emptyData();
  assert.ok(isData(d));
  d.operations = [operation()];
  assert.ok(isData(d));
  assert.equal(
    isData({ ...d, operations: [{ ...operation(), amount: NaN }] }),
    false,
  );
  assert.equal(
    isData({ ...d, operations: [{ ...operation(), kind: "invalid" }] }),
    false,
  );
  assert.equal(isData({ version: 2 }), false);
});

import { accountDeletionError } from "../src/domain.ts";
test("account deletion protects transaction sources, transfer destinations and last account", () => {
  const data = emptyData();
  assert.equal(accountDeletionError(data, "cash"), "");
  data.operations = [
    operation({
      kind: "transfer",
      toAccountId: "cash",
      category: "",
      subcategory: "",
    }),
  ];
  assert.ok(accountDeletionError(data, "cash"));
  assert.ok(accountDeletionError(data, "main"));
  data.operations = [operation()];
  assert.equal(accountDeletionError(data, "cash"), "");
  data.operations = [];
  data.accounts = [data.accounts[0]];
  assert.ok(accountDeletionError(data, "main"));
  assert.ok(accountDeletionError(data, "missing"));
});
