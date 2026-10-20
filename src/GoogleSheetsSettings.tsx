import { useEffect, useState } from "react";
import {
  Download,
  ExternalLink,
  LogIn,
  LogOut,
  RefreshCw,
  Upload,
} from "lucide-react";
import {
  authorizeGoogle,
  fetchTemplate,
  loadGoogleIdentity,
  revokeGoogle,
  sendNewOperations,
  spreadsheetId,
  type GoogleSession,
} from "./google-sheets";
import { readTemplate, TEMPLATE_ID, TEMPLATE_URL } from "./sheets-template";
import type { Data } from "./domain";
const CONFIG_KEY = "kopilka.google-settings.v1";
function savedConfig() {
  try {
    const value = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
    return {
      clientId: typeof value.clientId === "string" ? value.clientId : "",
      spreadsheet:
        typeof value.spreadsheet === "string" ? value.spreadsheet : "",
    };
  } catch {
    return { clientId: "", spreadsheet: "" };
  }
}
export default function GoogleSheetsSettings({
  data,
  onImport,
  disabled,
}: {
  data: Data;
  onImport: (data: Data) => void;
  disabled: boolean;
}) {
  const [config, setConfig] = useState(savedConfig);
  const [session, setSession] = useState<GoogleSession | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Data | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  useEffect(() => {
    let active = true;
    loadGoogleIdentity()
      .then(() => {
        if (active) setSdkReady(true);
      })
      .catch((caught) => {
        if (active) setError(String(caught.message));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => {
        setSession(null);
        setMessage("Вход Google истёк. Войдите снова, чтобы продолжить обмен.");
      },
      Math.max(0, session.expiresAt - Date.now() - 30000),
    );
    return () => clearTimeout(timer);
  }, [session]);
  function update(fields: Partial<typeof config>) {
    setConfig((current) => ({ ...current, ...fields }));
    setSession(null);
    setPending(null);
    setConfirmSend(false);
    setError("");
    setMessage("");
  }
  function remember() {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      throw new Error("Не удалось сохранить настройки подключения");
    }
  }
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось выполнить запрос",
      );
    } finally {
      setBusy(false);
    }
  }
  function target() {
    const id = spreadsheetId(config.spreadsheet);
    if (id === TEMPLATE_ID)
      throw new Error(
        "Это общий пустой шаблон. Сначала создайте его рабочую копию через «Файл → Создать копию» и вставьте ссылку на неё.",
      );
    return id;
  }
  return (
    <section className="panel settings-panel google-settings">
      <h3>Google Таблицы</h3>
      <p>
        Подключите рабочую копию шаблона «Копилка». Обмен запускается вручную:
        локальные изменения сохраняются в браузере, а в таблицу отправляются по
        кнопке.
      </p>
      <a
        className="secondary"
        href={TEMPLATE_URL}
        target="_blank"
        rel="noreferrer"
      >
        <ExternalLink size={16} /> Открыть пустой шаблон
      </a>
      <details className="google-help">
        <summary>Как настроить подключение</summary>
        <ol>
          <li>
            Откройте шаблон и выберите «Файл → Создать копию». Вставьте ссылку
            на свою копию ниже.
          </li>
          <li>В Google Cloud создайте проект, включите Google Sheets API.</li>
          <li>
            Настройте Google Auth Platform: аудитория External, режим Testing.
            Добавьте свой Google-аккаунт в Test users.
          </li>
          <li>
            Создайте OAuth Client типа «Веб-приложение». В разрешённые
            JavaScript origins добавьте <code>{window.location.origin}</code>.
          </li>
          <li>
            Скопируйте Client ID в поле ниже. Client Secret не нужен. Нажмите
            «Войти в Google» и разрешите доступ.
          </li>
        </ol>
        <a
          href="https://console.cloud.google.com/apis/library/sheets.googleapis.com"
          target="_blank"
          rel="noreferrer"
        >
          Открыть Google Cloud <ExternalLink size={13} />
        </a>
      </details>
      <label>
        OAuth Client ID
        <input
          value={config.clientId}
          onChange={(e) => update({ clientId: e.target.value.trim() })}
          placeholder="…apps.googleusercontent.com"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        Ссылка на рабочую Google Таблицу
        <input
          value={config.spreadsheet}
          onChange={(e) => update({ spreadsheet: e.target.value })}
          placeholder="https://docs.google.com/spreadsheets/d/…/edit"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <p className="helper">
        Google запросит разрешение на чтение и изменение таблиц. Приложение
        обращается только к указанной таблице. Вход действует до часа; ключ
        доступа хранится только в памяти этой вкладки.
      </p>
      <div className="google-actions">
        {!session ? (
          <button
            className="primary"
            disabled={
              busy || !sdkReady || !config.clientId || !config.spreadsheet
            }
            onClick={() => {
              void run(async () => {
                target();
                remember();
                setSession(await authorizeGoogle(config.clientId));
                setMessage("Вход выполнен. Можно проверить таблицу.");
              });
            }}
          >
            <LogIn size={17} />{" "}
            {sdkReady ? "Войти в Google" : "Загрузка входа Google…"}
          </button>
        ) : (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              revokeGoogle(session);
              setSession(null);
              setPending(null);
              setConfirmSend(false);
              setMessage("Google отключён. Локальные данные сохранены.");
            }}
          >
            <LogOut size={16} /> Отключить Google
          </button>
        )}
      </div>
      {session && (
        <>
          <div className="google-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const snapshot = await fetchTemplate(session, target());
                  const remote = readTemplate(snapshot);
                  setMessage(
                    `Шаблон ${snapshot.year} года распознан. Операций: ${remote.operations.length}.`,
                  );
                })
              }
            >
              <RefreshCw size={16} /> Проверить таблицу
            </button>
            <button
              className="secondary"
              disabled={busy || disabled}
              onClick={() =>
                void run(async () => {
                  const remote = readTemplate(
                    await fetchTemplate(session, target()),
                  );
                  setPending(remote);
                  setConfirmSend(false);
                })
              }
            >
              <Download size={16} /> Загрузить из таблицы
            </button>
            <button
              className="secondary"
              disabled={busy || disabled}
              onClick={() => {
                setConfirmSend(true);
                setPending(null);
                setError("");
                setMessage("");
              }}
            >
              <Upload size={16} /> Отправить новые операции
            </button>
          </div>
          <p className="helper">
            Отправка добавляет новые счета, категории и операции. Уже
            существующие строки, изменения и удаления не перезаписываются. Для
            актуализации приложения загрузите таблицу заново.
          </p>
        </>
      )}
      {pending && (
        <div className="google-confirm">
          <h4>Загрузить данные из таблицы?</h4>
          <p>
            В таблице: {pending.accounts.length} счетов,{" "}
            {Object.keys(pending.categories).length} категорий,{" "}
            {pending.operations.length} операций. Локальный учёт будет заменён.
            Перед заменой его копия сохранится в браузере.
          </p>
          <div className="google-actions">
            <button className="secondary" onClick={() => setPending(null)}>
              Отмена
            </button>
            <button
              className="primary"
              disabled={busy || disabled}
              onClick={() => {
                try {
                  localStorage.setItem(
                    "kopilka.before-google-import",
                    JSON.stringify(data),
                  );
                  onImport(pending);
                  setPending(null);
                  setMessage("Данные загружены из таблицы");
                } catch {
                  setError(
                    "Не удалось сохранить резервную копию. Загрузка отменена.",
                  );
                }
              }}
            >
              Загрузить и заменить
            </button>
          </div>
        </div>
      )}
      {confirmSend && session && (
        <div className="google-confirm">
          <h4>Отправить новые данные в рабочую таблицу?</h4>
          <p>
            Будут добавлены отсутствующие счета, категории и новые операции.
            Существующие данные и формулы сохранятся. После отправки приложение
            проверит ID операций.
          </p>
          <div className="google-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirmSend(false)}
            >
              Отмена
            </button>
            <button
              className="primary"
              disabled={busy || disabled}
              onClick={() =>
                void run(async () => {
                  const result = await sendNewOperations(
                    session,
                    target(),
                    data,
                  );
                  setConfirmSend(false);
                  setMessage(
                    result.changes
                      ? `Добавлено новых операций: ${result.operations}. Всего новых строк: ${result.changes}.`
                      : "Новых данных для отправки нет.",
                  );
                })
              }
            >
              Отправить
            </button>
          </div>
        </div>
      )}
      {busy && (
        <p className="helper" role="status">
          Обмениваемся данными с Google…
        </p>
      )}
      {message && (
        <p className="category-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
