/**
 * Autor: Stevan Gnjato (2023/0141)
 */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { memberSkills, skills } from "../../src/db/schema";
import { closeTestApp, createTestApp, dbOf } from "../helpers/app";
import {
  createHackathon,
  registerMember,
  registerOrganization,
  uniqueId,
  type TestUser,
} from "../helpers/factories";

/**
 * Integracioni test Dimitrijevog matching modula (D01–D06) kroz pravi HTTP
 * sloj i bazu: `GET /hackathons/:id/team-suggestions` mora da vrati slobodne
 * igrače hakatona rangirane po komplementarnosti veština u odnosu na
 * pozivaoca, a hakaton bez slobodnih igrača prazan (ne 500) odgovor.
 */
describe("team suggestions (e2e)", () => {
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

  /** Prijava člana na hakaton kroz pravi API (postaje slobodan igrač). */
  async function apply(user: TestUser, hackathonId: string): Promise<void> {
    await http()
      .post("/api/v1/applications")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ hackathonId })
      .expect(201);
  }

  function suggestionsFor(user: TestUser, hackathonId: string) {
    return http()
      .get(`/api/v1/hackathons/${hackathonId}/team-suggestions`)
      .set("Authorization", `Bearer ${user.token}`);
  }

  it("ranks free agents by skill complementarity and covers the required skill set", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);

    // Skup veština koji hakaton "traži" — jedinstvena imena po test-runu da
    // se predlozi ne mešaju sa postojećim podacima u bazi.
    const TS = `typescript-${uniqueId("s")}`;
    const REACT = `react-${uniqueId("s")}`;
    const NODE = `node-${uniqueId("s")}`;
    const required = [TS, REACT, NODE];

    // Pozivalac pokriva TS; slobodni igrači različito dopunjuju ostatak.
    const caller = await registerMember(app);
    await giveSkills(caller, [TS]);
    const agentFull = await registerMember(app); // +REACT +NODE → skor 2
    await giveSkills(agentFull, [REACT, NODE]);
    const agentPartial = await registerMember(app); // +REACT → skor 1
    await giveSkills(agentPartial, [REACT]);
    const agentOverlap = await registerMember(app); // samo TS (dupla) → skor 0
    await giveSkills(agentOverlap, [TS]);
    // Član sa savršenim veštinama koji se NIJE prijavio — ne sme u predloge.
    const outsider = await registerMember(app);
    await giveSkills(outsider, [REACT, NODE]);

    for (const member of [caller, agentFull, agentPartial, agentOverlap]) {
      await apply(member, hk.hackathonId);
    }

    const res = await suggestionsFor(caller, hk.hackathonId).expect(200);
    const teammates: Array<{ username: string; skills: string[]; score: number }> =
      res.body.teammates;

    // Rangirano opadajuće po skoru komplementarnosti (D03), pozivalac i
    // neprijavljeni član su isključeni.
    expect(teammates.map((t) => t.username)).toEqual([
      agentFull.username,
      agentPartial.username,
      agentOverlap.username,
    ]);
    expect(teammates.map((t) => t.score)).toEqual([2, 1, 0]);
    const scores = teammates.map((t) => t.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    // Najbolji predlog zajedno sa pozivaocem pokriva ceo traženi skup
    // veština, bez preklapanja (skor = broj veština koje pozivalac nema).
    const combined = new Set([TS, ...teammates[0].skills]);
    for (const skill of required) expect(combined.has(skill)).toBe(true);

    // Nema timova u ovom hakatonu → nema ni predloga timova.
    expect(res.body.teams).toEqual([]);
  });

  it("returns an empty suggestion list (not a 500) when the hackathon has no free agents", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);

    // Jedini prijavljeni je pozivalac — za njega nema slobodnih igrača.
    const caller = await registerMember(app);
    await apply(caller, hk.hackathonId);

    const res = await suggestionsFor(caller, hk.hackathonId).expect(200);
    expect(res.body).toEqual({ teammates: [], teams: [] });
  });
});
