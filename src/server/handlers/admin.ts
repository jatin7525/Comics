import { NextResponse } from "next/server";
import { z } from "zod";
import { api, actor, jsonInput } from "../http";
import { getServices } from "../services";
import {
  idSchema,
  policySchema,
  releaseReviewSchema,
  reportSchema,
  reviewSchema,
  userUpdateSchema,
} from "@/domain/validation";

export const review = api(
  async (context) => {
    await getServices().admin.review(
      actor(context),
      idSchema.parse(context.params.id),
      await jsonInput(context.request, reviewSchema),
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["admin"] },
);
export const hide = api(
  async (context) => {
    const input = await jsonInput(
      context.request,
      z
        .object({
          version: z.number().int().min(1),
          reason: z.string().trim().min(10).max(500),
        })
        .strict(),
    );
    await getServices().admin.hide(
      actor(context),
      idSchema.parse(context.params.id),
      input.version,
      input.reason,
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["admin"] },
);
export const user = api(
  async (context) => {
    const input = await jsonInput(context.request, userUpdateSchema);
    await getServices().admin.updateUser(
      actor(context),
      idSchema.parse(context.params.id),
      input.role,
      input.status,
      input.reason,
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["admin"] },
);
export const reviewRelease = api(
  async (context) => {
    await getServices().admin.reviewRelease(
      actor(context),
      idSchema.parse(context.params.id),
      await jsonInput(context.request, releaseReviewSchema),
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["admin"] },
);
export const policy = api(
  async (context) => {
    await getServices().admin.policy(
      actor(context),
      await jsonInput(context.request, policySchema),
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["admin"] },
);
export const resolve = api(
  async (context) => {
    const input = await jsonInput(context.request, reportSchema);
    await getServices().admin.resolve(
      actor(context),
      idSchema.parse(context.params.id),
      input.reason,
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["admin"] },
);
