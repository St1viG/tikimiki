import { Module } from "@nestjs/common";
import {
  MediaUploadController,
  UploadsController,
} from "./uploads.controller";
import { UploadsService } from "./uploads.service";

@Module({
  controllers: [UploadsController, MediaUploadController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
