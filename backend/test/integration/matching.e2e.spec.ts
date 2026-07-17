/**
 * Autor: Stevan Gnjato (2023/0141)
 */
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestApp, createTestApp } from "../helpers/app";
import {
  createHackathon,
  registerMember,
  registerOrganization,
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
