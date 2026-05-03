import { useState, useEffect, useRef, useCallback } from "react";
import Fuse from "fuse.js";
import type { Talent } from "../../pages/api/deepwoken/talents";
import { TalentCard } from "./TalentCard";

// ──────────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────────

interface FilterGroup {
  label: string;
  items: { value: string; display: string }[];
}

const FILTER_GROUPS: FilterGroup[] = [
  {
    label: "Core Stats",
    items: [
      { value: "Strength",     display: "STR" },
      { value: "Fortitude",    display: "FTD" },
      { value: "Agility",      display: "AGL" },
      { value: "Intelligence", display: "INT" },
      { value: "Willpower",    display: "WIL" },
      { value: "Charisma",     display: "CHA" },
    ],
  },
  {
    label: "Elements",
    items: [
      { value: "Flamecharm",  display: "Flame" },
      { value: "Frostdraw",   display: "Frost" },
      { value: "Thundercall", display: "Thunder" },
      { value: "Galebreathe", display: "Gale" },
      { value: "Shadowcast",  display: "Shadow" },
      { value: "Ironsing",    display: "Iron" },
      { value: "Bloodrend",   display: "Blood" },
    ],
  },
  {
    label: "Weapon",
    items: [
      { value: "Heavy Weapon",  display: "Heavy" },
      { value: "Medium Weapon", display: "Medium" },
      { value: "Light Weapon",  display: "Light" },
    ],
  },
];

const ALL_SORTABLE = FILTER_GROUPS.flatMap((g) => g.items);

const RARITIES = ["Common", "Rare", "Advanced", "Oath", "Quest", "Faction", "Race", "Origin"];

const PAGE_SIZE = 60;
type FilterMode = "OR" | "AND";
type SortDir = "asc" | "desc";
interface SortCriterion { attr: string; dir: SortDir }

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

// Score cutoff: Fuse scores range 0 (perfect) to 1 (no match).
// Only results below this value are shown — keeps genuinely relevant hits.
const SCORE_CUTOFF = 0.25;

function buildFuse(talents: Talent[]) {
  return new Fuse(talents, {
    keys: [
      { name: "name",        weight: 3 },
      { name: "description", weight: 2 },
      { name: "tree",        weight: 1.5 },
      { name: "notes",       weight: 1 },
    ],
    threshold: 0.4,  // wide net — SCORE_CUTOFF trims the tail
    includeScore: true,
  });
}

/**
 * Returns the numeric stat requirement for `attribute` on `talent`.
 * Checks prerequisites first (e.g. "35 Flamecharm"), then talent_attributes min_value.
 * Returns null when the talent has no numeric requirement for that attribute.
 */
function getStatRequirement(talent: Talent, attribute: string): number | null {
  // Check prerequisites — "35 Flamecharm", "15 Strength", etc.
  for (const p of talent.prerequisites) {
    if (p.prereq_type !== "attribute" && p.prereq_type !== "power") continue;
    const m = p.prereq_value.match(/^(\d+)\s+(.+)$/);
    if (m && m[2].trim().toLowerCase() === attribute.toLowerCase()) {
      return parseInt(m[1], 10);
    }
  }
  // Fallback to talent_attributes min_value
  const row = talent.attributes.find(
    (a) => a.attribute.toLowerCase() === attribute.toLowerCase()
  );
  return row?.min_value ?? null;
}

function applySort(results: Talent[], sorts: SortCriterion[]): Talent[] {
  if (sorts.length === 0) return results;
  return [...results].sort((a, b) => {
    for (const { attr, dir } of sorts) {
      const aVal = getStatRequirement(a, attr) ?? (dir === "asc" ? Infinity : -Infinity);
      const bVal = getStatRequirement(b, attr) ?? (dir === "asc" ? Infinity : -Infinity);
      if (aVal !== bVal) return dir === "asc" ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function TalentBrowser() {
  const [talents, setTalents] = useState<Talent[]>([]);
  const [fuse, setFuse]       = useState<Fuse<Talent> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [query, setQuery]                   = useState("");
  const [selectedAttrs, setSelectedAttrs]   = useState<Set<string>>(new Set());
  const [selectedRarities, setSelectedRarities] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode]         = useState<FilterMode>("OR");
  const [sorts, setSorts]                   = useState<SortCriterion[]>([]);
  const [addSortAttr, setAddSortAttr]       = useState("");
  const [page, setPage]                     = useState(1);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/deepwoken/talents", { cache: "no-cache" })
      .then((r) => r.json() as Promise<{ talents: Talent[]; error?: string }>)
      .then((data) => {
        if (data.error && !data.talents.length) {
          setError(data.error);
        } else {
          setTalents(data.talents);
          setFuse(buildFuse(data.talents));
        }
      })
      .catch(() => setError("Failed to load talent data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => { setPage(1); }, [query, selectedAttrs, selectedRarities, filterMode, sorts]);

  const toggleAttr = useCallback((attr: string) => {
    setSelectedAttrs((prev) => {
      const next = new Set(prev);
      next.has(attr) ? next.delete(attr) : next.add(attr);
      return next;
    });
  }, []);

  const toggleRarity = useCallback((rarity: string) => {
    setSelectedRarities((prev) => {
      const next = new Set(prev);
      next.has(rarity) ? next.delete(rarity) : next.add(rarity);
      return next;
    });
  }, []);

  const addSort = useCallback((attr: string) => {
    if (!attr) return;
    setSorts((prev) => {
      // If already present, toggle direction instead of duplicating
      if (prev.some((s) => s.attr === attr)) {
        return prev.map((s) =>
          s.attr === attr ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" } : s
        );
      }
      return [...prev, { attr, dir: "asc" }];
    });
    setAddSortAttr("");
  }, []);

  const removeSort = useCallback((attr: string) => {
    setSorts((prev) => prev.filter((s) => s.attr !== attr));
  }, []);

  const toggleSortDir = useCallback((attr: string) => {
    setSorts((prev) =>
      prev.map((s) => s.attr === attr ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" } : s)
    );
  }, []);

  const clearFilters = useCallback(() => {
    setQuery("");
    setSelectedAttrs(new Set());
    setSelectedRarities(new Set());
    setFilterMode("OR");
    setSorts([]);
    setAddSortAttr("");
  }, []);

  const filtered = (() => {
    let results: Talent[] = query.trim() && fuse
      ? fuse.search(query).filter((r) => (r.score ?? 1) < SCORE_CUTOFF).map((r) => r.item)
      : [...talents];

    if (selectedAttrs.size > 0) {
      const attrArr = Array.from(selectedAttrs);
      results = filterMode === "AND"
        ? results.filter((t) => attrArr.every((a) => t.attributes.some((ta) => ta.attribute === a)))
        : results.filter((t) => t.attributes.some((ta) => selectedAttrs.has(ta.attribute)));
    }

    if (selectedRarities.size > 0) {
      results = results.filter((t) => selectedRarities.has(t.rarity));
    }

    return applySort(results, sorts);
  })();

  const visible   = filtered.slice(0, page * PAGE_SIZE);
  const hasMore   = page * PAGE_SIZE < filtered.length;
  const hasActive = !!query.trim() || selectedAttrs.size > 0 || selectedRarities.size > 0 || sorts.length > 0;

  // Attributes already in the sort list — don't offer them in the "add" dropdown again
  const sortedAttrs = new Set(sorts.map((s) => s.attr));
  const availableForSort = ALL_SORTABLE.filter(({ value }) => !sortedAttrs.has(value));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error mt-8">
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <div className="relative">
        <input
          ref={searchRef}
          type="search"
          placeholder="Search talents… (Ctrl+K)"
          className="input input-bordered w-full pr-24"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-base-content/40 pointer-events-none hidden sm:inline">
          Ctrl+K
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-1.5 text-xs">
        {FILTER_GROUPS.map((group) => (
          <div key={group.label} className="flex items-center gap-2">
            <span className="text-base-content/40 w-20 shrink-0 text-right">{group.label}</span>
            <div className="flex flex-wrap gap-1">
              {group.items.map(({ value, display }) => (
                <button
                  key={value}
                  onClick={() => toggleAttr(value)}
                  className={`btn btn-xs rounded-full transition-all ${
                    selectedAttrs.has(value) ? "btn-primary" : "btn-ghost border border-base-300"
                  }`}
                >
                  {display}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Match mode — only visible when 2+ attribute chips are active */}
        {selectedAttrs.size > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-base-content/40 w-20 shrink-0 text-right">Match</span>
            <div className="flex gap-1">
              {(["OR", "AND"] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`btn btn-xs rounded-full font-mono transition-all ${
                    filterMode === mode ? "btn-accent" : "btn-ghost border border-base-300"
                  }`}
                  title={mode === "OR" ? "Show talents matching ANY selected attribute" : "Show talents matching ALL selected attributes"}
                >
                  {mode}
                </button>
              ))}
            </div>
            <span className="text-base-content/30">
              {filterMode === "OR" ? "match any selected attribute" : "must have all selected attributes"}
            </span>
          </div>
        )}

        {/* Rarity */}
        <div className="flex items-center gap-2">
          <span className="text-base-content/40 w-20 shrink-0 text-right">Rarity</span>
          <div className="flex flex-wrap gap-1">
            {RARITIES.map((rarity) => (
              <button
                key={rarity}
                onClick={() => toggleRarity(rarity)}
                className={`btn btn-xs rounded-full transition-all ${
                  selectedRarities.has(rarity) ? "btn-secondary" : "btn-ghost border border-base-300"
                }`}
              >
                {rarity}
              </button>
            ))}
          </div>
        </div>

        {/* Sort */}
        <div className="flex items-start gap-2">
          <span className="text-base-content/40 w-20 shrink-0 text-right pt-0.5">Sort by</span>
          <div className="flex flex-wrap items-center gap-1">
            {/* Active sort criteria chips */}
            {sorts.map(({ attr, dir }, idx) => {
              const label = ALL_SORTABLE.find((s) => s.value === attr)?.display ?? attr;
              return (
                <span
                  key={attr}
                  className="inline-flex items-center gap-0.5 bg-base-300 rounded-full pl-2 pr-1 py-0.5 text-xs"
                >
                  <span className="text-base-content/50 mr-0.5">{idx + 1}.</span>
                  <button
                    onClick={() => toggleSortDir(attr)}
                    className="font-medium hover:text-primary transition-colors"
                    title="Click to flip direction"
                  >
                    {label}
                  </button>
                  <button
                    onClick={() => toggleSortDir(attr)}
                    className="font-mono text-base-content/50 hover:text-primary transition-colors w-8 text-center"
                    title="Click to flip direction"
                  >
                    {dir === "asc" ? "↑" : "↓"}
                  </button>
                  <button
                    onClick={() => removeSort(attr)}
                    className="text-base-content/40 hover:text-error transition-colors leading-none"
                    title="Remove sort"
                  >
                    ×
                  </button>
                </span>
              );
            })}

            {/* Add sort dropdown */}
            {availableForSort.length > 0 && (
              <select
                className="select select-xs select-bordered rounded-full max-w-[9rem]"
                value={addSortAttr}
                onChange={(e) => addSort(e.target.value)}
              >
                <option value="">+ add sort…</option>
                {availableForSort.map(({ value, display }) => (
                  <option key={value} value={value}>{display}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Results count + clear */}
      <div className="flex items-center justify-between text-sm text-base-content/60">
        <span>
          {filtered.length === talents.length
            ? `${talents.length} talents`
            : `${filtered.length} of ${talents.length} talents`}
          {sorts.length > 0 && (
            <span className="ml-1 text-xs opacity-60">
              · sorted by {sorts.map((s) => {
                const label = ALL_SORTABLE.find((x) => x.value === s.attr)?.display ?? s.attr;
                return `${label} ${s.dir === "asc" ? "↑" : "↓"}`;
              }).join(", ")}
            </span>
          )}
        </span>
        {hasActive && (
          <button onClick={clearFilters} className="btn btn-xs btn-ghost">
            Clear all
          </button>
        )}
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <div className="py-16 text-center text-base-content/40">
          No talents match your search.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map((t) => (
              <TalentCard key={t.id} talent={t} />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setPage((p) => p + 1)}
              >
                Load more ({filtered.length - visible.length} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
