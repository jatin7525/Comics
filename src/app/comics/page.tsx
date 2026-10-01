import Link from "next/link";
import { catalogSchema } from "@/domain/validation";
import { getServices } from "@/server/services";
import { comicCard } from "@/server/dto";
import { ComicGrid, Empty, Intro } from "@/components/ui";
import { GenreFilters } from "@/components/genre-filters";

export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = catalogSchema.safeParse(raw);
  if (!parsed.success)
    return (
      <Empty
        title="This filter isn’t valid."
        href="/comics"
        label="Clear filters"
      >
        Choose a genre or search from the catalog.
      </Empty>
    );
  const query = { ...parsed.data, kind: "comic" as const };
  const result = await getServices().publications.catalog(query);
  const params = new URLSearchParams();
  if (query.genre) params.set("genre", query.genre);
  if (query.search) params.set("search", query.search);
  if (query.access) params.set("access", query.access);
  if (result.nextCursor) params.set("cursor", result.nextCursor);
  return (
    <>
      <Intro
        title={
          query.search
            ? `Stories for “${query.search}”`
            : "The complete collection."
        }
        description="Browse every story. Read the first four pages of any comic without an account."
      />
      <GenreFilters
        selected={query.genre}
        search={query.search}
        access={query.access}
      />
      <form className="catalog-controls" action="/comics">
        {query.genre && (
          <input type="hidden" name="genre" value={query.genre} />
        )}
        <label>
          Search
          <input
            type="search"
            name="search"
            defaultValue={query.search}
            placeholder="Title, creator, or story"
            maxLength={80}
          />
        </label>
        <label>
          Reading access
          <select name="access" defaultValue={query.access ?? ""}>
            <option value="">All access types</option>
            <option value="free">Free with an account</option>
            <option value="membership">Membership</option>
            <option value="purchase">Individual purchase</option>
            <option value="both">Membership or purchase</option>
          </select>
        </label>
        <button className="secondary">Apply</button>
      </form>
      {result.items.length ? (
        <ComicGrid comics={result.items.map(comicCard)} />
      ) : (
        <Empty title="No stories found." href="/comics" label="Clear filters">
          Try a different title or genre.
        </Empty>
      )}
      {result.nextCursor && (
        <div className="pagination">
          <Link className="secondary" href={`/comics?${params}`}>
            Next stories
          </Link>
        </div>
      )}
    </>
  );
}
