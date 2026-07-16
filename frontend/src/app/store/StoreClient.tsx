"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { BuyModal } from "@/components/popups/BuyModal";
import type { ModalState } from "@/components/popups/BuyModal";
import { PurchaseToast } from "@/components/popups/PurchaseToast";
import type { ToastKind } from "@/components/popups/PurchaseToast";
import { StoreRailRight } from "./StoreRailRight";
import { useT } from "@/components/i18n/LanguageProvider";
import { useRequireAuth } from "@/components/auth/AuthProvider";
import * as api from "@/lib/api";
import { formatXp } from "@/lib/format";
import { cosmeticToItem, merchToItem, type FilterCat, type MerchItem } from "@/lib/store";

/* StoreClient — interactive store page.
 *
 * Behaviour:
 *  - Filter chips: active chip highlights, cards hidden when category doesn't match.
 *  - XP wallet: mono tabular display; updates after purchase; btn-buy becomes
 *    "Nedovoljno XP" (at 0.55 opacity) when price > xp.
 *  - Buy modal: open on card click — shows size picker, delivery fields, or
 *    deficit section depending on available XP. Confirms purchase, deducts XP,
 *    shows success toast.
 *  - Premium cards: openPremiumModal skips delivery/size and uses confirm pattern.
 *  - Toast: ok (green check flash) / warn (lemon bell).
 *  - Askew "hot" sticker straightens on card hover (pure CSS in store.css).
 *
 * Supplies its own <main className="feed" id="store">.
 */

const M = {
  backLabel: { en: "Back", sr: "Nazad" },
  pageTitle: { en: "tikimiki Store", sr: "tikimiki Prodavnica" },
  pageSub: {
    en: "Official merch. Pay with XP points earned at hackathons and mini-games.",
    sr: "Zvanični merch. Plaća se XP poenima osvojenim na hackathonima i mini igricama.",
  },
  walletLabel: { en: "Your XP balance", sr: "Tvoj XP balans" },
  earnHint: { en: "Earn more XP", sr: "Zaradi više XP" },
  filterLabel: { en: "Filter products", sr: "Filtriraj proizvode" },
  filterAll: { en: "All", sr: "Sve" },
  filterTshirts: { en: "T-Shirts", sr: "Majice" },
  filterHoodies: { en: "Hoodies", sr: "Duksevi" },
  filterMugs: { en: "Mugs", sr: "Šolje" },
  filterPremium: { en: "Premium", sr: "Premium" },
  buyLabel: { en: "Buy", sr: "Kupi" },
  exchangeLabel: { en: "Exchange", sr: "Razmeni" },
  notEnoughXP: { en: "Not enough XP", sr: "Nedovoljno XP" },
  orderedToast: {
    en: "ordered! Check your email for details.",
    sr: "naručena! Provjeri email za detalje.",
  },
  boughtToast: { en: "unlocked! Check your inventory.", sr: "otključano! Provjeri svoj inventar." },
  loadingLabel: { en: "Loading products…", sr: "Učitavanje proizvoda…" },
  emptyLabel: { en: "No products available right now.", sr: "Trenutno nema dostupnih proizvoda." },
  purchaseError: {
    en: "Purchase failed. Please try again.",
    sr: "Kupovina nije uspela. Pokušaj ponovo.",
  },
} as const;

/** Opacity for the buy button when XP is insufficient. */
function buyOpacity(item: MerchItem, xp: number): React.CSSProperties {
  return item.price > xp ? { opacity: 0.55 } : {};
}

export function StoreClient() {
  const router = useRouter();
  useRequireAuth();
  const t = useT(M);

  // Current XP balance — hydrated from the user's real points.
  const [xp, setXp] = useState(0);

  // Store catalogue merged from cosmetics (digital) + merch (physical).
  const [items, setItems] = useState<MerchItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Active filter chip
  const [filter, setFilter] = useState<FilterCat>("sve");

  // Modal state
  const [modal, setModal] = useState<ModalState>({ open: false });
  // The catalogue item currently shown in the modal (for the confirm action).
  const [activeItem, setActiveItem] = useState<MerchItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedSize, setSelectedSize] = useState("L");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [deliveryCountry, setDeliveryCountry] = useState("RS");
  const [deliveryPhone, setDeliveryPhone] = useState("");

  // Toast
  const [toast, setToast] = useState<{ msg: string; kind: ToastKind }>({
    msg: "",
    kind: "hidden",
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, kind: "ok" | "warn") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, kind });
    toastTimer.current = setTimeout(() => {
      setToast({ msg: "", kind: "hidden" });
    }, 3200);
  }, []);

  // Load the user's XP balance + the merged store catalogue.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [profile, cosmetics, merch] = await Promise.all([
          api.getMyProfile(),
          api.getCosmetics(),
          api.getMerch(),
        ]);
        if (cancelled) return;
        setXp(profile.points);
        const merged: MerchItem[] = [
          ...merch.filter((m) => m.isAvailable).map(merchToItem),
          ...cosmetics.map(cosmeticToItem),
        ];
        setItems(merged);
      } catch (err) {
        if (!cancelled) console.error("Failed to load store", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Label for the buy button given current XP. */
  function buyLabel(item: MerchItem): string {
    if (item.price > xp) return t("notEnoughXP");
    if (item.isPremium) return t("exchangeLabel");
    return t("buyLabel");
  }

  // Open the buy modal for a regular merch card
  function openModal(item: MerchItem) {
    const notEnough = item.price > xp;
    setActiveItem(item);
    setModal({
      open: true,
      name: item.name,
      variant: item.variant,
      price: item.price,
      icon: item.icon,
      imageUrl: item.imageUrl,
      hasSizes: item.hasSizes,
      requiresDelivery: item.requiresDelivery,
      xp,
    });
    if (!notEnough) {
      // Default to the first available variant's label when sizes exist.
      const firstVariant = item.variants?.[0]?.label;
      setSelectedSize(firstVariant ?? "L");
      setDeliveryAddress("");
      setDeliveryCity("");
      setDeliveryZip("");
      setDeliveryCountry("RS");
      setDeliveryPhone("");
    }
  }

  // Open the modal for a premium item (no sizes/delivery, may be insufficient).
  // Digital items set requiresDelivery=false so BuyModal skips the address
  // fields entirely — no sentinel "–" data is collected or sent.
  function openPremiumModal(item: MerchItem) {
    setActiveItem(item);
    setModal({
      open: true,
      name: item.name,
      variant: item.variant,
      price: item.price,
      icon: item.icon,
      imageUrl: item.imageUrl,
      hasSizes: false,
      requiresDelivery: item.requiresDelivery,
      xp,
    });
  }

  function closeModal() {
    setModal({ open: false });
    setActiveItem(null);
  }

  async function handleConfirm() {
    if (!modal.open || !activeItem || submitting) return;
    const item = activeItem;
    const name = modal.name;
    setSubmitting(true);
    try {
      if (item.source === "cosmetic" && item.cosmeticId) {
        const res = await api.buyCosmetic(item.cosmeticId);
        setXp(res.newBalance);
        closeModal();
        showToast(`${name} ${t("boughtToast")}`, "ok");
      } else if (item.source === "merch" && item.merchId) {
        // Map the chosen size label back to its variant id (if any).
        const variantId = item.variants?.find((v) => v.label === selectedSize)?.variantId;
        // Re-fetch the profile at confirm time so shippingName uses the
        // current username — the user may have renamed since the page loaded.
        const profile = await api.getMyProfile();
        const res = await api.orderMerch(item.merchId, {
          variantId,
          shippingName: profile.username,
          shippingAddress: deliveryAddress.trim(),
          shippingCity: deliveryCity.trim(),
          shippingCountry: deliveryCountry.trim(),
          shippingZip: deliveryZip.trim(),
        });
        setXp(res.newBalance);
        closeModal();
        showToast(`${name} ${t("orderedToast")}`, "ok");
      }
    } catch (err) {
      console.error("Purchase failed", err);
      showToast(t("purchaseError"), "warn");
    } finally {
      setSubmitting(false);
    }
  }

  function handleWarnToast(msg: string) {
    showToast(msg, "warn");
  }

  const visibleItems = items.filter((item) => filter === "sve" || item.cat === filter);

  const FILTER_CHIPS: { cat: FilterCat; labelKey: keyof typeof M; icon: string | null }[] = [
    { cat: "sve", labelKey: "filterAll", icon: null },
    { cat: "majice", labelKey: "filterTshirts", icon: "image" },
    { cat: "duks", labelKey: "filterHoodies", icon: "shield" },
    { cat: "solje", labelKey: "filterMugs", icon: "coin" },
    { cat: "premium", labelKey: "filterPremium", icon: "premium" },
  ];

  return (
    <AppShell right={<StoreRailRight />}>
      <main className="feed" id="store">
        {/* Page header */}
        <div className="page-head">
          <button
            type="button"
            className="col-back"
            aria-label={t("backLabel")}
            onClick={() => router.back()}
          >
            <Icon name="arrow-left" />
          </button>
          <div className="col-titles">
            <h1 className="page-title">
              <Icon name="cart" /> {t("pageTitle")}
            </h1>
            <p className="page-sub">{t("pageSub")}</p>
          </div>
        </div>

        {/* XP wallet */}
        <div className="xp-wallet">
          <span className="xp-wallet-icon" aria-hidden="true">
            <Icon name="coin" />
          </span>
          <div className="xp-wallet-info">
            <div className="xp-wallet-label">{t("walletLabel")}</div>
            <div className="xp-wallet-amount" id="xp-display">
              {formatXp(xp)} <span>XP</span>
            </div>
          </div>
          <Link className="xp-earn-hint" href="/gamehub">
            <Icon name="flame" /> {t("earnHint")}
          </Link>
        </div>

        {/* Filter chips */}
        <div className="store-filters" role="group" aria-label={t("filterLabel")}>
          {FILTER_CHIPS.map(({ cat, labelKey, icon }) => (
            <button
              key={cat}
              className={[
                "filter-btn",
                cat === "premium" ? "premium-filter" : "",
                filter === cat ? "active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setFilter(cat)}
            >
              {icon && <Icon name={icon} />}
              {t(labelKey)}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="store-grid" id="store-grid">
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={`skel-${i}`} className="merch-card is-skeleton" aria-busy="true">
                <div
                  className="merch-img skel"
                  aria-hidden="true"
                  style={{ aspectRatio: "4 / 3" } as React.CSSProperties}
                />
                <div className="merch-body" aria-hidden="true">
                  <span
                    className="skel skel-line"
                    style={{ width: "70%" } as React.CSSProperties}
                  />
                  <span
                    className="skel skel-line"
                    style={{ width: "40%", marginTop: 5 } as React.CSSProperties}
                  />
                  <div className="merch-foot">
                    <span
                      className="skel"
                      style={
                        {
                          width: 84,
                          height: 22,
                          borderRadius: 6,
                        } as React.CSSProperties
                      }
                    />
                    <span
                      className="skel"
                      style={
                        {
                          width: 72,
                          height: 34,
                          borderRadius: 10,
                        } as React.CSSProperties
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          {!loading && visibleItems.length === 0 && <p className="page-sub">{t("emptyLabel")}</p>}
          {!loading &&
            visibleItems.map((item) => {
              const handleClick = item.isPremium
                ? () => openPremiumModal(item)
                : () => openModal(item);

              return (
                <button
                  key={item.id}
                  className={["merch-card", item.isPremium ? "is-premium" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  data-cat={item.cat}
                  onClick={handleClick}
                  aria-label={item.ariaLabel}
                >
                  <div className="merch-img">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- product photos are seeded arbitrary paths, not build-time known
                      <img src={item.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <Icon name={item.icon} />
                    )}
                    {item.badge && (
                      <span
                        className={[
                          "merch-badge",
                          item.badge.kind === "hot" ? "merch-badge-hot" : "",
                          item.badge.kind === "new" ? "merch-badge-new" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {item.badge.kind === "hot" && <Icon name="flame" />}
                        {item.badge.kind === "best" && <Icon name="flame" />}
                        {item.badge.label}
                      </span>
                    )}
                  </div>
                  <div className="merch-body">
                    <div className="merch-name">{item.name}</div>
                    <div className="merch-variant">{item.variant}</div>
                    <div className="merch-foot">
                      <div className="merch-price">
                        <Icon name="coin" /> {formatXp(item.price)}
                      </div>
                      <span className="btn-buy" style={buyOpacity(item, xp)}>
                        {buyLabel(item)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
        </div>
      </main>

      {/* Purchase modal */}
      <BuyModal
        state={modal}
        selectedSize={selectedSize}
        onSelectSize={setSelectedSize}
        deliveryAddress={deliveryAddress}
        onDeliveryAddress={setDeliveryAddress}
        deliveryCity={deliveryCity}
        onDeliveryCity={setDeliveryCity}
        deliveryZip={deliveryZip}
        onDeliveryZip={setDeliveryZip}
        deliveryCountry={deliveryCountry}
        onDeliveryCountry={setDeliveryCountry}
        deliveryPhone={deliveryPhone}
        onDeliveryPhone={setDeliveryPhone}
        onClose={closeModal}
        onConfirm={handleConfirm}
        onWarnToast={handleWarnToast}
      />

      {/* Toast */}
      <PurchaseToast message={toast.msg} kind={toast.kind} />
    </AppShell>
  );
}

export default StoreClient;
