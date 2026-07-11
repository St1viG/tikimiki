/**
 * Autor: Dimitrije Pesic (2023/0014)
 */
import { describe, expect, it, vi } from "vitest";
import { MatchingService, type FreeAgentDto } from "../../src/matching/matching.service";
import type { OpenTeamDto } from "../../src/teams/teams.service";

describe("MatchingService (unit)", () => {
  const service = new MatchingService({} as never, {} as never);

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

  describe("teamSuggestions", () => {
    const HACK = "hack-1";
    const USER = "user-1";
    const agent = (username: string, skills: string[]): FreeAgentDto => ({
      userId: username,
      username,
      displayName: null,
      skills,
    });
    const openTeam = (teamId: string, hackathonId: string, name: string): OpenTeamDto => ({
      teamId,
      name,
      hackathonId,
      hackathonTitle: "Hack",
      memberCount: 1,
      maxTeamSize: 4,
      members: [],
    });

    it("ranks free agents against the caller's own team and skips open teams", async () => {
      const teamsService = { openTeams: vi.fn() };
      const svc = new MatchingService({} as never, teamsService as never);
      vi.spyOn(svc, "freeAgentsForHackathon").mockResolvedValue([agent("bob", ["Go"])]);
      vi.spyOn(svc, "myActiveTeamId").mockResolvedValue("team-mine");
      vi.spyOn(svc, "teamSkills").mockResolvedValue(["React"]);

      const result = await svc.teamSuggestions(HACK, USER);

      expect(result.teams).toEqual([]);
      expect(result.teammates.map((t) => t.username)).toEqual(["bob"]);
      expect(teamsService.openTeams).not.toHaveBeenCalled();
    });

    it("ranks free agents and open teams against the caller's own skills when they have no team", async () => {
      const teamsService = {
        openTeams: vi
          .fn()
          .mockResolvedValue([
            openTeam("team-a", HACK, "Alpha"),
            openTeam("team-b", HACK, "Beta"),
            openTeam("team-other-hack", "hack-2", "Gamma"),
          ]),
      };
      const svc = new MatchingService({} as never, teamsService as never);
      vi.spyOn(svc, "freeAgentsForHackathon").mockResolvedValue([agent("bob", ["Go"])]);
      vi.spyOn(svc, "myActiveTeamId").mockResolvedValue(null);
      vi.spyOn(svc, "skillsForUser").mockResolvedValue(["React"]);
      vi.spyOn(svc, "teamSkills").mockImplementation(async (teamId: string) =>
        teamId === "team-a" ? ["React"] : ["Go"],
      );

      const result = await svc.teamSuggestions(HACK, USER);

      // team-other-hack belongs to a different hackathon and must not appear.
      expect(result.teams.map((t) => t.teamId)).toEqual(["team-b", "team-a"]);
      expect(result.teams.map((t) => t.score)).toEqual([1, 0]);
      expect(result.teammates.map((t) => t.username)).toEqual(["bob"]);
    });
  });
});
