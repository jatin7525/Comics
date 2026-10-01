import { notFound } from "next/navigation";
import { idSchema } from "@/domain/validation";
import { getServices } from "@/server/services";
import { currentUser } from "@/server/session";
import { comicCard } from "@/server/dto";
import { ComicGrid, Empty, Intro } from "@/components/ui";
import { FollowButton } from "@/components/reader-actions";
export default async function Creator({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const services = getServices(),
    author = await services.accounts.findUser(id);
  if (!author || !["author", "admin"].includes(author.role)) notFound();
  const user = await currentUser();
  const [items, following] = await Promise.all([
    services.publications.byAuthor(id),
    user ? services.community.isFollowing(user.id, id) : Promise.resolve(false),
  ]);
  const published = items.filter((item) => item.status === "published");
  return (
    <>
      <Intro
        title={author.name}
        description="Independent creator at Astra Comics"
        action={
          user?.id !== id ? (
            <FollowButton
              id={id}
              following={following}
              authenticated={!!user}
            />
          ) : undefined
        }
      />
      {published.length ? (
        <ComicGrid comics={published.map(comicCard)} />
      ) : (
        <Empty title="A new story is on its way.">
          This creator has no published stories yet.
        </Empty>
      )}
    </>
  );
}
