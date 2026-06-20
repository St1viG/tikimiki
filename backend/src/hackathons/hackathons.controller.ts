import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../common/zod.pipe";
import {
  addModeratorSchema,
  createHackathonSchema,
  createPrizeSchema,
  updateHackathonSchema,
  updatePrizeSchema,
  updateStatusSchema,
  type AddModeratorInput,
  type CreateHackathonInput,
  type CreatePrizeInput,
  type UpdateHackathonInput,
  type UpdatePrizeInput,
  type UpdateStatusInput,
} from "./dto";
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

  @Get(":id/calendar.ics")
  async getCalendar(
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const ics = await this.hackathons.getCalendar(id);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="hackathon.ics"');
    res.send(ics);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateHackathonSchema)) body: UpdateHackathonInput,
  ) {
    return this.hackathons.update(userId, id, body);
  }

  @Patch(":id/status")
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @CurrentUser() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) body: UpdateStatusInput,
  ) {
    return this.hackathons.updateStatus(userId, id, body);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  remove(
    @CurrentUser() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.hackathons.remove(userId, id);
  }

  @Get(":id/prizes")
  listPrizes(@Param("id", ParseUUIDPipe) id: string) {
    return this.hackathons.listPrizes(id);
  }

  @Post(":id/prizes")
  @UseGuards(JwtAuthGuard)
  createPrize(
    @CurrentUser() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createPrizeSchema)) body: CreatePrizeInput,
  ) {
    return this.hackathons.createPrize(userId, id, body);
  }

  @Patch("prizes/:prizeId")
  @UseGuards(JwtAuthGuard)
  updatePrize(
    @CurrentUser() userId: string,
    @Param("prizeId", ParseUUIDPipe) prizeId: string,
    @Body(new ZodValidationPipe(updatePrizeSchema)) body: UpdatePrizeInput,
  ) {
    return this.hackathons.updatePrize(userId, prizeId, body);
  }

  @Delete("prizes/:prizeId")
  @UseGuards(JwtAuthGuard)
  deletePrize(
    @CurrentUser() userId: string,
    @Param("prizeId", ParseUUIDPipe) prizeId: string,
  ) {
    return this.hackathons.deletePrize(userId, prizeId);
  }

  @Get(":id/moderators")
  @UseGuards(JwtAuthGuard)
  listModerators(@Param("id", ParseUUIDPipe) id: string) {
    return this.hackathons.listModerators(id);
  }

  @Post(":id/moderators")
  @UseGuards(JwtAuthGuard)
  addModerator(
    @CurrentUser() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addModeratorSchema)) body: AddModeratorInput,
  ) {
    return this.hackathons.addModerator(id, userId, body);
  }

  @Delete(":id/moderators/:targetUserId")
  @UseGuards(JwtAuthGuard)
  removeModerator(
    @CurrentUser() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("targetUserId", ParseUUIDPipe) targetUserId: string,
  ) {
    return this.hackathons.removeModerator(id, userId, targetUserId);
  }

  @Get(":id/teams/overview")
  @UseGuards(JwtAuthGuard)
  teamsOverview(
    @CurrentUser() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.hackathons.teamsOverview(id, userId);
  }
}
