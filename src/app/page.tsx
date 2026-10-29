"use client";

import { useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck, Check,
  CheckCheck, ChevronDown, CircleAlert, CircleCheck, CircleHelp,
  Clipboard, Copy, Download, ExternalLink, FileDown, Filter, Fingerprint,
  Github, KeyRound, Layers3, Link2, ListFilter, LockKeyhole, Play,
  Radio, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles,
  Square, Terminal, Wallet, X, Zap,
} from "lucide-react";
import {
  aggregateReplies, parseManualReplies, parsePostUrl, recipientsToCsv,
  type ChainFilter, type Reply, type SearchMode,
} from "@/lib/wallets";

type Source = "x" | "manual" | "sample" | null;
type ScanResponse = {
  postId: string;
  replies: Reply[];
  nextToken: string | null;
  fetchedCount: number;
  error?: string;
};

const sampleReplies: Reply[] = [
  { id: "demo-1", authorId: "sample-1", username: "sample_alpha", text: "My wallet: 0x1111111111111111111111111111111111111111" },
  { id: "demo-2", authorId: "sample-2", username: "sample_beta", text: "Joining 0x2222222222222222222222222222222222222222" },
  { id: "demo-3", authorId: "sample-3", username: "sample_gamma", text: "0x1111111111111111111111111111111111111111" },
  { id: "demo-4", authorId: "sample-4", username: "sample_delta", text: "Solana: So11111111111111111111111111111111111111112" },
  { id: "demo-5", authorId: "sample-5", username: "sample_epsilon", text: "Love this project!" },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#b4f77b] text-[#09140d] shadow-[0_0_24px_rgba(170,251,111,.18)]">
        <span className="text-[24px] font-black tracking-[-.13em] pr-1">R</span>
        <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-[3px] border-[#080d13] bg-[#b4f77b]" />
      </div>
      {!compact && <span className="text-[21px] font-extrabold tracking-[-.05em]">Wallet<span className="text-[#b4f77b]">Ray</span></span>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[11px] font-bold uppercase tracking-[.21em] text-[#b4f77b]">{children}</div>;
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Activity }) {
  return (
    <div className="surface rounded-2xl p-5 md:p-6">
      <div className="flex items-start justify-between text-[#8ea1ab]">
        <span className="text-sm font-medium">{label}</span>
        <Icon size={17} />
      </div>
      <div className="stat-number mt-3 text-3xl font-semibold text-[#f1faef] md:text-[39px]">{value}</div>
      <div className="mt-1 text-xs text-[#81949e]">{note}</div>
    </div>
  );
}

function shortWallet(address: string) {
  return address.length > 25 ? address.slice(0, 9) + "..." + address.slice(-7) : address;
}

export default function Home() {
  const [tab, setTab] = useState<"x" | "manual">("x");
  const [postUrl, setPostUrl] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [manualText, setManualText] = useState("");
  const [chain, setChain] = useState<ChainFilter>("both");
  const [mode, setMode] = useState<SearchMode>("recent");
  const [maxPages, setMaxPages] = useState(5);
  const [onePerAuthor, setOnePerAuthor] = useState(false);
  const [includeNested, setIncludeNested] = useState(true);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [source, setSource] = useState<Source>(null);
  const [sourcePostId, setSourcePostId] = useState("");
  const [pagesFetched, setPagesFetched] = useState(0);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const filteredReplies = useMemo(() => (
    source !== "x" || includeNested
      ? replies
      : replies.filter((r) => r.referencedTweets?.some((ref) => ref.type === "replied_to" && ref.id === sourcePostId))
  ), [replies, includeNested, source, sourcePostId]);

  const summary = useMemo(
    () => aggregateReplies(filteredReplies, chain, onePerAuthor),
    [filteredReplies, chain, onePerAuthor],
  );
  const visibleRecipients = useMemo(() => summary.recipients.filter((r) =>
    (r.address + " " + r.username + " " + r.chain).toLowerCase().includes(search.trim().toLowerCase())
  ), [summary.recipients, search]);

  const allWallets = summary.recipients.length;
  const scanStopped = () => controllerRef.current?.abort();

  async function runScan(event?: React.FormEvent) {
    event?.preventDefault();
    if (running) return;
    const id = parsePostUrl(postUrl);
    if (!id) { setError("Enter a valid X post URL (e.g. https://x.com/user/status/1234567890123456789)."); return; }
    if (!accessKey.trim()) { setError("Enter your WalletRay admin access key to use the paid X API."); return; }
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setError("");
    setStatus("Connecting to X API...");
    setSource("x");
    setSourcePostId(id);
    setReplies([]);
    setPagesFetched(0);
    setSearch("");
    let cursor: string | null = null;
    let finished = false;
    let pages = 0;
    try {
      for (let i = 0; i < maxPages; i++) {
        if (controller.signal.aborted) break;
        const response: Response = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-walletray-key": accessKey },
          body: JSON.stringify({ postUrl, mode, ...(cursor ? { pageToken: cursor } : {}) }),
          signal: controller.signal,
        });
        const data = await response.json() as ScanResponse;
        if (!response.ok) throw new Error(data.error ?? "Unable to fetch replies from X.");
        pages = i + 1;
        setPagesFetched(pages);
        setReplies((previous) => {
          const map = new Map(previous.map((r) => [r.id, r]));
          for (const reply of data.replies) map.set(reply.id, reply);
          return Array.from(map.values());
        });
        cursor = data.nextToken;
        setStatus("Page " + pages + " scanned · processing addresses...");
        if (!cursor) { finished = true; break; }
      }
      if (controller.signal.aborted) setStatus("Scan stopped. Partial results are retained.");
      else if (finished) setStatus("Scan completed. Results are ready to export.");
      else setStatus("Page limit reached (" + pages + "). More replies may exist. Increase the limit and scan again.");
    } catch (caught) {
      if (controller.signal.aborted) setStatus("Scan stopped. Partial results are retained.");
      else {
        setError(caught instanceof Error ? caught.message : "Unexpected scan error.");
        setStatus("Scan interrupted. Any collected results are retained.");
      }
    } finally {
      setRunning(false);
      controllerRef.current = null;
    }
  }

  function importManual() {
    const parsed = parseManualReplies(manualText);
    if (!parsed.length) { setError("Paste at least one non-empty line."); return; }
    setReplies(parsed);
    setSource("manual");
    setSourcePostId("");
    setError("");
    setPagesFetched(0);
    setStatus(parsed.length + " manual lines imported. These are not verified X replies.");
    setSearch("");
  }

  function loadSample() {
    setChain("both");
    setReplies(sampleReplies);
    setSource("sample");
    setSourcePostId("");
    setPagesFetched(0);
    setError("");
    setStatus("Sample mode — all addresses and replies are illustrative, not actual participants.");
    setSearch("");
    document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportCsv() {
    if (!allWallets) return;
    const csv = recipientsToCsv(summary.recipients, sourcePostId || undefined);
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "walletray-" + (sourcePostId || source || "recipients") + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyAll() {
    if (!allWallets) return;
    try {
      await navigator.clipboard.writeText(summary.recipients.map((w) => w.address).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { setError("Clipboard access was blocked. Use CSV export instead."); }
  }

  return (
    <main className="overflow-hidden">
      <header className="border-b border-[#25333b]/70">
        <div className="shell flex h-[76px] items-center justify-between">
          <a href="#" aria-label="WalletRay home"><Logo /></a>
          <nav className="hidden items-center gap-8 text-[13px] font-semibold text-[#a0b0b8] md:flex">
            <a className="transition hover:text-white" href="#collector">Collector</a>
            <a className="transition hover:text-white" href="#results">Results</a>
            <a className="transition hover:text-white" href="#how-it-works">How it works</a>
          </nav>
          <a href="https://github.com/ariefzzz5421/WalletRay" target="_blank" rel="noopener noreferrer"
            className="btn-secondary flex items-center gap-2 px-4 py-2.5 text-xs">
            <Github size={15} /> <span className="hidden sm:inline">View source</span><ArrowUpRight size={14} />
          </a>
        </div>
      </header>

      <section className="shell relative pb-12 pt-16 lg:pb-20 lg:pt-[84px]">
        <div className="absolute -right-28 top-0 -z-10 h-[420px] w-[420px] rounded-full bg-[#9af16b]/[.045] blur-[110px]" />
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr] lg:gap-16">
          <div>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#435449] bg-[#17271d] px-3.5 py-2 text-[11px] font-bold tracking-[.09em] text-[#bafc90]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#bafc90]" />
              BUILT FOR THE ONCHAIN COMMUNITY
              <ArrowUpRight size={12} />
            </div>
            <h1 className="max-w-[700px] text-[48px] font-semibold leading-[1.055] tracking-[-.065em] text-[#f5faf7] sm:text-[66px] lg:text-[70px]">
              From replies to <span className="text-[#b4f77b]">wallets.</span><br />In seconds.
            </h1>
            <p className="mt-6 max-w-[570px] text-[15px] leading-[1.85] text-[#98aab5] md:text-[16px]">
              Paste an X post, extract public wallet addresses from the conversation, remove duplicates and export an airdrop-ready candidate list. No manual copying. No spreadsheets chaos.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#collector" className="btn-primary flex items-center gap-2.5 px-6 py-3.5 text-[13px]">Launch collector <ArrowUpRight size={17} /></a>
              <button type="button" onClick={loadSample} className="btn-secondary flex items-center gap-2.5 px-6 py-3.5 text-[13px]"><Play size={15} /> Explore sample</button>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-[#8ca19b]">
              <span className="flex items-center gap-2"><CircleCheck size={15} className="text-[#b4f77b]" /> EVM & Solana</span>
              <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-[#b4f77b]" /> Validated addresses</span>
              <span className="flex items-center gap-2"><FileDown size={15} className="text-[#b4f77b]" /> CSV export</span>
            </div>
          </div>

          <div className="relative">
            <div className="panel glow relative overflow-hidden rounded-[24px] p-5 sm:p-7">
              <div className="absolute inset-0 grid-pattern opacity-65" />
              <div className="relative">
                <div className="mb-7 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-bold tracking-[.09em] text-[#b4f77b]"><Radio size={15} /> LIVE PIPELINE PREVIEW</span>
                  <span className="rounded-lg border border-[#405047] bg-[#1c3326] px-2.5 py-1 text-[10px] font-semibold text-[#b4f77b]">DEMO VIEW</span>
                </div>
                <div className="surface relative overflow-hidden rounded-xl p-5">
                  <div className="flex items-center justify-between text-[#b9c9ce]">
                    <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#202f39] font-bold text-[#dbe8ec]">𝕏</div><span className="text-sm font-semibold">X Conversation</span></div>
                    <div className="flex h-2 w-2 rounded-full bg-[#b4f77b]" />
                  </div>
                  <div className="mono mt-4 text-xs leading-6 text-[#90a4aa]">
                    <div><span className="text-[#b4f77b]">→</span> @community_user</div>
                    <div className="mt-2 rounded-lg bg-[#1a272e] p-3 text-[#dae7dc]">Drop your wallet address below 👇</div>
                    <div className="mt-3 flex items-center gap-2 text-[#8fbbb0]"><span className="h-1.5 w-1.5 rounded-full bg-[#b4f77b]" /> Collecting public replies...</div>
                  </div>
                </div>
                <div className="my-4 flex justify-center"><div className="rounded-xl border border-[#486344] bg-[#233525] p-2.5 text-[#b4f77b]"><ArrowDownRight size={19} /></div></div>
                <div className="surface relative overflow-hidden rounded-xl p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold"><Fingerprint size={16} className="text-[#b4f77b]" /> Address extraction</span>
                    <span className="text-[11px] text-[#8799a3]">Processing</span>
                  </div>
                  <div className="mono mt-4 space-y-3 text-[11px] sm:text-xs">
                    <div className="flex items-center justify-between gap-2 text-[#b4f77b]"><span className="truncate">0x71C...4a20</span><span className="flex items-center gap-1"><Check size={13} /> Valid EVM</span></div>
                    <div className="flex items-center justify-between gap-2 text-[#b4f77b]"><span className="truncate">So111...11112</span><span className="flex items-center gap-1"><Check size={13} /> Valid Solana</span></div>
                    <div className="flex items-center justify-between gap-2 text-[#f1b97a]"><span className="truncate">0x71C...4a20</span><span className="flex items-center gap-1"><Layers3 size={13} /> Duplicate</span></div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2.5">
                  {["EXTRACT", "VALIDATE", "EXPORT"].map((step, i) => (
                    <div key={step} className="flex items-center justify-center gap-1 rounded-lg border border-[#3b5242] bg-[#1a3122] py-3 text-[10px] font-bold tracking-[.07em] text-[#b4f77b]">
                      <CheckCircleTiny /> {step}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -right-3 hidden rounded-xl border border-[#3a4c43] bg-[#1b2c21] px-4 py-3 text-xs font-semibold text-[#c6ff9c] shadow-2xl sm:flex sm:items-center sm:gap-2">
              <Zap size={16} /> No private keys required
            </div>
          </div>
        </div>
      </section>

      <section id="collector" className="shell scroll-mt-8 pb-12 pt-4 lg:pb-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><SectionLabel>01 / THE COLLECTOR</SectionLabel><h2 className="text-[30px] font-semibold tracking-[-.05em] md:text-[37px]">Start a new collection</h2><p className="mt-2 text-sm text-[#8ea1ad]">Scan a public X conversation or import replies you already have.</p></div>
          <div className="flex items-center gap-2 rounded-full border border-[#34423d] bg-[#17221d] px-3 py-2 text-xs text-[#b6e5bf]"><span className="h-2 w-2 rounded-full bg-[#b4f77b]" /> Browser-based processing</div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.55fr_.85fr]">
          <div className="panel rounded-[22px] p-5 sm:p-7">
            <div className="mb-7 flex w-full gap-1 rounded-xl bg-[#0c1319] p-1.5 sm:w-fit">
              <button type="button" disabled={running} onClick={() => { setTab("x"); setError(""); }} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition ${tab === "x" ? "bg-[#26362e] text-[#c4fa9f]" : "text-[#8d9fa9] hover:text-white"}`}><Link2 size={15} /> X Post URL</button>
              <button type="button" disabled={running} onClick={() => { setTab("manual"); setError(""); }} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold transition ${tab === "manual" ? "bg-[#26362e] text-[#c4fa9f]" : "text-[#8d9fa9] hover:text-white"}`}><Clipboard size={15} /> Manual import</button>
            </div>
            {tab === "x" ? (
              <form onSubmit={runScan}>
                <label className="field-label" htmlFor="post-url">X / Twitter post URL</label>
                <div className="relative">
                  <Link2 size={17} className="pointer-events-none absolute left-4 top-4 text-[#8297a1]" />
                  <input id="post-url" name="postUrl" className="input pl-11" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} placeholder="https://x.com/username/status/..." autoComplete="url" />
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div><label className="field-label" htmlFor="access-key">Admin access key</label><div className="relative"><KeyRound size={16} className="pointer-events-none absolute left-4 top-4 text-[#8297a1]" /><input id="access-key" name="accessKey" type={showKey ? "text" : "password"} value={accessKey} onChange={(e) => setAccessKey(e.target.value)} className="input pl-11 pr-[70px]" placeholder="Your private app key" autoComplete="off" /><button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-3 top-3.5 text-xs font-bold text-[#b4f77b]">{showKey ? "Hide" : "Show"}</button></div></div>
                  <div><label className="field-label" htmlFor="search-mode">Search coverage</label><div className="relative"><select id="search-mode" value={mode} onChange={(e) => setMode(e.target.value as SearchMode)} className="input appearance-none"><option value="recent">Recent · last 7 days</option><option value="archive">Full archive · paid access</option></select><ChevronDown size={15} className="pointer-events-none absolute right-4 top-4 text-[#81949c]" /></div></div>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div><label className="field-label" htmlFor="page-limit">Max pages per scan</label><select id="page-limit" className="input min-w-[176px]" value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))}>{[1, 3, 5, 10, 25].map((v) => <option key={v} value={v}>{v} page{v > 1 ? "s" : ""} · up to {v * 100} posts</option>)}</select></div>
                  <span className="max-w-[260px] text-xs leading-5 text-[#83949f]"><CircleAlert size={14} className="mr-1 inline text-[#e1b77c]" /> X may charge per post read. Increasing pages increases potential cost.</span>
                </div>
                <div className="mt-7 flex flex-wrap gap-3">
                  <button type="submit" disabled={running} className="btn-primary flex min-w-[190px] items-center justify-center gap-2 px-5 py-3.5 text-sm">{running ? <RefreshCw size={17} className="animate-spin" /> : <Search size={17} />}{running ? "Scanning replies..." : "Scan X replies"} <ArrowRight size={16} /></button>
                  {running && <button type="button" onClick={scanStopped} className="btn-secondary flex items-center gap-2 px-5 py-3.5 text-sm"><Square size={14} /> Stop scan</button>}
                  {pagesFetched > 0 && <span className="flex items-center text-xs text-[#a6b7c0]">{pagesFetched} page{pagesFetched > 1 ? "s" : ""} loaded</span>}
                </div>
              </form>
            ) : (
              <div>
                <label className="field-label" htmlFor="manual-replies">Paste one reply per line</label>
                <textarea id="manual-replies" className="input min-h-[220px] resize-y font-mono text-xs leading-6" placeholder={`Example:\nMy address: 0x1111111111111111111111111111111111111111\nSolana: So11111111111111111111111111111111111111112`} value={manualText} onChange={(e) => setManualText(e.target.value)} />
                <div className="mt-2 text-xs text-[#879ba4]">Each non-empty line is treated as one submission. Maximum 10,000 lines. No X API calls or charges.</div>
                <button type="button" onClick={importManual} className="btn-primary mt-6 flex items-center gap-2 px-5 py-3.5 text-sm"><Clipboard size={17} /> Analyze pasted replies <ArrowRight size={16} /></button>
              </div>
            )}
            {(error || status) && <div role={error ? "alert" : "status"} className={`mt-6 flex items-start gap-2 rounded-xl border px-4 py-3 text-[13px] leading-5 ${error ? "border-[#684341] bg-[#301c1e] text-[#ffc2bd]" : "border-[#3c5442] bg-[#17271e] text-[#b6e4bf]"}`}>{error ? <CircleAlert size={17} className="mt-0.5 shrink-0" /> : <CircleCheck size={17} className="mt-0.5 shrink-0" />}<span>{error || status}</span></div>}
          </div>

          <div className="panel rounded-[22px] p-5 sm:p-7">
            <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-base font-bold"><SlidersHorizontal size={18} className="text-[#b4f77b]" /> Scan settings</h3><span className="text-[11px] text-[#879aa5]">LIVE FILTERS</span></div>
            <div className="mt-7"><div className="field-label">Blockchain network</div><div className="grid grid-cols-3 gap-2">
              {([{ value: "both", label: "All" }, { value: "evm", label: "EVM" }, { value: "solana", label: "Solana" }] as const).map((option) =>
                <button key={option.value} type="button" onClick={() => setChain(option.value)} className={`rounded-xl border py-3 text-xs font-bold transition ${chain === option.value ? "border-[#b4f77b] bg-[#b4f77b]/10 text-[#c6ff9d]" : "border-[#3a454d] bg-[#131d24] text-[#94a5ae] hover:border-[#607568]"}`}>{option.label}</button>)}
            </div></div>
            <div className="mt-8 space-y-5">
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={onePerAuthor} onChange={(e) => setOnePerAuthor(e.target.checked)} className="mt-1 h-4 w-4 accent-[#b4f77b]" /><span><span className="block text-sm font-semibold">One wallet per X account</span><span className="mt-1 block text-xs leading-5 text-[#8296a0]">Keep the first valid address per author. Not Sybil-proof.</span></span></label>
              <div className="h-px bg-[#2a3840]" />
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={includeNested} onChange={(e) => setIncludeNested(e.target.checked)} className="mt-1 h-4 w-4 accent-[#b4f77b]" /><span><span className="block text-sm font-semibold">Include nested replies</span><span className="mt-1 block text-xs leading-5 text-[#8296a0]">Include replies to other replies within the same conversation.</span></span></label>
            </div>
            <div className="mt-8 rounded-xl border border-[#3c4c3e] bg-[#1c2b22] p-4">
              <ShieldCheck size={19} className="mb-2 text-[#b4f77b]" />
              <p className="text-xs font-bold text-[#d6f7ca]">Privacy by design</p>
              <p className="mt-1.5 text-xs leading-5 text-[#9cb7a5]">Your X bearer token stays on the server. Results are processed in this browser session; no database in the MVP.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="results" className="shell scroll-mt-8 pb-20">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><SectionLabel>02 / YOUR RESULTS</SectionLabel><h2 className="text-[30px] font-semibold tracking-[-.05em] md:text-[37px]">Collection overview</h2><p className="mt-2 text-sm text-[#8ea1ad]">All counts update instantly when you change filters.</p></div>
          <div className="flex flex-wrap gap-2">{source === "sample" ? <span className="pill border-[#80724c] bg-[#30281b] text-[#ffd994]">SAMPLE DATA · NOT REAL</span> : source === "manual" ? <span className="pill">MANUAL · UNVERIFIED</span> : source === "x" ? <span className="pill border-[#3c6148] bg-[#1a2c22] text-[#baf49f]">X API · {pagesFetched} PAGE{pagesFetched !== 1 ? "S" : ""}</span> : <span className="pill">NO COLLECTION YET</span>}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Replies analyzed" value={summary.replies.toLocaleString()} note="Within the active filters" icon={Activity} />
          <Metric label="Unique wallets" value={allWallets.toLocaleString()} note="Eligible candidate addresses" icon={Wallet} />
          <Metric label="Duplicate mentions" value={summary.duplicateWallets.toLocaleString()} note="Repeated submissions removed" icon={Layers3} />
          <Metric label="Unique X authors" value={summary.uniqueAuthors.toLocaleString()} note="Authors with valid wallet matches" icon={Fingerprint} />
        </div>
        <div className="mt-5 panel overflow-hidden rounded-[22px]">
          <div className="flex flex-col gap-4 border-b border-[#2a3740] p-5 md:flex-row md:items-center md:justify-between md:p-6">
            <div><h3 className="text-lg font-bold tracking-[-.025em]">Recipient list <span className="ml-1 text-sm font-medium text-[#82949e]">({visibleRecipients.length})</span></h3><p className="mt-1 text-xs text-[#82949e]">Address validity does not prove ownership or airdrop eligibility.</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={copyAll} disabled={!allWallets} className="btn-secondary flex items-center gap-2 px-4 py-2.5 text-xs">{copied ? <CheckCheck size={14} /> : <Copy size={14} />}{copied ? "Copied!" : "Copy addresses"}</button><button type="button" onClick={exportCsv} disabled={!allWallets} className="btn-primary flex items-center gap-2 px-4 py-2.5 text-xs"><Download size={15} /> Export CSV</button></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2a3740] px-5 py-4 md:px-6"><div className="relative w-full sm:max-w-[350px]"><Search size={15} className="absolute left-3.5 top-3.5 text-[#81959d]" /><input type="search" className="input !min-h-[43px] !rounded-lg !pl-10 text-xs" placeholder="Search wallet, username or chain..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><span className="flex items-center gap-1.5 text-xs text-[#8499a2]"><ListFilter size={14} /> {summary.authorExclusions} filtered by author</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="bg-[#111b23] text-[10px] font-bold uppercase tracking-[.12em] text-[#80939e]"><tr><th className="px-6 py-4">#</th><th className="px-3 py-4">Wallet address</th><th className="px-3 py-4">Network</th><th className="px-3 py-4">X account</th><th className="px-3 py-4">Mentions</th><th className="px-4 py-4">Source</th></tr></thead>
              <tbody className="divide-y divide-[#28353e]">
                {visibleRecipients.slice(0, 100).map((recipient, index) => (
                  <tr key={recipient.chain + recipient.address} className="transition hover:bg-[#1a272f]">
                    <td className="px-6 py-4 text-xs text-[#85969f]">{String(index + 1).padStart(2, "0")}</td>
                    <td className="px-3 py-4"><div className="flex items-center gap-2"><span className="mono text-xs font-semibold text-[#c5f4c1]" title={recipient.address}>{shortWallet(recipient.address)}</span><button type="button" aria-label={"Copy address " + recipient.address} onClick={() => navigator.clipboard.writeText(recipient.address).catch(() => setError("Clipboard blocked."))} className="text-[#8799a2] hover:text-white"><Copy size={13} /></button></div></td>
                    <td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${recipient.chain === "EVM" ? "bg-[#28334c] text-[#aebfff]" : "bg-[#302747] text-[#d9b9ff]"}`}>{recipient.chain}</span></td>
                    <td className="px-3 py-4 text-xs text-[#a7b8c2]">{recipient.username ? "@" + recipient.username : "—"}</td>
                    <td className="px-3 py-4 text-xs text-[#cbd8d0]">{recipient.mentions}</td>
                    <td className="px-4 py-4">{source === "x" ? <a target="_blank" rel="noopener noreferrer" href={"https://x.com/i/web/status/" + encodeURIComponent(recipient.replyId)} className="inline-flex items-center gap-1 text-xs text-[#b4f77b] hover:underline">Reply <ExternalLink size={12} /></a> : <span className="text-xs text-[#7b909a]">{source === "sample" ? "Sample" : "Manual"}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visibleRecipients.length && <div className="flex flex-col items-center justify-center px-6 py-16 text-center"><div className="mb-4 rounded-2xl border border-[#344641] bg-[#203026] p-4 text-[#b4f77b]"><Wallet size={27} /></div><h3 className="text-base font-bold">{source ? "No matching addresses" : "Your next airdrop starts here"}</h3><p className="mt-2 max-w-[420px] text-sm leading-6 text-[#8ea0aa]">{source ? "Try another network, search term, or import data containing valid public addresses." : "Scan an X post above, paste a list of replies or explore the built-in sample to see WalletRay in action."}</p>{!source && <button type="button" onClick={loadSample} className="btn-secondary mt-5 flex items-center gap-2 px-5 py-2.5 text-xs"><Play size={14} /> Load sample data</button>}</div>}
          {visibleRecipients.length > 100 && <div className="border-t border-[#2a3740] px-6 py-4 text-center text-xs text-[#a6bac1]">Showing the first 100 of {visibleRecipients.length} matching recipients. CSV export includes all {summary.recipients.length} recipients.</div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#2a3740] bg-[#121c22] px-6 py-4 text-xs text-[#8da0a7]"><span><BadgeCheck size={14} className="mr-1 inline text-[#b4f77b]" /> Validated format · deduplicated · exportable</span><span>{summary.noWalletReplies} replies without valid matches · {summary.totalMentions} total address mentions</span></div>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-[#24323b] bg-[#0a1117] py-16">
        <div className="shell"><SectionLabel>03 / HOW IT WORKS</SectionLabel><h2 className="text-[30px] font-semibold tracking-[-.045em] md:text-[37px]">One link. Three steps.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { number: "01", title: "Connect the conversation", description: "Paste the public X post URL. WalletRay uses authorized X search endpoints with cursor-based pagination.", icon: Link2 },
              { number: "02", title: "Validate & clean", description: "Extract EVM and Solana addresses, validate formats, filter replies and remove duplicate addresses.", icon: ShieldCheck },
              { number: "03", title: "Export your recipients", description: "Download a CSV candidate list to review, verify and use with your preferred distribution workflow.", icon: FileDown },
            ].map((step) => <div key={step.number} className="surface rounded-2xl p-6"><div className="flex items-center justify-between"><step.icon size={26} className="text-[#b4f77b]" /><span className="mono text-sm text-[#667d80]">{step.number}</span></div><h3 className="mt-7 text-lg font-bold">{step.title}</h3><p className="mt-3 text-sm leading-7 text-[#92a3ad]">{step.description}</p></div>)}
          </div>
          <div className="mt-8 flex flex-wrap items-start gap-3 rounded-xl border border-[#524c36] bg-[#272417] px-5 py-4 text-xs leading-6 text-[#d1c29e]"><CircleHelp size={19} className="mt-0.5 shrink-0 text-[#ead08d]" /><span><strong>Important:</strong> X search is not guaranteed to include every reply. Recent search covers only 7 days, full archive requires eligible API access, and reads may incur charges. WalletRay never sends tokens or asks for wallet private keys. Verify airdrop eligibility independently.</span></div>
        </div>
      </section>

      <footer className="border-t border-[#25333b] py-8"><div className="shell flex flex-wrap items-center justify-between gap-5"><Logo /><p className="text-xs text-[#83949e]">Built for transparent community distribution · WalletRay MVP</p><a className="flex items-center gap-2 text-xs text-[#b0c2c8] hover:text-[#b4f77b]" href="https://github.com/ariefzzz5421/WalletRay" target="_blank" rel="noopener noreferrer"><Github size={15} /> Open source <ArrowUpRight size={14} /></a></div></footer>
    </main>
  );
}

function CheckCircleTiny() {
  return <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#b4f77b]"><Check size={9} strokeWidth={3} /></span>;
}
