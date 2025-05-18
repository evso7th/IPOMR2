
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
  layout: number[][]; // May not be fully utilized if platforms are defined directly
  playerStart: { xPx: number; yPx: number; xTile?: number; yTile?: number }; // Player start now in PIXELS, xTile/yTile optional
  tiles: Tile[]; // Processed tiles for rendering and collision (includes platforms)
}

export type GameAction = 'moveLeft' | 'moveRight' | 'jump' | 'stopMoveLeft' | 'stopMoveRight';

