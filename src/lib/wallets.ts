import bs58 from "bs58";
import { getAddress, isAddress } from "ethers";

export type ChainFilter = "both" | "evm" | "solana";
export type WalletChain = "EVM" | "Solana";
export type SearchMode = "recent" | "archive";

export type Reply = {
  id: string;
  text: string;
  authorId: string;
  username?: string;
  createdAt?: string;
  conversationId?: string;
  referencedTweets?: { id: string; type: string }[];
};

export type Wallet = { address: string; chain: WalletChain };
export type Recipient = Wallet & {
  authorId: string;
  username: string;
  replyId: string;
  createdAt?: string;
  mentions: number;
};
export type ScanSummary = {
  recipients: Recipient[];
  replies: number;
  matchedReplies: number;
  totalMentions: number;
  duplicateWallets: number;
  authorExclusions: number;
  uniqueAuthors: number;
  noWalletReplies: number;
};

const evmPattern = /(?<![A-Za-z0-9_])0x[a-fA-F0-9]{40}(?![A-Za-z0-9_])/g;
const solanaPattern = /(?<![A-Za-z0-9])[1-9A-HJ-NP-Za-km-z]{32,44}(?![A-Za-z0-9])/g;

export function parsePostUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!["x.com", "twitter.com", "www.x.com", "www.twitter.com", "mobile.twitter.com"].includes(url.hostname.toLowerCase())) return null;
    const match = url.pathname.match(/^\/(?:[A-Za-z0-9_]{1,15}|i\/web)\/status\/(\d{5,20})\/?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function extractWallets(text: string, filter: ChainFilter): Wallet[] {
  const matches: Wallet[] = [];
  const seen = new Set<string>();
  if (filter !== "solana") {
    for (const result of text.matchAll(evmPattern)) {
      const value = result[0];
      if (!isAddress(value)) continue; // ethers rejects invalid mixed-case checksums
      const address = getAddress(value);
      const key = "evm:" + address.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        matches.push({ address, chain: "EVM" });
      }
    }
  }
  if (filter !== "evm") {
    for (const result of text.matchAll(solanaPattern)) {
      const address = result[0];
      try {
        if (bs58.decode(address).length !== 32) continue;
        const key = "solana:" + address;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({ address, chain: "Solana" });
        }
      } catch {
        // A base58-looking word is not necessarily a Solana public key.
      }
    }
  }
  return matches;
}

export function aggregateReplies(replies: Reply[], filter: ChainFilter, onePerAuthor = false): ScanSummary {
  const byWallet = new Map<string, Recipient>();
  const claimedAuthors = new Set<string>();
  const matchedAuthors = new Set<string>();
  let matchedReplies = 0;
  let totalMentions = 0;
  let duplicateWallets = 0;
  let authorExclusions = 0;
  for (const reply of replies) {
    const wallets = extractWallets(reply.text, filter);
    if (wallets.length > 0) {
      matchedReplies++;
      matchedAuthors.add(reply.authorId);
    }
    for (const wallet of wallets) {
      totalMentions++;
      const key = wallet.chain + ":" + (wallet.chain === "EVM" ? wallet.address.toLowerCase() : wallet.address);
      const existing = byWallet.get(key);
      if (existing) {
        existing.mentions++;
        duplicateWallets++;
        continue;
      }
      if (onePerAuthor && claimedAuthors.has(reply.authorId)) {
        authorExclusions++;
        continue;
      }
      byWallet.set(key, {
        ...wallet,
        authorId: reply.authorId,
        username: reply.username ?? "",
        replyId: reply.id,
        createdAt: reply.createdAt,
        mentions: 1,
      });
      claimedAuthors.add(reply.authorId);
    }
  }
  return {
    recipients: [...byWallet.values()],
    replies: replies.length,
    matchedReplies,
    totalMentions,
    duplicateWallets,
    authorExclusions,
    uniqueAuthors: matchedAuthors.size,
    noWalletReplies: replies.length - matchedReplies,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  // Prevent spreadsheet formula injection, even when fields are quoted.
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function recipientsToCsv(recipients: Recipient[], sourcePostId?: string): string {
  const rows = [["chain", "wallet_address", "x_username", "x_author_id", "reply_id", "source_post_id", "mentions", "created_at"]];
  for (const wallet of recipients) rows.push([
    wallet.chain, wallet.address, wallet.username, wallet.authorId,
    wallet.replyId, sourcePostId ?? "", String(wallet.mentions), wallet.createdAt ?? "",
  ]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function parseManualReplies(input: string): Reply[] {
  return input.split(/\r?\n/).map((text) => text.trim()).filter(Boolean).slice(0, 10000).map((text, index) => ({
    id: "manual-" + (index + 1), authorId: "manual-" + (index + 1), username: "manual_" + (index + 1), text,
  }));
}
