/**
 * Autor: Nenad Skoković (2023/0039)
 */
import {
  BadGatewayException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

const GITHUB_API = "https://api.github.com";
/** Repos are already sorted by `pushed`, so these are the most active ones —
 *  worth the extra per-repo call for a precise byte-level language split. */
const TOP_REPOS_FOR_LANGUAGE_DETAIL = 5;
const MAX_TOP_LANGUAGES = 10;

interface GithubRepo {
  full_name: string;
  language: string | null;
  stargazers_count: number;
}

/** Aggregate GitHub activity, used to auto-verify a member's skill tags. */
export interface GithubProfileStats {
  repos: number;
  topLanguages: string[];
  stars: number;
}

/**
 * GithubService — pulls repo/language stats from the GitHub REST API using a
 * user's stored OAuth access token (see `OAuthService.fetchGithub`, N01,
 * persisted to `users.githubAccessToken`).
 */
@Injectable()
export class GithubService {
  /**
   * Repo count, total stars, and languages ranked by estimated usage
   * (byte counts for the most active repos, plain frequency for the rest).
   */
  async fetchProfileStats(accessToken: string): Promise<GithubProfileStats> {
    const repos = await this.fetchJson<GithubRepo[]>(
      `${GITHUB_API}/user/repos?per_page=100&sort=pushed`,
      accessToken,
    );

    const stars = repos.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0);
    const topLanguages = await this.rankLanguages(repos, accessToken);

    return { repos: repos.length, topLanguages, stars };
  }

  /**
   * Score languages by estimated usage: byte counts (via `GET
   * /repos/:owner/:repo/languages`) for the most active repos, and a plain
   * per-repo tally of `repo.language` for the rest — then sort descending.
   */
  private async rankLanguages(
    repos: GithubRepo[],
    accessToken: string,
  ): Promise<string[]> {
    const languageScore = new Map<string, number>();

    const detailed = repos.slice(0, TOP_REPOS_FOR_LANGUAGE_DETAIL);
    const detailedNames = new Set(detailed.map((r) => r.full_name));

    const breakdowns = await Promise.allSettled(
      detailed.map((r) =>
        this.fetchJson<Record<string, number>>(
          `${GITHUB_API}/repos/${r.full_name}/languages`,
          accessToken,
        ),
      ),
    );
    for (const result of breakdowns) {
      if (result.status !== "fulfilled") continue;
      for (const [language, bytes] of Object.entries(result.value)) {
        languageScore.set(language, (languageScore.get(language) ?? 0) + bytes);
      }
    }

    for (const r of repos) {
      if (!r.language || detailedNames.has(r.full_name)) continue;
      languageScore.set(r.language, (languageScore.get(r.language) ?? 0) + 1);
    }

    return [...languageScore.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TOP_LANGUAGES)
      .map(([language]) => language);
  }

  /**
   * GET `url` from the GitHub API using the same fetch pattern as
   * `OAuthService.fetchGithub` (bearer token + `User-Agent: tikimiki`).
   * Maps an expired/revoked token (401) to `UnauthorizedException`, any
   * other non-2xx or network failure to `BadGatewayException`.
   */
  private async fetchJson<T>(url: string, accessToken: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "tikimiki",
          Accept: "application/vnd.github+json",
        },
      });
    } catch {
      throw new BadGatewayException("Failed to reach GitHub");
    }
    if (res.status === 401) {
      throw new UnauthorizedException(
        "GitHub access token is invalid or expired",
      );
    }
    if (!res.ok) {
      throw new BadGatewayException(`GitHub request failed (${res.status})`);
    }
    return res.json() as Promise<T>;
  }
}
