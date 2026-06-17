import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import {
  createReportSchema,
  listReportsQuerySchema,
  resolveReportSchema,
  type CreateReportInput,
  type ListReportsQuery,
  type ResolveReportInput,
} from "./dto";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createReportSchema)) body: CreateReportInput,
  ) {
    return this.reports.create(userId, body);
  }

  @Get()
  list(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(listReportsQuerySchema))
    query: ListReportsQuery,
  ) {
    return this.reports.list(userId, query);
  }

  @Post(":id/resolve")
  resolve(
    @CurrentUser() userId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(resolveReportSchema)) body: ResolveReportInput,
  ) {
    return this.reports.resolve(userId, id, body);
  }
}
