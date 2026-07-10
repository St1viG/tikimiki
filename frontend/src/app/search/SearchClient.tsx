/**
 * SearchClient — the interactive `/search` page: a query box, skill/location/
 * type filters and three tabs (users / organizations / hackathons). The search
 * runs live (debounced) as the user types or changes a filter; stale in-flight
 * responses are discarded so the newest query always wins.
 *
 * Autor: Stevan Gnjato (2023/0141)
 */
"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { HackathonType } from "@tikimiki/types";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { useT } from "@/components/i18n/LanguageProvider";
import { searchAll, type SearchHit, type SearchResult } from "@/lib/api";
import { initials } from "@/lib/format";

const M = {
  title: { en: "Search", sr: "Pretraga" },
  placeholder: { en: "Search tikimiki…", sr: "Pretraži tikimiki…" },
  submit: { en: "Search", sr: "Traži" },
  filters: { en: "Filters", sr: "Filteri" },
  applyHint: { en: "Press Search to apply filters.", sr: "Pritisni Traži da primeniš filtere." },
  skillsLabel: { en: "Skills", sr: "Veštine" },
  skillsPlaceholder: { en: "Add a skill, press Enter", sr: "Dodaj veštinu, Enter" },
  removeSkill: { en: "Remove", sr: "Ukloni" },
  locationLabel: { en: "Location", sr: "Lokacija" },
  locationPlaceholder: { en: "e.g. Belgrade", sr: "npr. Beograd" },
  typeLabel: { en: "Type", sr: "Tip" },
  typeAll: { en: "Any type", sr: "Bilo koji tip" },
  typePhysical: { en: "Physical", sr: "Fizički" },
  typeVirtual: { en: "Virtual", sr: "Virtuelni" },
  typeHybrid: { en: "Hybrid", sr: "Hibridni" },
  orgNoFilters: {
    en: "Organizations are matched by name only — no filters apply.",
    sr: "Organizacije se pretražuju samo po imenu — filteri se ne primenjuju.",
  },
  tablist: { en: "Result categories", sr: "Kategorije rezultata" },
  tabUsers: { en: "Users", sr: "Korisnici" },
  tabOrgs: { en: "Organizations", sr: "Organizacije" },
  tabHackathons: { en: "Hackathons", sr: "Hakatoni" },
  prompt: {
    en: "Type to search, or set filters and press Search.",
    sr: "Kucaj za pretragu, ili podesi filtere i pritisni Traži.",
  },
  loading: { en: "Searching…", sr: "Pretražujem…" },
  empty: { en: "No results.", sr: "Nema rezultata." },
  error: { en: "Search failed. Try again.", sr: "Pretraga nije uspela. Pokušaj ponovo." },
} as const;

/** Which result group is currently shown. */
type Tab = "users" | "organizations" | "hackathons";
/** Selected hackathon type filter; "" means no type filter. */
type TypeFilter = "" | HackathonType;

const DEBOUNCE_MS = 300;

export function SearchClient() {
  const t = useT(M);
  // Seed (and keep synced with) the URL ?q= so a hand-off from the rail search
  // box lands here pre-filled and the live search fires immediately. Reading the
  // param the same way on server and client avoids a hydration mismatch, and the
  // effect re-syncs if the user searches again from the rail while already here.
  const searchParams = useSearchParams();
  const qParam = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(qParam);
  useEffect(() => {
    setQuery(qParam);
  }, [qParam]);
  // Draft filter inputs. Editing these does NOT search on its own — they are
  // committed to `applied` only when the user presses Search, so the button is
  // meaningful while the text query stays live.
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState<TypeFilter>("");
  // The filters actually driving the search (last committed via Search).
  const [applied, setApplied] = useState<{
    skills: string[];
    location: string;
    type: TypeFilter;
  }>({ skills: [], location: "", type: "" });

  const [result, setResult] = useState<SearchResult | null>(null);
  const [tab, setTab] = useState<Tab>("users");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Monotonic request id: only the most recently issued search may write state,
  // so a slow earlier response can never overwrite a newer one.
  const reqId = useRef(0);

  /** Searches the live query + the applied filters, ignoring stale responses. */
  const runSearch = useCallback(async () => {
    const q = query.trim();
    const loc = applied.location.trim();
    // Runs on a text query OR any applied filter, so filtering with an empty
    // query box still returns results.
    if (!q && !applied.skills.length && !loc && !applied.type) {
      setResult(null);
      setError(false);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(false);
    try {
      const res = await searchAll({
        q: q || undefined,
        skills: applied.skills.length ? applied.skills : undefined,
        location: loc || undefined,
        type: applied.type || undefined,
      });
      if (id === reqId.current) {
        setResult(res);
        setLoading(false);
      }
    } catch {
      if (id === reqId.current) {
        setError(true);
        setResult(null);
        setLoading(false);
      }
    }
  }, [query, applied]);

  // Debounce: the text query searches live as you type; applied filters search
  // once committed via Search. Draft filter edits do nothing until then.
  useEffect(() => {
    const hasCriteria =
      Boolean(query.trim()) ||
      applied.skills.length > 0 ||
      Boolean(applied.location.trim()) ||
      Boolean(applied.type);
    if (!hasCriteria) {
      setResult(null);
      setError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => void runSearch(), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [runSearch, query, applied]);

  // Draft filters differ from what's applied → a Search press is needed.
  const filtersDirty =
    location !== applied.location ||
    type !== applied.type ||
    skills.length !== applied.skills.length ||
    skills.some((s, i) => s !== applied.skills[i]);

  /** Commits the draft filters; the effect above then runs the search. */
  const applyFilters = useCallback(() => {
    setApplied({ skills, location, type });
  }, [skills, location, type]);

  /** Adds a trimmed, de-duplicated skill chip. */
  function addSkill(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setSkills((prev) =>
      prev.some((s) => s.toLowerCase() === value.toLowerCase()) ? prev : [...prev, value],
    );
    setSkillInput("");
  }

  function onSkillKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSkill(skillInput);
    } else if (e.key === "Backspace" && !skillInput && skills.length) {
      setSkills((prev) => prev.slice(0, -1));
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "users", label: t("tabUsers") },
    { key: "organizations", label: t("tabOrgs") },
    { key: "hackathons", label: t("tabHackathons") },
  ];
  const hits: SearchHit[] = result ? result[tab] : [];

  return (
    <AppShell variant="no-right">
      <main className="search-page" id="search-main">
        <header className="search-head">
          <h1 className="search-title">{t("title")}</h1>
          <form
            className="search-form"
            role="search"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              applyFilters();
            }}
          >
            <span className="search-box">
              <Icon name="search" />
              <input
                className="search-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("placeholder")}
                aria-label={t("title")}
              />
              {loading ? <span className="search-spinner" aria-hidden="true" /> : null}
            </span>
            <button
              className={`search-submit${filtersDirty ? " search-submit-dirty" : ""}`}
              type="submit"
            >
              {t("submit")}
            </button>
          </form>

          {/* Only the filters that narrow the active tab are shown, so any
              visible filter always changes the results on screen — no silent
              "nothing happened". Skills → users + hackathons; location/type →
              hackathons only; organizations match by name alone. */}
          <div className="search-filters">
            {tab !== "organizations" && (
              <div className="search-field search-field-skills">
                <span className="search-field-label">{t("skillsLabel")}</span>
                <div className="search-skillbox">
                  {skills.map((skill) => (
                    <span className="search-chip" key={skill}>
                      {skill}
                      <button
                        type="button"
                        className="search-chip-x"
                        aria-label={`${t("removeSkill")} ${skill}`}
                        onClick={() => setSkills((prev) => prev.filter((s) => s !== skill))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    className="search-skill-input"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={onSkillKeyDown}
                    onBlur={() => addSkill(skillInput)}
                    placeholder={t("skillsPlaceholder")}
                    aria-label={t("skillsLabel")}
                  />
                </div>
              </div>
            )}

            {tab === "hackathons" && (
              <>
                <label className="search-field">
                  <span className="search-field-label">{t("locationLabel")}</span>
                  <input
                    className="search-text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t("locationPlaceholder")}
                  />
                </label>

                <label className="search-field">
                  <span className="search-field-label">{t("typeLabel")}</span>
                  <select
                    className="search-select"
                    value={type}
                    onChange={(e) => setType(e.target.value as TypeFilter)}
                  >
                    <option value="">{t("typeAll")}</option>
                    <option value="physical">{t("typePhysical")}</option>
                    <option value="virtual">{t("typeVirtual")}</option>
                    <option value="hybrid">{t("typeHybrid")}</option>
                  </select>
                </label>
              </>
            )}

            {tab === "organizations" && <p className="search-filter-note">{t("orgNoFilters")}</p>}
          </div>
          {filtersDirty && <p className="search-apply-hint">{t("applyHint")}</p>}
        </header>

        <nav className="search-tabs" role="tablist" aria-label={t("tablist")}>
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`search-tab${tab === key ? " search-tab-active" : ""}`}
              onClick={() => setTab(key)}
            >
              {label}
              {result ? <span className="search-tab-count">{result[key].length}</span> : null}
            </button>
          ))}
        </nav>

        <section className="search-results" role="tabpanel" aria-live="polite">
          {error ? (
            <p className="search-status">{t("error")}</p>
          ) : !result && loading ? (
            <p className="search-status">{t("loading")}</p>
          ) : !result ? (
            <p className="search-status">{t("prompt")}</p>
          ) : hits.length === 0 ? (
            <p className="search-status">{loading ? t("loading") : t("empty")}</p>
          ) : (
            <ul className="search-list">
              {hits.map((hit) => (
                <SearchRow key={hit.id} hit={hit} tab={tab} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}

/** One result row; users and hackathons link to their pages, orgs are static. */
function SearchRow({ hit, tab }: { hit: SearchHit; tab: Tab }) {
  const href =
    tab === "hackathons"
      ? `/hackathons/${hit.id}`
      : tab === "users"
        ? `/u/${encodeURIComponent(hit.label)}`
        : null;

  const body = (
    <>
      <span className="search-avatar" aria-hidden="true">
        {hit.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hit.imageUrl} alt="" loading="lazy" />
        ) : (
          initials(hit.label)
        )}
      </span>
      <span className="search-meta">
        <span className="search-label">{hit.label}</span>
        {hit.subtitle ? <span className="search-subtitle">{hit.subtitle}</span> : null}
      </span>
    </>
  );

  return (
    <li className="search-item">
      {href ? (
        <Link className="search-card" href={href}>
          {body}
        </Link>
      ) : (
        <div className="search-card">{body}</div>
      )}
    </li>
  );
}
