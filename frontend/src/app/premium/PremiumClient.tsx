"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { useT } from "@/components/i18n/LanguageProvider";
import { useRequireAuth } from "@/components/auth/AuthProvider";
import * as api from "@/lib/api";
import { PRICING, priceAmount, priceLabel } from "@/lib/pricing";

/* PremiumClient — interactive premium page.
 *
 * Behaviour:
 *  - Billing toggle: monthly ↔ annual. Flips toggle-switch classes, swaps
 *    premium price between "4.99" (monthly) and "4.16" (annual), shows/hides
 *    the annual savings note, and re-triggers the lemon price-flash animation
 *    on each toggle.
 *  - FAQ accordion: each item tracks open/closed; aria-expanded on the button.
 *  - Activate Premium: one-shot; the button becomes "Activated!" and is
 *    rendered disabled/inert afterward.
 *
 * Supplies its own `<main className="premium-page" id="main">`.
 */

const M = {
  backLabel: { en: "Back", sr: "Nazad" },
  heroTitle1: { en: "Upgrade your", sr: "Unapredi svoje" },
  heroTitle2: { en: "hackathon experience", sr: "hackathon iskustvo" },
  heroSub: {
    en: "Advanced personalisation, more mini-games and exclusive benefits for serious competitors.",
    sr: "Naprednija personalizacija, češće mini igre i ekskluzivni benefiti za ozbiljne takmičare.",
  },
  pageSub: { en: "Upgrade your hackathon experience", sr: "Unapredi svoje hackathon iskustvo" },
  billingMonthly: { en: "Monthly", sr: "Mesečno" },
  billingAnnual: { en: "Yearly", sr: "Godišnje" },
  billingToggleAria: { en: "Switch to annual billing", sr: "Prebaci na godišnje plaćanje" },
  savePill: { en: "Save {save}%", sr: "Uštedi {save}%" },
  planBasic: { en: "Basic", sr: "Osnovni" },
  planPeriod: { en: "/mo", sr: "/mes" },
  planPeriodYear: { en: "yr", sr: "god" },
  planPremium: { en: "Premium", sr: "Premium" },
  planPopular: { en: "Most popular", sr: "Najpopularnije" },
  featHackathon: { en: "Hackathon participation", sr: "Učešće na hackathonima" },
  featBasicProfile: { en: "Basic profile personalisation", sr: "Osnovna personalizacija profila" },
  featDailySpin: { en: "Daily Spin once a day", sr: "Daily Spin jednom dnevno" },
  featDailyMini: { en: "Daily Minigame once a day", sr: "Daily Minigame jednom dnevno" },
  featMessages: { en: "Messages and Cohor", sr: "Poruke i Cohor" },
  featEverythingBasic: { en: "Everything in the Basic plan", sr: "Sve iz Osnovnog plana" },
  featAdvancedProfile: {
    en: "Advanced profile personalisation",
    sr: "Napredna personalizacija profila",
  },
  featMoreGames: { en: "More frequent mini-game plays", sr: "Češće igranje mini igara" },
  featActivation: {
    en: "Activation via account settings",
    sr: "Aktivacija putem podešavanja naloga",
  },
  featDuration: {
    en: "Defined duration + auto-renewal",
    sr: "Definisan period trajanja + automatska obnova",
  },
  featBadge: {
    en: "Exclusive Premium badge on profile",
    sr: "Ekskluzivna Premium bedž oznaka na profilu",
  },
  featNew: { en: "NEW", sr: "NOVO" },
  currentPlan: { en: "Current plan", sr: "Trenutni plan" },
  activateBtn: { en: "Activate Premium", sr: "Aktiviraj Premium" },
  activatedBtn: { en: "Activated!", sr: "Aktivirano!" },
  activatingBtn: { en: "Activating…", sr: "Aktiviranje…" },
  alreadyPremium: { en: "You're Premium", sr: "Već si Premium" },
  activateError: {
    en: "Couldn't activate Premium. Please try again.",
    sr: "Aktivacija Premiuma nije uspela. Pokušaj ponovo.",
  },
  comparePlans: { en: "Plan comparison", sr: "Poređenje planova" },
  colFeature: { en: "Feature", sr: "Funkcija" },
  colBasic: { en: "Basic", sr: "Osnovni" },
  colPremium: { en: "Premium", sr: "Premium" },
  rowHackathon: { en: "Hackathon participation", sr: "Hackathon učešće" },
  rowGifAvatar: { en: "GIF profile picture", sr: "GIF profilna slika" },
  rowGifBanner: { en: "GIF banner", sr: "GIF banner" },
  rowProfileAdv: { en: "Advanced profile personalisation", sr: "Napredne personalizacije profila" },
  rowBasicAdv: { en: "Basic", sr: "Osnovna" },
  rowAdvanced: { en: "Advanced", sr: "Napredna" },
  rowDailySpin: { en: "Daily Spin", sr: "Daily Spin" },
  rowSpinBasic: { en: "1× daily", sr: "1× dnevno" },
  rowSpinPremium: { en: "3× daily", sr: "3× dnevno" },
  rowPremiumBadge: { en: "Premium badge on profile", sr: "Premium bedž na profilu" },
  rowAutoRenew: { en: "Auto-renewal", sr: "Automatska obnova" },
  faqTitle: { en: "Frequently asked questions", sr: "Česta pitanja" },
  faqQ0: { en: "How do I activate Premium?", sr: "Kako aktiviram Premium?" },
  faqA0: {
    en: 'You activate Premium through the dedicated screen in your account settings, or directly by clicking the "Activate Premium" button here.',
    sr: 'Premium aktiviraš putem namenskog ekrana unutar podešavanja naloga, ili direktno klikom na "Aktiviraj Premium" dugme ovde.',
  },
  faqQ1: { en: "Can I cancel before the period ends?", sr: "Mogu li otkazati pre kraja perioda?" },
  faqA1: {
    en: "You can cancel at any time. Premium remains active until the end of the paid period, after which it will not auto-renew.",
    sr: "Možeš otkazati u bilo kom trenutku. Premium ostaje aktivan do kraja plaćenog perioda, nakon čega se neće automatski obnoviti.",
  },
  faqQ2: {
    en: "What does advanced profile personalisation mean?",
    sr: "Šta znači napredna personalizacija profila?",
  },
  faqA2: {
    en: "Premium users can set animated banner images, custom profile colours, highlight up to 6 hackathons in their bio section, and display exclusive badge labels.",
    sr: "Premium korisnici mogu postavljati animovane banner slike, prilagođene boje profila, istaknuti do 6 hackathona u bio sekciji i prikazivati ekskluzivne bedž oznake.",
  },
  faqQ3: {
    en: "Is there a difference between the monthly and annual plan?",
    sr: "Da li postoji razlika između mesečnog i godišnjeg plana?",
  },
  // {save}/{annual}/{monthly} are interpolated from PRICING at render time so
  // the FAQ copy can never drift from the price shown on the plan card.
  faqA3: {
    en: "All Premium features are identical. With the annual plan you save {save}% compared to monthly payments. You are billed {annual} once a year instead of {monthly} every month.",
    sr: "Sve Premium funkcije su identične. Godišnjim planom uštediš {save}% u poređenju sa mesečnim plaćanjem. Naplaćuje se {annual} jednom godišnje umesto {monthly} svaki mesec.",
  },
} as const;

type FaqId = 0 | 1 | 2 | 3;

export function PremiumClient() {
  useRequireAuth();
  const t = useT(M);
  const [isAnnual, setIsAnnual] = useState(false);
  // flashKey increments on each toggle to force React to remount the element
  // and re-trigger the CSS animation (equivalent to the offsetWidth reflow).
  const [flashKey, setFlashKey] = useState(0);
  const [openFaq, setOpenFaq] = useState<Set<FaqId>>(new Set());
  // `activated` becomes true once this user holds an active subscription —
  // either loaded on mount via getMySubscription() or just activated here.
  const [activated, setActivated] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  // On mount, learn whether the user is already Premium so the CTA can be
  // relabelled/disabled. Plan pricing/features stay static in the markup
  // (they are i18n'd copy + a static comparison table), so we don't fetch
  // getSubscriptionPlans() here — only the user's own subscription status.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { subscription } = await api.getMySubscription();
        if (!cancelled && subscription && subscription.status === "active") {
          setActivated(true);
        }
      } catch (err) {
        console.error("Failed to load subscription", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleBilling = useCallback(() => {
    setIsAnnual((prev) => !prev);
    setFlashKey((k) => k + 1);
  }, []);

  const toggleFaq = useCallback((id: FaqId) => {
    setOpenFaq((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleActivate = useCallback(async () => {
    if (activated || activating) return;
    setActivating(true);
    setActivateError(null);
    const billingCycle: "monthly" | "annual" = isAnnual ? "annual" : "monthly";
    try {
      // FLAGGED (mock payment): this activates the subscription with NO real
      // payment/checkout step — there is no card capture, no payment-provider
      // confirmation, and the price is informational only. Left intact on
      // purpose so the feature keeps working in dev, but it MUST be gated
      // behind a real payment flow before production billing goes live.
      console.warn(
        `[premium] activateSubscription("${billingCycle}") called WITHOUT a ` +
          "real payment step — MOCK PAYMENT, flagged for manual review.",
      );
      await api.activateSubscription(billingCycle);
      setActivated(true);
    } catch (err) {
      console.error("Failed to activate subscription", err);
      setActivateError(t("activateError"));
    } finally {
      setActivating(false);
    }
  }, [activated, activating, isAnnual, t]);

  // Price values — single-sourced from PRICING (no hard-coded copies).
  const premiumPrice = priceAmount(isAnnual ? PRICING.annualPerMonth : PRICING.monthly);
  const savePill = t("savePill").replace("{save}", String(PRICING.savePercent));
  const faqA3 = t("faqA3")
    .replace("{save}", String(PRICING.savePercent))
    .replace("{annual}", priceLabel(PRICING.annualTotal))
    .replace("{monthly}", priceLabel(PRICING.monthly));

  const faqItems: { id: FaqId; qKey: keyof typeof M; aKey: keyof typeof M }[] = [
    { id: 0, qKey: "faqQ0", aKey: "faqA0" },
    { id: 1, qKey: "faqQ1", aKey: "faqA1" },
    { id: 2, qKey: "faqQ2", aKey: "faqA2" },
    { id: 3, qKey: "faqQ3", aKey: "faqA3" },
  ];

  return (
    <AppShell variant="no-right">
      <main className="premium-page" id="main">
        <div className="page-head">
          <Link className="col-back" href="/" aria-label={t("backLabel")}>
            <Icon name="arrow-left" />
          </Link>
          <div className="col-titles">
            <h1 className="page-title">
              <Icon name="premium" /> Premium
            </h1>
            <p className="page-sub">{t("pageSub")}</p>
          </div>
        </div>

        {/* HERO */}
        <section className="premium-hero">
          <Icon name="premium" className="ghost-ic" />
          <span className="premium-badge">
            <Icon name="premium" /> tikimiki Premium
          </span>
          <p className="premium-title">
            {t("heroTitle1")}
            <br />
            <span className="highlight">{t("heroTitle2")}</span>
          </p>
          <p className="premium-subtitle">{t("heroSub")}</p>
        </section>

        {/* BILLING TOGGLE */}
        <div className="billing-toggle">
          <span id="lbl-monthly" className={isAnnual ? "muted" : "active"}>
            {t("billingMonthly")}
          </span>
          <button
            className={`toggle-switch${isAnnual ? " on" : ""}`}
            id="billing-toggle"
            onClick={handleToggleBilling}
            role="switch"
            aria-checked={isAnnual}
            aria-label={t("billingToggleAria")}
          >
            <span className="toggle-knob" aria-hidden="true"></span>
          </button>
          <span id="lbl-annual" className={isAnnual ? "active" : ""}>
            {t("billingAnnual")}
          </span>
          <span className="save-pill">{savePill}</span>
        </div>

        {/* PLANS */}
        <div className="plans-grid">
          {/* BASIC */}
          <div className="plan-card">
            <div className="plan-name">{t("planBasic")}</div>
            <div className="plan-price">
              <span className="plan-price-currency">$</span>
              <span className="plan-price-amount" id="price-basic">
                0
              </span>
              <span className="plan-price-period">{t("planPeriod")}</span>
            </div>
            <div className="plan-price-annual" id="note-basic">
              &nbsp;
            </div>

            <div className="plan-divider"></div>

            <ul className="plan-features">
              <li>
                <span className="feat-check">
                  <Icon name="check" />
                </span>{" "}
                {t("featHackathon")}
              </li>
              <li>
                <span className="feat-check">
                  <Icon name="check" />
                </span>{" "}
                {t("featBasicProfile")}
              </li>
              <li>
                <span className="feat-check">
                  <Icon name="check" />
                </span>{" "}
                {t("featDailySpin")}
              </li>
              <li>
                <span className="feat-check">
                  <Icon name="check" />
                </span>{" "}
                {t("featDailyMini")}
              </li>
              <li>
                <span className="feat-check">
                  <Icon name="check" />
                </span>{" "}
                {t("featMessages")}
              </li>
            </ul>

            <button className="btn btn-ghost btn-premium-cta">{t("currentPlan")}</button>
          </div>

          {/* PREMIUM */}
          <div className="plan-card featured">
            <div className="plan-popular-tag">
              <Icon name="premium" /> {t("planPopular")}
            </div>
            <div className="plan-name">{t("planPremium")}</div>
            <div className="plan-price">
              <span className="plan-price-currency">$</span>
              {/* key={flashKey} forces a DOM remount on each toggle, which restarts
                  the CSS price-flash animation. */}
              <span key={flashKey} className="plan-price-amount flash" id="price-premium">
                {premiumPrice}
              </span>
              <span className="plan-price-period">{t("planPeriod")}</span>
            </div>
            <div className="plan-price-annual" id="note-premium">
              {isAnnual ? (
                <>
                  <span className="strike">{priceLabel(PRICING.monthlyAnnualized)}</span>
                  {" → "}
                  <span className="save">
                    {priceLabel(PRICING.annualTotal)}/{t("planPeriodYear")}
                  </span>
                </>
              ) : (
                <>&nbsp;</>
              )}
            </div>

            <div className="plan-divider"></div>

            <ul className="plan-features">
              <li>
                <span className="feat-check">
                  <Icon name="check" />
                </span>{" "}
                {t("featEverythingBasic")}
              </li>
              <li>
                <span className="feat-check">
                  <Icon name="check" />
                </span>
                <span>
                  {t("featAdvancedProfile")} <span className="feat-new">{t("featNew")}</span>
                </span>
              </li>
              <li>
                <span className="feat-check">
                  <Icon name="check" />
                </span>
                <span>
                  {t("featMoreGames")} <span className="feat-new">{t("featNew")}</span>
                </span>
              </li>
              <li>
                <span className="feat-check">
                  <Icon name="check" />
                </span>
                <span>{t("featActivation")}</span>
              </li>
              <li>
                <span className="feat-check">
                  <Icon name="check" />
                </span>
                <span>{t("featDuration")}</span>
              </li>
              <li>
                <span className="feat-check">
                  <Icon name="check" />
                </span>
                <span>{t("featBadge")}</span>
              </li>
            </ul>

            <button
              className={`btn btn-primary btn-premium-cta btn-cta-crystal${
                activated || activating ? " is-busy" : ""
              }`}
              onClick={handleActivate}
              disabled={activated || activating}
            >
              {activated ? t("alreadyPremium") : activating ? t("activatingBtn") : t("activateBtn")}
            </button>
            {activateError && (
              <p className="plan-price-annual" role="alert">
                {activateError}
              </p>
            )}
          </div>
        </div>

        {/* COMPARE */}
        <section className="compare-section">
          <h2 className="compare-title">{t("comparePlans")}</h2>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">{t("colFeature")}</th>
                <th scope="col">{t("colBasic")}</th>
                <th scope="col" className="col-premium">
                  <Icon name="premium" /> {t("colPremium")}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("rowHackathon")}</td>
                <td>
                  <span className="check-yes">
                    <Icon name="check" />
                  </span>
                </td>
                <td>
                  <span className="check-crystal">
                    <Icon name="check" />
                  </span>
                </td>
              </tr>
              <tr>
                <td>{t("rowGifAvatar")}</td>
                <td>
                  <span className="check-no">—</span>
                </td>
                <td>
                  <span className="check-crystal">
                    <Icon name="check" />
                  </span>
                </td>
              </tr>
              <tr>
                <td>{t("rowGifBanner")}</td>
                <td>
                  <span className="check-no">—</span>
                </td>
                <td>
                  <span className="check-crystal">
                    <Icon name="check" />
                  </span>
                </td>
              </tr>
              <tr>
                <td>{t("rowProfileAdv")}</td>
                <td>
                  <span className="check-yes">{t("rowBasicAdv")}</span>
                </td>
                <td>
                  <span className="check-crystal">{t("rowAdvanced")}</span>
                </td>
              </tr>
              <tr>
                <td>{t("rowDailySpin")}</td>
                <td>
                  <span className="check-yes">{t("rowSpinBasic")}</span>
                </td>
                <td>
                  <span className="check-crystal">{t("rowSpinPremium")}</span>
                </td>
              </tr>
              <tr>
                <td>{t("rowPremiumBadge")}</td>
                <td>
                  <span className="check-no">—</span>
                </td>
                <td>
                  <span className="check-crystal">
                    <Icon name="check" />
                  </span>
                </td>
              </tr>
              <tr>
                <td>{t("rowAutoRenew")}</td>
                <td>
                  <span className="check-no">—</span>
                </td>
                <td>
                  <span className="check-crystal">
                    <Icon name="check" />
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* FAQ */}
        <section className="faq-section">
          <h2 className="faq-title">{t("faqTitle")}</h2>

          {faqItems.map(({ id, qKey, aKey }) => {
            const isOpen = openFaq.has(id);
            return (
              <div
                key={id}
                className={`faq-item${isOpen ? " open" : ""}`}
                onClick={() => toggleFaq(id)}
              >
                <button className="faq-q" type="button" aria-expanded={isOpen}>
                  {t(qKey)}
                  <span className="faq-arrow" aria-hidden="true">
                    <Icon name="chevron-down" />
                  </span>
                </button>
                <div className="faq-a">{id === 3 ? faqA3 : t(aKey)}</div>
              </div>
            );
          })}
        </section>
      </main>
    </AppShell>
  );
}

export default PremiumClient;
