// WeChat official accounts. Supports WeRead mp/cover + direct mp.weixin.qq.com extraction (free) or Dajiala (极致了).
import { credential } from "../config.ts";
import { sql } from "../db.ts";
import { extractFromUrl } from "../content/extract.ts";
import { upsertMaterial } from "../content/materials.ts";
import { enqueue, QUEUES } from "../jobs/queue.ts";
import { queueProcessing } from "../jobs/content.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { stripTags } from "../lib/text.ts";
import { sanitizeBody } from "../content/sanitize.ts";
import { identityKeyForUrl } from "../lib/url.ts";
import { dajialaConfigured, mpArticle, mpHistory, type MpArticle } from "../providers/dajiala.ts";
import { failureKind } from "../providers/receipts.ts";

let runtimeWereadCookie: string | null = null;

export function wereadConfigured(): boolean {
  return Boolean(credential("collectors", "WEREAD_COOKIE"));
}

export function mpCollectorConfigured(): boolean {
  return dajialaConfigured() || wereadConfigured();
}

function getWereadCookie(): string | null {
  return runtimeWereadCookie ?? credential("collectors", "WEREAD_COOKIE");
}

async function renewWereadCookie(cookie: string): Promise<string> {
  const res = await guardedFetch("https://weread.qq.com/web/login/renewal", {
    method: "POST",
    route: "direct",
    headers: {
      "content-type": "application/json;charset=UTF-8",
      accept: "application/json, text/plain, */*",
      origin: "https://weread.qq.com",
      referer: "https://weread.qq.com/",
      cookie,
    },
    body: JSON.stringify({ rq: "%2Fweb%2Fbook%2Fread" }),
    timeoutMs: 15_000,
  });
  const setCookies = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const map = new Map<string, string>();
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  for (const sc of setCookies) {
    const first = sc.split(";")[0] ?? "";
    const eq = first.indexOf("=");
    if (eq > 0) map.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
  const updated = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  runtimeWereadCookie = updated;
  return updated;
}

interface WereadCover {
  errcode?: number;
  errmsg?: string;
  reviewId?: string;
  title?: string;
  pic?: string;
  mp?: { avatar?: string; nickname?: string; introduction?: string };
}

const KNOWN_ALBUMS: Record<string, string[]> = {
  "mp-alibaba-tech": ["4553032283553038345"],
  "mp-taobao-tech": [
    "1522425612282494977",
    "2565944923443904512",
    "2565883875634397185",
    "1533906991218294785",
    "1592015847500414978",
    "1539610690070642689",
  ],
  "mp-amap-tech": ["4435679236414193667"],
  "mp-dewu-tech": [
    "3912573878257500173",
    "2467432582029361153",
    "2305149503479480324",
    "4369317552943005704",
  ],
  "mp-jd-tech": ["3354311538109333505", "3905071981338509316"],
  "mp-meituan-tech": ["2313242922622042112"],
  "mp-vivo-tech": ["4685263391375278087"],
};

interface CandidatePost {
  mpUrl: string;
  title: string;
  publishedAt?: Date | null;
  pic?: string | null;
  avatar?: string | null;
  raw: Record<string, unknown>;
}

/** Extracts WeChat album IDs from a raw mp.weixin.qq.com article page and persists any newly discovered IDs into sources.config.albums. */
async function autoDiscoverAlbums(sourceId: string, mpUrl: string, currentAlbums: string[] = []): Promise<string[]> {
  try {
    const res = await guardedFetch(mpUrl, { route: "direct", timeoutMs: 10_000 });
    if (res.status !== 200) return currentAlbums;
    const html = res.text();
    const ids1 = [...html.matchAll(/(?:album_id|albumId)["'\s:=]+(\d{15,22})/g)].map((m) => m[1]!);
    const ids2 = [...html.matchAll(/id:\s*JsDecode\('(\d{15,22})'\)/g)].map((m) => m[1]!);
    const known = new Set([...(KNOWN_ALBUMS[sourceId] ?? []), ...currentAlbums]);
    let changed = false;
    for (const id of [...ids1, ...ids2]) {
      if (!known.has(id)) {
        known.add(id);
        changed = true;
      }
    }
    const merged = [...known];
    if (changed) {
      await sql`UPDATE sources SET config = jsonb_set(coalesce(config, '{}'::jsonb), '{albums}', ${sql.json(merged as never)}, true), updated_at = now() WHERE id = ${sourceId}`;
    }
    return merged;
  } catch {
    return currentAlbums;
  }
}

/** Pulls secondary/multi-push articles from WeRead's /web/mp/articles when a new push is detected on /api/mp/cover. */
async function fetchWereadRecentArticles(bookId: string): Promise<CandidatePost[]> {
  const cookie = getWereadCookie();
  if (!cookie) return [];
  try {
    const url = `https://weread.qq.com/web/mp/articles?bookId=${encodeURIComponent(bookId)}&offset=0`;
    const res = await guardedFetch(url, {
      route: "direct",
      headers: { accept: "application/json, text/plain, */*", referer: "https://weread.qq.com/", cookie },
      timeoutMs: 10_000,
    });
    const payload = JSON.parse(res.text()) as {
      errCode?: number;
      errcode?: number;
      reviews?: Array<{
        createTime?: number;
        subReviews?: Array<{
          reviewId?: string;
          review?: {
            reviewId?: string;
            createTime?: number;
            mpInfo?: { title?: string; pic_url?: string; time?: number; avatar?: string };
          };
        }>;
      }>;
    };
    if ((payload.errCode ?? payload.errcode ?? 0) !== 0) return [];
    const out: CandidatePost[] = [];
    for (const group of (payload.reviews ?? []).slice(0, 2)) {
      const groupTime = group.createTime ?? 0;
      for (const sub of group.subReviews ?? []) {
        const rev = sub.review ?? {};
        const mpInfo = rev.mpInfo ?? {};
        const reviewId = rev.reviewId ?? sub.reviewId;
        const title = mpInfo.title?.trim();
        const ts = mpInfo.time ?? rev.createTime ?? groupTime;
        if (!reviewId || !title || !ts) continue;
        if (Date.now() - ts * 1000 > FIRST_CHECK_WINDOW_MS) continue;
        const prefix = `${bookId}_`;
        const rawToken = reviewId.startsWith(prefix) ? reviewId.slice(prefix.length) : reviewId.split("_").pop() ?? reviewId;
        const token = rawToken.replace(/~/g, "_");
        out.push({
          mpUrl: `https://mp.weixin.qq.com/s/${token}`,
          title,
          publishedAt: new Date(ts * 1000),
          pic: mpInfo.pic_url ? mpInfo.pic_url.replace(/^http:\/\//i, "https://") : null,
          avatar: mpInfo.avatar ? mpInfo.avatar.replace(/^http:\/\//i, "https://") : null,
          raw: { weread: { bookId, reviewId, via: "articles" } },
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchWechatAlbumCandidates(sourceId: string, wxid: string, extraAlbums: string[] = []): Promise<CandidatePost[]> {
  const albumIds = [...new Set([...(KNOWN_ALBUMS[sourceId] ?? []), ...extraAlbums])];
  if (!albumIds.length) return [];
  const byTitle = new Map<string, CandidatePost>();
  for (const albumId of albumIds) {
    for (const rev of ["0", "1"]) {
      try {
        const url = `https://mp.weixin.qq.com/mp/appmsgalbum?__biz=${encodeURIComponent(wxid)}&action=getalbum&album_id=${encodeURIComponent(albumId)}&count=5&is_reverse=${rev}&f=json`;
        const res = await guardedFetch(url, { route: "direct", timeoutMs: 10_000 });
        const data = JSON.parse(res.text()) as { getalbum_resp?: { article_list?: unknown } };
        const rawList = data.getalbum_resp?.article_list;
        const list = Array.isArray(rawList) ? rawList : rawList && typeof rawList === "object" ? [rawList] : [];
        for (const entry of list as Array<{ title?: string; url?: string; create_time?: string | number; cover_img_1_1?: string }>) {
          const title = entry.title?.trim();
          const rawUrl = entry.url?.replace(/\\x26amp;/g, "&").replace(/\\x26/g, "&").replace(/&amp;/g, "&").replace(/^http:\/\//i, "https://").split("#")[0];
          const ct = Number(entry.create_time ?? 0);
          if (!title || !rawUrl || !ct) continue;
          if (Date.now() - ct * 1000 > FIRST_CHECK_WINDOW_MS) continue;
          byTitle.set(title, {
            mpUrl: rawUrl,
            title,
            publishedAt: new Date(ct * 1000),
            pic: entry.cover_img_1_1?.replace(/^http:\/\//i, "https://") ?? null,
            raw: { album: { albumId, createTime: ct } },
          });
        }
      } catch {
        // Ignore transient album errors and fall back to WeRead cover.
      }
    }
  }
  return [...byTitle.values()];
}

async function fetchWereadCover(wxid: string): Promise<{ bookId: string; cover: WereadCover; mpUrl: string } | null> {
  let cookie = getWereadCookie();
  if (!cookie) return null;
  const decoded = Buffer.from(wxid, "base64").toString("utf8").trim();
  const bookId = /^\d+$/.test(decoded) ? `MP_WXS_${decoded}` : wxid;
  const url = `https://weread.qq.com/api/mp/cover?bookId=${encodeURIComponent(bookId)}`;
  const call = async (ck: string) => {
    const res = await guardedFetch(url, {
      route: "direct",
      headers: { accept: "application/json, text/plain, */*", referer: "https://weread.qq.com/", cookie: ck },
      timeoutMs: 15_000,
    });
    return JSON.parse(res.text()) as WereadCover;
  };
  let cover = await call(cookie);
  if (cover.errcode === -2012) {
    cookie = await renewWereadCookie(cookie);
    cover = await call(cookie);
  }
  if (!cover.reviewId || !cover.title) return null;
  const prefix = `${bookId}_`;
  const rawToken = cover.reviewId.startsWith(prefix) ? cover.reviewId.slice(prefix.length) : cover.reviewId;
  const token = rawToken.replace(/~/g, "_");
  return { bookId, cover, mpUrl: `https://mp.weixin.qq.com/s/${token}` };
}

const MAX_NEW_PER_CHECK = 8;
/** Posts older than this on the first check of an account are history, not news. */
const FIRST_CHECK_WINDOW_MS = 7 * 86400_000;
/** A body missing for a passing reason is fetched again on later checks: this often, while the post is this recent. */
const BODY_RETRIES = 3;
const BODY_RETRY_WINDOW_MS = 3 * 86400_000;

/** The article body, and when it is missing for a reason that may pass (rate limit, server error, lost answer), that reason. */
async function fetchBody(url: string, sourceId: string, identity: string): Promise<{ body: MpArticle | null; passing: string | null }> {
  try {
    return { body: await mpArticle(url, { subject: sourceId, identity }), passing: null };
  } catch (error) {
    const kind = failureKind(error);
    if (kind === "budget") throw error;
    return { body: null, passing: kind === "refused" ? null : String(error instanceof Error ? error.message : error).slice(0, 200) };
  }
}

interface MpSource {
  id: string;
  name: string;
  config: { wxid?: string; ghid?: string; nickname?: string; albums?: string[] };
  cursor: Record<string, unknown> | null;
  enabled: boolean;
  participation_mode: string;
}

export async function checkMpAccount(sourceId: string, reason: "schedule" | "manual") {
  const [source] = await sql<MpSource[]>`SELECT id, name, config, cursor, enabled, participation_mode FROM sources WHERE id = ${sourceId} AND kind = 'mp_account'`;
  if (!source) return { sourceId, status: "missing" as const };
  if (!source.enabled && reason !== "manual") return { sourceId, status: "paused" as const };
  const ghid = source.config.ghid ?? source.config.wxid;
  if (!ghid) return { sourceId, status: "unconfigured" as const };
  const [run] = await sql<{ id: number }[]>`INSERT INTO fetch_runs (source_id, detail) VALUES (${sourceId}, ${sql.json({ reason })}) RETURNING id`;
  const firstCheck = !source.cursor?.lastCheckedAt;
  let created = 0;
  try {
    if (!dajialaConfigured() && wereadConfigured() && source.config.wxid) {
      let currentAlbums = Array.isArray(source.config.albums) ? source.config.albums : [];
      const [item, albumPosts] = await Promise.all([
        fetchWereadCover(source.config.wxid),
        fetchWechatAlbumCandidates(sourceId, source.config.wxid, currentAlbums),
      ]);
      const candidates: CandidatePost[] = [...albumPosts];
      if (item && !candidates.some((c) => c.title.trim() === item.cover.title!.trim())) {
        candidates.unshift({
          mpUrl: item.mpUrl,
          title: item.cover.title!,
          pic: item.cover.pic ? item.cover.pic.replace(/^http:\/\//i, "https://") : null,
          avatar: item.cover.mp?.avatar?.replace(/^http:\/\//i, "https://") ?? null,
          raw: { weread: { bookId: item.bookId, reviewId: item.cover.reviewId } },
        });
      }
      if (item && item.cover.reviewId !== source.cursor?.lastReviewId) {
        const subPosts = await fetchWereadRecentArticles(item.bookId);
        for (const sp of subPosts) {
          if (!candidates.some((c) => c.title.trim() === sp.title.trim())) {
            candidates.push(sp);
          }
        }
      }
      const foundCount = candidates.length;
      for (const cand of candidates) {
        const key = identityKeyForUrl(cand.mpUrl);
        const [known] = key
          ? await sql<{ id: string; body_status: string }[]>`SELECT id, body_status FROM articles WHERE identity_key = ${key} OR title = ${cand.title} LIMIT 1`
          : await sql<{ id: string; body_status: string }[]>`SELECT id, body_status FROM articles WHERE source_id = ${sourceId} AND title = ${cand.title} LIMIT 1`;
        if (!known) {
          const [got, updatedAlbums] = await Promise.all([
            extractFromUrl(cand.mpUrl, `source:${sourceId}`, {}, { paidFallback: false }),
            autoDiscoverAlbums(sourceId, cand.mpUrl, currentAlbums),
          ]);
          currentAlbums = updatedAlbums;
          const picUrl = cand.pic ?? null;
          const media = got?.images?.length ? got.images : picUrl ? [{ kind: "image" as const, url: picUrl, width: null, height: null }] : [];
          const pubAt = got?.publishedAt ?? cand.publishedAt ?? new Date();
          const res = await upsertMaterial({
            sourceId,
            url: cand.mpUrl,
            title: cand.title,
            author: source.name,
            language: "zh",
            publishedAt: pubAt,
            publicationTime: got?.publicationTime ?? pubAt.toISOString(),
            excerpt: got?.text ? got.text.slice(0, 240) : null,
            bodyHtml: got?.html ?? null,
            bodyText: got?.text ?? null,
            bodyStatus: got?.text ? "ok" : "none",
            media,
            via: "fetch",
            backfill: firstCheck ? "first-import" : null,
            raw: cand.raw,
          });
          if (res.created) created += 1;
          if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId);
        }
        if (cand.avatar) {
          await sql`UPDATE sources SET icon_url = COALESCE(icon_url, ${cand.avatar}) WHERE id = ${sourceId}`;
        }
      }
      const cursor = { ...(source.cursor ?? {}), lastCheckedAt: new Date().toISOString(), lastReviewId: item?.cover.reviewId ?? source.cursor?.lastReviewId ?? null };
      await sql`
        UPDATE sources SET last_fetch_at = now(), last_ok_at = now(), fail_count = 0, last_error = NULL, health = 'ok', cursor = ${sql.json(cursor as never)},
          next_fetch_at = now() + make_interval(mins => interval_minutes), updated_at = now()
        WHERE id = ${sourceId}`;
      await sql`UPDATE fetch_runs SET status = 'ok', finished_at = now(), found_count = ${foundCount}, new_count = ${created} WHERE id = ${run!.id}`;
      return { sourceId, status: "ok" as const, found: foundCount, created, reused: false };
    }
    // One paid list call per account per 10-minute window, whoever asks.
    const window = `${reason === "schedule" ? "s" : "m"}:${Math.floor(Date.now() / 600_000)}`;
    const history = await mpHistory(ghid, { subject: sourceId, window });
    const posts = [...history.posts].sort((a, b) => b.post_time - a.post_time);
    let fetched = 0;
    for (const p of posts) {
      if (!p.url || !p.title || fetched >= MAX_NEW_PER_CHECK) continue;
      const publishedAt = p.post_time ? new Date(p.post_time * 1000) : null;
      if (firstCheck && publishedAt && Date.now() - publishedAt.getTime() > FIRST_CHECK_WINDOW_MS) continue;
      // Same identity rule as every entrance: the long link without tracking parameters. A known post is
      // skipped, unless its body failed for a passing reason: then it is tried again a few times.
      const key = identityKeyForUrl(p.url);
      const [known] = key
        ? await sql<{ id: string; body_status: string; discovered_at: Date; retry: { attempts: number } | null }[]>`
            SELECT id, body_status, discovered_at, raw->'dajiala'->'bodyRetry' AS retry FROM articles WHERE identity_key = ${key} LIMIT 1`
        : [];
      const retryBody = !!known?.retry && known.body_status === "none" && known.retry.attempts < BODY_RETRIES && Date.now() - known.discovered_at.getTime() < BODY_RETRY_WINDOW_MS;
      if (known && !retryBody) continue;
      fetched += 1;
      // Try direct free extraction first; fall back to paid Dajiala article_detail only when direct fetch fails.
      const directGot = await extractFromUrl(p.url, `source:${sourceId}`, {}, { paidFallback: false });
      const { body, passing } = directGot?.text ? { body: null, passing: null } : await fetchBody(p.url, sourceId, p.sn ?? p.url);
      if (known && !directGot?.text && !body?.content) {
        const retry = passing ? sql`jsonb_set(raw, '{dajiala,bodyRetry}', ${sql.json({ attempts: known.retry!.attempts + 1, error: passing })})` : sql`raw #- '{dajiala,bodyRetry}'`;
        await sql`UPDATE articles SET raw = ${retry} WHERE id = ${known.id}`;
        continue;
      }
      // Mode 1 bodies are light HTML (paragraphs and image tags).
      const html = directGot?.html ?? (body?.content ? sanitizeBody(body.content, p.url) : null);
      const text = directGot?.text ?? (body?.content ? stripTags(body.content) : null);
      const res = await upsertMaterial({
        sourceId,
        url: p.url,
        title: p.title,
        author: body?.author ?? source.name,
        language: "zh",
        publishedAt: directGot?.publishedAt ?? publishedAt,
        excerpt: p.digest ?? body?.desc ?? (text ? text.slice(0, 240) : null),
        bodyHtml: html,
        bodyText: text || null,
        bodyStatus: text ? "ok" : "none",
        media: directGot?.images ?? [],
        via: "fetch",
        backfill: firstCheck ? "first-import" : null,
        raw: {
          dajiala: {
            position: p.position, sn: p.sn ?? null, original: p.original ?? null, itemShowType: p.item_show_type ?? null, cover: p.cover_url ?? null,
            ...(passing ? { bodyRetry: { attempts: 1, error: passing } } : {}),
          },
        },
      });
      // A body fetched again arrives as a new revision (analysed again); stop retrying it.
      if (known) await sql`UPDATE articles SET raw = raw #- '{dajiala,bodyRetry}' WHERE id = ${known.id}`;
      if (res.created) created += 1;
      if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId);
    }
    const cursor = { ...(source.cursor ?? {}), lastCheckedAt: new Date().toISOString(), lastPostTime: posts[0]?.post_time ?? source.cursor?.lastPostTime ?? null, remainMoney: history.remainMoney };
    await sql`
      UPDATE sources SET last_fetch_at = now(), last_ok_at = now(), fail_count = 0, last_error = NULL, health = 'ok', cursor = ${sql.json(cursor as never)},
        next_fetch_at = now() + make_interval(mins => interval_minutes), updated_at = now()
      WHERE id = ${sourceId}`;
    await sql`UPDATE fetch_runs SET status = 'ok', finished_at = now(), found_count = ${posts.length}, new_count = ${created} WHERE id = ${run!.id}`;
    return { sourceId, status: "ok" as const, found: posts.length, created, reused: history.reused };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 500);
    const kind = failureKind(error);
    const soft = kind === "budget" || kind === "outage";
    await sql`
      UPDATE sources SET last_fetch_at = now(), last_error = ${message},
        fail_count = CASE WHEN ${soft} THEN fail_count ELSE fail_count + 1 END,
        health = CASE WHEN ${soft} THEN health WHEN fail_count + 1 >= 3 THEN 'failing' ELSE 'degraded' END, updated_at = now()
      WHERE id = ${sourceId}`;
    await sql`UPDATE fetch_runs SET status = 'failed', finished_at = now(), new_count = ${created}, error = ${message} WHERE id = ${run!.id}`;
    if (soft) throw error; // retried by the queue
    return { sourceId, status: "failed" as const, error: message };
  }
}

/** Every enabled account is checked once per its interval. */
export async function scheduleMpReconcile(now = new Date()) {
  if (!mpCollectorConfigured()) return { enqueued: 0 };
  const rows = await sql<{ id: string; last: string | null; interval_minutes: number }[]>`
    SELECT id, cursor->>'lastCheckedAt' AS last, interval_minutes FROM sources WHERE kind = 'mp_account' AND enabled`;
  let enqueued = 0;
  for (const s of rows) {
    const since = s.last ? now.getTime() - Date.parse(s.last) : Infinity;
    if (since <= s.interval_minutes * 60_000) continue;
    await enqueue(QUEUES.mpCheck, { sourceId: s.id, reason: "schedule" }, { singletonKey: `mp:${s.id}` });
    enqueued += 1;
  }
  return { enqueued };
}
