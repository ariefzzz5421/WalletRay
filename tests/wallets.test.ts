import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateReplies, extractWallets, parseManualReplies, parsePostUrl, recipientsToCsv } from "../src/lib/wallets";

const a = "0x1111111111111111111111111111111111111111";
const b = "0x2222222222222222222222222222222222222222";
const sol = "So11111111111111111111111111111111111111112";

test("accepts x.com and twitter.com URLs only", () => {
  assert.equal(parsePostUrl("https://x.com/example/status/2112408699272642882?s=20"), "2112408699272642882");
  assert.equal(parsePostUrl("https://twitter.com/i/web/status/2112408699272642882"), "2112408699272642882");
  assert.equal(parsePostUrl("https://x.com.evil.test/example/status/2112408699272642882"), null);
  assert.equal(parsePostUrl("https://example.com/foo/status/2112408699272642882"), null);
});

test("extracts and validates EVM and Solana wallets", () => {
  const wallets = extractWallets("test " + a + " " + a + " " + sol, "both");
  assert.equal(wallets.length, 2);
  assert.deepEqual(wallets.map((w) => w.chain), ["EVM", "Solana"]);
  assert.equal(extractWallets("not a wallet: 0xZZZZ", "evm").length, 0);
  assert.equal(extractWallets(sol, "evm").length, 0);
});

test("deduplicates wallets and optionally limits per author", () => {
  const replies = [
    { id: "1", authorId: "alice", text: a + " " + b, username: "alice" },
    { id: "2", authorId: "bob", text: a, username: "bob" },
    { id: "3", authorId: "charlie", text: "hi" },
  ];
  const all = aggregateReplies(replies, "evm", false);
  assert.equal(all.recipients.length, 2);
  assert.equal(all.duplicateWallets, 1);
  assert.equal(all.noWalletReplies, 1);
  const limited = aggregateReplies(replies, "evm", true);
  assert.equal(limited.recipients.length, 1);
  assert.equal(limited.authorExclusions, 1);
});

test("CSV escapes cells and includes headers", () => {
  const summary = aggregateReplies(parseManualReplies(a + "\n" + b), "evm");
  const csv = recipientsToCsv(summary.recipients, "123");
  assert.match(csv, /wallet_address/);
  assert.match(csv, /123/);
  assert.equal(summary.recipients.length, 2);
});
