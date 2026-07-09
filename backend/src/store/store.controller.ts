import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { createMerchOrderSchema, type CreateMerchOrderInput } from "./dto";
import { StoreService } from "./store.service";

@Controller("store")
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get("cosmetics")
  listCosmetics() {
    return this.store.listCosmetics();
  }

  @Get("merch")
  listMerch() {
    return this.store.listMerch();
  }

  @Get("me/inventory")
  @UseGuards(JwtAuthGuard)
  inventory(@CurrentUser() userId: string) {
    return this.store.getInventory(userId);
  }

  @Post("cosmetics/:cosmeticId/buy")
  @UseGuards(JwtAuthGuard)
  buyCosmetic(
    @CurrentUser() userId: string,
    @Param("cosmeticId", ParseUUIDPipe) cosmeticId: string,
  ) {
    return this.store.buyCosmetic(userId, cosmeticId);
  }

  @Post("merch/:merchId/order")
  @UseGuards(JwtAuthGuard)
  orderMerch(
    @CurrentUser() userId: string,
    @Param("merchId", ParseUUIDPipe) merchId: string,
    @Body(new ZodValidationPipe(createMerchOrderSchema))
    body: CreateMerchOrderInput,
  ) {
    return this.store.createMerchOrder(userId, merchId, body);
  }
}
