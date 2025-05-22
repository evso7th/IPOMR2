
import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_ROTATION_SPEED_MAX } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  if (!coins) return;
  console.log(`[renderCoins] CALLED with ${coins.length} coins. First coin:`, coins.length > 0 ? JSON.parse(JSON.stringify(coins[0])) : "No coins");
  
  coins.forEach((coin, index) => {
    console.log(`[renderCoins] Processing coin ${index}: ID: ${coin.id}, X:${coin.x?.toFixed(2)}, Y:${coin.y?.toFixed(2)}, Opacity:${coin.currentOpacity?.toFixed(2)}, Collected:${coin.isCollected}, VisuallyPresent: ${coin.isVisuallyPresent}, Particles: ${coin.particles?.length}`);

    ctx.save(); 

    if (coin.particles && coin.particles.length > 0) {
      console.log(`[renderCoins] Drawing ${coin.particles.length} particles for coin ${coin.id}`);
      coin.particles.forEach(particle => {
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; 
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      });
    } else if (!coin.isCollected && coin.currentOpacity > 0 && coin.isVisuallyPresent) { 
      console.log(`[renderCoins] Attempting to draw coin ${coin.id} as a yellow square.`);
      ctx.globalAlpha = coin.currentOpacity;

      // Simplified diagnostic drawing: bright yellow square
      ctx.fillStyle = 'yellow';
      ctx.fillRect(coin.x, coin.y, coin.width, coin.height);
      ctx.strokeStyle = 'orange';
      ctx.lineWidth = 2;
      ctx.strokeRect(coin.x, coin.y, coin.width, coin.height);
      
      console.log(`[renderCoins] Drawn diagnostic yellow square for coin ${coin.id} at X:${coin.x.toFixed(2)}, Y:${coin.y.toFixed(2)} Opacity: ${coin.currentOpacity.toFixed(2)}`);

    } else {
      // console.log(`[renderCoins] Coin ${coin.id} NOT drawn. Collected: ${coin.isCollected}, Opacity: ${coin.currentOpacity}, VisuallyPresent: ${coin.isVisuallyPresent}`);
    }
    
    ctx.restore(); 
  });
};
