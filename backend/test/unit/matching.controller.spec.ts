/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchingController } from "../../src/matching/matching.controller";
import type { MatchingService } from "../../src/matching/matching.service";

describe("MatchingController (unit)", () => {
  const USER = "user-1";
  const HACK = "hack-1";
  let svc: Record<string, ReturnType<typeof vi.fn>>;
  let controller: MatchingController;

  beforeEach(() => {
    svc = {
      teamSuggestions: vi.fn().mockReturnValue({ teammates: [], teams: [] }),
    };
    controller = new MatchingController(svc as unknown as MatchingService);
  });

  it("teamSuggestions forwards hackathonId and the caller's userId", () => {
    const result = controller.teamSuggestions(USER, HACK);
    expect(svc.teamSuggestions).toHaveBeenCalledWith(HACK, USER);
    expect(result).toEqual({ teammates: [], teams: [] });
  });
});
