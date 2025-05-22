
import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_SIZE } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  // console.log(`[renderCoins] CALLED with ${coins.length} coins. First coin: ${coins.length > 0 ? JSON.stringify(coins[0]) : 'No coins'}`);
  if (!coins || coins.length === 0) {
    return;
  }
  
  coins.forEach((coin) => {
    // console.log(`[renderCoins] Processing coin: ID=${coin.id}, isCollected=${coin.isCollected}, opacity=${coin.currentOpacity.toFixed(2)}, present=${coin.isVisuallyPresent}, particles=${coin.particles.length}`);
    ctx.save(); 

    if (coin.particles && coin.particles.length > 0) {
      // console.log(`[renderCoins] Coin ${coin.id} has ${coin.particles.length} particles. Drawing particles.`);
      coin.particles.forEach(particle => {
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; 
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      });
    } else if (!coin.isCollected && coin.currentOpacity > 0 && coin.isVisuallyPresent) { 
        // console.log(`[renderCoins] Drawing coin ${coin.id} as yellow square. X:${coin.x.toFixed(0)}, Y:${coin.y.toFixed(0)}, Opacity: ${coin.currentOpacity.toFixed(2)}`);
        
        // Simplified diagnostic drawing: Bright yellow square
        ctx.globalAlpha = coin.currentOpacity;
        ctx.fillStyle = 'yellow'; // Bright yellow
        ctx.fillRect(coin.x, coin.y, coin.width, coin.height);
        ctx.strokeStyle = 'orange';
        ctx.lineWidth = 1;
        ctx.strokeRect(coin.x, coin.y, coin.width, coin.height);

    } else {
      // console.log(`[renderCoins] Coin ${coin.id} NOT drawn. isCollected=${coin.isCollected}, opacity=${coin.currentOpacity.toFixed(2)}, present=${coin.isVisuallyPresent}`);
    }
    
    ctx.restore(); 
  });
};

