import Link from "next/link";
import { genres } from "@/domain/models";
export function GenreFilters({
  selected,
  search,
  access,
}: {
  selected?: string;
  search?: string;
  access?: string;
}) {
  return (
    <div className="discovery-bar">
      <nav className="filters" aria-label="Comic genres">
        {["All genres", ...genres].map((genre) => {
          const params = new URLSearchParams();
          if (genre !== "All genres") params.set("genre", genre);
          if (search) params.set("search", search);
          if (access) params.set("access", access);
          const active = genre === (selected || "All genres");
          return (
            <Link
              key={genre}
              href={`/comics${params.size ? `?${params}` : ""}`}
              className={`chip ${active ? "active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {genre}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
