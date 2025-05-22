
export const GRAVITY = 0.5; 
export const PLAYER_SPEED = 5; 
export const PLATFORM_SPEED = (PLAYER_SPEED * 0.75) / 4; 
export const MAX_JUMP_HEIGHT = 200; 
export const JUMP_STRENGTH = -14.14; 
export const PLAYER_WIDTH = 42; 
export const PLAYER_HEIGHT = 75; 

export const PLAYER_COLOR = 'hsl(var(--primary))';

// Coin Configuration
export const COIN_SIZE = 20; 
export const COIN_COLOR = 'gold'; 
export const COIN_VERTICAL_SPAWN_BOTTOM_OFFSET = 100; 
export const COIN_SPAWN_TOP_MARGIN = 10; 
export const COIN_FADE_IN_DURATION = 500; 
export const COIN_SPAWN_STAGGER_DELAY = 0; // No longer used for staggering within a pair for one-by-one logic
export const TOTAL_COINS_ON_LEVEL = 10; 
// export const NUMBER_OF_COIN_PAIRS = 5; // Removed, replaced by TOTAL_COINS_ON_LEVEL

// Coin Particle Configuration
export const COIN_PARTICLE_COUNT = 15;
export const COIN_PARTICLE_SIZE = 3; 
export const COIN_PARTICLE_LIFESPAN = 600; 
export const COIN_PARTICLE_SPEED_MULTIPLIER = 1.5;
export const COIN_PARTICLE_GRAVITY_FACTOR = 0.2; 

// Coin Rotation and Shadow Configuration
export const COIN_ROTATION_SPEED_MIN = 0.02; 
export const COIN_ROTATION_SPEED_MAX = 0.05; 
export const COIN_SHADOW_OFFSET_X = 2; 
export const COIN_SHADOW_OFFSET_Y = 2; 
export const COIN_SHADOW_BLUR = 4; 
export const COIN_SHADOW_COLOR = 'rgba(0, 0, 0, 0.3)';


// Enemy Configuration
export const ENEMY_RADIUS = 32; 
export const ENEMY_COLOR = 'red'; 
export const ENEMY_SPEED_FACTOR = 0.5; 

// P3 Platform Configuration (for level 2's drifting platform)
export const P3_SIZE_W = 64; 
export const P3_SIZE_H = 32; 
export const P3_DRIFT_RANGE = 20; 
export const P3_MOVEMENT_DURATION = 3000;
