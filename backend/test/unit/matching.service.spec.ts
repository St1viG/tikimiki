/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { describe, expect, it } from "vitest";
import { MatchingService, type FreeAgentDto } from "../../src/matching/matching.service";

describe("MatchingService (unit)", () => {
  const service = new MatchingService({} as never);

  describe("complementarityScore", () => {
    it("counts candidate skills not already covered", () => {
      const score = service.complementarityScore(["Go", "React", "SQL"], ["React"]);
      expect(score).toBe(2);
    });

    it("scores 0 when every candidate skill is already covered", () => {
      const score = service.complementarityScore(["React", "SQL"], ["React", "SQL", "Go"]);
      expect(score).toBe(0);
    });

    it("does not double-count duplicate candidate skills", () => {
      const score = service.complementarityScore(["Go", "Go", "React"], ["React"]);
      expect(score).toBe(1);
    });

    it("scores every skill when nothing is covered yet", () => {
      const score = service.complementarityScore(["Go", "React"], []);
      expect(score).toBe(2);
    });
  });

  describe("rankByComplementarity", () => {
    const agent = (username: string, skills: string[]): FreeAgentDto => ({
      userId: username,
      username,
      displayName: null,
      skills,
    });

    it("sorts free agents by descending complementarity score", () => {
      const agents = [
        agent("alice", ["React"]),
        agent("bob", ["Go", "SQL"]),
        agent("carol", ["React", "Go", "SQL", "Docker"]),
      ];

      const ranked = service.rankByComplementarity(agents, ["React"]);

      expect(ranked.map((a) => a.username)).toEqual(["carol", "bob", "alice"]);
      expect(ranked.map((a) => a.score)).toEqual([3, 2, 0]);
    });

    it("breaks ties alphabetically by username", () => {
      const agents = [agent("zed", ["Go"]), agent("amy", ["Go"])];

      const ranked = service.rankByComplementarity(agents, []);

      expect(ranked.map((a) => a.username)).toEqual(["amy", "zed"]);
    });

    it("does not mutate the input free agents", () => {
      const agents = [agent("alice", ["React"])];

      service.rankByComplementarity(agents, []);

      expect(agents[0]).not.toHaveProperty("score");
    });
  });
});
