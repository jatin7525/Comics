import Link from "next/link";
import type { Publication } from "@/domain/models";
import { accessLabels, Empty, Status } from "./ui";
export function PublicationTable({
  publications,
  admin = false,
}: {
  publications: Publication[];
  admin?: boolean;
}) {
  if (!publications.length)
    return (
      <Empty
        title={admin ? "No publications yet." : "Your next story starts here."}
        href={admin ? undefined : "/studio/publications/new"}
        label="Create a publication"
      >
        {admin
          ? "Author submissions will appear here for editorial review."
          : "Save a draft, upload your artwork, and submit it for review."}
      </Empty>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Publication</th>
            <th>Access</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {publications.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.title}</strong>
                <small className="table-subtitle">
                  {admin ? item.authorName : item.kind} · {item.pageCount} pages
                </small>
              </td>
              <td>{accessLabels[item.access]}</td>
              <td>
                <Status value={item.status} />
              </td>
              <td>{item.updatedAt.toLocaleDateString("en-GB")}</td>
              <td>
                <Link
                  className="text-link"
                  href={
                    admin
                      ? `/admin/reviews/${item.id}`
                      : `/studio/publications/${item.id}/edit`
                  }
                >
                  {admin ? "Review" : "Edit"}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
