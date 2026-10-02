import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { AccountRepository } from "./ports";
import type { User } from "@/domain/models";
import { canEnterService, type ServiceId } from "@/domain/service";
import { AppError } from "@/domain/errors";

const derive = promisify(scrypt);
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, salt, hex] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !hex || hex.length !== 128)
    return false;
  const derived = (await derive(password, salt, 64)) as Buffer;
  return timingSafeEqual(derived, Buffer.from(hex, "hex"));
}
export function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
const DUMMY_HASH = `scrypt:00000000000000000000000000000000:${"0".repeat(128)}`;
export class AuthService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly audience: ServiceId = "reader",
  ) {}
  async register(input: { name: string; email: string; password: string }) {
    if (this.audience !== "reader")
      throw new AppError(
        "FORBIDDEN",
        "Account registration is available on the reader platform only.",
        403,
      );
    const user: User = {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      role: "reader",
      status: "active",
      createdAt: new Date(),
    };
    await this.accounts.create({
      ...user,
      passwordHash: await hashPassword(input.password),
    });
    return this.issueSession(user);
  }
  async login(email: string, password: string) {
    const account = await this.accounts.findByEmail(email);
    const valid = await verifyPassword(
      password,
      account?.passwordHash ?? DUMMY_HASH,
    );
    if (!valid || !account || account.status !== "active")
      throw new AppError(
        "INVALID_CREDENTIALS",
        "Email or password is incorrect, or this account is unavailable.",
        401,
      );
    const user: User = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      status: account.status,
      createdAt: account.createdAt,
    };
    return this.issueSession(user);
  }
  private async issueSession(user: User) {
    if (!canEnterService(this.audience, user.role))
      throw new AppError(
        "FORBIDDEN",
        "This account does not have access to this workspace.",
        403,
      );
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.accounts.createSession({
      id: sessionHash(token),
      audience: this.audience,
      userId: user.id,
      expiresAt,
    });
    return { token, expiresAt, user };
  }
  async currentUser(token?: string): Promise<User | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const session = await this.accounts.findSession(sessionHash(token));
    if (!session || session.audience !== this.audience) return null;
    const user = await this.accounts.findUser(session.userId);
    return user?.status === "active" &&
      canEnterService(this.audience, user.role)
      ? user
      : null;
  }
  async logout(token?: string) {
    if (token) {
      const session = await this.accounts.findSession(sessionHash(token));
      if (session?.audience === this.audience)
        await this.accounts.deleteSession(session.id);
    }
  }
}
