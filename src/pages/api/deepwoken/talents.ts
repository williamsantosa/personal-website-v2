export const prerender = false;

type D1Database = { prepare: (sql: string) => D1PreparedStatement };
type D1PreparedStatement = {
  bind: (...args: unknown[]) => D1PreparedStatement;
  all: () => Promise<{ results: unknown[] }>;
};

export interface TalentAttribute {
  attribute: string;
  min_value: number | null;
  is_alternative: number;
  /** Local OR-group ID (scoped per talent). NULL = always required. Same number = pick one. */
  alt_group: number | null;
}

export interface TalentPrerequisite {
  prereq_type: string;
  prereq_value: string;
  is_alternative: number;
  /** Local OR-group ID (scoped per talent). NULL = always required. Same number = pick one. */
  alt_group: number | null;
}

export interface Talent {
  id: string;
  name: string;
  tree: string;
  rarity: string;
  description: string;
  notes: string[];
  attributes: TalentAttribute[];
  prerequisites: TalentPrerequisite[];
}

export async function GET({ locals }: { locals: App.Locals }) {
  const env = locals.runtime?.env as { DB?: D1Database } | undefined;
  const DB = env?.DB;

  if (!DB) {
    return new Response(JSON.stringify({ talents: [], error: "Database not configured" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  try {
    const [talentsResult, attrsResult, prereqsResult] = await Promise.all([
      DB.prepare("SELECT id, name, tree, rarity, description, notes FROM talents ORDER BY tree, name").all(),
      DB.prepare("SELECT talent_id, attribute, min_value, is_alternative, alt_group FROM talent_attributes").all(),
      DB.prepare("SELECT talent_id, prereq_type, prereq_value, is_alternative, alt_group FROM talent_prerequisites").all(),
    ]);

    const talentRows = talentsResult.results as Array<{
      id: string;
      name: string;
      tree: string;
      rarity: string;
      description: string;
      notes: string;
    }>;

    type AttrRow = { talent_id: string } & TalentAttribute;
    type PrereqRow = { talent_id: string } & TalentPrerequisite;

    const attrsByTalent = new Map<string, TalentAttribute[]>();
    for (const row of attrsResult.results as AttrRow[]) {
      if (!attrsByTalent.has(row.talent_id)) attrsByTalent.set(row.talent_id, []);
      attrsByTalent.get(row.talent_id)!.push({
        attribute: row.attribute,
        min_value: row.min_value,
        is_alternative: row.is_alternative,
        alt_group: row.alt_group,
      });
    }

    const prereqsByTalent = new Map<string, TalentPrerequisite[]>();
    for (const row of prereqsResult.results as PrereqRow[]) {
      if (!prereqsByTalent.has(row.talent_id)) prereqsByTalent.set(row.talent_id, []);
      prereqsByTalent.get(row.talent_id)!.push({
        prereq_type: row.prereq_type,
        prereq_value: row.prereq_value,
        is_alternative: row.is_alternative,
        alt_group: row.alt_group,
      });
    }

    const talents: Talent[] = talentRows.map((row) => ({
      id: row.id,
      name: row.name,
      tree: row.tree,
      rarity: row.rarity,
      description: row.description ?? "",
      notes: row.notes ? (JSON.parse(row.notes) as string[]) : [],
      attributes: attrsByTalent.get(row.id) ?? [],
      prerequisites: prereqsByTalent.get(row.id) ?? [],
    }));

    return new Response(JSON.stringify({ talents }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ talents: [], error: "Failed to load talents" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
