
import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y, COIN_ROTATION_SPEED_MAX } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  if (!coins || coins.length === 0) {
    return;
  }
  // console.log(`[renderCoins] CALLED with ${coins.length} coins. First coin:`, coins[0]);
  
  coins.forEach((coin, index) => {
    // console.log(`[renderCoins] Processing coin ${index}: ID: ${coin.id}, X:${coin.x.toFixed(2)}, Y:${coin.y.toFixed(2)}, W:${coin.width}, H:${coin.height}, Opacity:${coin.currentOpacity.toFixed(2)}, Collected:${coin.isCollected}, VisuallyPresent: ${coin.isVisuallyPresent}, Particles: ${coin.particles.length}, Rotation: ${coin.rotationAngle !== undefined ? coin.rotationAngle.toFixed(2) : 'N/A'}`);

    ctx.save(); 

    if (coin.particles.length > 0) {
      coin.particles.forEach(particle => {
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; 
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      });
    } else if (!coin.isCollected && coin.currentOpacity > 0 && coin.isVisuallyPresent) { 
      ctx.globalAlpha = coin.currentOpacity;

      // Ensure scaleX is 1 if rotation is disabled (max speed is 0)
      const scaleX = coin.rotationAngle !== undefined && COIN_ROTATION_SPEED_MAX > 0 ? Math.abs(Math.cos(coin.rotationAngle)) : 1;
      const currentDisplayWidth = coin.width * scaleX;
      const currentDisplayX = coin.x + (coin.width - currentDisplayWidth) / 2;

      ctx.shadowColor = COIN_SHADOW_COLOR;
      ctx.shadowBlur = COIN_SHADOW_BLUR;
      ctx.shadowOffsetX = COIN_SHADOW_OFFSET_X;
      ctx.shadowOffsetY = COIN_SHADOW_OFFSET_Y;
      
      if (coinImage?.complete && coinImage.src) {
        try {
          ctx.save(); 
          ctx.beginPath();
          ctx.arc(
            coin.x + coin.width / 2, 
            coin.y + coin.height / 2, 
            coin.width / 2, 
            0, 
            Math.PI * 2
          );
          ctx.closePath();
          ctx.clip();
          
          ctx.drawImage(coinImage, currentDisplayX, coin.y, currentDisplayWidth, coin.height);
          
          ctx.restore(); 

        } catch (e) {
          // console.error(`[renderCoins] Coin ${coin.id}: Error drawing image, drawing fallback. Error:`, e);
          drawFallbackCoin(ctx, coin); 
        }
      } else {
        drawFallbackCoin(ctx, coin);
      }
    }
    
    ctx.restore(); 
  });
};

function drawFallbackCoin(ctx: CanvasRenderingContext2D, coin: CoinState) {
  // console.log(`[renderCoins drawFallbackCoin] Drawing fallback for coin ${coin.id} at X:${coin.x.toFixed(2)} Y:${coin.y.toFixed(2)} Opacity: ${coin.currentOpacity.toFixed(2)}`);
  ctx.fillStyle = COIN_COLOR; 
  ctx.beginPath();
  ctx.arc(
    coin.x + coin.width / 2,
    coin.y + coin.height / 2,
    coin.width / 2, 
    0,
    Math.PI * 2
  );
  ctx.fill();
}

