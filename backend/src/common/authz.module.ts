import { Global, Module } from "@nestjs/common";
import { AuthzService } from "./authz.service";

/**
 * AuthzModule — exposes {@link AuthzService} (admin / hackathon-owner checks)
 * application-wide. `@Global()` so feature modules need not import it.
 */
@Global()
@Module({
  providers: [AuthzService],
  exports: [AuthzService],
})
export class AuthzModule {}
