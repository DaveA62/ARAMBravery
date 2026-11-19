export type Ability = 'Q' | 'W' | 'E' | 'R';

export interface Champion {
  id: string;
  name: string;
  title: string;
  roles: string[];
  attack: number;
  magic: number;
  portrait: string;
  splash: string;
  abilityIcons: Record<Ability, string>;
  abilityNames?: Record<Ability, string>;
  purchaseIdentities?: string[];
  power?: 'ap' | 'ad' | 'neutral' | 'hybrid';
}

export interface Item {
  id: string;
  name: string;
  description: string;
  icon: string;
  price: number;
  groups: string[];
  power: 'ap' | 'ad' | 'neutral' | 'hybrid';
  allowedChampions?: string[];
  forbiddenChampions?: string[];
  upgradesTo?: string;
}

export interface Spell {
  id: string;
  name: string;
  description: string;
  icon: string;
  forbiddenChampions?: string[];
}

export interface Augment {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'Silver' | 'Gold' | 'Prismatic';
  availability?: 'unconfirmed';
}
