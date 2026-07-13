/**
 * Autor: Nenad Skoković (2023/0039)
 *
 * Endpoint testovi za `GET /hackathons/:id/team-suggestions` (NT06). Postojeći
 * testovi pokrivaju logiku servisa (unit) i srećan put rangiranja slobodnih
 * igrača (matching.e2e); ovde se kroz pravi HTTP sloj proverava ponašanje same
 * rute: autentifikacija i validacija parametra, grana kada je pozivalac već u
 * timu (rangiranje prema veštinama TIMA), predlozi otvorenih timova, limit
 * broja predloga i isključenje povučenih prijava.
 */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memberSkills, skills, teamMembers } from "../../src/db/schema";
import { closeTestApp, createTestApp, dbOf } from "../helpers/app";
import {
  createHackathon,
  createTeam,
  registerMember,
  registerOrganization,
  uniqueId,
  type TestUser,
} from "../helpers/factories";

describe("team suggestions endpoint (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  /** Upiši veštine (kreira redove u `skills` po potrebi) i dodeli ih članu. */
  async function giveSkills(user: TestUser, names: string[]): Promise<void> {
    const db = dbOf(app);
    await db
      .insert(skills)
      .values(names.map((name) => ({ name })))
      .onConflictDoNothing();
    const rows = await db.select({ skillId: skills.skillId, name: skills.name }).from(skills);
    const byName = new Map(rows.map((r) => [r.name, r.skillId]));
    await db.insert(memberSkills).values(
      names.map((name) => ({
        userId: user.userId,
        skillId: byName.get(name)!,
      })),
    );
  }

  /** Prijava člana na hakaton kroz pravi API; vraća id prijave. */
  async function apply(user: TestUser, hackathonId: string): Promise<string> {
    const res = await http()
      .post("/api/v1/applications")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ hackathonId })
      .expect(201);
    return res.body.applicationId as string;
  }

  /** Ubaci postojećeg člana u tim direktno kroz bazu (uloga `member`). */
  async function addTeamMember(teamId: string, user: TestUser): Promise<void> {
    await dbOf(app).insert(teamMembers).values({ teamId, userId: user.userId, role: "member" });
  }

  function suggestionsFor(user: TestUser, hackathonId: string) {
    return http()
      .get(`/api/v1/hackathons/${hackathonId}/team-suggestions`)
      .set("Authorization", `Bearer ${user.token}`);
  }

  it("rejects an unauthenticated request (401)", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    await http().get(`/api/v1/hackathons/${hk.hackathonId}/team-suggestions`).expect(401);
  });

  it("rejects a malformed hackathon id (400 from the UUID pipe)", async () => {
    const caller = await registerMember(app);
    await http()
      .get("/api/v1/hackathons/not-a-uuid/team-suggestions")
      .set("Authorization", `Bearer ${caller.token}`)
      .expect(400);
  });

  it("returns empty lists (not a 404/500) for a nonexistent hackathon", async () => {
    const caller = await registerMember(app);
    const res = await suggestionsFor(caller, "00000000-0000-4000-8000-000000000000").expect(200);
    expect(res.body).toEqual({ teammates: [], teams: [] });
  });

  it("ranks suggestions against the caller's TEAM skills once they join a team", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);

    const A = `skill-a-${uniqueId("s")}`;
    const B = `skill-b-${uniqueId("s")}`;
    const C = `skill-c-${uniqueId("s")}`;

    // Pozivalac (A) i saigrač (B) čine aktivan tim → tim pokriva {A, B}.
    const caller = await registerMember(app);
    await giveSkills(caller, [A]);
    const mate = await registerMember(app);
    await giveSkills(mate, [B]);
    const team = await createTeam(app, hk.hackathonId, caller);
    await addTeamMember(team.teamId, mate);

    // Slobodni igrači: B je timu višak (skor 0), C dopunjuje tim (skor 1).
    const agentB = await registerMember(app);
    await giveSkills(agentB, [B]);
    const agentC = await registerMember(app);
    await giveSkills(agentC, [C]);
    await apply(agentB, hk.hackathonId);
    await apply(agentC, hk.hackathonId);

    const res = await suggestionsFor(caller, hk.hackathonId).expect(200);
    const teammates: Array<{ username: string; score: number }> = res.body.teammates;

    // Prema veštinama TIMA {A, B} skorovi su [1, 0]; prema veštinama samog
    // pozivaoca {A} bili bi izjednačeni [1, 1] — ovim se dokazuje grana tima.
    expect(teammates.map((t) => t.username)).toEqual([agentC.username, agentB.username]);
    expect(teammates.map((t) => t.score)).toEqual([1, 0]);

    // Pozivalac u timu ne dobija predloge timova za priključenje.
    expect(res.body.teams).toEqual([]);
  });

  it("suggests only this hackathon's open teams, ranked by what the caller adds", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org, { maxTeamSize: 2 });
    const otherHk = await createHackathon(app, org, { maxTeamSize: 2 });

    const X = `skill-x-${uniqueId("s")}`;
    const Y = `skill-y-${uniqueId("s")}`;

    const caller = await registerMember(app);
    await giveSkills(caller, [X]);

    // Otvoren tim čiji lider već pokriva X → pozivalac ne dodaje ništa (0).
    const leaderCovered = await registerMember(app);
    await giveSkills(leaderCovered, [X]);
    const coveredTeam = await createTeam(app, hk.hackathonId, leaderCovered, "aa-covered");

    // Otvoren tim koji pokriva samo Y → pozivalac dodaje X (skor 1).
    const leaderGap = await registerMember(app);
    await giveSkills(leaderGap, [Y]);
    const gapTeam = await createTeam(app, hk.hackathonId, leaderGap, "bb-gap");

    // Pun tim (2/2) ne sme u predloge.
    const leaderFull = await registerMember(app);
    const fullTeam = await createTeam(app, hk.hackathonId, leaderFull, "cc-full");
    const filler = await registerMember(app);
    await addTeamMember(fullTeam.teamId, filler);

    // Otvoren tim DRUGOG hakatona ne sme u predloge za ovaj.
    const leaderElsewhere = await registerMember(app);
    const otherTeam = await createTeam(app, otherHk.hackathonId, leaderElsewhere, "dd-other");

    const res = await suggestionsFor(caller, hk.hackathonId).expect(200);
    const teams: Array<{ teamId: string; score: number }> = res.body.teams;

    expect(teams.map((t) => t.teamId)).toEqual([gapTeam.teamId, coveredTeam.teamId]);
    expect(teams.map((t) => t.score)).toEqual([1, 0]);
    const ids = teams.map((t) => t.teamId);
    expect(ids).not.toContain(fullTeam.teamId);
    expect(ids).not.toContain(otherTeam.teamId);
  });

  it("caps teammate suggestions at 10", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const caller = await registerMember(app);

    const S = `skill-cap-${uniqueId("s")}`;
    for (let i = 0; i < 11; i += 1) {
      const agent = await registerMember(app);
      await giveSkills(agent, [S]);
      await apply(agent, hk.hackathonId);
    }

    const res = await suggestionsFor(caller, hk.hackathonId).expect(200);
    expect(res.body.teammates).toHaveLength(10);
  });

  it("drops an applicant from suggestions after they withdraw the application", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const caller = await registerMember(app);

    const stays = await registerMember(app);
    await apply(stays, hk.hackathonId);
    const leaves = await registerMember(app);
    const leavesApplicationId = await apply(leaves, hk.hackathonId);

    // Pre povlačenja: oba prijavljena člana su u predlozima.
    let res = await suggestionsFor(caller, hk.hackathonId).expect(200);
    let usernames = res.body.teammates.map((t: { username: string }) => t.username);
    expect(usernames).toContain(stays.username);
    expect(usernames).toContain(leaves.username);

    await http()
      .patch(`/api/v1/applications/${leavesApplicationId}/withdraw`)
      .set("Authorization", `Bearer ${leaves.token}`)
      .send({})
      .expect(200);

    res = await suggestionsFor(caller, hk.hackathonId).expect(200);
    usernames = res.body.teammates.map((t: { username: string }) => t.username);
    expect(usernames).toContain(stays.username);
    expect(usernames).not.toContain(leaves.username);
  });
});
