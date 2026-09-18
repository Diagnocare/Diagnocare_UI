/**
 * The catalogue of techniques a test can be performed by — "H&E Staining", "RT-PCR",
 * "Flow Cytometry".
 *
 * Seeded server-side and served by the API, never written out here: a list the frontend
 * carried its own copy of would drift from the one the server validates against, and a
 * technique a lab added for itself would not appear until the next frontend release.
 */
export interface TestTechniqueDto {
  techniqueId: number;

  /** Stable handle — "TQ-PCR". Never shown to a user. */
  code: string;

  name: string;

  /** One line on what the technique is, for choosing between two that sound alike. */
  description: string | null;

  /** How the picker groups it — "Molecular", "Morphology & Staining". */
  category: string | null;

  /** True for a technique shipped with the application rather than added by the lab. */
  isSystem: boolean;
}

/** The techniques of one category, as the picker groups them. */
export interface TechniqueGroup {
  category: string;
  techniques: TestTechniqueDto[];
}

/**
 * Groups techniques by category, preserving the order the API sent them in.
 *
 * A flat list of twenty-odd techniques is a scroll; grouped, it is a glance. The API already
 * orders by category then display order, so this only has to preserve what it was given
 * rather than impose an order of its own.
 */
export function groupTechniques(techniques: TestTechniqueDto[]): TechniqueGroup[] {
  const groups: TechniqueGroup[] = [];

  for (const t of techniques ?? []) {
    const category = t.category?.trim() || 'Other';
    let group = groups.find(g => g.category === category);
    if (!group) {
      group = { category, techniques: [] };
      groups.push(group);
    }
    group.techniques.push(t);
  }

  return groups;
}
