import type { INestApplication } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  hackathons,
  notifications,
  serverRoles,
  servers,
  teamMembers,
  userRoles,
} from "../../src/db/schema";
import { closeTestApp, createTestApp, dbOf } from "../helpers/app";
import {
  createHackathon,
  createTeam,
  registerMember,
  registerOrganization,
} from "../helpers/factories";

describe("applications lifecycle (e2e)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(app);
  });
  const http = () => request(app.getHttpServer());

  // Not async: returns the chainable supertest request so callers can attach
  // `.expect(...)` (an async wrapper would resolve to a plain Promise).
  function apply(token: string, hackathonId: string) {
    return http()
      .post("/api/v1/applications")
      .set("Authorization", `Bearer ${token}`)
      .send({ hackathonId });
  }

  it("lets a member apply, blocks a duplicate, and an organizer approve", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);

    const created = await apply(applicant.token, hk.hackathonId).expect(201);
    expect(created.body.status).toBe("pending");
    const applicationId = created.body.applicationId;

    // A second active application for the same hackathon is a conflict.
    await apply(applicant.token, hk.hackathonId).expect(409);

    // A non-owner cannot approve.
    const stranger = await registerMember(app);
    await http()
      .patch(`/api/v1/applications/${applicationId}/approve`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .expect(403);

    // The organizer can.
    const approved = await http()
      .patch(`/api/v1/applications/${applicationId}/approve`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);
    expect(approved.body.status).toBe("approved");

    // Approval grants the applicant a "Participant" role in the hackathon's
    // cohor server (role-based access follows acceptance).
    const db = dbOf(app);
    const [server] = await db
      .select({ serverId: servers.serverId })
      .from(servers)
      .where(eq(servers.hackathonId, hk.hackathonId));
    expect(server).toBeTruthy();

    const [role] = await db
      .select({ serverRoleId: serverRoles.serverRoleId })
      .from(serverRoles)
      .where(and(eq(serverRoles.serverId, server.serverId), eq(serverRoles.name, "Participant")));
    expect(role).toBeTruthy();

    const [grant] = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(
        and(eq(userRoles.serverRoleId, role.serverRoleId), eq(userRoles.userId, applicant.userId)),
      );
    expect(grant).toBeTruthy();
  });

  it("reflects approvals in the organizer stats", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);

    const created = await apply(applicant.token, hk.hackathonId).expect(201);
    await http()
      .patch(`/api/v1/applications/${created.body.applicationId}/approve`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);

    const stats = await http()
      .get(`/api/v1/applications/hackathon/${hk.hackathonId}/stats`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);
    expect(stats.body.total).toBe(1);
    expect(stats.body.approved).toBe(1);
  });

  it("rejects an application for a non-existent hackathon (404)", async () => {
    const applicant = await registerMember(app);
    await apply(applicant.token, "00000000-0000-4000-8000-000000000000").expect(404);
  });

  // ── SSU-10: apply validations ────────────────────────────────────────────

  it("blocks apply when hackathon status is not upcoming (400)", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);

    await dbOf(app)
      .update(hackathons)
      .set({ status: "ongoing" })
      .where(eq(hackathons.hackathonId, hk.hackathonId));

    await apply(applicant.token, hk.hackathonId).expect(400);
  });

  it("blocks apply when registration deadline has passed (400)", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);

    await dbOf(app)
      .update(hackathons)
      .set({ registrationDeadline: new Date(Date.now() - 1000) })
      .where(eq(hackathons.hackathonId, hk.hackathonId));

    await apply(applicant.token, hk.hackathonId).expect(400);
  });

  it("blocks apply when hackathon is full (400)", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const first = await registerMember(app);
    const second = await registerMember(app);

    await dbOf(app)
      .update(hackathons)
      .set({ maxParticipants: 1 })
      .where(eq(hackathons.hackathonId, hk.hackathonId));

    const created = await apply(first.token, hk.hackathonId).expect(201);
    await http()
      .patch(`/api/v1/applications/${created.body.applicationId}/approve`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);

    await apply(second.token, hk.hackathonId).expect(400);
  });

  // ── SSU-10: withdraw ─────────────────────────────────────────────────────

  it("member can withdraw a pending application (200, status=withdrawn)", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);

    const created = await apply(applicant.token, hk.hackathonId).expect(201);

    const res = await http()
      .patch(`/api/v1/applications/${created.body.applicationId}/withdraw`)
      .set("Authorization", `Bearer ${applicant.token}`)
      .send({})
      .expect(200);
    expect(res.body.status).toBe("withdrawn");
  });

  it("member can withdraw an approved application (200, status=withdrawn)", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);

    const created = await apply(applicant.token, hk.hackathonId).expect(201);
    await http()
      .patch(`/api/v1/applications/${created.body.applicationId}/approve`)
      .set("Authorization", `Bearer ${org.token}`)
      .expect(200);

    const res = await http()
      .patch(`/api/v1/applications/${created.body.applicationId}/withdraw`)
      .set("Authorization", `Bearer ${applicant.token}`)
      .send({})
      .expect(200);
    expect(res.body.status).toBe("withdrawn");
  });

  it("member can re-apply after withdrawing", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);

    const first = await apply(applicant.token, hk.hackathonId).expect(201);
    await http()
      .patch(`/api/v1/applications/${first.body.applicationId}/withdraw`)
      .set("Authorization", `Bearer ${applicant.token}`)
      .send({})
      .expect(200);

    const second = await apply(applicant.token, hk.hackathonId).expect(201);
    expect(second.body.status).toBe("pending");
  });

  it("stranger cannot withdraw another member's application (403)", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);
    const stranger = await registerMember(app);

    const created = await apply(applicant.token, hk.hackathonId).expect(201);

    await http()
      .patch(`/api/v1/applications/${created.body.applicationId}/withdraw`)
      .set("Authorization", `Bearer ${stranger.token}`)
      .send({})
      .expect(403);
  });

  it("cannot withdraw a rejected application (400)", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);

    const created = await apply(applicant.token, hk.hackathonId).expect(201);
    await http()
      .patch(`/api/v1/applications/${created.body.applicationId}/reject`)
      .set("Authorization", `Bearer ${org.token}`)
      .send({ reason: "no spots" })
      .expect(200);

    await http()
      .patch(`/api/v1/applications/${created.body.applicationId}/withdraw`)
      .set("Authorization", `Bearer ${applicant.token}`)
      .send({})
      .expect(400);
  });

  it("withdraw on non-existent application returns 404", async () => {
    const applicant = await registerMember(app);
    await http()
      .patch("/api/v1/applications/00000000-0000-4000-8000-000000000000/withdraw")
      .set("Authorization", `Bearer ${applicant.token}`)
      .send({})
      .expect(404);
  });

  it("double withdraw returns 400 not 404", async () => {
    const org = await registerOrganization(app);
    const hk = await createHackathon(app, org);
    const applicant = await registerMember(app);

    const created = await apply(applicant.token, hk.hackathonId).expect(201);
    await http()
      .patch(`/api/v1/applications/${created.body.applicationId}/withdraw`)
      .set("Authorization", `Bearer ${applicant.token}`)
      .send({})
      .expect(200);

    // Second withdraw: application is already withdrawn → 400, not 404.
    await http()
      .patch(`/api/v1/applications/${created.body.applicationId}/withdraw`)
      .set("Authorization", `Bearer ${applicant.token}`)
      .send({})
      .expect(400);
  });

  // ── SSU-10: team application ─────────────────────────────────────────────

  describe("POST /applications/team", () => {
    it("creates pending applications for every active team member", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const leader = await registerMember(app);
      const member2 = await registerMember(app);
      const team = await createTeam(app, hk.hackathonId, leader);

      await dbOf(app)
        .insert(teamMembers)
        .values({ teamId: team.teamId, userId: member2.userId, role: "member" });

      const res = await http()
        .post("/api/v1/applications/team")
        .set("Authorization", `Bearer ${leader.token}`)
        .send({ hackathonId: hk.hackathonId, teamId: team.teamId })
        .expect(201);

      expect(res.body).toHaveLength(2);
      expect((res.body as { status: string }[]).every((a) => a.status === "pending")).toBe(true);
      expect((res.body as { teamId: string }[]).every((a) => a.teamId === team.teamId)).toBe(true);
    });

    it("relinks a member's pre-existing application to this team instead of skipping it", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const leader = await registerMember(app);
      const member2 = await registerMember(app);
      const team = await createTeam(app, hk.hackathonId, leader);

      await dbOf(app)
        .insert(teamMembers)
        .values({ teamId: team.teamId, userId: member2.userId, role: "member" });

      // Leader individually applies first (application.teamId is null).
      await apply(leader.token, hk.hackathonId).expect(201);

      // Team apply: member2 gets a new application, leader's existing one is
      // relinked to this team rather than left orphaned.
      const res = await http()
        .post("/api/v1/applications/team")
        .set("Authorization", `Bearer ${leader.token}`)
        .send({ hackathonId: hk.hackathonId, teamId: team.teamId })
        .expect(201);

      expect(res.body).toHaveLength(2);
      expect((res.body as { teamId: string }[]).every((a) => a.teamId === team.teamId)).toBe(true);
    });

    it("returns empty array when every member's application is already linked to this team", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const leader = await registerMember(app);
      const team = await createTeam(app, hk.hackathonId, leader);

      await http()
        .post("/api/v1/applications/team")
        .set("Authorization", `Bearer ${leader.token}`)
        .send({ hackathonId: hk.hackathonId, teamId: team.teamId })
        .expect(201);

      const res = await http()
        .post("/api/v1/applications/team")
        .set("Authorization", `Bearer ${leader.token}`)
        .send({ hackathonId: hk.hackathonId, teamId: team.teamId })
        .expect(201);

      expect(res.body).toHaveLength(0);
    });

    it("returns 403 when caller is not a team member", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const leader = await registerMember(app);
      const outsider = await registerMember(app);
      const team = await createTeam(app, hk.hackathonId, leader);

      await http()
        .post("/api/v1/applications/team")
        .set("Authorization", `Bearer ${outsider.token}`)
        .send({ hackathonId: hk.hackathonId, teamId: team.teamId })
        .expect(403);
    });

    it("returns 400 when hackathon is not upcoming", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const leader = await registerMember(app);
      const team = await createTeam(app, hk.hackathonId, leader);

      await dbOf(app)
        .update(hackathons)
        .set({ status: "ongoing" })
        .where(eq(hackathons.hackathonId, hk.hackathonId));

      await http()
        .post("/api/v1/applications/team")
        .set("Authorization", `Bearer ${leader.token}`)
        .send({ hackathonId: hk.hackathonId, teamId: team.teamId })
        .expect(400);
    });
  });

  describe("required application questions", () => {
    async function addQuestion(
      org: { token: string },
      hackathonId: string,
      required: boolean,
    ): Promise<string> {
      const res = await http()
        .post(`/api/v1/applications/hackathon/${hackathonId}/questions`)
        .set("Authorization", `Bearer ${org.token}`)
        .send({ prompt: "Zašto želiš da učestvuješ?", type: "short_text", required })
        .expect(201);
      return (res.body as { questionId: string }).questionId;
    }

    it("blocks apply when a required question has no answer (400)", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      await addQuestion(org, hk.hackathonId, true);
      const applicant = await registerMember(app);

      await apply(applicant.token, hk.hackathonId).expect(400);
    });

    it("blocks apply when a required answer is blank (400)", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const questionId = await addQuestion(org, hk.hackathonId, true);
      const applicant = await registerMember(app);

      await http()
        .post("/api/v1/applications")
        .set("Authorization", `Bearer ${applicant.token}`)
        .send({ hackathonId: hk.hackathonId, answers: [{ questionId, answer: "   " }] })
        .expect(400);
    });

    it("lets a member apply once every required question is answered", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const questionId = await addQuestion(org, hk.hackathonId, true);
      const applicant = await registerMember(app);

      const res = await http()
        .post("/api/v1/applications")
        .set("Authorization", `Bearer ${applicant.token}`)
        .send({ hackathonId: hk.hackathonId, answers: [{ questionId, answer: "Zbog iskustva." }] })
        .expect(201);
      expect(res.body.status).toBe("pending");
    });

    it("does not require an answer to an optional question", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      await addQuestion(org, hk.hackathonId, false);
      const applicant = await registerMember(app);

      await apply(applicant.token, hk.hackathonId).expect(201);
    });

    it("rejects an answer to another hackathon's question (400)", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const otherHk = await createHackathon(app, org);
      const foreignQuestionId = await addQuestion(org, otherHk.hackathonId, false);
      const applicant = await registerMember(app);

      await http()
        .post("/api/v1/applications")
        .set("Authorization", `Bearer ${applicant.token}`)
        .send({
          hackathonId: hk.hackathonId,
          answers: [{ questionId: foreignQuestionId, answer: "x" }],
        })
        .expect(400);
    });

    it("blocks team apply when a required question has no answer (400)", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      await addQuestion(org, hk.hackathonId, true);
      const leader = await registerMember(app);
      const team = await createTeam(app, hk.hackathonId, leader);

      await http()
        .post("/api/v1/applications/team")
        .set("Authorization", `Bearer ${leader.token}`)
        .send({ hackathonId: hk.hackathonId, teamId: team.teamId })
        .expect(400);
    });

    it("team apply succeeds when required questions are answered", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const questionId = await addQuestion(org, hk.hackathonId, true);
      const leader = await registerMember(app);
      const team = await createTeam(app, hk.hackathonId, leader);

      const res = await http()
        .post("/api/v1/applications/team")
        .set("Authorization", `Bearer ${leader.token}`)
        .send({
          hackathonId: hk.hackathonId,
          teamId: team.teamId,
          answers: [{ questionId, answer: "Tim spreman za rad." }],
        })
        .expect(201);
      expect(res.body).toHaveLength(1);
    });
  });

  // ── SSU-10: calendar export ──────────────────────────────────────────────

  describe("GET /hackathons/:id/calendar.ics", () => {
    it("returns iCal with correct Content-Type and event fields", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);

      const res = await http().get(`/api/v1/hackathons/${hk.hackathonId}/calendar.ics`).expect(200);

      expect(res.headers["content-type"]).toMatch(/text\/calendar/);
      expect(res.text).toContain("BEGIN:VCALENDAR");
      expect(res.text).toContain("BEGIN:VEVENT");
      expect(res.text).toContain("DTSTART");
      expect(res.text).toContain("DTEND");
      expect(res.text).toContain("END:VEVENT");
    });

    it("returns 404 for a non-existent hackathon", async () => {
      await http()
        .get("/api/v1/hackathons/00000000-0000-4000-8000-000000000000/calendar.ics")
        .expect(404);
    });
  });

  // ── SSU-10: org notifications ────────────────────────────────────────────

  describe("org notifications on new applications", () => {
    it("individual apply stores a new_application notification for the organizer", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const applicant = await registerMember(app);

      await apply(applicant.token, hk.hackathonId).expect(201);

      // Fire-and-forget: give the notification time to commit.
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const notifs = await dbOf(app)
        .select({ type: notifications.type })
        .from(notifications)
        .where(
          and(eq(notifications.userId, org.userId), eq(notifications.type, "new_application")),
        );

      expect(notifs.length).toBeGreaterThan(0);
    });

    it("team apply stores a new_application notification for the organizer", async () => {
      const org = await registerOrganization(app);
      const hk = await createHackathon(app, org);
      const leader = await registerMember(app);
      const team = await createTeam(app, hk.hackathonId, leader);

      await http()
        .post("/api/v1/applications/team")
        .set("Authorization", `Bearer ${leader.token}`)
        .send({ hackathonId: hk.hackathonId, teamId: team.teamId })
        .expect(201);

      // Fire-and-forget: give the notification time to commit.
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      const notifs = await dbOf(app)
        .select({ type: notifications.type })
        .from(notifications)
        .where(
          and(eq(notifications.userId, org.userId), eq(notifications.type, "new_application")),
        );

      expect(notifs.length).toBeGreaterThan(0);
    });
  });
});
