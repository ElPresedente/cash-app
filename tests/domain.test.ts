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

import {
  restoreData,
  saveCategory,
  deleteCategory,
  categoryDeletionError,
} from "../src/domain.ts";
test("legacy data migrates with all account balances and operations intact", () => {
  const current = emptyData();
  current.accounts[0].opening = 129900;
  const legacy = {
    version: 1,
    accounts: current.accounts,
    operations: [operation()],
  };
  const migrated = restoreData(JSON.parse(JSON.stringify(legacy)));
  assert.ok(migrated);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.operations, legacy.operations);
  assert.deepEqual(migrated.accounts, legacy.accounts);
  assert.ok(migrated.categories["Кафе и рестораны"].includes("Кофе"));
  assert.equal(
    restoreData({ ...legacy, operations: [{ ...operation(), amount: -1 }] }),
    null,
  );
});
test("custom categories validate and persist through a JSON roundtrip", () => {
  const data = saveCategory(emptyData(), null, " Путешествия ", [
    { original: null, name: " Отели " },
  ]);
  const op = operation({ category: "Путешествия", subcategory: "Отели" });
  assert.equal(validate(op, data.accounts, data.categories), "");
  data.operations = [op];
  const restored = restoreData(JSON.parse(JSON.stringify(data)));
  assert.ok(restored);
  assert.deepEqual(restored.categories["Путешествия"], ["Отели"]);
  assert.equal(restored.operations[0].subcategory, "Отели");
  assert.ok(
    validate({ ...op, category: "Нет такой" }, data.accounts, data.categories),
  );
});
test("category and subcategory renaming preserves transaction history and balances", () => {
  const data = emptyData();
  data.operations = [operation(), operation({ id: "2", subcategory: "" })];
  const renamed = saveCategory(data, "Кафе и рестораны", "Еда вне дома", [
    { original: "Кофе", name: "Напитки" },
    { original: "Обед", name: "Обед" },
    { original: "Ресторан", name: "Ресторан" },
  ]);
  assert.equal(renamed.operations[0].category, "Еда вне дома");
  assert.equal(renamed.operations[0].subcategory, "Напитки");
  assert.equal(renamed.operations[1].subcategory, "");
  assert.deepEqual(balances(renamed), balances(data));
  assert.ok(isData(renamed));
  assert.equal(data.operations[0].category, "Кафе и рестораны");
});
test("category editing rejects duplicates, empty names and deletion of used subcategories", () => {
  const data = emptyData();
  data.operations = [operation()];
  assert.throws(() => saveCategory(data, null, " продукты ", []));
  assert.throws(() => saveCategory(data, null, " ", []));
  assert.throws(() =>
    saveCategory(data, null, "Новая", [
      { original: null, name: "А" },
      { original: null, name: " а " },
    ]),
  );
  assert.throws(() => saveCategory(data, "Кафе и рестораны", "Кафе", []));
  assert.throws(() =>
    saveCategory(data, null, "Новая", [{ original: null, name: "" }]),
  );
});
test("category deletion protects history and the last category", () => {
  const data = emptyData();
  data.operations = [operation()];
  assert.ok(categoryDeletionError(data, "Кафе и рестораны"));
  assert.throws(() => deleteCategory(data, "Кафе и рестораны"));
  const next = deleteCategory(data, "Покупки");
  assert.equal(Object.hasOwn(next.categories, "Покупки"), false);
  assert.deepEqual(next.operations, data.operations);
  assert.ok(isData(next));
  assert.throws(() =>
    deleteCategory(
      { ...emptyData(), categories: { Единственная: [] } },
      "Единственная",
    ),
  );
});
