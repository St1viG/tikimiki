import { describe, expect, it } from "vitest";
import { createHackathonSchema } from "../../src/hackathons/dto";

const valid = {
  title: "Test Hack",
  description: "A described hackathon.",
  type: "virtual" as const,
  startsAt: "2030-01-10T00:00:00.000Z",
  endsAt: "2030-01-12T00:00:00.000Z",
  registrationDeadline: "2030-01-05T00:00:00.000Z",
  maxTeamSize: 4,
};

describe("createHackathonSchema", () => {
  it("accepts a valid body and defaults minTeamSize to 1", () => {
    const r = createHackathonSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.minTeamSize).toBe(1);
  });

  it("rejects date-only (non ISO-8601 datetime) strings", () => {
    expect(
      createHackathonSchema.safeParse({ ...valid, startsAt: "2030-01-10" })
        .success,
    ).toBe(false);
  });

  it("rejects a latitude outside [-90, 90]", () => {
    expect(
      createHackathonSchema.safeParse({ ...valid, latitude: 200, longitude: 10 })
        .success,
    ).toBe(false);
  });

  it("rejects a longitude outside [-180, 180]", () => {
    expect(
      createHackathonSchema.safeParse({ ...valid, latitude: 10, longitude: 999 })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown hackathon type", () => {
    expect(
      createHackathonSchema.safeParse({ ...valid, type: "remote" }).success,
    ).toBe(false);
  });

  it("rejects an empty title", () => {
    expect(createHackathonSchema.safeParse({ ...valid, title: "" }).success).toBe(
      false,
    );
  });

  it("requires maxTeamSize", () => {
    const { maxTeamSize: _omit, ...without } = valid;
    void _omit;
    expect(createHackathonSchema.safeParse(without).success).toBe(false);
  });
});
