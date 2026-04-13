/**
 * Weapon strategies barrel export
 */

export { WeaponStrategy } from './WeaponStrategy.js';
export { SwordStrategy } from './SwordStrategy.js';
export { SpearStrategy } from './SpearStrategy.js';
export { BowStrategy } from './BowStrategy.js';
export { StaffStrategy } from './StaffStrategy.js';
export { DaggerStrategy } from './DaggerStrategy.js';
export { ShieldStrategy } from './ShieldStrategy.js';

import { SwordStrategy } from './SwordStrategy.js';
import { SpearStrategy } from './SpearStrategy.js';
import { BowStrategy } from './BowStrategy.js';
import { StaffStrategy } from './StaffStrategy.js';
import { DaggerStrategy } from './DaggerStrategy.js';
import { ShieldStrategy } from './ShieldStrategy.js';

/** equipType → Strategy class mapping */
export const StrategyMap = {
  sword: SwordStrategy,
  spear: SpearStrategy,
  bow: BowStrategy,
  staff: StaffStrategy,
  dagger: DaggerStrategy,
  shield: ShieldStrategy,
};
