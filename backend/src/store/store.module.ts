import { Module } from "@nestjs/common";
import { PointsService } from "../common/points.service";
import { StoreController } from "./store.controller";
import { StoreService } from "./store.service";

@Module({
  controllers: [StoreController],
  providers: [StoreService, PointsService],
})
export class StoreModule {}
