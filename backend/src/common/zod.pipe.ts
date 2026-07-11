/**
 * Autor: Nenad Skoković (2023/0039)
 */
import { BadRequestException, PipeTransform } from "@nestjs/common";
import type { ZodType, ZodTypeDef } from "zod";

/**
 * Validates/parses the incoming payload against a Zod schema. Input is
 * intentionally left as `unknown` (rather than pinned to `T`) — a raw
 * querystring/body rarely matches its schema's parsed *output* type (e.g. a
 * `.transform()` or `.default()` field), and `safeParse` only cares about the
 * runtime value, not this compile-time parameter.
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: "Validation failed",
        errors: result.error.flatten(),
      });
    }
    return result.data;
  }
}
