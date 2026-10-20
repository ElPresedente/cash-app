import { useState } from "react";
import { ArrowLeft, ChevronRight, Folder, Plus, Trash2 } from "lucide-react";
import Modal from "./Modal";
import {
  categoryDeletionError,
  deleteCategory,
  saveCategory,
  type Data,
  type SubcategoryDraft,
} from "./domain";

type Draft = SubcategoryDraft & { key: string };
export default function CategorySettings({
  data,
  onChange,
  disabled,
  onBack,
}: {
  data: Data;
  onChange: (data: Data) => void;
  disabled: boolean;
  onBack: () => void;
}) {
  const [editor, setEditor] = useState<{ original: string | null } | null>(
    null,
  );
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState("");
  function open(original: string | null) {
    setEditor({ original });
    setName(original ?? "");
    setRows(
      original === null
        ? []
        : data.categories[original].map((sub) => ({
            key: crypto.randomUUID(),
            original: sub,
            name: sub,
          })),
    );
    setError("");
    setConfirmDelete(false);
    setNotice("");
  }
  function close() {
    setEditor(null);
    setError("");
    setConfirmDelete(false);
  }
  const deletionError = editor?.original
    ? categoryDeletionError(data, editor.original)
    : "";
  return (
    <>
      <div className="category-toolbar">
        <button className="secondary" onClick={onBack}>
          <ArrowLeft size={17} /> Настройки
        </button>
        <button
          className="primary"
          disabled={disabled}
          onClick={() => open(null)}
        >
          <Plus size={18} /> Добавить категорию
        </button>
      </div>
      <div className="section-heading">
        <h3>
          Категории <span>{Object.keys(data.categories).length}</span>
        </h3>
      </div>
      <p className="helper category-description">
        Категории и подкатегории доступны в мастере и полной форме операций.
      </p>
      {disabled && (
        <p className="warning">
          Сначала экспортируйте исходные данные и очистите хранилище в
          настройках.
        </p>
      )}
      {notice && (
        <p className="category-notice" role="status">
          {notice}
        </p>
      )}
      <div className="account-grid category-settings-grid">
        {Object.entries(data.categories).map(([category, subs]) => (
          <article className="panel category-card" key={category}>
            <span className="account-symbol">
              <Folder size={23} />
            </span>
            <h3>{category}</h3>
            <p className="category-subs">
              {subs.length ? subs.join(" · ") : "Без подкатегорий"}
            </p>
            <small className="muted">
              Операций:{" "}
              {data.operations.filter((op) => op.category === category).length}
            </small>
            <button
              className="secondary account-edit"
              disabled={disabled}
              aria-label={`Редактировать категорию ${category}`}
              onClick={() => open(category)}
            >
              Редактировать <ChevronRight size={15} />
            </button>
          </article>
        ))}
      </div>
      {editor && (
        <Modal
          title={
            editor.original === null
              ? "Новая категория"
              : "Редактировать категорию"
          }
          onClose={close}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (disabled) return;
              try {
                onChange(saveCategory(data, editor.original, name, rows));
                setNotice(
                  editor.original === null
                    ? "Категория добавлена"
                    : "Категория обновлена",
                );
                close();
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Не удалось сохранить категорию",
                );
              }
            }}
          >
            <label>
              Название категории
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setError("");
                }}
                maxLength={60}
                required
                placeholder="Например, Путешествия"
              />
            </label>
            <div className="subcategory-editor">
              <div className="section-heading">
                <h3>
                  Подкатегории <span>{rows.length}</span>
                </h3>
              </div>
              {!rows.length && (
                <p className="helper">
                  Можно оставить категорию без подкатегорий или добавить свои.
                </p>
              )}
              {rows.map((row, index) => {
                const used =
                  row.original !== null &&
                  data.operations.some(
                    (op) =>
                      op.category === editor.original &&
                      op.subcategory === row.original,
                  );
                return (
                  <div className="subcategory-edit-item" key={row.key}>
                    <div className="subcategory-edit-row">
                      <label>
                        Подкатегория {index + 1}
                        <input
                          value={row.name}
                          maxLength={60}
                          required
                          placeholder="Название подкатегории"
                          onChange={(event) => {
                            setRows((current) =>
                              current.map((item) =>
                                item.key === row.key
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            );
                            setError("");
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={used}
                        aria-label={`Удалить подкатегорию ${(row.original ?? row.name) || String(index + 1)}`}
                        onClick={() => {
                          setRows((current) =>
                            current.filter((item) => item.key !== row.key),
                          );
                          setError("");
                        }}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                    {used && (
                      <p className="helper">
                        Есть операции: можно переименовать, удалить нельзя.
                      </p>
                    )}
                  </div>
                );
              })}
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setRows((current) => [
                    ...current,
                    { key: crypto.randomUUID(), original: null, name: "" },
                  ]);
                  setError("");
                }}
              >
                <Plus size={16} /> Добавить подкатегорию
              </button>
              <p className="helper">
                Переименования обновятся в существующих операциях. Изменения
                применяются после сохранения.
              </p>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={disabled} type="submit">
              {editor.original === null
                ? "Добавить категорию"
                : "Сохранить изменения"}
            </button>
            {editor.original !== null && (
              <div className="account-delete-section">
                {confirmDelete ? (
                  <div role="alert">
                    <p className="helper">
                      Удалить категорию «{editor.original}» и её подкатегории?
                      Это действие нельзя отменить.
                    </p>
                    <div className="form-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={disabled}
                        onClick={() => {
                          try {
                            onChange(deleteCategory(data, editor.original!));
                            setNotice("Категория удалена");
                            close();
                          } catch (caught) {
                            setError(
                              caught instanceof Error
                                ? caught.message
                                : "Не удалось удалить категорию",
                            );
                            setConfirmDelete(false);
                          }
                        }}
                      >
                        Да, удалить категорию
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="text-danger"
                      disabled={disabled || !!deletionError}
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 size={17} /> Удалить категорию
                    </button>
                    {deletionError && <p className="helper">{deletionError}</p>}
                  </>
                )}
              </div>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}
