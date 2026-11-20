// Drawing only: the city, its people and cars, and the screens, painted on one
// canvas from the world's state. Top-down, sun-soaked: a warm sunset tint, long
// shadows, roofed buildings with a pseudo-3D lift, and a minimap drawn by hud.js.
// Nothing here reads input or changes the world.
//
// Headlight cones and lamp glow after dark (the clock drives the light, not a
// fixed sunset), smoke from a battered player car, taxi roof signs, rooftop
// helipads and AC units on the tall towers, landmark markers for the named
// places, and brawlers drawn bulkier than gunmen so a fight reads at a glance.
// The sky tint follows the in-game hour through the SKY_TINTS table instead of
// one fixed wash.

import { DISTRICTS, DAY_CYCLE, PALETTE, ROADS_X, ROADS_Y, SKY_TINTS, VIEW, WORLD } from './config.js';
import { clamp, dist } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WIN = 'win';

const ROAD_HALF = WORLD.roadWidth / 2;
const SIDE = WORLD.sidewalk;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const camera = { x: 0, y: 0, zoom: 1 };
  const fonts = new Map();

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}:${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  /** True when the in-game hour is dark enough for headlights and lamps. */
  function isNight(state) {
    const h = state.timeOfDay;
    return h >= DAY_CYCLE.nightHour || h < 6;
  }

  /** The sky wash for the current hour, interpolated from SKY_TINTS. */
  function skyTint(state) {
    const h = state.timeOfDay;
    let tint = SKY_TINTS[SKY_TINTS.length - 1].tint;
    for (let i = 0; i < SKY_TINTS.length; i += 1) {
      if (h <= SKY_TINTS[i].hour) {
        tint = SKY_TINTS[i].tint;
        break;
      }
    }
    return tint;
  }

  function drawGround(state) {
    const { x: cx, y: cy } = camera;
    const vw = canvas.width / camera.zoom;
    const vh = canvas.height / camera.zoom;
    const x0 = cx - vw / 2 - 60;
    const y0 = cy - vh / 2 - 60;
    const x1 = cx + vw / 2 + 60;
    const y1 = cy + vh / 2 + 60;

    // Grass base.
    context.fillStyle = PALETTE.grass;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Mown stripes for texture.
    context.fillStyle = PALETTE.grassDark;
    const stripe = 120;
    for (let sx = Math.floor(x0 / stripe) * stripe; sx < x1; sx += stripe * 2) {
      context.fillRect(sx, y0, stripe, y1 - y0);
    }
    // Ocean and beach on the west edge.
    if (x0 < WORLD.beachX) {
      const wave = Math.sin(state.time * 1.4) * 6;
      context.fillStyle = PALETTE.waterDeep;
      context.fillRect(x0, y0, WORLD.waterX - x0, y1 - y0);
      context.fillStyle = PALETTE.water;
      context.fillRect(x0, y0, WORLD.waterX - x0 + wave, y1 - y0);
      context.fillStyle = '#ffffff';
      context.globalAlpha = 0.38;
      for (let wy = Math.floor(y0 / 90) * 90; wy < y1; wy += 90) {
        context.fillRect(WORLD.waterX - 26 + wave, wy, 60, 3);
      }
      context.globalAlpha = 1;
      context.fillStyle = PALETTE.sand;
      context.fillRect(WORLD.waterX, y0, WORLD.beachX - WORLD.waterX, y1 - y0);
    }
    // Parks.
    for (const park of state.city.parks) {
      if (park.x > x1 || park.y > y1 || park.x + park.w < x0 || park.y + park.h < y0) continue;
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    // Sidewalks, then road surfaces, then lane markings.
    context.fillStyle = PALETTE.sidewalk;
    for (const rx of ROADS_X) context.fillRect(rx - ROAD_HALF - SIDE, y0, (ROAD_HALF + SIDE) * 2, y1 - y0);
    for (const ry of ROADS_Y) context.fillRect(x0, ry - ROAD_HALF - SIDE, x1 - x0, (ROAD_HALF + SIDE) * 2);
    context.fillStyle = PALETTE.road;
    for (const rx of ROADS_X) context.fillRect(rx - ROAD_HALF, y0, ROAD_HALF * 2, y1 - y0);
    for (const ry of ROADS_Y) context.fillRect(x0, ry - ROAD_HALF, x1 - x0, ROAD_HALF * 2);
    // Centre dashes.
    context.fillStyle = PALETTE.lane;
    for (const rx of ROADS_X) {
      for (let y = Math.floor(y0 / 64) * 64; y < y1; y += 64) context.fillRect(rx - 2, y, 4, 30);
    }
    for (const ry of ROADS_Y) {
      for (let x = Math.floor(x0 / 64) * 64; x < x1; x += 64) context.fillRect(x, ry - 2, 30, 4);
    }
    // Crosswalks at every intersection.
    context.fillStyle = 'rgba(244, 241, 230, 0.85)';
    for (const rx of ROADS_X) {
      for (const ry of ROADS_Y) {
        for (let i = -3; i <= 3; i += 1) {
          context.fillRect(rx - ROAD_HALF + 6, ry + i * 12 - 4, ROAD_HALF * 2 - 12, 6);
          context.fillRect(rx + i * 12 - 4, ry - ROAD_HALF + 6, 6, ROAD_HALF * 2 - 12);
        }
      }
    }
  }

  function drawProps(state) {
    const { x: cx, y: cy } = camera;
    const vw = canvas.width / camera.zoom;
    const vh = canvas.height / camera.zoom;
    const x0 = cx - vw / 2 - 80;
    const y0 = cy - vh / 2 - 80;
    const x1 = cx + vw / 2 + 80;
    const y1 = cy + vh / 2 + 80;
    const night = isNight(state);
    for (const prop of state.city.props) {
      if (prop.x < x0 || prop.x > x1 || prop.y < y0 || prop.y > y1) continue;
      if (prop.kind === 'tree') {
        context.fillStyle = 'rgba(0,0,0,0.18)';
        context.beginPath();
        context.arc(prop.x + 5, prop.y + 6, prop.r, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.tree;
        context.beginPath();
        context.arc(prop.x, prop.y, prop.r, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#57a047';
        context.beginPath();
        context.arc(prop.x - 4, prop.y - 4, prop.r * 0.55, 0, Math.PI * 2);
        context.fill();
      } else if (prop.kind === 'pond') {
        context.fillStyle = PALETTE.water;
        context.beginPath();
        context.arc(prop.x, prop.y, prop.r, 0, Math.PI * 2);
        context.fill();
      } else if (prop.kind === 'fountain') {
        context.fillStyle = '#c9cdd6';
        context.beginPath();
        context.arc(prop.x, prop.y, prop.r, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.water;
        context.beginPath();
        context.arc(prop.x, prop.y, prop.r * 0.7, 0, Math.PI * 2);
        context.fill();
      } else if (prop.kind === 'bench') {
        context.fillStyle = '#7d5a34';
        context.fillRect(prop.x - 10, prop.y - 4, 20, 8);
        context.fillStyle = '#a87c4f';
        context.fillRect(prop.x - 10, prop.y - 6, 20, 3);
      } else if (prop.kind === 'lamp') {
        context.fillStyle = '#2c3036';
        context.beginPath();
        context.arc(prop.x, prop.y, prop.r, 0, Math.PI * 2);
        context.fill();
        if (night) {
          context.fillStyle = PALETTE.lampGlow;
          context.beginPath();
          context.arc(prop.x, prop.y, prop.r * 4, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = '#ffe9a8';
          context.beginPath();
          context.arc(prop.x, prop.y, prop.r * 0.8, 0, Math.PI * 2);
          context.fill();
        }
      } else if (prop.kind === 'billboard') {
        context.fillStyle = 'rgba(0,0,0,0.25)';
        context.fillRect(prop.x - prop.w / 2 + 4, prop.y - prop.h / 2 + 5, prop.w, prop.h);
        context.fillStyle = '#e8b04b';
        context.fillRect(prop.x - prop.w / 2, prop.y - prop.h / 2, prop.w, prop.h);
        context.fillStyle = '#0e1420';
        context.font = 'bold 13px system-ui, sans-serif';
        context.textAlign = 'center';
        context.fillText('SOLMAR BAY', prop.x, prop.y + 5);
      } else if (prop.kind === 'landmark') {
        // A gold ring and a label for the named places.
        context.strokeStyle = '#ffd23f';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(prop.x, prop.y, prop.r, 0, Math.PI * 2);
        context.stroke();
        text(prop.name, prop.x, prop.y - prop.r - 8, 13, '#f4f1e6', 'center', 'bold');
      } else if (prop.kind === 'container') {
        context.save();
        context.translate(prop.x, prop.y);
        context.fillStyle = 'rgba(0,0,0,0.25)';
        context.fillRect(-prop.w / 2 + 4, -prop.h / 2 + 5, prop.w, prop.h);
        context.fillStyle = prop.color;
        context.fillRect(-prop.w / 2, -prop.h / 2, prop.w, prop.h);
        context.fillStyle = 'rgba(255,255,255,0.25)';
        for (let i = -2; i <= 2; i += 1) context.fillRect(i * 12 - 1, -prop.h / 2 + 3, 2, prop.h - 6);
        context.restore();
      } else if (prop.kind === 'crate') {
        context.fillStyle = '#a87c4f';
        context.fillRect(prop.x - prop.r, prop.y - prop.r, prop.r * 2, prop.r * 2);
        context.strokeStyle = '#7d5a34';
        context.strokeRect(prop.x - prop.r, prop.y - prop.r, prop.r * 2, prop.r * 2);
      } else if (prop.kind === 'pier') {
        // Wooden pier planks over the harbor water.
        context.fillStyle = '#8a6a45';
        context.fillRect(prop.x - prop.w / 2, prop.y - prop.h / 2, prop.w, prop.h);
        context.fillStyle = '#a87c4f';
        for (let py = prop.y - prop.h / 2 + 6; py < prop.y + prop.h / 2; py += 12) {
          context.fillRect(prop.x - prop.w / 2 + 3, py, prop.w - 6, 3);
        }
      } else if (prop.kind === 'post') {
        context.fillStyle = '#6d4f30';
        context.beginPath();
        context.arc(prop.x, prop.y, prop.r, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#a87c4f';
        context.beginPath();
        context.arc(prop.x - 1, prop.y - 1, prop.r * 0.6, 0, Math.PI * 2);
        context.fill();
      }
    }
    for (const palm of state.city.palms) {
      if (palm.x < x0 || palm.x > x1 || palm.y < y0 || palm.y > y1) continue;
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.beginPath();
      context.arc(palm.x + 5, palm.y + 6, palm.r, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#7d5a34';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(palm.x, palm.y + 4);
      context.lineTo(palm.x, palm.y - 2);
      context.stroke();
      context.fillStyle = PALETTE.palm;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        context.beginPath();
        context.ellipse(palm.x + Math.cos(a) * palm.r * 0.7, palm.y + Math.sin(a) * palm.r * 0.7, palm.r * 0.75, palm.r * 0.3, a, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawBuildings(state) {
    const { x: cx, y: cy } = camera;
    const vw = canvas.width / camera.zoom;
    const vh = canvas.height / camera.zoom;
    const x0 = cx - vw / 2 - 120;
    const y0 = cy - vh / 2 - 120;
    const x1 = cx + vw / 2 + 120;
    const y1 = cy + vh / 2 + 120;
    const sorted = state.city.buildings.filter((b) => b.x + b.w > x0 && b.x < x1 && b.y + b.h > y0 && b.y < y1);
    sorted.sort((a, b) => a.y - b.y);
    for (const b of sorted) {
      const lift = b.height * 0.55;
      // Shadow and wall (the pseudo-3D lift).
      context.fillStyle = 'rgba(0,0,0,0.28)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.wall;
      context.fillRect(b.x, b.y - lift, b.w, b.h + lift);
      // Roof.
      context.fillStyle = b.roof;
      context.fillRect(b.x, b.y - lift, b.w, b.h);
      context.strokeStyle = 'rgba(0,0,0,0.35)';
      context.lineWidth = 2;
      context.strokeRect(b.x + 1, b.y - lift + 1, b.w - 2, b.h - 2);
      // Roof details: vents, skylights, pool on the tall ones.
      context.fillStyle = 'rgba(255,255,255,0.28)';
      context.fillRect(b.x + b.w * 0.18, b.y - lift + b.h * 0.2, b.w * 0.2, b.h * 0.18);
      context.fillRect(b.x + b.w * 0.62, b.y - lift + b.h * 0.55, b.w * 0.18, b.h * 0.2);
      if (b.height > 26) {
        context.fillStyle = '#2f7fa8';
        context.fillRect(b.x + b.w * 0.3, b.y - lift + b.h * 0.35, b.w * 0.4, b.h * 0.3);
        // A helipad ring on the tallest towers.
        context.strokeStyle = '#f4f1e6';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(b.x + b.w * 0.5, b.y - lift + b.h * 0.5, Math.min(b.w, b.h) * 0.22, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = '#f4f1e6';
        context.font = 'bold 12px system-ui, sans-serif';
        context.textAlign = 'center';
        context.fillText('H', b.x + b.w * 0.5, b.y - lift + b.h * 0.5 + 4);
      }
      // AC units on the roof edge.
      context.fillStyle = 'rgba(0,0,0,0.3)';
      context.fillRect(b.x + b.w * 0.08, b.y - lift + 4, 10, 6);
      context.fillRect(b.x + b.w * 0.82, b.y - lift + 4, 10, 6);
      // Windows on the wall face.
      if (b.windows) {
        context.fillStyle = 'rgba(255, 236, 180, 0.85)';
        const cols = Math.max(2, Math.floor(b.w / 26));
        const rows = Math.max(1, Math.floor(lift / 16));
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            context.fillRect(b.x + 8 + c * ((b.w - 16) / cols), b.y - lift + 6 + r * 15, 7, 9);
          }
        }
      }
    }
  }

  function drawCar(car, isPlayer, time, state) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.30)';
    roundRect(-car.model.len / 2 + 3, -car.model.wid / 2 + 4, car.model.len, car.model.wid, 8);
    context.fill();
    // Headlight cones after dark, for any moving car.
    if (isNight(state) && car.speed > 20) {
      const grad = context.createLinearGradient(car.model.len / 2, 0, car.model.len / 2 + 150, 0);
      grad.addColorStop(0, PALETTE.headlight);
      grad.addColorStop(1, 'rgba(255, 248, 201, 0)');
      context.fillStyle = grad;
      context.beginPath();
      context.moveTo(car.model.len / 2, -car.model.wid / 2 + 3);
      context.lineTo(car.model.len / 2 + 150, -26);
      context.lineTo(car.model.len / 2 + 150, 26);
      context.lineTo(car.model.len / 2, car.model.wid / 2 - 3);
      context.closePath();
      context.fill();
    }
    // Body.
    context.fillStyle = car.model.color;
    roundRect(-car.model.len / 2, -car.model.wid / 2, car.model.len, car.model.wid, 8);
    context.fill();
    // Cabin and windshield.
    context.fillStyle = '#1d2733';
    roundRect(-car.model.len * 0.18, -car.model.wid / 2 + 4, car.model.len * 0.32, car.model.wid - 8, 5);
    context.fill();
    context.fillStyle = 'rgba(180, 220, 255, 0.7)';
    context.fillRect(car.model.len * 0.16, -car.model.wid / 2 + 5, 5, car.model.wid - 10);
    // Headlights and tail lights.
    context.fillStyle = '#fff8c9';
    context.fillRect(car.model.len / 2 - 3, -car.model.wid / 2 + 2, 3, 5);
    context.fillRect(car.model.len / 2 - 3, car.model.wid / 2 - 7, 3, 5);
    // Tail lights flare bright red while the car brakes.
    context.fillStyle = car.braking ? '#ff2e2e' : '#ff3b30';
    context.fillRect(-car.model.len / 2, -car.model.wid / 2 + 2, 3, 5);
    context.fillRect(-car.model.len / 2, car.model.wid / 2 - 7, 3, 5);
    if (car.braking) {
      context.fillStyle = 'rgba(255, 46, 46, 0.25)';
      context.beginPath();
      context.arc(-car.model.len / 2, 0, 22, 0, Math.PI * 2);
      context.fill();
    }
    // A taxi sign on the roof.
    if (car.model.name === 'Sol Taxi') {
      context.fillStyle = '#0e1420';
      context.fillRect(-6, -car.model.wid / 2 - 1, 12, 5);
      context.fillStyle = '#ffd23f';
      context.font = 'bold 5px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText('TAXI', 0, -car.model.wid / 2 + 3);
    }
    if (isPlayer) {
      context.strokeStyle = '#ffd23f';
      context.lineWidth = 2.5;
      roundRect(-car.model.len / 2 - 4, -car.model.wid / 2 - 4, car.model.len + 8, car.model.wid + 8, 10);
      context.stroke();
      // Smoke from a battered car: the damage model made visible.
      if (state && state.player.damage >= 40) {
        context.fillStyle = PALETTE.smoke;
        context.beginPath();
        context.arc(-car.model.len / 2 + Math.sin(time * 5) * 4, -car.model.wid / 2 - 6, 7 + Math.sin(time * 7) * 2, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Police light bar, flashing.
    if (car.model.name === 'Interceptor') {
      const phase = Math.floor(time * 6) % 2 === 0;
      context.fillStyle = phase ? '#ff3b30' : '#2b6cff';
      context.fillRect(-8, -car.model.wid / 2 + 2, 7, 6);
      context.fillStyle = phase ? '#2b6cff' : '#ff3b30';
      context.fillRect(1, -car.model.wid / 2 + 2, 7, 6);
      if (phase) {
        context.fillStyle = 'rgba(255,59,48,0.18)';
        context.beginPath();
        context.arc(0, 0, 46, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  function drawPed(ped, isPlayer, time) {
    const bob = Math.sin(ped.walkPhase || 0) * 2;
    const bulky = ped.role === 'brawler';
    context.save();
    context.translate(ped.x, ped.y);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(2, 4, 9, 6, 0, 0, Math.PI * 2);
    context.fill();
    // Legs, body, head — a little walker with a direction.
    context.rotate(ped.angle);
    context.fillStyle = '#2c3036';
    context.fillRect(-6, -6 + bob, 5, 5);
    context.fillRect(-6, 1 - bob, 5, 5);
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(0, 0, bulky ? 11 : 9, 0, Math.PI * 2);
    context.fill();
    if (bulky) {
      // Brawlers are broader: shoulder pads that read at a glance.
      context.fillStyle = '#7a1f1f';
      context.beginPath();
      context.arc(-3, -7, 4, 0, Math.PI * 2);
      context.arc(-3, 7, 4, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#f2c9a0';
    context.beginPath();
    context.arc(7, 0, 5.5, 0, Math.PI * 2);
    context.fill();
    // A dog walker's dog: a small dot trailing behind.
    if (ped.kind === 'dog') {
      context.rotate(-ped.angle);
      context.fillStyle = '#8a6a45';
      context.beginPath();
      context.arc(-16, 6, 4, 0, Math.PI * 2);
      context.fill();
    }
    if (isPlayer) {
      context.rotate(-ped.angle);
      context.strokeStyle = '#ffd23f';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, 16, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = 'rgba(255,255,255,0.85)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(0, 0, 19, 0, Math.PI * 2);
      context.stroke();
      // Aim line while on foot.
      context.strokeStyle = 'rgba(255,210,63,0.7)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(10, 0);
      context.lineTo(34, 0);
      context.stroke();
    }
    context.restore();
  }

  function drawWorld(state) {
    drawGround(state);
    drawProps(state);
    // Pickups under the cars.
    for (const p of state.combat.pickups) {
      const bobY = Math.sin(p.bob) * 3;
      context.save();
      context.translate(p.x, p.y + bobY);
      if (p.type === 'cash') {
        context.fillStyle = '#2f9e5f';
        context.fillRect(-11, -7, 22, 14);
        context.fillStyle = '#ffd23f';
        context.font = 'bold 11px system-ui, sans-serif';
        context.textAlign = 'center';
        context.fillText('$', 0, 4);
      } else {
        context.fillStyle = '#f4f1e6';
        context.fillRect(-10, -10, 20, 20);
        context.fillStyle = '#e5484d';
        context.fillRect(-3, -8, 6, 16);
        context.fillRect(-8, -3, 16, 6);
      }
      context.restore();
    }
    drawBuildings(state);
    // Mission marker: a pulsing beacon and a ring on the ground.
    const marker = state.missions.marker();
    if (marker) {
      const pulse = 1 + Math.sin(state.time * 4) * 0.15;
      context.save();
      context.translate(marker.x, marker.y);
      context.strokeStyle = '#ffd23f';
      context.lineWidth = 4;
      context.beginPath();
      context.arc(0, 0, marker.r * 0.45 * pulse, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = 'rgba(255,210,63,0.25)';
      context.beginPath();
      context.arc(0, 0, marker.r * 0.45 * pulse, 0, Math.PI * 2);
      context.fill();
      // Beacon column.
      const grad = context.createLinearGradient(0, -260, 0, 0);
      grad.addColorStop(0, 'rgba(255,210,63,0)');
      grad.addColorStop(1, 'rgba(255,210,63,0.45)');
      context.fillStyle = grad;
      context.fillRect(-14, -260, 28, 260);
      context.fillStyle = '#ffd23f';
      context.beginPath();
      context.moveTo(0, -252);
      context.lineTo(12, -226);
      context.lineTo(-12, -226);
      context.closePath();
      context.fill();
      context.restore();
    }
    // Pedestrians, then cars, then the player on top.
    for (const ped of state.traffic.peds) drawPed(ped, false, state.time);
    for (const enemy of state.combat.enemies) {
      if (!enemy.alive) continue;
      drawPed({ x: enemy.x, y: enemy.y, angle: enemy.angle, color: '#c22e2e', walkPhase: state.time * 6, role: enemy.role }, false, state.time);
      // Health bar over rivals.
      context.fillStyle = 'rgba(0,0,0,0.5)';
      context.fillRect(enemy.x - 16, enemy.y - 26, 32, 5);
      context.fillStyle = '#e5484d';
      context.fillRect(enemy.x - 16, enemy.y - 26, 32 * (enemy.health / 100), 5);
      // A reloading gunman shows a small pause icon.
      if (enemy.role === 'gunman' && enemy.reloadTimer > 0) {
        text('…', enemy.x, enemy.y - 32, 14, '#f4f1e6', 'center', 'bold');
      }
    }
    for (const car of state.traffic.cars) {
      if (state.player.inCar === car) continue;
      drawCar(car, false, state.time, state);
    }
    for (const cop of state.police.cops) drawCar(cop, false, state.time, state);
    if (state.player.inCar) drawCar(state.player.inCar, true, state.time, state);
    else drawPed({ x: state.player.x, y: state.player.y, angle: state.player.angle, color: '#ffd23f', walkPhase: state.player.walkPhase }, true, state.time);
    // Bullets and particles.
    for (const b of state.combat.bullets) {
      context.strokeStyle = '#ffe27a';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    for (const p of state.combat.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // Steal progress ring.
    if (state.player.stealTarget) {
      const car = state.player.stealTarget;
      context.strokeStyle = '#ffd23f';
      context.lineWidth = 5;
      context.beginPath();
      context.arc(car.x, car.y, 44, -Math.PI / 2, -Math.PI / 2 + state.player.stealProgress * Math.PI * 2);
      context.stroke();
      text('STEALING…', car.x, car.y - 56, 15, '#ffd23f', 'center', 'bold');
    }
    // Drifting: skid marks trail the rear wheels for a moment.
    if (state.player.drifting && state.player.inCar) {
      const car = state.player.inCar;
      context.strokeStyle = 'rgba(20, 20, 20, 0.35)';
      context.lineWidth = 4;
      const back = car.angle + Math.PI;
      context.beginPath();
      context.moveTo(car.x + Math.cos(back) * 18, car.y + Math.sin(back) * 18);
      context.lineTo(car.x + Math.cos(back) * 40, car.y + Math.sin(back) * 40);
      context.stroke();
    }
    // Sky tint for the hour — sunset at dusk, deep blue after dark.
    context.fillStyle = skyTint(state);
    context.fillRect(camera.x - canvas.width / camera.zoom / 2, camera.y - canvas.height / camera.zoom / 2, canvas.width / camera.zoom, canvas.height / camera.zoom);
    // District names, only when zoomed far out (the wide city shot) — the
    // map reads as a place with named parts, not a grid of green.
    if (camera.zoom < 0.6) {
      for (const d of DISTRICTS) {
        context.save();
        context.globalAlpha = 0.75;
        text(d.name.toUpperCase(), d.x + d.w / 2, d.y + d.h / 2, 44, '#f4f1e6', 'center', 'bold');
        context.restore();
      }
    }
  }

  function drawOffscreenMarker(state) {
    const marker = state.missions.marker();
    if (!marker) return;
    const sx = (marker.x - camera.x) * camera.zoom + canvas.width / 2;
    const sy = (marker.y - camera.y) * camera.zoom + canvas.height / 2;
    if (sx > 60 && sx < canvas.width - 60 && sy > 60 && sy < canvas.height - 60) return;
    const cx = clamp(sx, 50, canvas.width - 50);
    // Keep the arrow clear of the minimap (bottom-left) and the message
    // banner / help line (bottom strip), so it never hides the HUD.
    const cy = clamp(sy, 50, canvas.height - 240);
    const angle = Math.atan2(sy - canvas.height / 2, sx - canvas.width / 2);
    context.save();
    context.translate(cx, cy);
    context.rotate(angle);
    context.fillStyle = '#ffd23f';
    context.beginPath();
    context.moveTo(16, 0);
    context.lineTo(-10, -11);
    context.lineTo(-10, 11);
    context.closePath();
    context.fill();
    context.restore();
    text(`${Math.round(dist(state.player.x, state.player.y, marker.x, marker.y))}m`, cx, cy + 26, 13, '#ffd23f', 'center', 'bold');
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = 640;
    const lineH = 30;
    const h = 150 + lines.length * lineH + 70;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    context.fillStyle = 'rgba(10, 14, 22, 0.88)';
    roundRect(x, y, w, h, 14);
    context.fill();
    context.strokeStyle = accent || '#ffd23f';
    context.lineWidth = 2;
    roundRect(x, y, w, h, 14);
    context.stroke();
    text(title, canvas.width / 2, y + 64, 42, '#f4f1e6', 'center', 'bold');
    lines.forEach((line, i) => {
      text(line, canvas.width / 2, y + 116 + i * lineH, 19, '#c9cdd6', 'center');
    });
    text(prompt, canvas.width / 2, y + h - 30, 19, accent || '#ffd23f', 'center', 'bold');
  }

  /** Paint one frame. `screen` is one of the SCREEN_* constants. */
  function draw(state, screen) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0e1420';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const zoom = state.shotZoom || 1;
    camera.zoom = zoom * (canvas.width / VIEW.width);
    camera.x = clamp(state.player.x, 0, 4800);
    camera.y = clamp(state.player.y, 0, 3600);
    // The camera transform: world -> screen, centred on the player.
    context.setTransform(camera.zoom, 0, 0, camera.zoom, canvas.width / 2 - camera.x * camera.zoom, canvas.height / 2 - camera.y * camera.zoom);
    if (screen === SCREEN_TITLE) {
      // Title shows the city alive behind the panel: a slow pan over Downtown.
      camera.x = 2360 + Math.sin(state.time * 0.05) * 300;
      camera.y = 1620 + Math.cos(state.time * 0.04) * 200;
      context.setTransform(camera.zoom, 0, 0, camera.zoom, canvas.width / 2 - camera.x * camera.zoom, canvas.height / 2 - camera.y * camera.zoom);
    }
    drawWorld(state);
    // Back to screen space for markers and panels.
    context.setTransform(1, 0, 0, 1, 0, 0);
    // Vignette: darkened corners pull the eye to the action.
    const vg = context.createRadialGradient(
      canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.45,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.75,
    );
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, 'rgba(10, 10, 20, 0.28)');
    context.fillStyle = vg;
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (screen === SCREEN_PLAY) drawOffscreenMarker(state);
    if (screen === SCREEN_TITLE) {
      drawPanel('SOLMAR BAY', [
        'An open-world crime story in the sun.',
        'Steal cars. Outrun the law. Run five jobs for the Tide.',
        'WASD drive & walk · Mouse aim · Click shoot · E enter car',
        'Shift run · Space handbrake · P pause · M mute · R restart job',
        state.saveSummary || 'A new story — Mara Quinn, courier, owes the harbor boss one last run.',
      ], state.hasSave ? 'Press Enter — continue your story' : 'Press Enter or click to start');
    } else if (screen === SCREEN_PAUSED) {
      const statsLine = state.stats
        ? `${Math.round(state.stats.distanceDriven / 100) / 10} miles driven · ${state.stats.nearMisses} near misses · ${Math.round(state.stats.timePlayed / 60)} min on the streets · ${state.stats.busts} busts`
        : '';
      drawPanel('PAUSED', ['The bay waits for no one — except now.', statsLine, 'M mute · R restart job · Enter resume'], 'Press P or Enter to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('MARA IS DOWN', [`The Tide will remember her. Cash kept: $${state.player.cash}.`, 'The story restarts from your last save.'], 'Press Enter to try again');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', [`The Solmar Bay PD took Mara in. Cash kept: $${state.player.cash}.`, 'The story restarts from your last save.'], 'Press Enter to try again');
    } else if (screen === SCREEN_WIN) {
      drawPanel('THE TIDE IS FREE', ['All five jobs done. Mara Quinn owns the bay now.', `Final take: $${state.player.cash}. Free roam continues.`], 'Press Enter to keep playing');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, camera };
}
