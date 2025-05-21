
import type { CoinState } from '@/types/game';
import { COIN_COLOR, COIN_SHADOW_COLOR, COIN_SHADOW_BLUR, COIN_SHADOW_OFFSET_X, COIN_SHADOW_OFFSET_Y } from '@/config/gameConfig';

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  // console.log(`[renderCoins] CALLED with ${coins.length} coins.`); 
  
  coins.forEach(coin => {
    // console.log(`[renderCoins] Processing coin ID: ${coin.id}, X:${coin.x}, Y:${coin.y}, Opacity:${coin.currentOpacity}, Collected:${coin.isCollected}, VisuallyPresent: ${coin.isVisuallyPresent}`);

    ctx.save(); 

    if (coin.particles.length > 0) {
      coin.particles.forEach(particle => {
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; 
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      });
    } else if (!coin.isCollected && coin.currentOpacity > 0 && coin.isVisuallyPresent) { 
      ctx.globalAlpha = coin.currentOpacity;

      const scaleX = Math.abs(Math.cos(coin.rotationAngle)); 
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

    