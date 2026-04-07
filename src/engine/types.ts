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
}

export interface WorldState {
  entities: Entity[];
  tick: number;
  gridSize: number;
}
