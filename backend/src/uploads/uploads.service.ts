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
import type { UploadedImage } from "./dto";

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

@Injectable()
export class UploadsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

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
    field: "avatar" | "banner" | "image" | "media",
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

  /** Save a new avatar image and update users.avatarUrl. */
  async setAvatar(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<AvatarUploadDto> {
    if (!file) throw new BadRequestException("No file uploaded");
    await this.assertUserExists(userId);

    const avatarUrl = this.persist(userId, "avatar", file);
    await this.db
      .update(users)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(users.userId, userId));

    return { avatarUrl };
  }

  /** Save a new banner image and update users.bannerUrl. */
  async setBanner(
    userId: string,
    file: UploadedImage | undefined,
  ): Promise<BannerUploadDto> {
    if (!file) throw new BadRequestException("No file uploaded");
    await this.assertUserExists(userId);

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
