import { kindsOf, type ObjShape, type Shape } from './shape.js';

export const LOW_CONFIDENCE_SAMPLES = 10;

/**
 * Share of fields whose type never changed, weighted by presence. Null is tracked
 * separately and does not count as a type change.
 */
export function confidenceOf(root: Shape): number {
  let weighted = 0;
  let total = 0;
  const visit = (s: Shape, weight: number) => {
    const stable = kindsOf(s).length <= 1 ? 1 : 0;
    weighted += weight * stable;
    total += weight;
    if (s.obj) visitObj(s.obj);
    if (s.arr?.items) visit(s.arr.items, weight);
  };
  const visitObj = (o: ObjShape) => {
    for (const f of o.fields.values()) visit(f, o.count > 0 ? f.count / o.count : 0);
  };
  visit(root, 1);
  return total === 0 ? 1 : Math.round((weighted / total) * 1000) / 1000;
}
