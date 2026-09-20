// Candy Friends — Other Player Entity (Interpolated Remote Players)

import { GameObjects, Scene, Math as PhaserMath } from 'phaser';
import type { PlayerState, CharacterId, Vec2 } from '@candy-friends/shared';
import { CHARACTER_CONFIGS } from '@candy-friends/shared';

export class OtherPlayerEntity extends GameObjects.Container {
  public state: PlayerState;
  public characterId: CharacterId;
  private sprite: GameObjects.Graphics;
  private nameText: GameObjects.Text;
  private hpBarBg: GameObjects.Graphics;
  private hpBarFill: GameObjects.Graphics;
  private lastUpdate = 0;
  private targetState: PlayerState | null = null;

  constructor(scene: Scene, state: PlayerState) {
    super(scene, state.pos.x, state.pos.y);
    this.state = state;
    this.characterId = state.characterId;
    scene.add.existing(this);

    this.createGraphics();
    this.updateVisuals();
  }

  private createGraphics(): void {
    const config = CHARACTER_CONFIGS[this.characterId];
    const color = config.color;

    this.sprite = this.scene.add.graphics();
    this.sprite.setDepth(10);
    this.add(this.sprite);

    this.nameText = this.scene.add.text(0, -40, config.name, {
      fontSize: '11px',
      color: '#ffffff',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(15);
    this.add(this.nameText);

    this.hpBarBg = this.scene.add.graphics();
    this.hpBarBg.setDepth(12);
    this.add(this.hpBarBg);

    this.hpBarFill = this.scene.add.graphics();
    this.hpBarFill.setDepth(13);
    this.add(this.hpBarFill);
  }

  // Set target state for interpolation
  setTarget(target: PlayerState): void {
    this.targetState = target;
    this.lastUpdate = this.scene.time.now;
  }

  // Call each frame to interpolate
  update(dt: number): void {
    if (!this.targetState) return;

    const alpha = Math.min(1, dt * 20); // 20Hz interpolation
    this.interpolate(alpha);
  }

  private interpolate(alpha: number): void {
    if (!this.targetState) return;

    this.state.pos.x = PhaserMath.Linear(this.state.pos.x, this.targetState.pos.x, alpha);
    this.state.pos.y = PhaserMath.Linear(this.state.pos.y, this.targetState.pos.y, alpha);
    this.state.vel.x = PhaserMath.Linear(this.state.vel.x, this.targetState.vel.x, alpha);
    this.state.vel.y = PhaserMath.Linear(this.state.vel.y, this.targetState.vel.y, alpha);
    this.setPosition(this.state.pos.x, this.state.pos.y);

    // Smooth facing
    if (this.targetState.facing !== this.state.facing) {
      this.state.facing = this.targetState.facing;
    }

    this.state.anim = this.targetState.anim;
    this.state.flags = { ...this.targetState.flags };
    this.state.ability = { ...this.targetState.ability };

    this.updateVisuals();
  }

  private updateVisuals(): void {
    const config = CHARACTER_CONFIGS[this.characterId];
    const color = config.color;
    const scale = this.state.facing === 1 ? 1 : -1;

    this.sprite.clear();
    this.sprite.fillStyle(color, 0.85); // Slightly transparent for remote players

    const width = 24;
    const height = 36;
    this.sprite.fillRoundedRect(-width/2 * scale, -height/2, width, height, 12);
    this.sprite.fillCircle(0, -height/2 - 8, 14);

    // Eyes
    this.sprite.fillStyle(0x000000, 1);
    const eyeOffset = this.state.facing === 1 ? 5 : -5;
    this.sprite.fillCircle(eyeOffset, -height/2 - 10, 3);
    this.sprite.fillCircle(eyeOffset + (this.state.facing === 1 ? 8 : -8), -height/2 - 10, 3);

    // HP bar
    this.hpBarBg.clear();
    this.hpBarFill.clear();
    const barWidth = 40;
    const barHeight = 4;
    const barY = height/2 + 8;
    this.hpBarBg.fillStyle(0x333333, 1);
    this.hpBarBg.fillRect(-barWidth/2, barY, barWidth, barHeight);
    const hpPct = Math.max(0, this.state.hp / this.state.maxHp);
    this.hpBarFill.fillStyle(hpPct > 0.3 ? 0x00ff00 : 0xff0000, 1);
    this.hpBarFill.fillRect(-barWidth/2, barY, barWidth * hpPct, barHeight);

    // Downed
    if (this.state.flags.downed) {
      this.sprite.fillStyle(0xff0000, 0.5);
      this.sprite.fillCircle(0, 0, 30);
    }

    // Stunned
    if (this.state.flags.stunned) {
      this.sprite.fillStyle(0xffff00, 0.7);
      for (let i = 0; i < 3; i++) {
        const angle = (this.scene.time.now / 200 + i * 2) % (Math.PI * 2);
        this.sprite.fillCircle(Math.cos(angle) * 25, Math.sin(angle) * 25 - 30, 5);
      }
    }
  }

  destroy(): void {
    this.nameText.destroy();
    super.destroy();
  }
}