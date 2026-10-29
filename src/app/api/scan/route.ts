import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parsePostUrl, type Reply } from "@/lib/wallets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  postUrl: z.string().trim().max(350),
  mode: z.enum(["recent", "archive"]),
  pageToken: z.string().min(1).max(4096).optional(),
}).strict();

function authorized(candidate: string | null, secret: string): boolean {
  if (!candidate || !secret) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const token = process.env.X_BEARER_TOKEN;
  const secret = process.env.WALLETRAY_ACCESS_KEY;
  if (!token || !secret) return fail("Server not configured. Set X_BEARER_TOKEN and WALLETRAY_ACCESS_KEY.", 503);
  if (!authorized(request.headers.get("x-walletray-key"), secret)) return fail("Invalid access key.", 401);

  let json: unknown;
  try { json = await request.json(); } catch { return fail("Invalid JSON body.", 400); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return fail("Invalid scan request.", 400);
  const { postUrl, mode, pageToken } = parsed.data;
  const postId = parsePostUrl(postUrl);
  if (!postId) return fail("Please enter a valid x.com or twitter.com post URL.", 400);

  const url = new URL(mode === "archive"
    ? "https://api.x.com/2/tweets/search/all"
    : "https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", "conversation_id:" + postId + " -is:retweet");
  url.searchParams.set("max_results", "100");
  url.searchParams.set("tweet.fields", "created_at,author_id,conversation_id,referenced_tweets");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username");
  if (pageToken) url.searchParams.set("next_token", pageToken);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return fail("X API timed out or could not be reached. Try again.", 502);
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) return fail("X API rejected the token or this endpoint is unavailable to your plan.", 502);
    if (response.status === 429) return fail("X API rate limit reached. Wait and retry.", 429);
    if (response.status === 402) return fail("X API credits are insufficient.", 402);
    return fail("X API returned HTTP " + response.status + ".", 502);
  }

  try {
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") return fail("Unexpected X API response.", 502);
    const payload = data as {
      data?: { id: string; text: string; author_id: string; created_at?: string; conversation_id?: string; referenced_tweets?: { id: string; type: string }[] }[];
      includes?: { users?: { id: string; username: string }[] };
      meta?: { next_token?: string; result_count?: number };
    };
    const users = new Map((payload.includes?.users ?? []).map((u) => [u.id, u.username]));
    const replies: Reply[] = (Array.isArray(payload.data) ? payload.data : [])
      .filter((post) => post && typeof post.id === "string" && typeof post.text === "string" && post.id !== postId && post.conversation_id === postId)
      .map((post) => ({
        id: post.id,
        text: post.text,
        authorId: typeof post.author_id === "string" ? post.author_id : "unknown:" + post.id,
        username: users.get(post.author_id) ?? "",
        createdAt: post.created_at,
        conversationId: post.conversation_id,
        referencedTweets: post.referenced_tweets,
      }));
    return NextResponse.json({
      postId, replies,
      nextToken: payload.meta?.next_token ?? null,
      fetchedCount: payload.meta?.result_count ?? replies.length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Unexpected response from X API.", 502);
  }
}
