"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/i18n/LanguageProvider";
import { formatXp } from "@/lib/format";
import { XP_REWARDS } from "@/lib/rewards";

/**
 * BuyModal — the purchase-confirmation overlay for /store.
 *
 * Behaviour:
 *  - When the user has enough XP: shows size picker (for items with sizes),
 *    delivery fields, cost row, and a "Confirm purchase" button.
 *  - When XP is insufficient: shows a deficit row, earn-XP list, and a
 *    "Earn XP" button that navigates to /gamehub.
 *  - Clicking the backdrop or "Cancel" closes the modal.
 *  - Confirming validates address + phone, deducts XP, closes modal, and
 *    triggers an "ok" toast via the onPurchase callback.
 */

const M = {
  titleNotEnough: { en: "Not enough XP points", sr: "Nedovoljno XP poena" },
  titleConfirm: { en: "Confirm purchase", sr: "Potvrdi kupovinu" },
  confirmSub: {
    en: "Are you sure you want to buy this item?",
    sr: "Da li si siguran/na da želiš da kupiš ovaj artikal?",
  },
  sizeLabel: { en: "Choose size", sr: "Izaberi veličinu" },
  deliveryAddr: { en: "Street address", sr: "Ulica i broj" },
  deliveryAddrPh: {
    en: "Street and number",
    sr: "Ulica i broj",
  },
  deliveryCity: { en: "City", sr: "Grad" },
  deliveryCityPh: { en: "e.g. Belgrade", sr: "npr. Beograd" },
  deliveryZip: { en: "Postal code", sr: "Poštanski broj" },
  deliveryZipPh: { en: "e.g. 11000", sr: "npr. 11000" },
  deliveryCountry: { en: "Country", sr: "Država" },
  deliveryPhone: { en: "Contact phone", sr: "Kontakt telefon" },
  deficitTitle: { en: "You are missing", sr: "Nedostaje ti" },
  deficitSub1: { en: "You have", sr: "Imaš" },
  deficitSub2: { en: "XP · Needed", sr: "XP · Potrebno" },
  earnHeader: { en: "How to earn XP?", sr: "Kako zaraditi XP?" },
  earnDaily: { en: "Daily Minigame", sr: "Daily Minigame" },
  earnDailySuffix: { en: "daily", sr: "dnevno" },
  earnSpin: { en: "Daily Spin", sr: "Daily Spin" },
  earnHack: { en: "Hackathon participation", sr: "Hackathon učešće" },
  earnWin: { en: "Hackathon win", sr: "Pobeda na hackathonu" },
  earnUpTo: { en: "up to", sr: "do" },
  priceLabel: { en: "Price", sr: "Cena" },
  cancelBtn: { en: "Cancel", sr: "Otkaži" },
  confirmBtn: { en: "Confirm purchase", sr: "Potvrdi kupovinu" },
  earnBtn: { en: "Earn XP", sr: "Zaradi XP" },
  warnAddr: { en: "Enter delivery address.", sr: "Unesi adresu dostave." },
  warnCity: { en: "Enter your city.", sr: "Unesi grad." },
  warnZip: { en: "Enter your postal code.", sr: "Unesi poštanski broj." },
  warnPhone: { en: "Enter contact phone.", sr: "Unesi kontakt telefon." },
} as const;

/** Countries offered in the delivery form, 2-letter codes as required by the backend. */
const COUNTRIES = [
  { code: "RS", label: "Srbija" },
  { code: "BA", label: "Bosna i Hercegovina" },
  { code: "HR", label: "Hrvatska" },
  { code: "ME", label: "Crna Gora" },
  { code: "MK", label: "Severna Makedonija" },
  { code: "SI", label: "Slovenija" },
] as const;

export type ModalState =
  | { open: false }
  | {
      open: true;
      name: string;
      variant: string;
      price: number;
      icon: string;
      hasSizes: boolean;
      /** Physical merch collects a shipping address; digital items skip it. */
      requiresDelivery: boolean;
      xp: number;
    };

type Props = {
  state: ModalState;
  selectedSize: string;
  onSelectSize: (s: string) => void;
  deliveryAddress: string;
  onDeliveryAddress: (v: string) => void;
  deliveryCity: string;
  onDeliveryCity: (v: string) => void;
  deliveryZip: string;
  onDeliveryZip: (v: string) => void;
  deliveryCountry: string;
  onDeliveryCountry: (v: string) => void;
  deliveryPhone: string;
  onDeliveryPhone: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  onWarnToast: (msg: string) => void;
};

const SIZES = ["S", "M", "L", "XL"];

export function BuyModal({
  state,
  selectedSize,
  onSelectSize,
  deliveryAddress,
  onDeliveryAddress,
  deliveryCity,
  onDeliveryCity,
  deliveryZip,
  onDeliveryZip,
  deliveryCountry,
  onDeliveryCountry,
  deliveryPhone,
  onDeliveryPhone,
  onClose,
  onConfirm,
  onWarnToast,
}: Props) {
  const router = useRouter();
  const t = useT(M);

  if (!state.open) return null;

  const { name, variant, price, icon, hasSizes, requiresDelivery, xp } = state;
  const notEnough = price > xp;

  /** Render a reward value like "up to +150 XP daily" / "+300 XP". */
  function reward(key: keyof typeof XP_REWARDS, suffix?: string): string {
    const r = XP_REWARDS[key];
    const prefix = r.kind === "upTo" ? `${t("earnUpTo")} ` : "";
    const tail = suffix ? ` ${suffix}` : "";
    return `${prefix}+${formatXp(r.amount)} XP${tail}`;
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleConfirm() {
    // Only physical merch collects/validates a shipping address.
    if (requiresDelivery) {
      const addr = deliveryAddress.trim();
      const city = deliveryCity.trim();
      const zip = deliveryZip.trim();
      const phone = deliveryPhone.trim();
      if (!addr) {
        onWarnToast(t("warnAddr"));
        return;
      }
      if (!city) {
        onWarnToast(t("warnCity"));
        return;
      }
      if (!zip) {
        onWarnToast(t("warnZip"));
        return;
      }
      if (!phone) {
        onWarnToast(t("warnPhone"));
        return;
      }
    }
    onConfirm();
  }

  return (
    <div
      className="modal-overlay open"
      id="modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal={true}
      aria-labelledby="modal-title"
    >
      <div className="modal">
        <div className="modal-title" id="modal-title">
          {notEnough ? t("titleNotEnough") : t("titleConfirm")}
        </div>
        {!notEnough && (
          <div className="modal-sub" id="modal-sub">
            {t("confirmSub")}
          </div>
        )}

        {/* Item row */}
        <div className="modal-item-row">
          <div className="modal-item-icon" id="modal-icon" aria-hidden="true">
            <Icon name={icon} />
          </div>
          <div>
            <div className="modal-item-name" id="modal-name">
              {name}
            </div>
            <div className="modal-item-variant" id="modal-variant">
              {variant}
            </div>
          </div>
        </div>

        {/* Size picker (only when sufficient XP and item has sizes) */}
        {!notEnough && hasSizes && (
          <div id="size-section">
            <div className="modal-size-label">{t("sizeLabel")}</div>
            <div className="size-options">
              {SIZES.map((s) => (
                <button
                  key={s}
                  className={`size-btn${selectedSize === s ? " selected" : ""}`}
                  onClick={() => onSelectSize(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Delivery fields (only for physical merch with sufficient XP) */}
        {!notEnough && requiresDelivery && (
          <div id="delivery-section">
            <div className="modal-size-label">
              <label htmlFor="delivery-address">{t("deliveryAddr")}</label>
            </div>
            <input
              type="text"
              className="modal-field-input"
              id="delivery-address"
              placeholder={t("deliveryAddrPh")}
              aria-label={t("deliveryAddr")}
              value={deliveryAddress}
              onChange={(e) => onDeliveryAddress(e.target.value)}
            />
            <div
              className="modal-field-row"
              style={{ display: "flex", gap: "12px", marginTop: "12px" }}
            >
              <div style={{ flex: 2 }}>
                <div className="modal-size-label">
                  <label htmlFor="delivery-city">{t("deliveryCity")}</label>
                </div>
                <input
                  type="text"
                  className="modal-field-input"
                  id="delivery-city"
                  placeholder={t("deliveryCityPh")}
                  aria-label={t("deliveryCity")}
                  value={deliveryCity}
                  onChange={(e) => onDeliveryCity(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="modal-size-label">
                  <label htmlFor="delivery-zip">{t("deliveryZip")}</label>
                </div>
                <input
                  type="text"
                  className="modal-field-input"
                  id="delivery-zip"
                  placeholder={t("deliveryZipPh")}
                  aria-label={t("deliveryZip")}
                  value={deliveryZip}
                  onChange={(e) => onDeliveryZip(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-size-label" style={{ marginTop: "12px" }}>
              <label htmlFor="delivery-country">{t("deliveryCountry")}</label>
            </div>
            <select
              className="modal-field-input"
              id="delivery-country"
              aria-label={t("deliveryCountry")}
              value={deliveryCountry}
              onChange={(e) => onDeliveryCountry(e.target.value)}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="modal-size-label" style={{ marginTop: "12px" }}>
              <label htmlFor="delivery-phone">{t("deliveryPhone")}</label>
            </div>
            <input
              type="text"
              className="modal-field-input"
              id="delivery-phone"
              placeholder="+381 6X XXX XXXX"
              aria-label={t("deliveryPhone")}
              value={deliveryPhone}
              onChange={(e) => onDeliveryPhone(e.target.value)}
            />
          </div>
        )}

        {/* Insufficient XP section */}
        {notEnough && (
          <div id="insufficient-section">
            <div className="modal-deficit-row">
              <div className="modal-deficit-icon" aria-hidden="true">
                <Icon name="coin" />
              </div>
              <div>
                <div className="modal-deficit-title">
                  {t("deficitTitle")} <span id="modal-deficit-amount">{formatXp(price - xp)}</span>{" "}
                  XP
                </div>
                <div className="modal-deficit-sub">
                  {t("deficitSub1")} <span id="modal-deficit-have">{formatXp(xp)}</span>{" "}
                  {t("deficitSub2")} <span id="modal-deficit-need">{formatXp(price)}</span> XP
                </div>
              </div>
            </div>
            <div className="modal-earn-hdr">{t("earnHeader")}</div>
            <div className="modal-earn-list">
              <div className="modal-earn-item">
                <Icon name="gamehub" aria-hidden="true" />
                <span>
                  <b>{t("earnDaily")}</b>: {reward("dailyMinigame", t("earnDailySuffix"))}
                </span>
              </div>
              <div className="modal-earn-item">
                <Icon name="flame" aria-hidden="true" />
                <span>
                  <b>{t("earnSpin")}</b>: {reward("dailySpin")}
                </span>
              </div>
              <div className="modal-earn-item">
                <Icon name="hackathon" aria-hidden="true" />
                <span>
                  <b>{t("earnHack")}</b>: {reward("hackathonJoin")}
                </span>
              </div>
              <div className="modal-earn-item">
                <Icon name="trophy" aria-hidden="true" />
                <span>
                  <b>{t("earnWin")}</b>: {reward("hackathonWin")}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Cost row */}
        <div className="modal-cost-row">
          <div className="modal-cost-label">{t("priceLabel")}</div>
          <div className="modal-cost-val" id="modal-price">
            <Icon name="coin" /> {formatXp(price)} XP
          </div>
        </div>

        {/* Action buttons */}
        <div className="modal-btns">
          <button className="btn btn-ghost modal-cancel" onClick={onClose}>
            {t("cancelBtn")}
          </button>
          {!notEnough && (
            <button
              className="btn btn-primary modal-confirm"
              id="modal-confirm-btn"
              onClick={handleConfirm}
            >
              {t("confirmBtn")}
            </button>
          )}
          {notEnough && (
            <button
              className="btn btn-violet modal-confirm"
              id="modal-earn-btn"
              onClick={() => router.push("/gamehub")}
            >
              <Icon name="flame" /> {t("earnBtn")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default BuyModal;
