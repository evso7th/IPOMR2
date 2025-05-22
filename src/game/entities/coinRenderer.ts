
import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SIZE } from '@/config/gameConfig';

const drawCoinVisual = (
    ctx: CanvasRenderingContext2D,
    coin: CoinState,
    coinImage: HTMLImageElement | null,
    displayX: number,
    displayY: number,
    displayWidth: number,
    displayHeight: number
) => {
    // Simplified: always draw a red square with yellow border for diagnostics
    ctx.fillStyle = 'red';
    ctx.fillRect(coin.x, coin.y, coin.width, coin.height);
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 1;
    ctx.strokeRect(coin.x, coin.y, coin.width, coin.height);

    // console.log(`[drawCoinVisual] Drawing diagnostic for coin ${coin.id} at X:${coin.x}, Y:${coin.y}`);
};

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  console.log(`[renderCoins] CALLED with coins array length: ${coins.length}`);
  if (coins.length > 0) {
    // console.log("[renderCoins] First coin data:", JSON.parse(JSON.stringify(coins[0])));
  }
  
  coins.forEach((coin) => {
    console.log(`[renderCoins] Processing coin: ${coin.id}, Collected: ${coin.isCollected}, Opacity: ${coin.currentOpacity}, VisuallyPresent: ${coin.isVisuallyPresent}, X: ${coin.x}, Y: ${coin.y}`);

    if (!coin.isCollected && coin.currentOpacity > 0.5 && coin.isVisuallyPresent) { // Using 0.5 to be less strict than >0 for fade-in
      console.log(`[renderCoins] Drawing coin (diagnostic red square): ${coin.id}`);
      
      // Simplified diagnostic drawing:
      ctx.fillStyle = 'red';
      ctx.fillRect(coin.x, coin.y, coin.width, coin.height);
      ctx.strokeStyle = 'yellow';
      ctx.lineWidth = 2; // Make border more visible
      ctx.strokeRect(coin.x, coin.y, coin.width, coin.height);
      
    } else {
        // console.log(`[renderCoins] Coin ${coin.id} NOT drawn. Collected: ${coin.isCollected}, Opacity: ${coin.currentOpacity}, VisuallyPresent: ${coin.isVisuallyPresent}`);
    }

    // Render particles if any (keep this logic for when coin collection works)
    if (coin.particles.length > 0) {
      // console.log(`[renderCoins] Coin ${coin.id} has ${coin.particles.length} particles.`);
      coin.particles.forEach(particle => {
        ctx.save();
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; // Particles are simple colored squares
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
        ctx.restore();
      });
    }
  });
};

