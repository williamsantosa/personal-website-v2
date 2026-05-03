import type { Talent } from "../../pages/api/deepwoken/talents";

const RARITY_BADGE: Record<string, string> = {
  Common: "talent-badge-common",
  Rare: "badge-warning",
  Advanced: "badge-error",
  Oath: "badge-primary",
  Quest: "badge-success",
  Faction: "badge-info",
  Race: "badge-secondary",
  Origin: "badge-secondary",
  "Mantra Level": "badge-accent",
  Mastery: "badge-accent",
  Murmur: "badge-primary",
};

interface Props {
  talent: Talent;
}

/**
 * Formats a requirement list into a human-readable string that respects
 * OR-group semantics encoded in alt_group.
 *
 *   alt_group === null  → always required (AND with everything else)
 *   alt_group === N     → belongs to OR-group N; rendered as "A OR B OR C"
 *
 * Example:
 *   [Light Weapon(null), Medium Weapon(1), Heavy Weapon(1)]
 *   → "Light Weapon, Medium Weapon OR Heavy Weapon"
 *
 * Multiple OR groups on one talent are each collapsed into their own token:
 *   [A(null), B(1), C(1), D(2), E(2)]
 *   → "A, B OR C, D OR E"
 *
 * is_alternative / alt_group are stored as number / number|null from SQLite.
 */
function joinWithAlternatives<T extends { alt_group: number | null }>(
  items: T[],
  format: (item: T) => string
): string {
  const result: string[] = [];
  const seenGroups = new Set<number>();

  for (const item of items) {
    if (item.alt_group === null) {
      result.push(format(item));
    } else if (!seenGroups.has(item.alt_group)) {
      seenGroups.add(item.alt_group);
      const groupItems = items.filter((it) => it.alt_group === item.alt_group);
      result.push(groupItems.map(format).join(" OR "));
    }
    // Already-rendered group members are skipped
  }

  return result.join(", ");
}

export function TalentCard({ talent }: Props) {
  const badgeClass = RARITY_BADGE[talent.rarity] ?? "talent-badge-common";

  const attrDisplay = joinWithAlternatives(
    talent.attributes,
    (a) => (a.min_value != null ? `${a.min_value} ${a.attribute}` : a.attribute)
  );

  const prereqAttrItems = talent.prerequisites.filter(
    (p) => p.prereq_type === "attribute" || p.prereq_type === "power"
  );
  const prereqTalentItems = talent.prerequisites.filter((p) => p.prereq_type === "talent");

  const prereqAttrsStr   = joinWithAlternatives(prereqAttrItems,   (p) => p.prereq_value);
  const prereqTalentsStr = joinWithAlternatives(prereqTalentItems, (p) => p.prereq_value);

  const prereqActions = talent.prerequisites
    .filter((p) => p.prereq_type === "action")
    .map((p) => p.prereq_value);

  return (
    <div
      id={talent.id}
      className="card bg-base-200 border border-base-300 hover:border-primary transition-colors duration-150 h-full"
    >
      <div className="card-body p-4 gap-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <a
            href={`#${talent.id}`}
            className="card-title text-sm font-semibold leading-snug hover:text-primary transition-colors"
          >
            {talent.name}
          </a>
          <span className={`badge badge-sm shrink-0 ${badgeClass}`}>
            {talent.rarity}
          </span>
        </div>

        {/* Tree + attributes */}
        <div className="flex flex-wrap gap-1 text-xs text-base-content/60">
          <span className="font-medium">{talent.tree}</span>
          {attrDisplay && (
            <>
              <span>·</span>
              <span>{attrDisplay}</span>
            </>
          )}
        </div>

        {/* Description (full text — avoid line-clamp so long blurbs aren't cut mid-sentence) */}
        {talent.description && (
          <p className="text-xs text-base-content/80 leading-relaxed break-words">
            {talent.description}
          </p>
        )}

        {/* Prerequisites */}
        {(prereqAttrItems.length > 0 || prereqTalentItems.length > 0 || prereqActions.length > 0) && (
          <div className="mt-auto pt-2 border-t border-base-300 space-y-1">
            {prereqAttrItems.length > 0 && (
              <div className="text-xs text-base-content/60">
                <span className="font-medium text-base-content/80">Requires: </span>
                {prereqAttrsStr}
              </div>
            )}
            {prereqTalentItems.length > 0 && (
              <div className="text-xs text-base-content/60">
                <span className="font-medium text-base-content/80">Talent: </span>
                {prereqTalentsStr}
              </div>
            )}
            {prereqActions.length > 0 && (
              <div className="text-xs text-base-content/60 italic">
                {prereqActions[0]}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
