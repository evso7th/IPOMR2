
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
  facingDirection: 'left' | 'right';
  image?: HTMLImageElement;
  activePlatformId: string | null; 
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number; 
}

export interface CoinState {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  
  isCollected: boolean;
  collectionTime?: number; 
  
  targetSpawnTime: number; 
  currentOpacity: number; 
  
  particles: Particle[]; 
  isVisuallyPresent: boolean; 

  rotationAngle: number; 
  rotationSpeed: number; 
}

export interface EnemyState {
  id: string;
  x: number;
  y: number;
  radius: number;
  width: number; 
  height: number; 
  vx: number;
  direction: number;
  color: string;
}

export type TilePositioningAnchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface TilePositioning {
  anchor: TilePositioningAnchor;
  xOffsetPx?: number; 
  yOffsetPx?: number; 
}

export interface Tile {
  id: string; 
  x: number;
  y: number;
  width: number;
  height: number;
  type: number; 
  color: string;
  vx?: number;
  direction?: number;
  layer?: 'background' | 'foreground';
  'data-ai-hint'?: string;
}

export interface RawTileData {
  id: string; 
  width: number | string; 
  height: number | string; 
  type: number;
  color: string;
  vx?: number;
  direction?: number;
  layer?: 'background' | 'foreground';
  positioning: TilePositioning;
  'data-ai-hint'?: string;
}

export interface RawPlayerStart {
  platformId: string; 
  horizontalAlign: 'left' | 'center' | 'right'; 
  xOffsetPx?: number; 
  yOffsetPx?: number; 
}

export interface RawLevelData {
  playerStart: RawPlayerStart;
  tiles: RawTileData[];
}

export interface ProcessedLevelData {
  playerStart: { xPx: number; yPx: number }; 
  tiles: Tile[]; 
}

export type GameAction = 'moveLeft' | 'moveRight' | 'jump' | 'stopMoveLeft' | 'stopMoveRight';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameStats {
  collectedCoins: number;
  totalCoinsOnLevel: number;
}
