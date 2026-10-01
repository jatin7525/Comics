import { NextResponse } from "next/server";
import { api, jsonInput } from "../http";
import { getServices } from "../services";
import { cookieName } from "../session";
import { loginSchema, registerSchema } from "@/domain/validation";

function sessionResponse(
  result: Awaited<ReturnType<ReturnType<typeof getServices>["auth"]["login"]>>,
) {
  const response = NextResponse.json({
    user: {
      id: result.user.id,
      name: result.user.name,
      role: result.user.role,
    },
  });
  response.cookies.set(cookieName(), result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: result.expiresAt,
  });
  return response;
}
export const register = api(
  async ({ request }) =>
    sessionResponse(
      await getServices().auth.register(
        await jsonInput(request, registerSchema),
      ),
    ),
  { limit: 10, window: 600 },
);
export const login = api(
  async ({ request }) => {
    const input = await jsonInput(request, loginSchema);
    return sessionResponse(
      await getServices().auth.login(input.email, input.password),
    );
  },
  { limit: 10, window: 600 },
);
export const logout = api(async ({ request }) => {
  await getServices().auth.logout(request.cookies.get(cookieName())?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
});
