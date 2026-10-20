import Modal from "./Modal";
import CategorySettings from "./CategorySettings";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  ChevronRight,
  Plus,
  Wallet,
  LayoutDashboard,
  List,
  Settings,
  Search,
  ArrowLeft,
  PiggyBank,
  CreditCard,
  Download,
  Trash2,
  Check,
  Coffee,
  ShoppingBasket,
  House,
  Car,
  Heart,
  Sparkles,
} from "lucide-react";
import {
  balances,
  accountDeletionError,
  demoData,
  emptyData,
  restoreData,
  kinds,
  money,
  parseMoney,
  suggest,
  today,
  validate,
  type Data,
  type Kind,
  type Operation,
} from "./domain";
const STORAGE = "kopilka.v1";
const icons = {
  expense: ArrowUpRight,
  income: ArrowDownLeft,
  transfer: ArrowLeftRight,
  credit: CreditCard,
};
const categoryIcons: Record<string, typeof Coffee> = {
  Продукты: ShoppingBasket,
  "Кафе и рестораны": Coffee,
  Транспорт: Car,
  Дом: House,
  Здоровье: Heart,
};
type Page = "overview" | "operations" | "accounts" | "settings";
const navigation = [
  { id: "overview" as Page, label: "Обзор", icon: LayoutDashboard },
  { id: "operations" as Page, label: "Операции", icon: List },
  { id: "accounts" as Page, label: "Счета", icon: Wallet },
  { id: "settings" as Page, label: "Настройки", icon: Settings },
];
export default function App() {
  const [loadError] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      return raw && !restoreData(JSON.parse(raw))
        ? "Сохранённые данные не удалось прочитать. Экспортируйте исходные данные в настройках перед сохранением новых операций."
        : "";
    } catch {
      return "Не удалось прочитать хранилище браузера. Данные не перезаписаны.";
    }
  });
  const [data, setData] = useState<Data>(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      const d = raw ? JSON.parse(raw) : null;
      return restoreData(d) ?? emptyData();
    } catch {
      return emptyData();
    }
  });
  const [storageError, setStorageError] = useState("");
  const [allowSave, setAllowSave] = useState(!loadError);
  useEffect(() => {
    if (!allowSave) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(data));
      setStorageError("");
    } catch {
      setStorageError(
        "Не удалось сохранить изменения в браузере. Экспортируйте данные, прежде чем закрыть вкладку.",
      );
    }
  }, [data, allowSave]);
  const [page, setPage] = useState<Page>("overview");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editor, setEditor] = useState<{ kind: Kind; full: boolean } | null>(
    null,
  );
  const [menu, setMenu] = useState(false);
  const [hoverKind, setHoverKind] = useState<Kind | null>(null);
  const [accountForm, setAccountForm] = useState(false);
  const [confirmAccountDelete, setConfirmAccountDelete] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const editingAccount = data.accounts.find((a) => a.id === editingAccountId);
  function closeAccountForm() {
    setConfirmAccountDelete(false);
    setAccountForm(false);
    setEditingAccountId(null);
  }
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(t);
  }, [notice]);
  const totals = balances(data);
  const balance = Object.values(totals).reduce((a, b) => a + b, 0);
  const monthly = data.operations.filter((o) => o.date.startsWith(month));
  const income = monthly
    .filter((o) => o.kind === "income")
    .reduce((s, o) => s + o.amount, 0);
  const expenses = monthly
    .filter((o) => o.kind === "expense")
    .reduce((s, o) => s + o.amount, 0);
  const credit = monthly
    .filter((o) => o.kind === "credit")
    .reduce((s, o) => s + o.amount, 0);
  const sorted = [...monthly].sort((a, b) => b.date.localeCompare(a.date));
  const visible = sorted.filter(
    (o) =>
      (filter === "all" || o.kind === filter) &&
      `${o.title} ${o.category} ${o.note}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const grouped = Object.entries(
    visible.reduce<Record<string, Operation[]>>((groups, o) => {
      (groups[o.date] ??= []).push(o);
      return groups;
    }, {}),
  );
  const spending = Object.entries(
    monthly
      .filter((o) => o.kind === "expense")
      .reduce<Record<string, number>>((s, o) => {
        s[o.category] = (s[o.category] || 0) + o.amount;
        return s;
      }, {}),
  ).sort((a, b) => b[1] - a[1]);
  function open(kind: Kind = "expense", full = false) {
    setMenu(false);
    setHoverKind(null);
    setEditor({ kind, full });
  }
  function exportData(raw = false) {
    const blob = new Blob(
      [
        raw
          ? localStorage.getItem(STORAGE) || "null"
          : JSON.stringify(data, null, 2),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kopilka-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reset() {
    if (
      confirm(
        "Удалить все операции и обнулить счета в этом браузере? Сначала можно экспортировать данные.",
      )
    ) {
      setData(emptyData());
      setAllowSave(true);
      setNotice("Данные очищены");
    }
  }
  function addDemo() {
    if (
      data.operations.length &&
      !confirm(
        "Заменить текущие данные демонстрационными? Сначала можно сделать экспорт в настройках.",
      )
    )
      return;
    setData(demoData());
    setMonth(today().slice(0, 7));
    setAllowSave(true);
    setNotice("Добавлены демоданные");
  }
  const operationRows = (limit?: number) =>
    grouped.slice(0, limit).map(([date, ops]) => (
      <div className="day" key={date}>
        <div className="day-label">
          {date === today()
            ? "Сегодня"
            : new Date(date + "T12:00:00").toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
              })}
          <span>
            {money(
              ops
                .filter((o) => o.kind === "expense")
                .reduce((s, o) => s + o.amount, 0),
            )}
          </span>
        </div>
        {ops.map((o) => {
          const Icon = categoryIcons[o.category] || icons[o.kind];
          return (
            <div className="operation" key={o.id}>
              <div className={"op-icon " + o.kind}>
                <Icon size={20} />
              </div>
              <div className="op-description">
                <strong>{o.title}</strong>
                <small>
                  {o.kind === "transfer"
                    ? `${data.accounts.find((a) => a.id === o.accountId)?.name} → ${data.accounts.find((a) => a.id === o.toAccountId)?.name}`
                    : [
                        o.category || kinds[o.kind],
                        o.subcategory,
                        data.accounts.find((a) => a.id === o.accountId)?.name,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </small>
              </div>
              <b className={o.kind === "income" ? "positive" : ""}>
                {o.kind === "expense" ? "−" : o.kind === "transfer" ? "" : "+"}
                {money(o.amount)}
              </b>
              <button
                className="icon-button delete"
                aria-label={"Удалить " + o.title}
                onClick={() => {
                  if (
                    confirm(`Удалить «${o.title}»? Балансы будут пересчитаны.`)
                  )
                    setData({
                      ...data,
                      operations: data.operations.filter((x) => x.id !== o.id),
                    });
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>
    ));
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setPage("overview");
          }}
        >
          <span>
            <PiggyBank size={24} />
          </span>
          копилка<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">ЛИЧНОЕ ПРОСТРАНСТВО</div>
        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              <Icon size={19} />
              {label}
              {page === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span /> Всё на вашем устройстве
          </div>
          <p>
            Маленькие шаги.
            <br />
            Большие возможности.
          </p>
          <div className="profile">
            <div>Я</div>
            <span>
              Мои финансы<small>Личное пространство</small>
            </span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span className="breadcrumb">
            Мои финансы <ChevronRight size={14} />{" "}
            {navigation.find((n) => n.id === page)?.label}
          </span>
          <div className="topbar-right">
            <span className="local-badge">
              <span /> Локально
            </span>
            <div className="avatar">Я</div>
          </div>
        </header>
        <div className="content">
          {((loadError && !allowSave) || storageError) && (
            <div role="alert" className="warning">
              {storageError || loadError}
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">ВАШИ ДЕНЬГИ ПОД КОНТРОЛЕМ</div>
              <h1>
                {page === "overview"
                  ? "Всё по полочкам"
                  : navigation.find((n) => n.id === page)?.label}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {page === "overview"
                  ? "Больше ясности. Меньше лишних движений."
                  : page === "operations"
                    ? "Каждая мелочь складывается в большую картину."
                    : page === "accounts"
                      ? "Все ваши деньги в одном месте."
                      : "Ваше пространство — ваши правила."}
              </p>
            </div>
            {(page === "overview" || page === "operations") && (
              <label className="month-picker">
                <input
                  aria-label="Месяц операций"
                  type="month"
                  value={month}
                  onChange={(e) => e.target.value && setMonth(e.target.value)}
                />
              </label>
            )}
          </div>
          {page === "overview" && (
            <>
              <section className="summary-grid">
                <article className="balance-card">
                  <div className="balance-label">
                    <Wallet size={17} /> Общий баланс <span>₽</span>
                  </div>
                  <h2>{money(balance)}</h2>
                  <div className="balance-footer">
                    <span>На {data.accounts.length} счетах</span>
                    <button onClick={() => setPage("accounts")}>
                      Мои счета <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="balance-orbit" />
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span className="stat-icon income">
                      <ArrowDownLeft size={20} />
                    </span>
                    <span>Доходы за месяц</span>
                  </div>
                  <h2>{money(income)}</h2>
                  <p>Всё, что пришло</p>
                </article>
                <article className="stat-card">
                  <div className="stat-top">
                    <span className="stat-icon expense">
                      <ArrowUpRight size={20} />
                    </span>
                    <span>Расходы за месяц</span>
                  </div>
                  <h2>{money(expenses)}</h2>
                  <p>Всё, что потрачено</p>
                </article>
              </section>
              <div className="section-heading">
                <h3>
                  Мои счета <span>{data.accounts.length}</span>
                </h3>
                <button onClick={() => setPage("accounts")}>
                  Все счета <ChevronRight size={16} />
                </button>
              </div>
              <div className="accounts-strip">
                {data.accounts.map((a) => (
                  <button
                    className="account-chip"
                    key={a.id}
                    onClick={() => setPage("accounts")}
                  >
                    <span
                      className="account-symbol"
                      style={{ background: a.color + "18", color: a.color }}
                    >
                      <Wallet size={20} />
                    </span>
                    <span>
                      <small>{a.name}</small>
                      <strong>{money(totals[a.id])}</strong>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
                <button
                  className="add-account"
                  onClick={() => setAccountForm(true)}
                >
                  <Plus size={19} /> Добавить счёт
                </button>
              </div>
              <div className="dashboard-columns">
                <section className="panel">
                  <div className="section-heading">
                    <h3>Последние операции</h3>
                    <button onClick={() => setPage("operations")}>
                      Все <ChevronRight size={15} />
                    </button>
                  </div>
                  {monthly.length ? (
                    operationRows(3)
                  ) : (
                    <Empty
                      onAdd={() => open()}
                      title="Здесь начинается порядок"
                      text="Добавьте первую операцию — и картина ваших финансов начнёт складываться."
                    />
                  )}
                </section>
                <section className="panel breakdown">
                  <div className="section-heading">
                    <h3>Куда уходят деньги</h3>
                    <span className="muted">За месяц</span>
                  </div>
                  {expenses > 0 ? (
                    <>
                      <div
                        className="donut"
                        style={{
                          background: `conic-gradient(${spending
                            .map(([, v], i) => {
                              const before =
                                (spending
                                  .slice(0, i)
                                  .reduce((s, x) => s + x[1], 0) /
                                  expenses) *
                                100;
                              return `${["#7966dd", "#b0a4ee", "#edba7b", "#9dcbbc", "#b9cbe1", "#dba4b8"][i % 6]} ${before}% ${before + (v / expenses) * 100}%`;
                            })
                            .join(",")})`,
                        }}
                      >
                        <div>
                          <small>Всего расходов</small>
                          <strong>{money(expenses)}</strong>
                        </div>
                      </div>
                      <div className="legend">
                        {spending.map(([cat, value], i) => (
                          <div key={cat}>
                            <i
                              style={{
                                background: [
                                  "#7966dd",
                                  "#b0a4ee",
                                  "#edba7b",
                                  "#9dcbbc",
                                  "#b9cbe1",
                                  "#dba4b8",
                                ][i % 6],
                              }}
                            />
                            <span>{cat}</span>
                            <b>{Math.round((value / expenses) * 100)}%</b>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="empty-chart">
                      <div className="donut">
                        <div>
                          <small>Всего расходов</small>
                          <strong>0 ₽</strong>
                        </div>
                      </div>
                      <p>У каждого рубля будет своя история</p>
                    </div>
                  )}
                  {credit > 0 && (
                    <p className="credit-note">
                      Получено кредитов: {money(credit)}
                      <br />
                      <small>Не включены в доходы</small>
                    </p>
                  )}
                </section>
              </div>
              {!data.operations.length && (
                <div className="demo-banner">
                  <span>
                    <Sparkles size={18} />
                    <span>
                      Сначала осмотреться?
                      <small>
                        Попробуйте «Копилку» на демонстрационных данных.
                      </small>
                    </span>
                  </span>
                  <button onClick={addDemo}>
                    Попробовать <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
          {page === "operations" && (
            <section className="panel">
              <div className="filters">
                <label className="search">
                  <Search size={18} />
                  <input
                    placeholder="Найти операцию"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Тип операций"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Все типы</option>
                  {Object.entries(kinds).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              {visible.length ? (
                operationRows()
              ) : (
                <Empty
                  onAdd={() => open()}
                  title={
                    monthly.length
                      ? "Ничего не найдено"
                      : "Пока ни одной операции"
                  }
                  text="Добавьте операцию или выберите другой месяц и фильтр."
                />
              )}
            </section>
          )}
          {page === "accounts" && (
            <>
              <div className="account-grid">
                {data.accounts.map((a) => (
                  <article className="panel account-detail" key={a.id}>
                    <span
                      className="account-symbol"
                      style={{ color: a.color, background: a.color + "18" }}
                    >
                      <Wallet size={24} />
                    </span>
                    <h3>{a.name}</h3>
                    <h2>{money(totals[a.id])}</h2>
                    <p>Начальный остаток: {money(a.opening)}</p>
                    <button
                      className="secondary account-edit"
                      aria-label={`Редактировать счёт ${a.name}`}
                      onClick={() => {
                        setEditingAccountId(a.id);
                        setAccountForm(true);
                      }}
                    >
                      Редактировать
                    </button>
                  </article>
                ))}
                <button
                  className="panel new-account"
                  onClick={() => setAccountForm(true)}
                >
                  <Plus /> Добавить счёт
                </button>
              </div>
              <p className="helper">
                Баланс пересчитывается по операциям. Переводы между своими
                счетами не меняют общий баланс.
              </p>
            </>
          )}
          {page === "settings" && categoriesOpen && (
            <CategorySettings
              data={data}
              onChange={setData}
              disabled={!allowSave}
              onBack={() => setCategoriesOpen(false)}
            />
          )}
          {page === "settings" && !categoriesOpen && (
            <div className="settings-stack">
              <section className="panel settings-panel">
                <h3>Категории</h3>
                <p>Настройте категории и подкатегории для своих операций.</p>
                <button
                  className="secondary"
                  onClick={() => setCategoriesOpen(true)}
                >
                  Настроить категории <ChevronRight size={16} />
                </button>
              </section>
              <section className="panel settings-panel">
                <h3>Ваши данные</h3>
                <p>
                  Операции хранятся только в этом браузере. Экспортируйте копию,
                  чтобы сохранить её отдельно. Пока экспорт предназначен для
                  резервного копирования: импорт появится позднее.
                </p>
                <button className="secondary" onClick={() => exportData()}>
                  <Download size={18} /> Экспортировать JSON
                </button>
                {loadError && !allowSave && (
                  <button
                    className="secondary"
                    onClick={() => exportData(true)}
                  >
                    Скачать исходные данные
                  </button>
                )}
                <button className="text-danger" onClick={reset}>
                  <Trash2 size={17} /> Очистить данные
                </button>
              </section>
              <section className="panel settings-panel">
                <h3>Попробовать на примере</h3>
                <p>
                  Демоданные заменят текущие счета и операции. Перед заменой
                  сохраните экспорт.
                </p>
                <button className="secondary" onClick={addDemo}>
                  Загрузить демоданные
                </button>
              </section>
              <section className="panel settings-panel">
                <h3>
                  Google Sheets <span className="soon">Позднее</span>
                </h3>
                <p>
                  Подключение таблиц запланировано на следующий этап. Сейчас
                  можно вести учёт без авторизации.
                </p>
              </section>
              <section className="panel settings-panel">
                <h3>Быстрый ввод</h3>
                <p>
                  Нажмите «+», чтобы открыть мастер. Удерживайте кнопку и
                  переведите палец на тип операции — откроется полная форма. С
                  клавиатуры меню открывается через Shift + Enter, затем
                  выберите тип.
                </p>
                <button className="secondary" onClick={() => setMenu(true)}>
                  Открыть меню типов
                </button>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <PiggyBank size={15} /> Копилка{" "}
            <span>Для спокойствия, а не для сложностей.</span>
          </footer>
        </div>
      </main>
      <nav className="mobile-nav">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => setPage(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {menu && (
        <div className="quick-menu-scrim" onClick={() => setMenu(false)}>
          <div className="quick-menu" onClick={(e) => e.stopPropagation()}>
            <small>ПОЛНАЯ ФОРМА</small>
            {(Object.keys(kinds) as Kind[]).map((kind) => {
              const Icon = icons[kind];
              return (
                <button
                  data-kind={kind}
                  key={kind}
                  className={hoverKind === kind ? "highlight" : ""}
                  onClick={() => open(kind, true)}
                >
                  <span className={"stat-icon " + kind}>
                    <Icon size={19} />
                  </span>
                  {kinds[kind]}
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="fab-container">
        <span className="fab-hint">Записать операцию</span>
        <button
          ref={launcher}
          aria-label="Добавить операцию"
          aria-haspopup="menu"
          aria-expanded={menu}
          className="fab"
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.shiftKey && e.key === "Enter") {
              e.preventDefault();
              held.current = true;
              setMenu(true);
            }
          }}
          onClick={(e) => {
            if (e.detail === 0) {
              if (!held.current) open();
              held.current = false;
            }
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            held.current = false;
            start.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
            timer.current = setTimeout(() => {
              held.current = true;
              setMenu(true);
            }, 420);
          }}
          onPointerMove={(e) => {
            if (!held.current) {
              if (
                Math.hypot(
                  e.clientX - start.current.x,
                  e.clientY - start.current.y,
                ) > 14 &&
                timer.current
              )
                clearTimeout(timer.current);
              return;
            }
            const el = document
              .elementFromPoint(e.clientX, e.clientY)
              ?.closest<HTMLElement>("[data-kind]");
            setHoverKind((el?.dataset.kind as Kind) || null);
          }}
          onPointerUp={(e) => {
            if (timer.current) clearTimeout(timer.current);
            if (held.current) {
              const el = document
                .elementFromPoint(e.clientX, e.clientY)
                ?.closest<HTMLElement>("[data-kind]");
              if (el) open(el.dataset.kind as Kind, true);
            } else if (
              Math.hypot(
                e.clientX - start.current.x,
                e.clientY - start.current.y,
              ) < 14
            )
              open();
          }}
          onPointerCancel={() => {
            if (timer.current) clearTimeout(timer.current);
            setHoverKind(null);
            setMenu(false);
          }}
        >
          <Plus size={28} />
        </button>
      </div>
      {editor && (
        <OperationEditor
          initial={editor.kind}
          full={editor.full}
          data={data}
          onClose={() => {
            setEditor(null);
            launcher.current?.focus();
          }}
          onSave={(op) => {
            if (!allowSave) {
              setNotice(
                "Сначала экспортируйте исходные данные и очистите хранилище в настройках",
              );
              return;
            }
            setData({ ...data, operations: [op, ...data.operations] });
            setMonth(op.date.slice(0, 7));
            setEditor(null);
            setNotice("Операция добавлена");
            launcher.current?.focus();
          }}
        />
      )}
      {accountForm && (
        <Modal
          title={editingAccount ? "Редактировать счёт" : "Новый счёт"}
          onClose={closeAccountForm}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              const accountName = String(fields.get("name")).trim();
              if (!accountName) {
                setNotice("Добавьте название счёта");
                return;
              }
              const opening = parseMoney(String(fields.get("opening")));
              if (!Number.isSafeInteger(opening) || opening < 0) {
                setNotice("Укажите корректный начальный остаток");
                return;
              }
              if (!allowSave) {
                setNotice(
                  "Сначала экспортируйте исходные данные и очистите хранилище в настройках",
                );
                return;
              }
              setData((current) => ({
                ...current,
                accounts: editingAccount
                  ? current.accounts.map((account) =>
                      account.id === editingAccount.id
                        ? { ...account, name: accountName, opening }
                        : account,
                    )
                  : [
                      ...current.accounts,
                      {
                        id: crypto.randomUUID(),
                        name: accountName,
                        opening,
                        color: "#70998a",
                      },
                    ],
              }));
              setNotice(editingAccount ? "Счёт обновлён" : "Счёт добавлен");
              closeAccountForm();
            }}
          >
            <label>
              Название
              <input
                name="name"
                required
                maxLength={60}
                placeholder="Например, накопительный"
                defaultValue={editingAccount?.name ?? ""}
              />
            </label>
            <label>
              Начальный остаток, ₽
              <input
                name="opening"
                inputMode="decimal"
                defaultValue={
                  editingAccount
                    ? (editingAccount.opening / 100).toFixed(2)
                    : "0"
                }
                required
              />
            </label>
            <button className="primary" type="submit">
              {editingAccount ? "Сохранить изменения" : "Добавить счёт"}
            </button>
            {editingAccount && (
              <div className="account-delete-section">
                {confirmAccountDelete ? (
                  <div role="alert">
                    <p className="helper">
                      Удалить счёт «{editingAccount.name}»? Его остаток{" "}
                      {money(editingAccount.opening)} будет исключён из общего
                      баланса. Это действие нельзя отменить.
                    </p>
                    <div className="form-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setConfirmAccountDelete(false)}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => {
                          if (!allowSave) {
                            setNotice(
                              "Сначала сохраните исходные данные и очистите хранилище в настройках",
                            );
                            return;
                          }
                          const error = accountDeletionError(
                            data,
                            editingAccount.id,
                          );
                          if (error) {
                            setNotice(error);
                            setConfirmAccountDelete(false);
                            return;
                          }
                          setData((current) => ({
                            ...current,
                            accounts: current.accounts.filter(
                              (a) => a.id !== editingAccount.id,
                            ),
                          }));
                          closeAccountForm();
                          setNotice("Счёт удалён");
                        }}
                      >
                        Да, удалить счёт
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="text-danger"
                      disabled={
                        !allowSave ||
                        !!accountDeletionError(data, editingAccount.id)
                      }
                      onClick={() => setConfirmAccountDelete(true)}
                    >
                      <Trash2 size={17} /> Удалить счёт
                    </button>
                    {!!accountDeletionError(data, editingAccount.id) && (
                      <p className="helper">
                        {accountDeletionError(data, editingAccount.id)}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </form>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
    </div>
  );
}
function Empty({
  onAdd,
  title,
  text,
}: {
  onAdd: () => void;
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <List size={26} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="secondary" onClick={onAdd}>
        <Plus size={17} /> Первая операция
      </button>
    </div>
  );
}
function OperationEditor({
  initial,
  full,
  data,
  onClose,
  onSave,
}: {
  initial: Kind;
  full: boolean;
  data: Data;
  onClose: () => void;
  onSave: (o: Operation) => void;
}) {
  const categories = data.categories;
  const [op, setOp] = useState<Operation>({
    id: crypto.randomUUID(),
    kind: initial,
    title: "",
    amount: 0,
    accountId: data.accounts[0].id,
    toAccountId: data.accounts[1]?.id || "",
    category: "",
    subcategory: "",
    date: today(),
    note: "",
  });
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const candidate = suggest(op.title, op.kind, data.operations);
  const categorical = op.kind === "expense" || op.kind === "income";
  function patch(p: Partial<Operation>) {
    setOp((o) => ({ ...o, ...p }));
    setError("");
  }
  function save() {
    const next = { ...op, title: op.title.trim(), amount: parseMoney(amount) };
    const message = validate(next, data.accounts, data.categories);
    if (message) {
      setError(message);
      return;
    }
    onSave(next);
  }
  const types = (
    <div className="type-selector">
      {(Object.keys(kinds) as Kind[]).map((kind) => (
        <button
          key={kind}
          type="button"
          className={op.kind === kind ? "selected" : ""}
          onClick={() => patch({ kind, category: "", subcategory: "" })}
        >
          {kinds[kind]}
        </button>
      ))}
    </div>
  );
  const accountSelect = (
    <>
      <label>
        {op.kind === "transfer"
          ? "Со счёта"
          : op.kind === "income" || op.kind === "credit"
            ? "На счёт"
            : "Списать со счёта"}
        <select
          value={op.accountId}
          onChange={(e) => patch({ accountId: e.target.value })}
        >
          {data.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {money(balances(data)[a.id])}
            </option>
          ))}
        </select>
      </label>
      {op.kind === "transfer" && (
        <label>
          На счёт
          <select
            value={op.toAccountId}
            onChange={(e) => patch({ toAccountId: e.target.value })}
          >
            <option value="">Выберите счёт</option>
            {data.accounts
              .filter((a) => a.id !== op.accountId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
      )}
    </>
  );
  const categorySelect = (
    <>
      <label>
        Категория
        <select
          value={op.category}
          onChange={(e) => patch({ category: e.target.value, subcategory: "" })}
        >
          <option value="">Выберите категорию</option>
          {Object.keys(categories).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      {!!categories[op.category]?.length && (
        <label>
          Подкатегория
          <select
            value={op.subcategory}
            onChange={(e) => patch({ subcategory: e.target.value })}
          >
            <option value="">Без подкатегории</option>
            {categories[op.category].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
    </>
  );
  return (
    <Modal
      title={
        full
          ? "Новая операция"
          : step === 0
            ? "Что запишем?"
            : step === 1
              ? "Выберите категорию"
              : step === 2
                ? "Уточним подкатегорию"
                : "Введите сумму"
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (full || step === 3) save();
          else if (step === 0) {
            if (!op.title.trim()) {
              setError("Как назовём операцию?");
              return;
            }
            setStep(categorical ? 1 : 3);
          }
        }}
      >
        {!full && (
          <div className="wizard-progress">
            <span style={{ width: `${(step + 1) * 25}%` }} />
          </div>
        )}
        {(full || step === 0) && (
          <>
            {types}
            <label>
              Название
              <input
                autoComplete="off"
                maxLength={100}
                placeholder="Например, кофе по пути"
                value={op.title}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </label>
            {!full && candidate && (
              <button
                className="suggestion"
                type="button"
                onClick={() => {
                  patch({
                    category: candidate.category,
                    subcategory: candidate.subcategory,
                  });
                  setStep(
                    categories[candidate.category]?.length &&
                      !candidate.subcategory
                      ? 2
                      : 3,
                  );
                }}
              >
                <span className="suggestion-icon">
                  <Sparkles size={19} />
                </span>
                <span>
                  <small>ПОХОЖАЯ ОПЕРАЦИЯ</small>
                  <strong>{candidate.title}</strong>
                  <small>
                    {candidate.category}
                    {candidate.subcategory ? " · " + candidate.subcategory : ""}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            )}
          </>
        )}
        {full && categorical && categorySelect}
        {!full && step === 1 && (
          <div className="category-grid">
            {Object.keys(categories).map((cat) => {
              const Icon = categoryIcons[cat] || Wallet;
              return (
                <button
                  type="button"
                  key={cat}
                  onClick={() => {
                    patch({ category: cat, subcategory: "" });
                    setStep(categories[cat].length ? 2 : 3);
                  }}
                >
                  <Icon size={21} />
                  {cat}
                </button>
              );
            })}
          </div>
        )}
        {!full && step === 2 && (
          <>
            <p className="helper">{op.category}</p>
            <div className="subcategory-list">
              {categories[op.category]?.map((sub) => (
                <button
                  type="button"
                  key={sub}
                  onClick={() => {
                    patch({ subcategory: sub });
                    setStep(3);
                  }}
                >
                  {sub}
                  <ChevronRight size={17} />
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  patch({ subcategory: "" });
                  setStep(3);
                }}
              >
                Без подкатегории
                <ChevronRight size={17} />
              </button>
            </div>
          </>
        )}
        {(full || step === 3) && (
          <>
            {!full && (
              <p className="operation-preview">
                {op.title}
                <small>
                  {[op.category, op.subcategory].filter(Boolean).join(" · ") ||
                    kinds[op.kind]}
                </small>
              </p>
            )}
            <label>
              Сумма, ₽
              <input
                className="amount-input"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError("");
                }}
              />
            </label>
            {accountSelect}
            <div className="form-row">
              <label>
                Дата
                <input
                  type="date"
                  value={op.date}
                  onChange={(e) => patch({ date: e.target.value })}
                />
              </label>
              <label>
                Комментарий
                <input
                  maxLength={250}
                  placeholder="Необязательно"
                  value={op.note}
                  onChange={(e) => patch({ note: e.target.value })}
                />
              </label>
            </div>
            {op.kind === "credit" && (
              <p className="helper">
                Получение заёмных денег на счёт. Не учитывается как доход.
                Проценты, график и погашение кредита добавим позднее.
              </p>
            )}
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {!full && step > 0 && (
            <button
              type="button"
              className="secondary back"
              onClick={() => {
                setError("");
                setStep(
                  step === 3
                    ? categorical
                      ? categories[op.category]?.length
                        ? 2
                        : 1
                      : 0
                    : step - 1,
                );
              }}
            >
              <ArrowLeft size={18} /> Назад
            </button>
          )}
          {(full || step === 0 || step === 3) && (
            <button className="primary" type="submit">
              {full || step === 3 ? "Сохранить операцию" : "Продолжить"}
              <ChevronRight size={18} />
            </button>
          )}
        </div>
        {!full && (
          <p className="wizard-note">
            {step === 0
              ? "Один шаг за другим. Остальное подскажем."
              : "Можно вернуться и изменить любой выбор."}
          </p>
        )}
      </form>
    </Modal>
  );
}
