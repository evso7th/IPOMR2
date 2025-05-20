
import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  // console.log(`[renderCoins] Called with ${coins.length} coins.`);
  coins.forEach(coin => {
    // console.log(`[renderCoins] Processing coin: ${coin.id}, collected: ${coin.isCollected}, opacity: ${coin.currentOpacity}, x: ${coin.x}, y: ${coin.y}`);

    ctx.save(); 

    if (coin.particles.length > 0) {
      // console.log(`[renderCoins] Coin ${coin.id} has ${coin.particles.length} particles.`);
      coin.particles.forEach(particle => {
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; 
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      });
    } else if (!coin.isCollected && coin.currentOpacity > 0) {
      // console.log(`[renderCoins] Drawing coin: ${coin.id} at x:${coin.x}, y:${coin.y}, opacity:${coin.currentOpacity}`);
      ctx.globalAlpha = coin.currentOpacity;

      // Force scaleX to 1 for no visual rotation effect (for debugging)
      const scaleX = 1; // Math.abs(Math.cos(coin.rotationAngle));
      const currentDisplayWidth = coin.width * scaleX;
      const currentDisplayX = coin.x + (coin.width - currentDisplayWidth) / 2;

      // Apply shadow
      ctx.shadowColor = COIN_SHADOW_COLOR;
      ctx.shadowBlur = COIN_SHADOW_BLUR;
      ctx.shadowOffsetX = COIN_SHADOW_OFFSET_X;
      ctx.shadowOffsetY = COIN_SHADOW_OFFSET_Y;
      
      if (coinImage?.complete && coinImage.src) {
        try {
          // console.log(`[renderCoins] Attempting to draw image for coin ${coin.id}`);
          ctx.save(); 
          // Clip to a circle
          ctx.beginPath();
          ctx.arc(
            coin.x + coin.width / 2, 
            coin.y + coin.height / 2, 
            coin.width / 2, // radius
            0, 
            Math.PI * 2
          );
          ctx.closePath();
          ctx.clip();
          
          // Draw the image
          ctx.drawImage(coinImage, currentDisplayX, coin.y, currentDisplayWidth, coin.height);
          
          ctx.restore(); // Restore from clipping

        } catch (e) {
          // console.warn(`[renderCoins] Failed to draw image for coin ${coin.id}, falling back to color. Error:`, e);
          drawFallbackCoin(ctx, coin); 
        }
      } else {
        // console.log(`[renderCoins] Coin image not loaded or no src for coin ${coin.id}, drawing fallback.`);
        drawFallbackCoin(ctx, coin);
      }
    } else {
        // console.log(`[renderCoins] Coin ${coin.id} not drawn. Collected: ${coin.isCollected}, Opacity: ${coin.currentOpacity}`);
    }
    
    ctx.restore(); // Restore from globalAlpha and shadow changes
  });
};

function drawFallbackCoin(ctx: CanvasRenderingContext2D, coin: CoinState) {
  ctx.fillStyle = COIN_COLOR; 
  ctx.beginPath();
  ctx.arc(
    coin.x + coin.width / 2,
    coin.y + coin.height / 2,
    coin.width / 2, // radius
    0,
    Math.PI * 2
  );
  ctx.fill();
}

