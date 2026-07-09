import { beforeEach, describe, expect, it, vi } from "vitest";
import { HackathonsController } from "../../src/hackathons/hackathons.controller";
import type { HackathonsService } from "../../src/hackathons/hackathons.service";

describe("HackathonsController (unit)", () => {
  const USER = "user-1";
  const HACK = "hack-1";
  let svc: Record<string, ReturnType<typeof vi.fn>>;
  let controller: HackathonsController;

  beforeEach(() => {
    svc = {
      list: vi.fn().mockReturnValue(["h1"]),
      create: vi.fn().mockReturnValue({ hackathonId: HACK }),
      getById: vi.fn().mockReturnValue({ hackathonId: HACK }),
      update: vi.fn().mockReturnValue({ hackathonId: HACK, title: "Novi" }),
      updateStatus: vi.fn().mockReturnValue({ status: "ongoing" }),
      remove: vi.fn().mockReturnValue({ success: true }),
    };
    controller = new HackathonsController(svc as unknown as HackathonsService);
  });

  it("list needs no auth and returns all hackathons", () => {
    expect(controller.list()).toEqual(["h1"]);
    expect(svc.list).toHaveBeenCalledOnce();
  });

  it("create forwards the organizer id and the body", () => {
    const body = { title: "Hack", type: "virtual" } as never;
    controller.create(USER, body);
    expect(svc.create).toHaveBeenCalledWith(USER, body);
  });

  it("getOne forwards only the id (public read)", () => {
    controller.getOne(HACK);
    expect(svc.getById).toHaveBeenCalledWith(HACK);
  });

  it("update forwards userId, id and the patch body", () => {
    const body = { title: "Novi" } as never;
    const result = controller.update(USER, HACK, body);
    expect(svc.update).toHaveBeenCalledWith(USER, HACK, body);
    expect(result).toEqual({ hackathonId: HACK, title: "Novi" });
  });

  it("updateStatus forwards userId, id and the status body", () => {
    const body = { status: "ongoing" } as never;
    controller.updateStatus(USER, HACK, body);
    expect(svc.updateStatus).toHaveBeenCalledWith(USER, HACK, body);
  });

  it("remove forwards userId and id", () => {
    controller.remove(USER, HACK);
    expect(svc.remove).toHaveBeenCalledWith(USER, HACK);
  });
});
