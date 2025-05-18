
export const TILE_SIZE = 32; // pixels
export const GRAVITY = 0.5; // pixels per frame^2
export const PLAYER_SPEED = 5; // pixels per frame
export const PLATFORM_SPEED = (PLAYER_SPEED * 0.75) / 4; // pixels per frame for moving platforms
export const MAX_JUMP_HEIGHT = 200; // pixels
// export const JUMP_STRENGTH = -Math.sqrt(MAX_JUMP_HEIGHT * 2 * GRAVITY); // pixels per frame (negative is up)
export const JUMP_STRENGTH = -14.14; // Approx. -Math.sqrt(200 * 2 * 0.5)
export const PLAYER_WIDTH = 48; // pixels
export const PLAYER_HEIGHT = 75; // pixels

export const PLAYER_COLOR = 'hsl(var(--primary))';
export const TILE_COLOR_GROUND = 'hsl(var(--accent))';
export const TILE_COLOR_EMPTY = 'rgba(0,0,0,0)';

// Coin Configuration
export const COIN_SIZE = 20; // width and height of the coin
export const COIN_COLOR = 'gold'; // fallback color if image fails
export const COIN_VERTICAL_SPAWN_BOTTOM_OFFSET = 100; // from bottom of canvas for coin's bottom edge
export const COIN_SPAWN_TOP_MARGIN = 10; // margin below player's max reach from highest platform for coin's top edge
export const COIN_FADE_IN_DURATION = 500; // ms
// export const COIN_FADE_OUT_DURATION = 300; // ms - replaced by particle lifespan
export const COIN_SPAWN_STAGGER_DELAY = 500; // ms - delay for the second coin in a pair. Increased from 250ms.

// Coin Particle Configuration
export const COIN_PARTICLE_COUNT = 15;
export const COIN_PARTICLE_SIZE = 3; // pixels
export const COIN_PARTICLE_LIFESPAN = 600; // ms
export const COIN_PARTICLE_SPEED_MULTIPLIER = 1.5;
export const COIN_PARTICLE_GRAVITY_FACTOR = 0.2; // A lighter gravity for particles

