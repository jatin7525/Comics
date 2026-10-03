import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { api, actor, jsonInput } from "../http";
import { getServices } from "../services";
import {
  commentListSchema,
  commentSchema,
  idSchema,
  progressSchema,
  reportSchema,
  toggleSchema,
} from "@/domain/validation";
import { ensure } from "@/domain/errors";

export const save = api(
  async (context) => {
    const user = actor(context),
      id = idSchema.parse(context.params.id);
    const publication = await getServices().publications.find(id);
    ensure(
      publication?.status === "published",
      "NOT_FOUND",
      "Publication not found.",
      404,
    );
    const input = await jsonInput(context.request, toggleSchema);
    await getServices().community.save(user.id, id, input.enabled);
    return NextResponse.json({ ok: true });
  },
  { authenticated: true },
);
export const progress = api(
  async (context) => {
    const input = await jsonInput(context.request, progressSchema);
    await getServices().reading.progress(
      idSchema.parse(context.params.id),
      input.page,
      actor(context),
    );
    return NextResponse.json({ ok: true });
  },
  { authenticated: true },
);
export const follow = api(
  async (context) => {
    const user = actor(context),
      id = idSchema.parse(context.params.id);
    const author = await getServices().accounts.findUser(id);
    ensure(
      author &&
        ["author", "admin"].includes(author.role) &&
        author.status === "active",
      "NOT_FOUND",
      "Creator not found.",
      404,
    );
    ensure(
      user.id !== author.id,
      "INVALID_FOLLOW",
      "You cannot follow yourself.",
    );
    const input = await jsonInput(context.request, toggleSchema);
    await getServices().community.follow(user.id, id, input.enabled);
    return NextResponse.json({ ok: true });
  },
  { authenticated: true },
);
export const report = api(
  async (context) => {
    const user = actor(context),
      id = idSchema.parse(context.params.id);
    const publication = await getServices().publications.find(id);
    ensure(
      publication?.status === "published",
      "NOT_FOUND",
      "Publication not found.",
      404,
    );
    const input = await jsonInput(context.request, reportSchema);
    await getServices().community.report({
      id: randomUUID(),
      reporterId: user.id,
      comicId: id,
      title: publication.title,
      reason: input.reason,
      status: "open",
      createdAt: new Date(),
      resolvedAt: null,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  },
  { authenticated: true, limit: 10, window: 600 },
);
export const listComments = api(async (context) => {
  const input = commentListSchema.parse(
    Object.fromEntries(context.request.nextUrl.searchParams),
  );
  return NextResponse.json(
    await getServices().comments.list(
      idSchema.parse(context.params.id),
      input.chapter,
      input.cursor,
      context.user,
    ),
  );
});
export const postComment = api(
  async (context) => {
    const input = await jsonInput(context.request, commentSchema);
    const comment = await getServices().comments.post(
      actor(context),
      idSchema.parse(context.params.id),
      input.chapterId,
      input.body,
    );
    return NextResponse.json({ id: comment.id }, { status: 201 });
  },
  { authenticated: true, limit: 10 },
);
export const deleteComment = api(
  async (context) => {
    await getServices().comments.remove(
      actor(context),
      idSchema.parse(context.params.id),
      idSchema.parse(context.params.commentId),
    );
    return NextResponse.json({ ok: true });
  },
  { authenticated: true },
);
