import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];

// GET tells the form whether image uploads are available on this deployment.
export function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.PINATA_JWT) });
}

// POST stores an image on IPFS through Pinata and returns an https URL for it.
export async function POST(request: Request) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json({ error: "Image upload is not configured. Paste an image URL instead." }, { status: 501 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (!TYPES.includes(file.type)) return NextResponse.json({ error: "Use a PNG, JPG, WebP, GIF or SVG." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be under 5 MB." }, { status: 400 });

  const body = new FormData();
  body.append("file", file);
  body.append("network", "public");

  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body,
  });
  if (!res.ok) return NextResponse.json({ error: "The upload service rejected the file." }, { status: 502 });

  const json = (await res.json()) as { data?: { cid?: string } };
  const cid = json.data?.cid;
  if (!cid) return NextResponse.json({ error: "The upload service returned no CID." }, { status: 502 });

  const gateway = (process.env.PINATA_GATEWAY ?? "https://gateway.pinata.cloud").replace(/\/$/, "");
  return NextResponse.json({ url: `${gateway}/ipfs/${cid}`, cid });
}
