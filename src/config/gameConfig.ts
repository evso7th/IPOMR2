
export const TILE_SIZE = 32; // pixels
export const GRAVITY = 0.5; // pixels per frame^2
export const PLAYER_SPEED = 5; // pixels per frame
export const PLATFORM_SPEED = (PLAYER_SPEED * 0.75) / 4; // pixels per frame for moving platforms
export const MAX_JUMP_HEIGHT = 200; // pixels
export const JUMP_STRENGTH = -14.14; // Approx. -Math.sqrt(200 * 2 * 0.5)
export const PLAYER_WIDTH = 48; // pixels
export const PLAYER_HEIGHT = 75; // pixels

export const PLAYER_COLOR = 'hsl(var(--primary))';
export const TILE_COLOR_GROUND = 'hsl(var(--accent))'; // This seems unused, platforms get color from JSON
export const TILE_COLOR_EMPTY = 'rgba(0,0,0,0)'; // Unused

// Coin Configuration
export const COIN_SIZE = 20; 
export const COIN_COLOR = 'gold'; 
export const COIN_VERTICAL_SPAWN_BOTTOM_OFFSET = 100; 
export const COIN_SPAWN_TOP_MARGIN = 10; 
export const COIN_FADE_IN_DURATION = 500; // ms
export const COIN_SPAWN_STAGGER_DELAY = 500; // ms 

// Coin Particle Configuration
export const COIN_PARTICLE_COUNT = 15;
export const COIN_PARTICLE_SIZE = 3; // pixels
export const COIN_PARTICLE_LIFESPAN = 600; // ms
export const COIN_PARTICLE_SPEED_MULTIPLIER = 1.5;
export const COIN_PARTICLE_GRAVITY_FACTOR = 0.2; 

// Coin Rotation and Shadow Configuration
export const COIN_ROTATION_SPEED_MIN = 0.01; // radians per frame
export const COIN_ROTATION_SPEED_MAX = 0.03; // radians per frame
export const COIN_SHADOW_OFFSET_X = 2; // pixels
export const COIN_SHADOW_OFFSET_Y = 2; // pixels
export const COIN_SHADOW_BLUR = 4; // pixels
export const COIN_SHADOW_COLOR = 'rgba(0, 0, 0, 0.3)';


// Enemy Configuration
export const ENEMY_RADIUS = 32; // pixels
export const ENEMY_COLOR = 'red'; // color of the enemy
export const ENEMY_SPEED_FACTOR = 0.5; // Factor of PLATFORM_SPEED
