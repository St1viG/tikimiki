import { GenerativeAvatar } from "@/components/ui/GenerativeAvatar";

/**
 * OrbArt — the inner art for an `.avatar.is-orb` wrapper: the user's uploaded
 * avatar image when they have one, otherwise a deterministic generated avatar
 * seeded by their username. Use everywhere an avatar is shown so a real uploaded
 * picture appears consistently (feed, profile, popup, comments, rails …).
 */
export function OrbArt({
  url,
  seed,
  alt = "",
}: {
  url?: string | null;
  seed: string;
  alt?: string;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="orb-art" src={url} alt={alt} />;
  }
  return <GenerativeAvatar seed={seed} className="orb-art" />;
}

export default OrbArt;
