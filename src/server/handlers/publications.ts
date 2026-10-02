import { editorData } from "../editor-data";
import { NextResponse } from "next/server";
import { processImage } from "../image-upload";
import { z } from "zod";
import { api, actor, boundedBody, jsonInput } from "../http";
import { getServices } from "../services";
import { comicCard } from "../dto";
import {
  catalogSchema,
  idSchema,
  publicationSchema,
  updatePublicationSchema,
  versionSchema,
  pageTextSchema,
  chaptersSchema,
  pageBatchSchema,
} from "@/domain/validation";
import { ensure } from "@/domain/errors";
import { canManagePublication } from "@/domain/access";

const PAGE_CACHE_SECONDS = 7 * 24 * 60 * 60;
const COVER_CACHE_SECONDS = 60 * 60;
export const catalog = api(async ({ request }) => {
  const input = catalogSchema.parse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  const result = await getServices().publications.catalog(input);
  return NextResponse.json({
    items: result.items.map(comicCard),
    nextCursor: result.nextCursor,
  });
});
export const create = api(
  async (context) => {
    const publication = await getServices().publishing.create(
      actor(context),
      await jsonInput(context.request, publicationSchema),
    );
    return NextResponse.json(
      { id: publication.id, slug: publication.slug },
      { status: 201 },
    );
  },
  { roles: ["author", "admin"] },
);
export const update = api(
  async (context) => {
    const input = await jsonInput(context.request, updatePublicationSchema);
    await getServices().publishing.edit(
      actor(context),
      idSchema.parse(context.params.id),
      input.version,
      input.publication,
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["author", "admin"] },
);
export const submit = api(
  async (context) => {
    const input = await jsonInput(context.request, versionSchema);
    await getServices().publishing.submit(
      actor(context),
      idSchema.parse(context.params.id),
      input.version,
    );
    return NextResponse.json({ ok: true });
  },
  { roles: ["author", "admin"] },
);
export const upload = api(
  async (context) => {
    const id = idSchema.parse(context.params.id);
    await getServices().publishing.owned(actor(context), id);
    const type = context.request.headers.get("Content-Type");
    ensure(
      typeof type === "string" && type.startsWith("multipart/form-data"),
      "CONTENT_TYPE",
      "Upload a multipart image.",
      415,
    );
    const bytes = await boundedBody(context.request, 11 * 1024 * 1024);
    const form = await new Response(Buffer.from(bytes), {
      headers: { "Content-Type": type },
    }).formData();
    const kind = z.enum(["cover", "page"]).parse(form.get("kind"));
    const version = z.coerce.number().int().min(1).parse(form.get("version"));
    const alt = z.string().trim().min(10).max(1000).parse(form.get("alt"));
    const file = form.get("file");
    const processed = await processImage(file, kind === "cover" ? 1000 : 1800);
    await getServices().publishing.upload(
      actor(context),
      id,
      version,
      kind,
      processed,
      alt,
    );
    return NextResponse.json(
      { ok: true, version: version + 1 },
      { status: 201 },
    );
  },
  { roles: ["author", "admin"], limit: 120 },
);
export const cover = api(
  async (context) => {
    const publication = await getServices().publications.find(
      idSchema.parse(context.params.id),
    );
    ensure(
      publication &&
        (publication.status === "published" ||
          (context.user && canManagePublication(context.user, publication))),
      "NOT_FOUND",
      "Cover not found.",
      404,
    );
    ensure(publication.coverKey, "NOT_FOUND", "Cover not found.", 404);
    const object = await getServices().storage.get(publication.coverKey);
    ensure(object, "NOT_FOUND", "Cover not found.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": object.contentType,
        // Browser-only caching for public covers; drafts stay uncached so workspace edits show at once.
        "Cache-Control":
          publication.status === "published"
            ? `private, max-age=${COVER_CACHE_SECONDS}`
            : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
  { limit: 500 },
);
export const media = api(
  async (context) => {
    const id = idSchema.parse(context.params.id);
    const number = z.coerce.number().int().min(1).parse(context.params.page);
    const object = await getServices().reading.image(id, number, context.user);
    return new Response(object.body, {
      headers: {
        "Content-Type": object.contentType,
        // Readers request pages with ?v=<publication version>, so any republish changes the URL.
        // `private` keeps the bytes out of shared/CDN caches; access is rechecked on every uncached request.
        "Cache-Control": `private, max-age=${PAGE_CACHE_SECONDS}, immutable`,
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  },
  { limit: 500 },
);
export const pageBatch = api(async (context) => {
  const input = pageBatchSchema.parse(
    Object.fromEntries(context.request.nextUrl.searchParams),
  );
  const { publication, ...batch } = await getServices().reading.pages(
    idSchema.parse(context.params.id),
    input.from,
    input.limit,
    context.user,
  );
  return NextResponse.json({ ...batch, version: publication.version });
});
export const studioMedia = api(
  async (context) => {
    const id = idSchema.parse(context.params.id);
    const number = z.coerce.number().int().min(1).parse(context.params.page);
    await getServices().publishing.owned(actor(context), id);
    const page = await getServices().publications.page(id, number);
    ensure(page, "NOT_FOUND", "Page not found.", 404);
    const object = await getServices().storage.get(page.storageKey);
    ensure(object, "NOT_FOUND", "Page not found.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": object.contentType,
        "Cache-Control": "private, no-store",
      },
    });
  },
  { roles: ["author", "admin"], limit: 500 },
);

export const reorderPages = api(
  async (context) => {
    const input = await jsonInput(
      context.request,
      z
        .object({ version: z.number().int().min(1), ids: z.array(idSchema) })
        .strict(),
    );
    await getServices().publishing.reorder(
      actor(context),
      idSchema.parse(context.params.id),
      input.version,
      input.ids,
    );
    return NextResponse.json({ ok: true, version: input.version + 1 });
  },
  { roles: ["author", "admin"] },
);
export const editPage = api(
  async (context) => {
    const input = await jsonInput(context.request, pageTextSchema);
    await getServices().publishing.editPage(
      actor(context),
      idSchema.parse(context.params.id),
      input.version,
      idSchema.parse(context.params.pageId),
      input.alt,
      input.storyText,
    );
    return NextResponse.json({ ok: true, version: input.version + 1 });
  },
  { roles: ["author", "admin"] },
);
export const setChapters = api(
  async (context) => {
    const input = await jsonInput(context.request, chaptersSchema);
    await getServices().publishing.setChapters(
      actor(context),
      idSchema.parse(context.params.id),
      input.version,
      input.chapters,
    );
    return NextResponse.json({ ok: true, version: input.version + 1 });
  },
  { roles: ["author", "admin"] },
);

export const editor = api(
  async (context) => {
    const services = getServices();
    const publication = await services.publishing.owned(
      actor(context),
      idSchema.parse(context.params.id),
    );
    return NextResponse.json(
      editorData(
        publication,
        await services.publications.pages(publication.id),
      ),
    );
  },
  { roles: ["author", "admin"] },
);
