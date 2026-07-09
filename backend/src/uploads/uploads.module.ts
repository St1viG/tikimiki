import { Module } from "@nestjs/common";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { MediaUploadController, UploadsController } from "./uploads.controller";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [SubscriptionsModule],
  controllers: [UploadsController, MediaUploadController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
