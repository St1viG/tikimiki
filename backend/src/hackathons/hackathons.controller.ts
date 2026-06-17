import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import { createHackathonSchema, type CreateHackathonInput } from "./dto";
import { HackathonsService } from "./hackathons.service";

@Controller("hackathons")
export class HackathonsController {
  constructor(private readonly hackathons: HackathonsService) {}

  @Get()
  list() {
    return this.hackathons.list();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createHackathonSchema))
    body: CreateHackathonInput,
  ) {
    return this.hackathons.create(userId, body);
  }

  @Get(":id")
  getOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.hackathons.getById(id);
  }
}
