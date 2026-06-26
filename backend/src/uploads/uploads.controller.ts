import {
  BadRequestException,
  Controller,
  Delete,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { UploadedImage } from "./dto";
import { UploadsService } from "./uploads.service";

/**
 * multer's fileFilter callback signature. Declared locally because
 * `@types/multer` is not installed, so the ambient `Express.Multer`
 * namespace is unavailable.
 */
type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

/** Reject any upload whose MIME type is not an image. */
function imageOnlyFilter(
  _req: unknown,
  file: { mimetype: string },
  cb: FileFilterCallback,
): void {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new BadRequestException("Only image files are allowed"), false);
  }
}

/** Accept images and videos (post media). */
function mediaFilter(
  _req: unknown,
  file: { mimetype: string },
  cb: FileFilterCallback,
): void {
  if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new BadRequestException("Only image or video files are allowed"), false);
  }
}

@Controller("users/me")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /* ── avatar ───────────────────────────────────────────────── */

  @Post("avatar")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: imageOnlyFilter,
    }),
  )
  uploadAvatar(
    @CurrentUser() userId: string,
    @UploadedFile() file: UploadedImage,
  ) {
    return this.uploads.setAvatar(userId, file);
  }

  @Delete("avatar")
  @UseGuards(JwtAuthGuard)
  deleteAvatar(@CurrentUser() userId: string) {
    return this.uploads.deleteAvatar(userId);
  }

  /* ── banner ───────────────────────────────────────────────── */

  @Post("banner")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: imageOnlyFilter,
    }),
  )
  uploadBanner(
    @CurrentUser() userId: string,
    @UploadedFile() file: UploadedImage,
  ) {
    return this.uploads.setBanner(userId, file);
  }

  @Delete("banner")
  @UseGuards(JwtAuthGuard)
  deleteBanner(@CurrentUser() userId: string) {
    return this.uploads.deleteBanner(userId);
  }
}

@Controller("uploads")
export class MediaUploadController {
  constructor(private readonly uploads: UploadsService) {}

  /* ── generic image (e.g. group-chat icon) ─────────────────── */

  @Post("image")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: imageOnlyFilter,
    }),
  )
  uploadImage(
    @CurrentUser() userId: string,
    @UploadedFile() file: UploadedImage,
  ) {
    return this.uploads.saveImage(userId, file);
  }

  /* ── post media (images + videos) ─────────────────────────── */

  @Post("media")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 80 * 1024 * 1024 },
      fileFilter: mediaFilter,
    }),
  )
  uploadMedia(
    @CurrentUser() userId: string,
    @UploadedFile() file: UploadedImage,
  ) {
    return this.uploads.saveMedia(userId, file);
  }
}
