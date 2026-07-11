/**
 * Autor: Andrej Colić (2023/0492)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationsController } from "../../src/applications/applications.controller";
import type { ApplicantFilterInput } from "../../src/applications/dto";
import type { ApplicationsService } from "../../src/applications/applications.service";

describe("ApplicationsController (unit)", () => {
  const USER = "user-1";
  const HACK = "hack-1";
  let svc: Record<string, ReturnType<typeof vi.fn>>;
  let controller: ApplicationsController;

  beforeEach(() => {
    svc = {
      create: vi.fn().mockReturnValue({ applicationId: "app-1" }),
      listMine: vi.fn().mockReturnValue([]),
      listForHackathon: vi.fn().mockReturnValue([]),
      approve: vi.fn().mockReturnValue({ status: "approved" }),
      reject: vi.fn().mockReturnValue({ status: "rejected" }),
      withdraw: vi.fn().mockReturnValue({ status: "withdrawn" }),
    };
    controller = new ApplicationsController(svc as unknown as ApplicationsService);
  });

  it("create forwards userId and the body", () => {
    const body = { hackathonId: HACK } as never;
    const result = controller.create(USER, body);
    expect(svc.create).toHaveBeenCalledWith(USER, body);
    expect(result).toEqual({ applicationId: "app-1" });
  });

  it("listMine forwards the current user id", () => {
    controller.listMine(USER);
    expect(svc.listMine).toHaveBeenCalledWith(USER);
  });

  it("listForHackathon forwards hackathonId, userId and the filter query", () => {
    const filter = { sortBy: "github" } as ApplicantFilterInput;
    controller.listForHackathon(USER, HACK, filter);
    expect(svc.listForHackathon).toHaveBeenCalledWith(HACK, USER, filter);
  });

  it("approve forwards applicationId and userId", () => {
    controller.approve(USER, "app-1");
    expect(svc.approve).toHaveBeenCalledWith("app-1", USER);
  });

  it("reject forwards applicationId, userId and the reason body", () => {
    const body = { reason: "Nepotpuno" } as never;
    controller.reject(USER, "app-1", body);
    expect(svc.reject).toHaveBeenCalledWith("app-1", USER, body);
  });

  it("withdraw forwards applicationId, userId and the body", () => {
    const body = {} as never;
    controller.withdraw(USER, "app-1", body);
    expect(svc.withdraw).toHaveBeenCalledWith("app-1", USER, body);
  });
});
