
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
  image?: HTMLImageElement; // Image is part of state for current renderer
}

export interface Tile {
  x: number;
  y: number;
  width: number;
  height: number;
  type: number; // 0: empty, 1: solid
  color: string;
  // image?: HTMLImageElement; // Tile image will be passed to renderer directly
}

export interface LevelData {
  tileWidth: number;
  tileHeight: number;
  layout: number[][]; 
  playerStart: { xPx: number; yPx: number; xTile?: number; yTile?: number }; 
  tiles: Tile[]; 
}

export type GameAction = 'moveLeft' | 'moveRight' | 'jump' | 'stopMoveLeft' | 'stopMoveRight';
