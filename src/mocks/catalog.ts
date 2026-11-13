// SPDX-License-Identifier: GPL-3.0-or-later

// A made-up catalogue for the mock server: invented titles, people and providers only.
import type { components } from "@/api/schema.gen";

type S = components["schemas"];

const TITLES: ReadonlyArray<[en: string, romanized: string, native: string]> = [
  ["The Lantern Keeper", "Tourou no Bannin", "灯籠の番人"],
  ["Moonlit Bakery", "Tsukiyo no Panya", "月夜のパン屋"],
  ["Iron Garden", "Tetsu no Niwa", "鉄の庭"],
  ["Paper Kites Over Harbor Town", "Minatomachi no Kami Dako", "港町の紙凧"],
  ["Salt and Starlight", "Shio to Hoshiakari", "塩と星明かり"],
  ["Ninth Floor Detectives", "Kyuukai Tantei", "九階探偵"],
  ["A Quiet Spell", "Shizuka na Mahou", "静かな魔法"],
  ["Clockwork Fox", "Haguruma Kitsune", "歯車狐"],
  ["Rooftop Orchestra", "Okujou Gakudan", "屋上楽団"],
  ["The Last Ferry Home", "Saigo no Renrakusen", "最後の連絡船"],
  ["Winter Map", "Fuyu no Chizu", "冬の地図"],
  ["Hollow Crown Academy", "Utsuro Kanmuri Gakuen", "虚冠学園"],
  ["Tea for Dragons", "Ryuu ni Ocha wo", "竜にお茶を"],
  ["Glass Sea", "Garasu no Umi", "硝子の海"],
  ["Seven Small Thunders", "Nanatsu no Koikazuchi", "七つの小雷"],
  ["River of Ink", "Sumi no Kawa", "墨の川"],
  ["Night Market Ghosts", "Yoichi no Yuurei", "夜市の幽霊"],
  ["Copper Wings", "Akagane no Tsubasa", "銅の翼"],
  ["The Sleepless Archivist", "Nemuranai Shishokan", "眠らない司書官"],
  ["Lemon Season", "Remon no Kisetsu", "レモンの季節"],
  ["Mountain Post Office", "Yama no Yuubinkyoku", "山の郵便局"],
  ["Echo Sword", "Kodama no Tsurugi", "木霊の剣"],
  ["Small Gods of the Kitchen", "Daidokoro no Kamisama", "台所の神様"],
  ["Blue Hour Racers", "Aoi Jikan no Hashiriya", "青い時間の走り屋"],
];

const TYPES = ["manga", "manhwa", "manhua", "webtoon", "comic", "light_novel"] as const;
const STATUSES = ["releasing", "completed", "hiatus", "cancelled", "upcoming"] as const;
const GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Mystery",
  "Romance",
  "Slice of Life",
  "Sci-Fi",
  "Sports",
];
const RATINGS: S["EntryContentRating"][] = ["safe", "safe", "safe", "suggestive", "safe", "erotic"];
/** Mostly the cycle; one unrated and one pornographic work, where a "suggestive" user sees the same as before. */
const rating = (i: number): S["EntryContentRating"] =>
  i === 6 ? "unknown" : i === 11 ? "pornographic" : pick(RATINGS, i);
const PEOPLE = ["Aoi Hoshino", "Ren Tachibana", "Mika Sorano", "Jun Kiriyama", "Sora Amane", "Kai Morioka"];

export const ATTRIBUTION: S["Attribution"] = {
  provider: "example-provider",
  url: "https://example.com",
  license: "CC BY 4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
};

function entryId(i: number): string {
  return `ent_${String(1000 + i)}`;
}

function pick<T>(list: readonly T[], i: number): T {
  return list[i % list.length] as T;
}

export const CATALOG: S["CatalogEntry"][] = TITLES.map(([en, romanized, native], i) => {
  const id = entryId(i);
  const type = pick(TYPES, i);
  const year = 2008 + ((i * 7) % 17);
  const status = pick(STATUSES, i);
  const genres = [pick(GENRES, i), pick(GENRES, i + 3), ...(i % 3 === 0 ? [pick(GENRES, i + 5)] : [])];
  return {
    id,
    title: en,
    type,
    status,
    content_rating: rating(i),
    original_language:
      type === "manhwa" || type === "webtoon" ? "ko" : type === "manhua" ? "zh" : type === "comic" ? "en" : "ja",
    year,
    ...(status === "completed" || status === "cancelled" ? { end_year: year + 3 } : {}),
    cover: { url: `/api/v1/catalog/entries/${id}/cover`, width: 600, height: 900 },
    titles: [
      { text: en, language: "en", kind: "official", primary: true },
      { text: native, language: "ja", kind: "native", primary: false },
      { text: romanized, language: "ja-Latn", kind: "romanized", primary: false },
    ],
    descriptions: [
      {
        text:
          i % 4 === 1
            ? `<p><b>${en}</b> follows a small cast through an unusual year.</p><p>Made-up text for the mock catalogue.</p>`
            : `${en} follows a small cast through an unusual year.\n\nMade-up text for the mock catalogue.`,
        language: "en",
        format: i % 4 === 1 ? "html" : "plain",
      },
    ],
    credits: [
      { name: pick(PEOPLE, i), role: "author" },
      { name: pick(PEOPLE, i + 2), role: "artist" },
    ],
    genres,
    tags: [
      { name: "Found Family", genre: false, spoiler: false },
      { name: "Twist Ending", genre: false, spoiler: true },
    ],
    external_ids: [
      { provider: "example-provider", id: String(5000 + i), url: `https://example.com/entries/${5000 + i}` },
    ],
    links: [{ type: "official", url: `https://example.org/works/${5000 + i}`, title: "Publisher page" }],
    attribution: [ATTRIBUTION],
  };
});

/** The summary the list endpoints return for an entry. */
export function summary(entry: S["CatalogEntry"], i: number): S["CatalogEntrySummary"] {
  const { id, title, type, status, content_rating, year, original_language, cover, genres, attribution } = entry;
  return {
    id,
    title,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    content_rating,
    ...(year ? { year } : {}),
    ...(original_language ? { original_language } : {}),
    ...(cover ? { cover } : {}),
    genres,
    rating: Math.round((6 + ((i * 37) % 40) / 10) * 10) / 10,
    attribution,
  };
}

const COLORS = ["#e0457b", "#3a7bd5", "#2fa36b", "#d98c1f", "#8e5bd8", "#1f9fb0"];

/** A generated cover: a coloured panel with the title, as SVG. */
export function coverSvg(entry: S["CatalogEntry"], i: number): string {
  const color = pick(COLORS, i);
  const words = entry.title.split(" ");
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last && `${last} ${word}`.length <= 12) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const text = lines
    .map((line, n) => `<text x="40" y="${560 + n * 64}" font-size="54" font-weight="700" fill="#fff">${line}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#111"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><path d="M40 60h520v300H40z" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="6"/><path d="M40 380h250v120H40zM310 380h250v120H310z" fill="#fff" fill-opacity=".12"/>${text}</svg>`;
}

const RATING_ORDER: S["EntryContentRating"][] = ["safe", "suggestive", "erotic", "pornographic"];

/** Whether a user with this ceiling may see an entry (unknown ratings are shown). */
export function withinCeiling(rating: S["EntryContentRating"], ceiling: S["ContentRating"]): boolean {
  if (rating === "unknown") return true;
  return RATING_ORDER.indexOf(rating) <= RATING_ORDER.indexOf(ceiling);
}
