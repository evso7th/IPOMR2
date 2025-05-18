export interface PlayerState {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  isOnGround: boolean;
  isMovingLeft: boolean;
  isMovingRight: boolean;
  color: string;
  image?: HTMLImageElement;
}

export interface Tile {
  x: number;
  y: number;
  width: number;
  height: number;
  type: number; // 0: empty, 1: solid
  color: string;
  image?: HTMLImageElement;
}

export interface LevelData {
  tileWidth: number;
  tileHeight: number;
  layout: number[][]; // 2D array representing tile types
  playerStart: { xTile: number; yTile: number };
  tiles: Tile[]; // Processed tiles for rendering and collision
}

export type GameAction = 'moveLeft' | 'moveRight' | 'jump' | 'stopMoveLeft' | 'stopMoveRight';
