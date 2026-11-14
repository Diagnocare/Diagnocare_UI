import { BookingPackageRef } from 'src/app/models/promotion/promotion.model';

/**
 * The shape of the catalogue this model needs. Structurally the same as the picker's
 * DcPickableTest / DcTestGroup, restated here so this file imports nothing from the component.
 */
export interface SelTest { code: string; name: string; price: number; bookable: boolean; }
export interface SelSubGroup { id: string; name: string; price?: number; tests: SelTest[]; }
export interface SelGroup { id: string; name: string; price?: number; subGroups: SelSubGroup[]; }

/** A group or sub-group, with every test beneath it. */
export interface SelUnit {
  type: 'Group' | 'SubGroup';
  id: string;
  name: string;
  /** Package price (0 = none set, so the price is the sum of the tests). */
  price: number;
  tests: SelTest[];
  children: SelUnit[];
}

/** One change to make. The picker turns each into the event its host already understands. */
export type SelOp =
  | { kind: 'package'; ref: BookingPackageRef }   // add the package if absent, remove it if present
  | { kind: 'test'; test: SelTest };              // add the test if absent, remove it if present

export type CheckState = 'all' | 'some' | 'none';

export const unitKey = (type: string, id: string) => `${type}:${id}`;

export function buildUnits(groups: SelGroup[]): SelUnit[] {
  return groups.map(g => {
    const children: SelUnit[] = g.subGroups.map(s => ({
      type: 'SubGroup' as const, id: s.id, name: s.name, price: Number(s.price || 0), tests: s.tests, children: [],
    }));
    return {
      type: 'Group' as const, id: g.id, name: g.name, price: Number(g.price || 0),
      tests: children.reduce<SelTest[]>((all, c) => all.concat(c.tests), []), children,
    };
  });
}

/**
 * Hierarchical checkbox logic for group → sub-group → test, kept apart from the component so it
 * can be unit-tested and so the rules live in one place.
 *
 * THE MODEL
 *   What the user "has" is a set of individually chosen tests plus a set of whole groups and
 *   sub-groups ("packages"). A test counts as chosen if it is in either. A checkbox on a group or
 *   sub-group is DERIVED from that: all its bookable tests chosen → checked, some → indeterminate,
 *   none → unchecked. So ticking every test one by one checks the sub-group, with no extra state.
 *
 * WHAT A TICK DOES
 *   Ticking a group/sub-group records it as a package, which is charged its package price rather
 *   than the sum of its tests. Only when a test inside cannot be booked is it expanded into the
 *   smaller pieces. The API still works out the final price; this only decides what to send.
 *
 * WHAT AN UNTICK DOES
 *   Removes the unit's tests from whatever chose them. A package that covered them is replaced by
 *   the pieces that are still wanted, so unticking one test inside a ticked group leaves the rest
 *   ticked.
 *
 * Plans are lists of ops, not mutations: the host owns the real selection. The model keeps a
 * working copy while planning, so a plan that touches the same thing twice stays consistent.
 */
export class SelectionModel {
  private readonly byKey = new Map<string, SelUnit>();
  private readonly owner = new Map<string, { g: string; s: string }>();
  private selected: Set<string>;
  private pkgs: BookingPackageRef[];

  constructor(
    private readonly units: SelUnit[],
    selectedCodes: readonly string[],
    packages: readonly BookingPackageRef[],
    /** Keys (see unitKey) of everything that has a live offer, e.g. "Group:LFT", "Test:CBC". */
    private readonly offers: ReadonlySet<string>,
  ) {
    this.selected = new Set(selectedCodes);
    this.pkgs = [...packages];
    for (const g of units) {
      this.byKey.set(unitKey(g.type, g.id), g);
      for (const s of g.children) {
        this.byKey.set(unitKey(s.type, s.id), s);
        for (const t of s.tests) this.owner.set(t.code, { g: g.id, s: s.id });
      }
    }
  }

  // ── Reading the state ────────────────────────────────────────────────────

  /** True if the test is chosen on its own or through a chosen group / sub-group. */
  covered(code: string): boolean {
    return this.selected.has(code) || this.packageCovering(code) !== null;
  }

  /** The chosen group / sub-group that includes this test, if any. */
  packageCovering(code: string): BookingPackageRef | null {
    const o = this.owner.get(code);
    if (!o) return null;
    return this.pkgs.find(p => (p.type === 'Group' ? o.g : o.s) === p.id) ?? null;
  }

  /** Checkbox state over the bookable tests (an unbookable test cannot be chosen, so it never counts). */
  state(tests: readonly SelTest[]): CheckState {
    const eligible = tests.filter(t => t.bookable);
    if (eligible.length === 0) return 'none';
    const n = eligible.filter(t => this.covered(t.code)).length;
    return n === 0 ? 'none' : n === eligible.length ? 'all' : 'some';
  }

  unit(type: 'Group' | 'SubGroup', id: string): SelUnit | undefined {
    return this.byKey.get(unitKey(type, id));
  }

  // ── Planning changes ─────────────────────────────────────────────────────

  /** Tick a group or sub-group. Anything chosen inside it is folded into the tick. */
  planSelect(unit: SelUnit): SelOp[] {
    const ops: SelOp[] = [];
    const inside = new Set(unit.tests.map(t => t.code));

    // Clean slate inside the unit, so a package is never stacked on its own pieces.
    for (const p of [...this.pkgs]) {
      const u = this.unit(p.type, p.id);
      if (u && u !== unit && u.tests.every(t => inside.has(t.code))) this.dropPackage(p, ops);
    }
    for (const t of unit.tests) if (this.selected.has(t.code)) this.dropTest(t, ops);

    this.addUnit(unit, new Set(), ops);
    return ops;
  }

  /** Untick: stop choosing these tests, keeping everything else that was chosen. */
  planUnselect(codes: readonly string[]): SelOp[] {
    const ops: SelOp[] = [];
    const gone = new Set(codes);

    for (const p of [...this.pkgs]) {
      const u = this.unit(p.type, p.id);
      if (!u || !u.tests.some(t => gone.has(t.code))) continue;
      this.dropPackage(p, ops);
      this.addUnit(u, gone, ops);          // put back what is still wanted
    }
    for (const t of this.allTests()) if (gone.has(t.code) && this.selected.has(t.code)) this.dropTest(t, ops);
    return ops;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private allTests(): SelTest[] {
    return this.units.reduce<SelTest[]>((all, g) => all.concat(g.tests), []);
  }

  /** Choose as much of `unit` as is wanted: as a package when all of it is wanted, else piece by piece. */
  private addUnit(unit: SelUnit, exclude: ReadonlySet<string>, ops: SelOp[]): void {
    const wanted = unit.tests.filter(t => t.bookable && !exclude.has(t.code));
    if (wanted.length === 0) return;

    const whole = unit.tests.every(t => t.bookable && !exclude.has(t.code));
    if (whole) {
      if (!this.pkgs.some(p => p.type === unit.type && p.id === unit.id)) this.addPackage(unit, ops);
      return;
    }
    if (unit.children.length) {
      unit.children.forEach(c => this.addUnit(c, exclude, ops));
      return;
    }
    wanted.forEach(t => { if (!this.selected.has(t.code)) this.addTest(t, ops); });
  }

  private addPackage(u: SelUnit, ops: SelOp[]) {
    const ref = { type: u.type, id: u.id, name: u.name } as BookingPackageRef;
    this.pkgs.push(ref);
    ops.push({ kind: 'package', ref });
  }
  private dropPackage(p: BookingPackageRef, ops: SelOp[]) {
    this.pkgs = this.pkgs.filter(x => !(x.type === p.type && x.id === p.id));
    ops.push({ kind: 'package', ref: p });
  }
  private addTest(t: SelTest, ops: SelOp[]) { this.selected.add(t.code); ops.push({ kind: 'test', test: t }); }
  private dropTest(t: SelTest, ops: SelOp[]) { this.selected.delete(t.code); ops.push({ kind: 'test', test: t }); }
}
