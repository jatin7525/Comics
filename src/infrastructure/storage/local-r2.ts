import type { ObjectStorage } from "@/application/ports";
import type { StoredObject } from "@/domain/models";

export class LocalR2Storage implements ObjectStorage {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
  ) {}
  private async request(key: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    const response = await fetch(
      `${this.endpoint}/${key.split("/").map(encodeURIComponent).join("/")}`,
      {
        ...init,
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok && response.status !== 404)
      throw new Error(`Local R2 operation failed (${response.status}).`);
    return response;
  }
  async put(key: string, data: Uint8Array, contentType: string) {
    const response = await this.request(key, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: Buffer.from(data),
    });
    if (!response.ok) throw new Error("Local R2 upload failed.");
  }
  async get(key: string): Promise<StoredObject | null> {
    const response = await this.request(key);
    if (response.status === 404 || !response.body) return null;
    return {
      body: response.body,
      contentType:
        response.headers.get("Content-Type") ?? "application/octet-stream",
      size: Number(response.headers.get("Content-Length")) || undefined,
    };
  }
  async delete(key: string) {
    await this.request(key, { method: "DELETE" });
  }
}
