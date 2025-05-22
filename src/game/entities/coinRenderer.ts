
import type { CoinState } from '@/types/game';
import { 
  COIN_COLOR, 
  COIN_SIZE,
  COIN_SHADOW_OFFSET_X,
  COIN_SHADOW_OFFSET_Y,
  COIN_SHADOW_BLUR,
  COIN_SHADOW_COLOR 
} from '@/config/gameConfig';

const drawFallbackCoin = (
  ctx: CanvasRenderingContext2D,
  coin: CoinState
) => {
  ctx.beginPath();
  ctx.arc(
    coin.x + coin.width / 2,
    coin.y + coin.height / 2,
    coin.width / 2, 
    0,
    Math.PI * 2
  );
  ctx.fillStyle = COIN_COLOR; 
  ctx.fill();
  ctx.closePath();
};

export const renderCoins = (
  ctx: CanvasRenderingContext2D,
  coins: CoinState[],
  coinImage: HTMLImageElement | null
): void => {
  if (!coins || coins.length === 0) {
    return;
  }

  coins.forEach((coin) => {
    if (!coin.isCollected && coin.currentOpacity > 0 && coin.isVisuallyPresent) {
      ctx.save();
      ctx.globalAlpha = coin.currentOpacity;

      ctx.shadowColor = COIN_SHADOW_COLOR;
      ctx.shadowBlur = COIN_SHADOW_BLUR;
      ctx.shadowOffsetX = COIN_SHADOW_OFFSET_X;
      ctx.shadowOffsetY = COIN_SHADOW_OFFSET_Y;
      
      const coinCenterX = coin.x + coin.width / 2;
      const coinCenterY = coin.y + coin.height / 2;
      
      const scaleX = Math.abs(Math.cos(coin.rotationAngle)); // Apply rotation
      const currentDisplayWidth = coin.width * scaleX;
      const currentDisplayX = coin.x + (coin.width - currentDisplayWidth) / 2;

      if (coinImage && coinImage.complete && coinImage.naturalHeight !== 0) {
        ctx.beginPath();
        ctx.arc(coinCenterX, coinCenterY, coin.width / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(
          coinImage,
          currentDisplayX, 
          coin.y,
          currentDisplayWidth, 
          coin.height
        );
      } else {
         drawFallbackCoin(ctx, coin);
      }
      ctx.restore(); 
    }

    if (coin.particles.length > 0) {
      coin.particles.forEach(particle => {
        ctx.save();
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = COIN_COLOR; 
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
        ctx.restore();
      });
    }
  });
};

