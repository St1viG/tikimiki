import { beforeEach, describe, expect, it, vi } from "vitest";
import { KanbanController } from "../../src/kanban/kanban.controller";
import type { KanbanService } from "../../src/kanban/kanban.service";

describe("KanbanController (unit)", () => {
  const USER = "user-1";
  const TEAM = "team-1";
  let kanban: Record<string, ReturnType<typeof vi.fn>>;
  let controller: KanbanController;

  beforeEach(() => {
    kanban = {
      getBoard: vi.fn().mockReturnValue({ columns: [] }),
      createCard: vi.fn().mockReturnValue({ cardId: "card-1" }),
      updateCard: vi.fn().mockReturnValue({ cardId: "card-1", position: 2 }),
      deleteCard: vi.fn().mockReturnValue({ success: true }),
      createColumn: vi.fn().mockReturnValue({ columnId: "col-1" }),
      reorderColumns: vi.fn().mockReturnValue([]),
    };
    controller = new KanbanController(kanban as unknown as KanbanService);
  });

  it("getBoard forwards teamId and userId", () => {
    const result = controller.getBoard(USER, TEAM);
    expect(kanban.getBoard).toHaveBeenCalledWith(TEAM, USER);
    expect(result).toEqual({ columns: [] });
  });

  it("createCard forwards teamId, userId and the whole body", () => {
    const body = { columnId: "col-1", title: "Zadatak" } as never;
    controller.createCard(USER, TEAM, body);
    expect(kanban.createCard).toHaveBeenCalledWith(TEAM, USER, body);
  });

  it("updateCard forwards cardId, userId and the body (e.g. move)", () => {
    const body = { columnId: "col-2" } as never;
    const result = controller.updateCard(USER, "card-1", body);
    expect(kanban.updateCard).toHaveBeenCalledWith("card-1", USER, body);
    expect(result).toEqual({ cardId: "card-1", position: 2 });
  });

  it("deleteCard forwards cardId and userId", () => {
    controller.deleteCard(USER, "card-1");
    expect(kanban.deleteCard).toHaveBeenCalledWith("card-1", USER);
  });

  it("reorderColumns forwards teamId, userId and the body", () => {
    const body = { columns: [{ columnId: "col-1", position: 0 }] } as never;
    controller.reorderColumns(USER, TEAM, body);
    expect(kanban.reorderColumns).toHaveBeenCalledWith(TEAM, USER, body);
  });
});
