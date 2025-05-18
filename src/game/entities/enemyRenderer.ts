
import type { EnemyState } from '@/types/game';

export const renderEnemies = (
  ctx: CanvasRenderingContext2D,
  enemies: EnemyState[]
): void => {
  enemies.forEach(enemy => {
    ctx.beginPath();
    ctx.arc(enemy.x + enemy.radius, enemy.y + enemy.radius, enemy.radius, 0, Math.PI * 2);
    ctx.fillStyle = enemy.color;
    ctx.fill();
    ctx.closePath();
  });
};
