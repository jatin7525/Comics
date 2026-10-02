import { serviceOrigins } from "@/server/service";
import { requireUser } from "@/server/session";
import { Intro } from "@/components/ui";
export default async function Account() {
  const user = await requireUser();
  return (
    <>
      <Intro
        title="Your account."
        description="Your identity and publishing access."
      />
      <div className="panel account-details">
        <h2>{user.name}</h2>
        <dl>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Role</dt>
          <dd>{user.role}</dd>
          <dt>Account status</dt>
          <dd>{user.status}</dd>
          <dt>Joined</dt>
          <dd>{user.createdAt.toLocaleDateString("en-GB")}</dd>
        </dl>
        <p className="muted">
          Author access is granted by the editorial team. Payment management
          will become available when billing launches.
        </p>
        {user.role === "reader" && (
          <a
            className="primary"
            href={`${serviceOrigins().reader}/become-author`}
          >
            Apply for author access
          </a>
        )}
      </div>
    </>
  );
}
