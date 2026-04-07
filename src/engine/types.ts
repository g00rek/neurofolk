export type Gender = 'male' | 'female';
export type EntityState = 'idle' | 'mating';

export interface Position {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  position: Position;
  gender: Gender;
  state: EntityState;
  age: number;
  maxAge: number;
}

export const MIN_REPRODUCTIVE_AGE = 18;
export const MAX_REPRODUCTIVE_AGE = 50;

export interface WorldState {
  entities: Entity[];
  tick: number;
  gridSize: number;
}
