import { describe, it, expect } from "vitest";
import { provetConsultationItemRawSchema } from "./provetApi";

describe("provetConsultationItemRawSchema", () => {
  it("reads usage_size, usage_type, type_code and is_dispense_fee_item when present", () => {
    const raw = {
      consultation: "C-1",
      patient: "P-1",
      code: "MED-01",
      name: "Amoxicilina",
      quantity: 0.028,
      price: 50000,
      type_code: 2,
      usage_size: 2,
      usage_type: 1,
      is_dispense_fee_item: false,
    };
    const parsed = provetConsultationItemRawSchema.parse(raw);
    expect(parsed.type_code).toBe(2);
    expect(parsed.usage_size).toBe(2);
    expect(parsed.usage_type).toBe(1);
    expect(parsed.is_dispense_fee_item).toBe(false);
  });

  it("defaults the new fields safely when Provet omits them (package-based items)", () => {
    const raw = { consultation: "C-1", patient: "P-1", code: "SERV-01", name: "Consulta", quantity: 1, price: 80000 };
    const parsed = provetConsultationItemRawSchema.parse(raw);
    expect(parsed.type_code).toBeNull();
    expect(parsed.usage_size).toBeNull();
    expect(parsed.usage_type).toBeNull();
    expect(parsed.is_dispense_fee_item).toBe(false);
  });
});