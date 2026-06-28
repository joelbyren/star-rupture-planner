import Dexie, { type Table } from 'dexie';
import type { PlanSnapshot } from '../store/planStore.ts';

class PlannerDb extends Dexie {
  plans!: Table<PlanSnapshot, string>;

  constructor() {
    super('star-rupture-planner');
    this.version(1).stores({
      plans: 'planId, planName',
    });
  }
}

export const db = new PlannerDb();
