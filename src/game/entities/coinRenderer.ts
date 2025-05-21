
import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  // console.log(`[renderCoins] CALLED. Number of coins: ${coins.length}`);
  if (coins.length === 0) {
    return;
  }
  
  coins.forEach((coin, index) => {
    // console.log(`[renderCoins] Processing coin ${index}: ID: ${coin.id}, X:${coin.x.toFixed(2)}, Y:${coin.y.toFixed(2)}, W:${coin.width}, H:${coin.height}, Opacity:${coin.currentOpacity.toFixed(2)}, Collected:${coin.isCollected}, VisuallyPresent: ${coin.isVisuallyPresent}, Particles: ${coin.particles.length}, Rotation: ${coin.rotationAngle !== undefined ? coin.rotationAngle.toFixed(2) : 'N/A'}`);

    ctx.save(); 

    if (coin.particles.length > 0) {
      // console.log(`[renderCoins] Coin ${coin.id}: Rendering ${coin.particles.length} particles.`);
      coin.particles.forEach(particle => {
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; 
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      });
    } else if (!coin.isCollected && coin.currentOpacity > 0 && coin.isVisuallyPresent) { 
      // console.log(`[renderCoins] Coin ${coin.id}: Attempting to render main coin.`);
      ctx.globalAlpha = coin.currentOpacity;

      const scaleX = coin.rotationAngle !== undefined ? Math.abs(Math.cos(coin.rotationAngle)) : 1;
      const currentDisplayWidth = coin.width * scaleX;
      const currentDisplayX = coin.x + (coin.width - currentDisplayWidth) / 2;

      ctx.shadowColor = COIN_SHADOW_COLOR;
      ctx.shadowBlur = COIN_SHADOW_BLUR;
      ctx.shadowOffsetX = COIN_SHADOW_OFFSET_X;
      ctx.shadowOffsetY = COIN_SHADOW_OFFSET_Y;
      
      if (coinImage?.complete && coinImage.src) {
        try {
          // console.log(`[renderCoins] Coin ${coin.id}: Drawing image at X:${currentDisplayX.toFixed(2)}, Y:${coin.y.toFixed(2)}, W:${currentDisplayWidth.toFixed(2)}, H:${coin.height.toFixed(2)}`);
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
        // console.log(`[renderCoins] Coin ${coin.id}: Image not loaded or no src, drawing fallback.`);
        drawFallbackCoin(ctx, coin);
      }
    } else {
        // console.log(`[renderCoins] Coin ${coin.id}: Not rendering. Collected: ${coin.isCollected}, Opacity: ${coin.currentOpacity}, VisuallyPresent: ${coin.isVisuallyPresent}`);
    }
    
    ctx.restore(); 
  });
};

function drawFallbackCoin(ctx: CanvasRenderingContext2D, coin: CoinState) {
  // console.log(`[renderCoins] Drawing fallback for coin ${coin.id} at X:${coin.x}, Y:${coin.y}`);
  ctx.fillStyle = 'red'; // Bright red for diagnostic
  ctx.beginPath();
  ctx.arc(
    coin.x + coin.width / 2,
    coin.y + coin.height / 2,
    coin.width / 2, 
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.strokeStyle = 'yellow';
  ctx.lineWidth = 1;
  ctx.stroke(); 
}
