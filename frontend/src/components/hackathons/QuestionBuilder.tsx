"use client";

import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";

/**
 * QuestionBuilder — the application-form editor used inside the create/edit
 * hackathon screens. It owns no server state: the parent holds the list and
 * persists it (as part of a draft, at publish, or via the question API on
 * edit). `questionId` is set for questions that already exist server-side so
 * the edit screen can reconcile create/update/delete.
 */

export type QuestionKind =
  | "short_text"
  | "long_text"
  | "single_choice"
  | "multi_choice";

export interface QuestionDraft {
  /** Stable local key for React lists (not sent to the server). */
  key: string;
  /** Present once the question exists server-side (edit mode). */
  questionId?: string;
  prompt: string;
  type: QuestionKind;
  options: string[];
  required: boolean;
  allowOther: boolean;
}

let seq = 0;
export function newQuestion(): QuestionDraft {
  seq += 1;
  return {
    key: `q-${Date.now().toString(36)}-${seq}`,
    prompt: "",
    type: "short_text",
    options: ["", ""],
    required: false,
    allowOther: false,
  };
}

const M = {
  title: { en: "Application form", sr: "Formular za prijavu" },
  sub: {
    en: "Questions applicants answer when they apply. Leave empty for a one-click apply.",
    sr: "Pitanja na koja se odgovara pri prijavi. Ostavi prazno za prijavu jednim klikom.",
  },
  addQuestion: { en: "Add question", sr: "Dodaj pitanje" },
  prompt: { en: "Question", sr: "Pitanje" },
  promptPh: { en: "e.g. Why do you want to join?", sr: "npr. Zašto želiš da učestvuješ?" },
  type: { en: "Type", sr: "Tip" },
  tShort: { en: "Short text", sr: "Kratak tekst" },
  tLong: { en: "Long text", sr: "Dugačak tekst" },
  tSingle: { en: "Single choice", sr: "Jedan izbor" },
  tMulti: { en: "Multiple choice", sr: "Više izbora" },
  options: { en: "Options", sr: "Opcije" },
  optionPh: { en: "Option", sr: "Opcija" },
  addOption: { en: "Add option", sr: "Dodaj opciju" },
  required: { en: "Required", sr: "Obavezno" },
  allowOther: { en: "Allow “Other” (free text)", sr: "Dozvoli „Ostalo“ (slobodan tekst)" },
  remove: { en: "Remove question", sr: "Ukloni pitanje" },
  moveUp: { en: "Move up", sr: "Pomeri gore" },
  moveDown: { en: "Move down", sr: "Pomeri dole" },
  removeOption: { en: "Remove option", sr: "Ukloni opciju" },
  empty: { en: "No questions yet.", sr: "Još nema pitanja." },
} as const;

const KIND_ORDER: QuestionKind[] = [
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
];

function isChoice(t: QuestionKind): boolean {
  return t === "single_choice" || t === "multi_choice";
}

export function QuestionBuilder({
  value,
  onChange,
}: {
  value: QuestionDraft[];
  onChange: (next: QuestionDraft[]) => void;
}) {
  const t = useT(M);

  const kindLabel = (k: QuestionKind): string =>
    k === "short_text"
      ? t("tShort")
      : k === "long_text"
        ? t("tLong")
        : k === "single_choice"
          ? t("tSingle")
          : t("tMulti");

  const patch = (i: number, next: Partial<QuestionDraft>) =>
    onChange(value.map((q, idx) => (idx === i ? { ...q, ...next } : q)));

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const setOption = (qi: number, oi: number, text: string) =>
    patch(qi, {
      options: value[qi].options.map((o, idx) => (idx === oi ? text : o)),
    });
  const addOption = (qi: number) =>
    patch(qi, { options: [...value[qi].options, ""] });
  const removeOption = (qi: number, oi: number) =>
    patch(qi, { options: value[qi].options.filter((_, idx) => idx !== oi) });

  return (
    <section className="nh-section">
      <div className="qb-head">
        <div>
          <h2 className="nh-section-title">{t("title")}</h2>
          <p className="nh-hint" style={{ marginTop: 2 }}>{t("sub")}</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost hk-btn-sm"
          onClick={() => onChange([...value, newQuestion()])}
        >
          <Icon name="plus" /> {t("addQuestion")}
        </button>
      </div>

      {value.length === 0 ? (
        <p className="qb-empty">{t("empty")}</p>
      ) : (
        <div className="qb-list">
          {value.map((q, i) => (
            <div className="qb-card" key={q.key}>
              <div className="qb-card-head">
                <span className="qb-index">{i + 1}</span>
                <div className="qb-card-actions">
                  <button
                    type="button"
                    className="qb-icon-btn"
                    aria-label={t("moveUp")}
                    title={t("moveUp")}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <Icon name="chevron-down" className="qb-flip" />
                  </button>
                  <button
                    type="button"
                    className="qb-icon-btn"
                    aria-label={t("moveDown")}
                    title={t("moveDown")}
                    disabled={i === value.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <Icon name="chevron-down" />
                  </button>
                  <button
                    type="button"
                    className="qb-icon-btn qb-icon-danger"
                    aria-label={t("remove")}
                    title={t("remove")}
                    onClick={() => remove(i)}
                  >
                    <Icon name="x" />
                  </button>
                </div>
              </div>

              <div className="nh-field">
                <label className="nh-label">{t("prompt")}</label>
                <input
                  className="nh-input"
                  value={q.prompt}
                  placeholder={t("promptPh")}
                  onChange={(e) => patch(i, { prompt: e.target.value })}
                />
              </div>

              <div className="nh-field">
                <label className="nh-label">{t("type")}</label>
                <div className="qb-type-row" role="radiogroup" aria-label={t("type")}>
                  {KIND_ORDER.map((k) => (
                    <button
                      type="button"
                      key={k}
                      className={`nh-type${q.type === k ? " nh-type-on" : ""}`}
                      role="radio"
                      aria-checked={q.type === k}
                      onClick={() => patch(i, { type: k })}
                    >
                      {kindLabel(k)}
                    </button>
                  ))}
                </div>
              </div>

              {isChoice(q.type) && (
                <div className="nh-field">
                  <label className="nh-label">{t("options")}</label>
                  <div className="qb-options">
                    {q.options.map((opt, oi) => (
                      <div className="qb-option-row" key={oi}>
                        <input
                          className="nh-input"
                          value={opt}
                          placeholder={`${t("optionPh")} ${oi + 1}`}
                          onChange={(e) => setOption(i, oi, e.target.value)}
                        />
                        <button
                          type="button"
                          className="qb-icon-btn qb-icon-danger"
                          aria-label={t("removeOption")}
                          title={t("removeOption")}
                          disabled={q.options.length <= 1}
                          onClick={() => removeOption(i, oi)}
                        >
                          <Icon name="x" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-ghost hk-btn-sm qb-add-option"
                      onClick={() => addOption(i)}
                    >
                      <Icon name="plus" /> {t("addOption")}
                    </button>
                  </div>
                </div>
              )}

              <div className="qb-toggles">
                <label className="qb-toggle">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => patch(i, { required: e.target.checked })}
                  />
                  {t("required")}
                </label>
                {isChoice(q.type) && (
                  <label className="qb-toggle">
                    <input
                      type="checkbox"
                      checked={q.allowOther}
                      onChange={(e) => patch(i, { allowOther: e.target.checked })}
                    />
                    {t("allowOther")}
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default QuestionBuilder;
