import "server-only";
import { randomUUID, createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, ensure } from "@/domain/errors";
import type { Role, User } from "@/domain/models";
import { getServices } from "./services";
import { cookieName } from "./session";
import { config } from "./config";

export interface ApiContext {
  request: NextRequest;
  params: Record<string, string>;
  user: User | null;
}
type NextContext = { params: Promise<Record<string, string>> };
export function actor(context: ApiContext): User {
  ensure(context.user, "UNAUTHENTICATED", "Sign in to continue.", 401);
  return context.user;
}
export function api(
  handler: (context: ApiContext) => Promise<Response>,
  options: {
    roles?: Role[];
    authenticated?: boolean;
    limit?: number;
    window?: number;
  } = {},
) {
  return async (request: NextRequest, context: NextContext) => {
    const requestId = randomUUID();
    try {
      const env = config();
      if (!["GET", "HEAD"].includes(request.method))
        ensure(
          request.headers.get("origin") === new URL(env.APP_ORIGIN).origin,
          "INVALID_ORIGIN",
          "This request must come from Astra Comics.",
          403,
        );
      const services = getServices();
      const user = await services.auth.currentUser(
        request.cookies.get(cookieName())?.value,
      );
      if (options.authenticated || options.roles)
        ensure(user, "UNAUTHENTICATED", "Sign in to continue.", 401);
      if (options.roles)
        ensure(
          user && options.roles.includes(user.role),
          "FORBIDDEN",
          "You do not have permission to perform this action.",
          403,
        );
      const ip =
        env.TRUST_PROXY === "true"
          ? (request.headers.get(env.TRUSTED_IP_HEADER) ?? "unknown")
          : "local";
      const identity =
        user?.id ??
        createHmac("sha256", env.RATE_LIMIT_SECRET).update(ip).digest("hex");
      const scope = request.nextUrl.pathname.startsWith("/api/auth")
        ? "auth"
        : request.nextUrl.pathname.includes("/media")
          ? "media"
          : "api";
      await services.limiter.consume(
        `${scope}:${options.limit ?? 120}:${options.window ?? 60}:${identity}`,
        options.limit ?? 120,
        options.window ?? 60,
      );
      const response = await handler({
        request,
        params: await context.params,
        user,
      });
      response.headers.set("X-Request-Id", requestId);
      if (!response.headers.has("Cache-Control"))
        response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (error) {
      const known = error instanceof AppError;
      const validation = error instanceof ZodError;
      const status = known ? error.status : validation ? 400 : 500;
      if (!known && !validation)
        console.error(
          JSON.stringify({
            requestId,
            event: "request_failed",
            path: request.nextUrl.pathname,
            error: error instanceof Error ? error.name : "UnknownError",
          }),
        );
      return NextResponse.json(
        {
          error: {
            code: known
              ? error.code
              : validation
                ? "VALIDATION_ERROR"
                : "INTERNAL_ERROR",
            message: known
              ? error.message
              : validation
                ? (error.issues[0]?.message ?? "Invalid input.")
                : "Something went wrong. Please try again.",
            requestId,
          },
        },
        {
          status,
          headers: {
            "Cache-Control": "no-store",
            ...(status === 429 ? { "Retry-After": "60" } : {}),
            "X-Request-Id": requestId,
          },
        },
      );
    }
  };
}
export async function boundedBody(
  request: Request,
  limit: number,
): Promise<Uint8Array> {
  const length = Number(request.headers.get("Content-Length"));
  ensure(
    !length || length <= limit,
    "BODY_TOO_LARGE",
    "The uploaded data is too large.",
    413,
  );
  const reader = request.body?.getReader();
  ensure(reader, "EMPTY_BODY", "A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError(
          "BODY_TOO_LARGE",
          "The uploaded data is too large.",
          413,
        );
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function jsonInput<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  ensure(
    request.headers.get("Content-Type")?.includes("application/json"),
    "CONTENT_TYPE",
    "Send JSON data.",
    415,
  );
  let body: unknown;
  try {
    body = JSON.parse(
      Buffer.from(await boundedBody(request, 32_768)).toString("utf8"),
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("INVALID_JSON", "Invalid JSON data.");
  }
  return schema.parse(body);
}
