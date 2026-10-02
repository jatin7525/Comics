import { NextResponse } from "next/server";
import { z } from "zod";
import { api, actor, jsonInput, boundedBody } from "../http";
import { getServices } from "../services";
import { idSchema, versionSchema } from "@/domain/validation";
import {
  applicationInput,
  applicationReview,
} from "@/domain/author-application";
import { ensure } from "@/domain/errors";
import { processImage } from "../image-upload";
export const start = api(
  async (context) => {
    const application = await getServices().authorApplications.start(
      actor(context),
    );
    return NextResponse.json({ id: application.id });
  },
  { roles: ["reader"], limit: 10 },
);
export const save = api(
  async (context) => {
    const input = await jsonInput(
      context.request,
      z
        .object({
          version: z.number().int().min(1),
          application: applicationInput,
        })
        .strict(),
    );
    await getServices().authorApplications.save(
      actor(context),
      idSchema.parse(context.params.id),
      input.version,
      input.application,
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["reader"] },
);
export const submit = api(
  async (context) => {
    const input = await jsonInput(context.request, versionSchema);
    await getServices().authorApplications.submit(
      actor(context),
      idSchema.parse(context.params.id),
      input.version,
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["reader"], limit: 10 },
);
export const upload = api(
  async (context) => {
    const id = idSchema.parse(context.params.id);
    await getServices().authorApplications.owned(actor(context), id);
    const type = context.request.headers.get("Content-Type");
    ensure(
      typeof type === "string" && type.startsWith("multipart/form-data"),
      "CONTENT_TYPE",
      "Upload a multipart image.",
      415,
    );
    const bytes = await boundedBody(context.request, 4 * 1024 * 1024);
    const form = await new Response(Buffer.from(bytes), {
      headers: { "Content-Type": type },
    }).formData();
    const version = z.coerce.number().int().min(1).parse(form.get("version"));
    const alt = z.string().trim().min(10).max(1000).parse(form.get("alt"));
    const processed = await processImage(
      form.get("file"),
      1600,
      3 * 1024 * 1024,
    );
    await getServices().authorApplications.upload(
      actor(context),
      id,
      version,
      processed,
      alt,
      z.enum(["sample", "thumbnail"]).parse(form.get("kind") ?? "sample") ===
        "thumbnail",
    );
    return NextResponse.json(
      { ok: true, version: version + 1 },
      { status: 201 },
    );
  },
  { roles: ["reader"], limit: 120 },
);
export const remove = api(
  async (context) => {
    const input = await jsonInput(context.request, versionSchema);
    await getServices().authorApplications.remove(
      actor(context),
      idSchema.parse(context.params.id),
      input.version,
      idSchema.parse(context.params.sample),
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["reader"] },
);
function sampleHandler(reviewer: boolean) {
  return api(
    async (context) => {
      const object = await getServices().authorApplications.image(
        actor(context),
        idSchema.parse(context.params.id),
        idSchema.parse(context.params.sample),
        reviewer,
      );
      return new Response(object.body, {
        headers: {
          "Content-Type": object.contentType,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
    { roles: reviewer ? ["admin"] : ["reader", "author", "admin"], limit: 120 },
  );
}
export const sample = sampleHandler(false);
export const reviewSample = sampleHandler(true);
export const review = api(
  async (context) => {
    await getServices().authorApplications.review(
      actor(context),
      idSchema.parse(context.params.id),
      await jsonInput(context.request, applicationReview),
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["admin"] },
);

export const reorder = api(
  async (context) => {
    const input = await jsonInput(
      context.request,
      z
        .object({
          version: z.number().int().min(1),
          ids: z.array(idSchema),
        })
        .strict(),
    );
    await getServices().authorApplications.reorder(
      actor(context),
      idSchema.parse(context.params.id),
      input.version,
      input.ids,
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["reader"] },
);
