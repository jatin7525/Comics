import "server-only";
import { MongoAuthorApplications } from "@/infrastructure/mongo/author-applications";
import { AuthorApplicationService } from "@/application/author-application-service";
import { serviceId } from "./service";
import {
  MongoAccounts,
  MongoEntitlements,
  MongoRateLimiter,
} from "@/infrastructure/mongo/accounts";
import { MongoPublications } from "@/infrastructure/mongo/publications";
import { MongoCommunity } from "@/infrastructure/mongo/community";
import { MongoAdministration } from "@/infrastructure/mongo/administration";
import { AuthService } from "@/application/auth-service";
import { PublicationService } from "@/application/publication-service";
import { ReadingService } from "@/application/reading-service";
import { AdminService } from "@/application/admin-service";
import { createStorage } from "@/infrastructure/storage/factory";

function compose() {
  const accounts = new MongoAccounts();
  const publications = new MongoPublications();
  const entitlements = new MongoEntitlements();
  const community = new MongoCommunity();
  const administration = new MongoAdministration();
  const storage = createStorage();
  const applications = new MongoAuthorApplications();
  return {
    applications,
    authorApplications: new AuthorApplicationService(applications, storage),
    accounts,
    publications,
    entitlements,
    community,
    administration,
    storage,
    limiter: new MongoRateLimiter(),
    auth: new AuthService(accounts, serviceId()),
    publishing: new PublicationService(publications, storage, administration),
    reading: new ReadingService(publications, entitlements, storage, community),
    admin: new AdminService(administration, publications),
  };
}
let services: ReturnType<typeof compose> | undefined;
export function getServices() {
  return (services ??= compose());
}
