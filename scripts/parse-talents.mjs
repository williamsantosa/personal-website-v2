/**
 * Parses the Deepwoken Fandom wiki raw wikitext into structured talent records,
 * then writes a SQL seed file at scripts/seed-talents.sql.
 *
 * Usage:
 *   node scripts/parse-talents.mjs          (uses cached scripts/wiki-talents-raw.txt)
 *   npx wrangler d1 execute DB --local  --file=scripts/seed-talents.sql
 *   npx wrangler d1 execute DB --remote --file=scripts/seed-talents.sql
 *
 * To refresh the source:
 *   node scripts/fetch-wikitext.mjs
 */

import { writeFileSync, readFileSync, existsSync } from "fs";

const RAW_WIKITEXT = "scripts/wiki-talents-raw.txt";
const OUTPUT_SQL   = "scripts/seed-talents.sql";
const OUTPUT_JSON  = "scripts/talents-debug.json";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Strip {{template}} calls, [[wikilinks]], wiki formatting, and HTML tags */
function cleanWikiMarkup(text) {
  return text
    .replace(/'{2,3}/g, "")               // '''bold''' / ''italic''
    .replace(/\{\{[^}]+\}\}/g, (m) => {   // {{templates}} → last pipe param or ""
      const parts = m.slice(2, -2).split("|");
      return parts.length > 1 ? parts[parts.length - 1].trim() : "";
    })
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")  // [[link|label]] → label
    .replace(/\[\[([^\]]+)\]\]/g, "$1")   // [[link]] → link
    .replace(/<[^>]+>/g, "")              // <html tags>
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escSql(str) {
  return str.replace(/'/g, "''");
}

// ──────────────────────────────────────────────────────────────────────────────
// Bracket tag parser  "[Rarity, Attr1, Attr2]"
// ──────────────────────────────────────────────────────────────────────────────

function parseBracketTag(line) {
  // `line` is already the full bracket string, e.g. "[Faction Talent, [[Authority Ensign]] Exclusive]"
  // Strip the outer [ and ] directly instead of using a regex that stops at the first ]
  const first = line.indexOf("[");
  const last  = line.lastIndexOf("]");
  if (first === -1 || last === -1 || last <= first) return null;

  const parts = line.slice(first + 1, last).split(",").map((p) => p.trim());
  if (parts.length === 0) return null;

  const rarityRaw = parts[0];
  let rarity = "Common";
  if (rarityRaw.startsWith("Advanced"))     rarity = "Advanced";
  else if (rarityRaw.startsWith("Rare"))    rarity = "Rare";
  else if (rarityRaw.startsWith("Common"))  rarity = "Common";
  else if (rarityRaw.startsWith("Oath"))    rarity = "Oath";
  else if (rarityRaw.startsWith("Quest"))   rarity = "Quest";
  else if (rarityRaw.startsWith("Faction")) rarity = "Faction";
  else if (rarityRaw.startsWith("Race"))    rarity = "Race";
  else if (rarityRaw.startsWith("Origin"))  rarity = "Origin";
  else if (rarityRaw.startsWith("Mantra Level")) rarity = "Mantra Level";
  else if (rarityRaw.startsWith("Mastery")) rarity = "Mastery";
  else if (rarityRaw.startsWith("Murmur"))  rarity = "Murmur";
  else                                      rarity = rarityRaw.replace(" Talent", "");

  let altGroupCounter = 0;
  const attributes = [];
  for (const part of parts.slice(1)) {
    const raw = part.trim();
    if (!raw) continue;
    if (raw.includes("//")) {
      altGroupCounter++;
      const group = altGroupCounter;
      raw.split("//").forEach((a) => {
        const n = cleanWikiMarkup(a.trim());
        if (n) attributes.push({ name: n, isAlternative: true, altGroup: group });
      });
    } else {
      attributes.push({ name: cleanWikiMarkup(raw), isAlternative: false, altGroup: null });
    }
  }

  return { rarity, attributes };
}

// ──────────────────────────────────────────────────────────────────────────────
// Prerequisite parser
// ──────────────────────────────────────────────────────────────────────────────

function parsePrereqs(text) {
  const prereqs = [];
  let groupCounter = 0;
  const orGroups = text.split(/\bOR\b/i);

  if (orGroups.length > 1) {
    // "OR" word case: each comma-separated block is one alternative group.
    // e.g. "A, B OR C, D" → group1={A,B}, group2={C,D}
    for (const block of orGroups) {
      groupCounter++;
      const currentGroup = groupCounter;
      const parts = block.split(",").map((p) => cleanWikiMarkup(p).trim()).filter(Boolean);
      for (const part of parts) {
        if (part.includes("//")) {
          // "//" within an OR block: treat as same group (they're already alternatives)
          part.split("//").forEach((a) => {
            const r = classifyPrereq(a.trim());
            if (r) prereqs.push({ ...r, isAlternative: true, altGroup: currentGroup });
          });
        } else {
          const r = classifyPrereq(part);
          if (r) prereqs.push({ ...r, isAlternative: true, altGroup: currentGroup });
        }
      }
    }
  } else {
    // No "OR" word: only "//" creates alternative groups within a single block.
    // e.g. "90 Light, 90 Medium // 90 Heavy, Using a Pistol"
    //   → 90 Light (required), {90 Medium OR 90 Heavy} (group 1), Using a Pistol (required)
    const parts = orGroups[0].split(",").map((p) => cleanWikiMarkup(p).trim()).filter(Boolean);
    for (const part of parts) {
      if (part.includes("//")) {
        groupCounter++;
        const currentGroup = groupCounter;
        part.split("//").forEach((a) => {
          const r = classifyPrereq(a.trim());
          if (r) prereqs.push({ ...r, isAlternative: true, altGroup: currentGroup });
        });
      } else {
        const r = classifyPrereq(part);
        if (r) prereqs.push({ ...r, isAlternative: false, altGroup: null });
      }
    }
  }

  return prereqs;
}

function classifyPrereq(text) {
  text = text.trim();
  if (!text) return null;

  // "N Attribute" — numeric requirement
  if (/^\d+\s+\S/.test(text)) return { prereqType: "attribute", prereqValue: text };

  // Power N
  if (/^Power\s+\d+$/i.test(text)) return { prereqType: "power", prereqValue: text };

  // Action-like
  const lower = text.toLowerCase();
  if (
    lower.includes("interact") ||
    lower.includes("cauldron") ||
    lower.includes("automatically obtained") ||
    lower.includes("fishing") ||
    lower.includes("completing") ||
    lower.includes("quest") ||
    lower.includes("promotion reward") ||
    lower.includes("obtainment")
  ) {
    return { prereqType: "action", prereqValue: text };
  }

  // Mantra "(Mantra)" suffix
  if (text.includes("(Mantra)")) {
    return { prereqType: "talent", prereqValue: text.replace("(Mantra)", "").trim() };
  }

  // "All X Talents"
  if (lower.startsWith("all ")) return { prereqType: "talent", prereqValue: text };

  // Oath reference
  if (lower.startsWith("oath:") || lower.includes("oath:")) {
    return { prereqType: "talent", prereqValue: text };
  }

  // Non-empty non-numeric → talent name
  if (text && !/^\d+$/.test(text)) return { prereqType: "talent", prereqValue: text };

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Wikitext parser
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns the nesting depth of a wikitext bullet line.
 * "* foo"  → 1,  "** foo" → 2,  "*** foo" → 3,  etc.
 * Non-bullet lines → 0.
 */
function bulletDepth(line) {
  const m = line.match(/^(\*+)/);
  return m ? m[1].length : 0;
}

/** Strip leading asterisks and trim */
function stripBullets(line) {
  return line.replace(/^\*+/, "").trim();
}

const KNOWN_RARITIES = [
  "common", "rare", "advanced", "oath", "quest", "faction", "race", "origin",
  "mantra level", "mastery", "murmur", "unlockable", "echo",
];

/**
 * Scan `content` for the first bracket `[...]` whose content starts with a
 * known rarity word (skipping wikilinks [[...]] and category links [[:...]]).
 * Returns { brIdx, closeBr } or null.
 */
function findRarityBracket(content) {
  let i = 0;
  while (i < content.length) {
    const brIdx = content.indexOf("[", i);
    if (brIdx === -1) return null;

    const next = content[brIdx + 1];

    // Skip wikilinks [[...]] and category links [[:...]]
    if (next === "[" || next === ":") {
      // advance past the closing ]] or ]
      const closeDouble = content.indexOf("]]", brIdx);
      i = closeDouble !== -1 ? closeDouble + 2 : brIdx + 2;
      continue;
    }

    // Skip bold/italic markers that happen to contain brackets ('''[[...]]''')
    // These are always wikilinks — handled above; nothing extra needed.

    // Find the matching ] while hopping over any [[...]] wikilinks inside the bracket
    let closeBr = -1;
    let j = brIdx + 1;
    while (j < content.length) {
      if (content[j] === "[" && content[j + 1] === "[") {
        // Skip nested [[wikilink]] — find its ]]
        const nested = content.indexOf("]]", j + 2);
        j = nested !== -1 ? nested + 2 : j + 2;
        continue;
      }
      if (content[j] === "]") { closeBr = j; break; }
      j++;
    }
    if (closeBr === -1) return null;

    const bracketContent = content.slice(brIdx + 1, closeBr).toLowerCase().trim();
    if (KNOWN_RARITIES.some((r) => bracketContent.startsWith(r))) {
      return { brIdx, closeBr };
    }

    i = brIdx + 1;
  }
  return null;
}

/**
 * Detect a talent entry line.
 * Wikitext talent lines look like:
 *   *{{cl|rarityclass|Name}} [Rarity, Attr] - Description
 *   *[[Oath: X|{{cl|...}}]] [Oath Talent] - Description
 *   *'''[[Murmur: X]]''' [Common Talent, Unlockable Talent] - Description
 * Depth is always 1 (single leading *).
 */
function isTalentEntryLine(line) {
  if (bulletDepth(line) !== 1) return false;
  const content = stripBullets(line);

  const rb = findRarityBracket(content);
  if (!rb) return false;

  // The rarity bracket must appear before " - "
  const dIdx = content.indexOf(" - ");
  if (dIdx === -1) return false;
  if (rb.brIdx > dIdx) return false;

  return true;
}

function parseTalentEntryLine(line) {
  const content = stripBullets(line);

  const rb = findRarityBracket(content);
  if (!rb) return null;

  // Name is everything before the rarity bracket, cleaned up
  const namePart = content.slice(0, rb.brIdx).trim();
  let name;
  const clMatch = namePart.match(/\{\{cl\|[^|]+\|([^}]+)\}\}/);
  if (clMatch) {
    name = clMatch[1].trim();
  } else {
    name = namePart;
  }

  // Parse the rarity bracket content
  const bracketContent = content.slice(rb.brIdx, rb.closeBr + 1);
  const tag = parseBracketTag(bracketContent);
  if (!tag) return null;

  // Description follows " - " after the closing bracket
  const dashIdx = content.indexOf(" - ", rb.closeBr);
  const description = dashIdx !== -1
    ? cleanWikiMarkup(content.slice(dashIdx + 3).trim())
    : "";

  return { name: cleanWikiMarkup(name), tag, description };
}

function parseTalents(wikitext) {
  const lines = wikitext.split("\n");
  const talents = [];
  const seenIds = new Set();

  let currentTree = null;
  let currentTalent = null;

  function finalizeTalent() {
    if (!currentTalent) return;
    talents.push(currentTalent);
    currentTalent = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // === Tree name ===
    const treeMatch = line.match(/^===\s*(.+?)\s*===$/);
    if (treeMatch) {
      finalizeTalent();
      currentTree = treeMatch[1].trim();
      continue;
    }

    // ## Talents section start (h2)
    if (line.match(/^==\s*Talents\s*==$/)) {
      currentTree = null;
      continue;
    }

    // Skip lines outside a tree
    if (currentTree === null) continue;

    // Depth-1 bullet: new talent entry
    if (isTalentEntryLine(line)) {
      finalizeTalent();
      const parsed = parseTalentEntryLine(line);
      if (!parsed) continue;

      const baseSlug = slugify(parsed.name);
      let slug = baseSlug;
      let counter = 1;
      while (seenIds.has(slug)) slug = `${baseSlug}-${++counter}`;
      seenIds.add(slug);

      currentTalent = {
        id: slug,
        name: parsed.name,
        tree: currentTree,
        rarity: parsed.tag.rarity,
        attributes: parsed.tag.attributes,
        description: parsed.description,
        prerequisites: [],
        notes: [],
      };
      continue;
    }

    // Depth ≥ 2 bullets: notes / prerequisites under current talent
    if (currentTalent && bulletDepth(line) >= 2) {
      const content = cleanWikiMarkup(stripBullets(line));
      if (!content) continue;

      const prereqMatch = content.match(/^Prerequisit(?:e|es|ies):\s*(.+)$/i);
      if (prereqMatch) {
        const parsed = parsePrereqs(prereqMatch[1]);
        currentTalent.prerequisites.push(...parsed);
      } else {
        currentTalent.notes.push(content);
      }
      continue;
    }

    // Non-bullet paragraph that starts with "Prerequisites:" (some entries use this)
    if (currentTalent && /^Prerequisit\w*:/i.test(line.trim())) {
      const m = line.trim().match(/^Prerequisit(?:e|es|ies):\s*(.+)$/i);
      if (m) {
        const parsed = parsePrereqs(m[1]);
        currentTalent.prerequisites.push(...parsed);
      }
      continue;
    }
  }

  finalizeTalent();
  return talents;
}

// ──────────────────────────────────────────────────────────────────────────────
// SQL builder
// ──────────────────────────────────────────────────────────────────────────────

function buildSql(talents) {
  const lines = [
    "-- Generated by scripts/parse-talents.mjs",
    "-- Do not edit manually; re-run the script to regenerate",
    "",
    "DELETE FROM talent_prerequisites;",
    "DELETE FROM talent_attributes;",
    "DELETE FROM talents;",
    "",
  ];

  for (const t of talents) {
    const notes = escSql(JSON.stringify(t.notes));
    const desc  = escSql(t.description || "");
    lines.push(
      `INSERT INTO talents (id, name, tree, rarity, description, notes) VALUES ('${escSql(t.id)}', '${escSql(t.name)}', '${escSql(t.tree)}', '${escSql(t.rarity)}', '${desc}', '${notes}');`
    );
  }

  lines.push("");

  for (const t of talents) {
    for (const attr of t.attributes) {
      const numMatch = attr.name.match(/^(\d+)\s+(.+)$/);
      const attrName = numMatch ? numMatch[2] : attr.name;
      const minVal   = numMatch ? numMatch[1] : "NULL";
      const isAlt    = attr.isAlternative ? 1 : 0;
      const altGroup = attr.altGroup != null ? attr.altGroup : "NULL";
      lines.push(
        `INSERT OR IGNORE INTO talent_attributes (talent_id, attribute, min_value, is_alternative, alt_group) VALUES ('${escSql(t.id)}', '${escSql(attrName)}', ${minVal}, ${isAlt}, ${altGroup});`
      );
    }
  }

  lines.push("");

  for (const t of talents) {
    for (const prereq of t.prerequisites) {
      const isAlt    = prereq.isAlternative ? 1 : 0;
      const altGroup = prereq.altGroup != null ? prereq.altGroup : "NULL";
      lines.push(
        `INSERT OR IGNORE INTO talent_prerequisites (talent_id, prereq_type, prereq_value, is_alternative, alt_group) VALUES ('${escSql(t.id)}', '${escSql(prereq.prereqType)}', '${escSql(prereq.prereqValue)}', ${isAlt}, ${altGroup});`
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(RAW_WIKITEXT)) {
    throw new Error(
      `Missing ${RAW_WIKITEXT}. Run: node scripts/fetch-wikitext.mjs`
    );
  }

  console.log(`Parsing ${RAW_WIKITEXT}...`);
  const wikitext = readFileSync(RAW_WIKITEXT, "utf8");
  const talents  = parseTalents(wikitext);

  console.log(`Parsed ${talents.length} talents`);

  const withPrereqs = talents.filter((t) => t.prerequisites.length > 0).length;
  console.log(`  With prerequisites: ${withPrereqs}`);
  console.log(`  Without prerequisites: ${talents.length - withPrereqs}`);

  if (talents.length < 100) {
    console.warn("WARNING: suspiciously few talents parsed.");
  }

  writeFileSync(OUTPUT_SQL,  buildSql(talents), "utf8");
  writeFileSync(OUTPUT_JSON, JSON.stringify(talents, null, 2), "utf8");

  console.log(`\nWritten: ${OUTPUT_SQL}`);
  console.log(`Written: ${OUTPUT_JSON} (debug)`);
  console.log("\nNext steps:");
  console.log("  npx wrangler d1 execute DB --local  --file=scripts/seed-talents.sql");
  console.log("  npx wrangler d1 execute DB --remote --file=scripts/seed-talents.sql");
}

main().catch((err) => { console.error(err); process.exit(1); });
