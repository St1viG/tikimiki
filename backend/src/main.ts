import "reflect-metadata";
import { join } from "path";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { env } from "./config/env";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  // Serve uploaded avatars/banners. Static middleware is NOT under the global
  // "api/v1" prefix, so these live at http://<host>/uploads/<file>.
  app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads/" });
  await app.listen(env.PORT);
  // eslint-disable-next-line no-console
  console.log(`tikimiki API → http://localhost:${env.PORT}/api/v1`);
}

void bootstrap();
