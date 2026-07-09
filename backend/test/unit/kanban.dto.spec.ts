import { describe, expect, it } from "vitest";
import {
  createCardSchema,
  createColumnSchema,
  reorderColumnsSchema,
  updateCardSchema,
} from "../../src/kanban/dto";

const UUID = "22222222-2222-2222-2222-222222222222";

describe("createCardSchema", () => {
  it("accepts a card with a column id and a title", () => {
    const r = createCardSchema.safeParse({ columnId: UUID, title: "Zadatak" });
    expect(r.success).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(createCardSchema.safeParse({ columnId: UUID, title: "" }).success).toBe(false);
  });

  it("rejects a non-UUID column id", () => {
    expect(createCardSchema.safeParse({ columnId: "col-1", title: "x" }).success).toBe(false);
  });

  it("rejects a title longer than 200 characters", () => {
    expect(createCardSchema.safeParse({ columnId: UUID, title: "a".repeat(201) }).success).toBe(
      false,
    );
  });
});

describe("updateCardSchema", () => {
  it("accepts a single-field update (move to another column)", () => {
    expect(updateCardSchema.safeParse({ columnId: UUID }).success).toBe(true);
  });

  it("allows unassigning a card with assignedTo: null", () => {
    expect(updateCardSchema.safeParse({ assignedTo: null }).success).toBe(true);
  });

  it("rejects an empty patch (no field provided)", () => {
    expect(updateCardSchema.safeParse({}).success).toBe(false);
  });

  it("rejects a negative position", () => {
    expect(updateCardSchema.safeParse({ position: -1 }).success).toBe(false);
  });
});

describe("createColumnSchema", () => {
  it("accepts a named column", () => {
    expect(createColumnSchema.safeParse({ name: "U toku" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createColumnSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("reorderColumnsSchema", () => {
  it("accepts a non-empty ordered list", () => {
    const r = reorderColumnsSchema.safeParse({
      columns: [{ columnId: UUID, position: 0 }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty column list", () => {
    expect(reorderColumnsSchema.safeParse({ columns: [] }).success).toBe(false);
  });

  it("rejects a negative position", () => {
    expect(
      reorderColumnsSchema.safeParse({
        columns: [{ columnId: UUID, position: -3 }],
      }).success,
    ).toBe(false);
  });
});
