import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, extname } from "path";
import { eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDB } from "../db/db.module";
import { users } from "../db/schema";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import type { UploadedImage, VideoUploadResult } from "./dto";

/* ── response interfaces ──────────────────────────────────── */

export interface AvatarUploadDto {
  avatarUrl: string;
}

export interface ImageUploadDto {
  url: string;
}

export interface BannerUploadDto {
  bannerUrl: string;
}

export interface UploadDeleteResult {
  success: true;
}

/** Absolute path to the directory served statically at "/uploads". */
const UPLOAD_DIR = join(process.cwd(), "uploads");

/** Business limit for uploaded project videos (50 MB). */
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Best-effort magic-byte sniff for the two supported video containers, so a
 * file merely renamed to `.mp4`/`.webm` (with non-video contents) is rejected:
 *  - MP4 / ISO-BMFF: the ASCII marker "ftyp" at byte offset 4.
 *  - WebM / Matroska: the EBML signature 0x1A45DFA3 at byte offset 0.
 *
 * Autor: Stevan Gnjato (2023/0141)
 */
function sniffVideoType(buffer: Buffer): "video/mp4" | "video/webm" | null {
  if (buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp") {
    return "video/mp4";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "video/webm";
  }
  return null;
}

@Injectable()
export class UploadsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  /** Ensure the user exists (404 otherwise). */
  private async assertUserExists(userId: string): Promise<void> {
    const [user] = await this.db
      .select({ userId: users.userId })
      .from(users)
      .where(eq(users.userId, userId))
      .limit(1);
    if (!user) throw new NotFoundException("User not found");
  }

  /**
   * Persist a multer in-memory file to UPLOAD_DIR under a unique name and
   * return its public "/uploads/<filename>" url.
   */
  private persist(
    userId: string,
    field: "avatar" | "banner" | "image" | "media" | "video",
    file: UploadedImage,
  ): string {
    if (!existsSync(UPLOAD_DIR)) {
      mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    const ext = extname(file.originalname);
    const filename = `${userId}-${field}-${Date.now()}${ext}`;
    writeFileSync(join(UPLOAD_DIR, filename), file.buffer);
    return `/uploads/${filename}`;
  }

  /**
   * Save a new avatar image and update users.avatarUrl.
   *
   * Animated GIF avatars are a Premium-only feature: a non-premium user who
   * uploads an `image/gif` is rejected (static images stay open to everyone).
   */
  async setAvatar(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<AvatarUploadDto> {
    if (!file) throw new BadRequestException("No file uploaded");
    await this.assertUserExists(userId);

    if (file.mimetype === "image/gif") {
      const premium = await this.subscriptions.isPremium(userId);
      if (!premium) {
        throw new BadRequestException(
          "Animirani GIF avatar je dostupan samo Premium članovima",
        );
      }
    }

    const avatarUrl = this.persist(userId, "avatar", file);
    await this.db
      .update(users)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(users.userId, userId));

    return { avatarUrl };
  }

  /**
   * Save a new banner image and update users.bannerUrl.
   *
   * The profile banner is a Premium feature — a non-premium user is rejected.
   * (When premium ends, the banner is cleared in SubscriptionsService.cancel.)
   */
  async setBanner(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<BannerUploadDto> {
    if (!file) throw new BadRequestException("No file uploaded");
    await this.assertUserExists(userId);

    const premium = await this.subscriptions.isPremium(userId);
    if (!premium) {
      throw new BadRequestException("Baner je dostupan samo Premium članovima");
    }

    const bannerUrl = this.persist(userId, "banner", file);
    await this.db
      .update(users)
      .set({ bannerUrl, updatedAt: new Date() })
      .where(eq(users.userId, userId));

    return { bannerUrl };
  }

  /** Save a generic image (e.g. a group-chat icon) and return its url. */
  async saveImage(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<ImageUploadDto> {
    if (!file) throw new BadRequestException("No file uploaded");
    await this.assertUserExists(userId);

    const url = this.persist(userId, "image", file);
    return { url };
  }

  /** Save a post media file (image or video) and return its url. */
  async saveMedia(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<ImageUploadDto> {
    if (!file) throw new BadRequestException("No file uploaded");
    await this.assertUserExists(userId);

    const url = this.persist(userId, "media", file);
    return { url };
  }

  /**
   * Save a project presentation video (MP4/WebM only) and return its url.
   * Rejects oversized files (>50 MB) and anything that is not really a video
   * once its magic bytes are inspected.
   *
   * Autor: Stevan Gnjato (2023/0141)
   */
  async saveVideo(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<VideoUploadResult> {
    if (!file) throw new BadRequestException("No file uploaded");
    await this.assertUserExists(userId);

    if (file.size > VIDEO_MAX_BYTES) {
      throw new BadRequestException("Video exceeds the 50MB limit");
    }
    if (!sniffVideoType(file.buffer)) {
      throw new BadRequestException("Only MP4 or WebM video files are allowed");
    }

    const url = this.persist(userId, "video", file);
    return { url };
  }

  /** Clear users.avatarUrl. */
  async deleteAvatar(userId: string): Promise<UploadDeleteResult> {
    const updated = await this.db
      .update(users)
      .set({ avatarUrl: null, updatedAt: new Date() })
      .where(eq(users.userId, userId))
      .returning({ userId: users.userId });
    if (updated.length === 0) throw new NotFoundException("User not found");
    return { success: true };
  }

  /** Clear users.bannerUrl. */
  async deleteBanner(userId: string): Promise<UploadDeleteResult> {
    const updated = await this.db
      .update(users)
      .set({ bannerUrl: null, updatedAt: new Date() })
      .where(eq(users.userId, userId))
      .returning({ userId: users.userId });
    if (updated.length === 0) throw new NotFoundException("User not found");
    return { success: true };
  }
}
