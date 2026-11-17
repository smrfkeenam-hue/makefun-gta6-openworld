// Combat: bullets, rival crew gunmen, and the cash and med-kit pickups scattered
// around the city. Enemies take cover positions, shoot at the player when close,
// and drop cash when they go down. Nothing here draws — render.js paints it.
//
// The crew now has two roles: gunmen who strafe and shoot from range, and
// brawlers who close in fast and swing up close — so a fight reads as a crew,
// not five identical shooters. Gunmen reload after a burst (a visible pause
// the player can exploit), and a rival who takes a hit ducks toward the
// nearest building corner for cover instead of standing in the open.

import { ACTIVITY_SPOTS, COMBAT } from './config.js';
import { clamp, dist, pick, range } from './random.js';

const ENEMY_ROLES = ['gunman', 'gunman', 'gunman', 'brawler'];

export function createCombat(random, city) {
  const bullets = [];   // {x, y, vx, vy, fromPlayer, life}
  const enemies = [];   // {x, y, angle, health, fireTimer, speed, alive, role, ...}
  const pickups = [];   // {x, y, type: 'cash'|'health', value, bob}
  const particles = []; // {x, y, vx, vy, life, maxLife, color, size}

  function seedPickups() {
    for (const spot of ACTIVITY_SPOTS) {
      pickups.push({ x: spot.x, y: spot.y, type: spot.type, value: spot.type === 'cash' ? 160 : 40, bob: random() * Math.PI * 2 });
    }
  }

  function spawnEnemies(x, y, count) {
    const spawned = [];
    for (let i = 0; i < count; i += 1) {
      // Spread the crew out in a ring around the player: rivals stacked on
      // one point look like a glitch and die to a single bullet, and rivals
      // appearing within arm's reach shoot straight before Mara can react.
      // Retry until each has its own ground.
      let spot = city.freeSpotRing(x, y, 260, 420);
      for (let tries = 0; tries < 12; tries += 1) {
        const tooClose = spawned.some((e) => dist(e.x, e.y, spot.x, spot.y) < 70);
        if (!tooClose) break;
        spot = city.freeSpotRing(x, y, 260, 420);
      }
      const role = pick(random, ENEMY_ROLES);
      const enemy = {
        x: spot.x,
        y: spot.y,
        angle: random() * Math.PI * 2,
        health: COMBAT.enemyHealth,
        // The crew needs a beat to raise their guns when they appear, or
        // the fight starts with five barrels already on target.
        fireTimer: range(random, 1.0, 2.0),
        speed: role === 'brawler' ? range(random, 150, 190) : range(random, 90, 140),
        alive: true,
        strafe: random() < 0.5 ? 1 : -1,
        alerted: false, // set when gunfire lands nearby: the crew converges
        role,
        burstLeft: 0,   // shots left in the current burst (gunmen reload)
        reloadTimer: 0, // pause between bursts
        meleeTimer: 0,  // swing cooldown for brawlers
        coverX: null,   // cover corner to duck toward after taking a hit
        coverY: null,
      };
      enemies.push(enemy);
      spawned.push(enemy);
    }
    return spawned;
  }

  function fireBullet(x, y, angle, fromPlayer) {
    bullets.push({
      x: x + Math.cos(angle) * 22,
      y: y + Math.sin(angle) * 22,
      vx: Math.cos(angle) * COMBAT.bulletSpeed,
      vy: Math.sin(angle) * COMBAT.bulletSpeed,
      fromPlayer,
      life: 0.9,
    });
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const s = range(random, speed * 0.3, speed);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: range(random, 0.25, 0.6),
        maxLife: 0.6,
        color,
        size: range(random, 2, 5),
      });
    }
  }

  function muzzle(x, y, angle) {
    burst(x + Math.cos(angle) * 26, y + Math.sin(angle) * 26, '#ffd23f', 4, 160);
  }

  function blood(x, y) {
    burst(x, y, '#c22e2e', 10, 200);
  }

  function sparks(x, y) {
    burst(x, y, '#ffd23f', 6, 260);
  }

  /** Dust kicked up by a sprinting player or a drifting car. */
  function dust(x, y) {
    burst(x, y, '#c9b8a3', 3, 60);
  }

  /** The nearest building corner to (x, y): a ducking spot under fire. */
  function nearestCover(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const b of city.buildings) {
      const corners = [
        { x: b.x - 20, y: b.y - 20 }, { x: b.x + b.w + 20, y: b.y - 20 },
        { x: b.x - 20, y: b.y + b.h + 20 }, { x: b.x + b.w + 20, y: b.y + b.h + 20 },
      ];
      for (const c of corners) {
        const d = dist(x, y, c.x, c.y);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    return best;
  }

  /**
   * One step. `player` is the player object ({x, y, health, inCar, ...});
   * `onPlayerHit(damage)`, `onEnemyDown(enemy)` and `onPickup(pickup)` are
   * callbacks the world wires to cash, sound and mission progress.
   */
  function step(dt, player, hooks) {
    // Bullets fly and hit walls, the player, or enemies.
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > 4800 || b.y > 3600;
      if (!dead && city.blocked(b.x, b.y, 2)) {
        sparks(b.x, b.y);
        dead = true;
      }
      if (!dead && !b.fromPlayer && !player.inCar && dist(b.x, b.y, player.x, player.y) < 16) {
        hooks.onPlayerHit(COMBAT.bulletDamage * 0.5);
        blood(player.x, player.y);
        dead = true;
      }
      if (!dead && b.fromPlayer) {
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          if (dist(b.x, b.y, enemy.x, enemy.y) < 18) {
            enemy.health -= COMBAT.bulletDamage;
            blood(enemy.x, enemy.y);
            // A hit sends the rival ducking for the nearest building corner.
            const cover = nearestCover(enemy.x, enemy.y);
            if (cover) {
              enemy.coverX = cover.x;
              enemy.coverY = cover.y;
            }
            // Gunfire gives the crew away: every rival nearby converges on
            // the shooter instead of wandering.
            for (const other of enemies) {
              if (other.alive && dist(other.x, other.y, player.x, player.y) < 600) other.alerted = true;
            }
            if (enemy.health <= 0) {
              enemy.alive = false;
              hooks.onEnemyDown(enemy);
              pickups.push({ x: enemy.x, y: enemy.y, type: 'cash', value: 120, bob: 0 });
            }
            dead = true;
            break;
          }
        }
      }
      if (dead) bullets.splice(i, 1);
    }

    // Enemies act by role. Gunmen strafe and shoot in bursts with a reload
    // pause; brawlers close in fast and swing when they reach the player.
    // An alerted crew closes in from further out instead of standing around.
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const d = dist(enemy.x, enemy.y, player.x, player.y);
      const targetAngle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
      // Ducking for cover after a hit: move to the corner, then resume.
      if (enemy.coverX !== null && d > COMBAT.enemyRange * 0.5) {
        const cd = dist(enemy.x, enemy.y, enemy.coverX, enemy.coverY);
        if (cd > 12) {
          const ca = Math.atan2(enemy.coverY - enemy.y, enemy.coverX - enemy.x);
          enemy.x += Math.cos(ca) * enemy.speed * dt;
          enemy.y += Math.sin(ca) * enemy.speed * dt;
          enemy.angle = ca;
          continue;
        }
        enemy.coverX = null;
        enemy.coverY = null;
      }
      if (enemy.role === 'brawler') {
        enemy.meleeTimer -= dt;
        if (!player.inCar && d < 46 && enemy.meleeTimer <= 0) {
          enemy.meleeTimer = 1.1;
          hooks.onPlayerHit(14);
          blood(player.x, player.y);
        } else if (d > 40 && (enemy.alerted || d < COMBAT.enemyRange * 1.5)) {
          enemy.x += Math.cos(targetAngle) * enemy.speed * dt;
          enemy.y += Math.sin(targetAngle) * enemy.speed * dt;
          enemy.angle = targetAngle;
        }
      } else if (d < COMBAT.enemyRange && !player.inCar) {
        enemy.angle = targetAngle;
        if (enemy.reloadTimer > 0) {
          enemy.reloadTimer -= dt;
        } else {
          enemy.fireTimer -= dt;
          if (enemy.fireTimer <= 0) {
            if (enemy.burstLeft <= 0) enemy.burstLeft = 3;
            enemy.burstLeft -= 1;
            // Rival aim is shaky, not laser: at 300px a ±0.22 rad spread
            // misses more often than it hits, so moving Mara survives.
            fireBullet(enemy.x, enemy.y, targetAngle + range(random, -0.22, 0.22), false);
            muzzle(enemy.x, enemy.y, targetAngle);
            hooks.onEnemyShot();
            if (enemy.burstLeft > 0) {
              enemy.fireTimer = 0.22;
            } else {
              // Burst spent: a reload pause the player can push through.
              enemy.fireTimer = COMBAT.enemyFireRate + range(random, 0, 0.4);
              enemy.reloadTimer = range(random, 0.9, 1.4);
            }
          }
        }
        // Strafe sideways to stay a threat, not a statue.
        const strafeAngle = targetAngle + (Math.PI / 2) * enemy.strafe;
        enemy.x += Math.cos(strafeAngle) * enemy.speed * 0.4 * dt;
        enemy.y += Math.sin(strafeAngle) * enemy.speed * 0.4 * dt;
        if (random() < 0.01) enemy.strafe *= -1;
      } else if (d > 60 && (enemy.alerted || d < COMBAT.enemyRange * 1.5)) {
        // Close the distance when the player is far — alerted rivals hunt.
        enemy.x += Math.cos(targetAngle) * enemy.speed * dt;
        enemy.y += Math.sin(targetAngle) * enemy.speed * dt;
        enemy.angle = targetAngle;
      }
      if (city.blocked(enemy.x, enemy.y, 12)) {
        enemy.x -= Math.cos(targetAngle) * enemy.speed * dt * 2;
        enemy.y -= Math.sin(targetAngle) * enemy.speed * dt * 2;
      }
    }

    // Pickups bob and are collected on touch.
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const p = pickups[i];
      p.bob += dt * 3;
      if (!player.inCar && dist(p.x, p.y, player.x, player.y) < COMBAT.pickupRadius) {
        hooks.onPickup(p);
        pickups.splice(i, 1);
      }
    }

    // Particles fade.
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Prune dead enemies once their cash is taken (kept briefly for the fall).
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      if (!enemies[i].alive && random() < 0.02) enemies.splice(i, 1);
    }
  }

  function clearEnemies() {
    enemies.length = 0;
    bullets.length = 0;
  }

  seedPickups();
  return { bullets, enemies, pickups, particles, spawnEnemies, fireBullet, muzzle, burst, blood, sparks, dust, step, clearEnemies };
}
