// Candy Friends — Player Entity (Local Player with Prediction)

import { Sprite, Graphics, GameObjects, Scene, Math as PhaserMath } from 'phaser';
import type { PlayerState, CharacterId, Vec2, AnimationState, PlayerFlags, GAME_CONSTANTS } from '@candy-friends/shared';
import { CHARACTER_CONFIGS, GAME_CONSTANTS as GC } from '@candy-friends/shared';

export class PlayerEntity extends GameObjects.Container {
  public state: PlayerState;
  public characterId: CharacterId;
  private sprite: Graphics;
  private nameText: GameObjects.Text;
  private hpBarBg: Graphics;
  private hpBarFill: Graphics;
  private abilityCooldownArc: Graphics;
  private facingRight = true;
  private lastAnimState: AnimationState = 'idle';
  private animFrame = 0;
  private animTimer = 0;

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

    // Body (procedural capsule)
    this.sprite = this.scene.add.graphics();
    this.sprite.setDepth(10);
    this.add(this.sprite);

    // Name label
    this.nameText = this.scene.add.text(0, -40, config.name, {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'Arial',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(15);
    this.add(this.nameText);

    // HP bar
    this.hpBarBg = this.scene.add.graphics();
    this.hpBarBg.setDepth(12);
    this.add(this.hpBarBg);

    this.hpBarFill = this.scene.add.graphics();
    this.hpBarFill.setDepth(13);
    this.add(this.hpBarFill);

    // Ability cooldown indicator
    this.abilityCooldownArc = this.scene.add.graphics();
    this.abilityCooldownArc.setDepth(14);
    this.add(this.abilityCooldownArc);
  }

  // Called each frame with local input (prediction)
  applyInput(moveDir: Vec2, dt: number): void {
    const speed = GC.TILE_SIZE * 5; // 5 tiles/sec
    const velX = moveDir.x * speed;
    const velY = moveDir.y * speed;

    this.state.vel.x = velX;
    this.state.vel.y = velY;
    this.state.pos.x += velX * dt;
    this.state.pos.y += velY * dt;

    if (moveDir.x !== 0) {
      this.facingRight = moveDir.x > 0;
    }

    // Update animation state
    const moving = Math.hypot(moveDir.x, moveDir.y) > 0.1;
    if (moving && !this.state.flags.stunned && !this.state.flags.frozen && !this.state.flags.downed) {
      this.state.anim = 'walk';
    } else if (!this.state.flags.downed && this.state.anim !== 'ability' && this.state.anim !== 'hurt') {
      this.state.anim = 'idle';
    }

    this.setPosition(this.state.pos.x, this.state.pos.y);
    this.updateVisuals();
  }

  // Reconcile with server state
  reconcile(serverState: PlayerState): void {
    // Position correction
    const dx = serverState.pos.x - this.state.pos.x;
    const dy = serverState.pos.y - this.state.pos.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 2) {
      // Snap if large discrepancy
      this.state.pos = { ...serverState.pos };
      this.setPosition(this.state.pos.x, this.state.pos.y);
    } else if (dist > 0.5) {
      // Smooth correction
      this.state.pos.x += dx * 0.3;
      this.state.pos.y += dy * 0.3;
      this.setPosition(this.state.pos.x, this.state.pos.y);
    }

    // Sync other state
    this.state.hp = serverState.hp;
    this.state.anim = serverState.anim;
    this.state.facing = serverState.facing;
    this.state.flags = { ...serverState.flags };
    this.state.ability = { ...serverState.ability };
    this.state.lastInputSeq = serverState.lastInputSeq;
    this.facingRight = serverState.facing === 1;

    this.updateVisuals();
  }

  // Interpolate other players
  interpolate(targetState: PlayerState, alpha: number): void {
    this.state.pos.x = PhaserMath.Linear(this.state.pos.x, targetState.pos.x, alpha);
    this.state.pos.y = PhaserMath.Linear(this.state.pos.y, targetState.pos.y, alpha);
    this.state.vel.x = PhaserMath.Linear(this.state.vel.x, targetState.vel.x, alpha);
    this.state.vel.y = PhaserMath.Linear(this.state.vel.y, targetState.vel.y, alpha);
    this.setPosition(this.state.pos.x, this.state.pos.y);
    this.updateVisuals();
  }

  private updateVisuals(): void {
    const config = CHARACTER_CONFIGS[this.characterId];
    const color = config.color;
    const scale = this.facingRight ? 1 : -1;

    // Clear and redraw
    this.sprite.clear();
    this.sprite.fillStyle(color, 1);

    // Body capsule
    const width = 24;
    const height = 36;
    this.sprite.fillRoundedRect(-width/2 * scale, -height/2, width, height, 12);

    // Head circle
    this.sprite.fillCircle(0, -height/2 - 8, 14);

    // Eyes
    this.sprite.fillStyle(0x000000, 1);
    const eyeOffset = this.facingRight ? 5 : -5;
    this.sprite.fillCircle(eyeOffset, -height/2 - 10, 3);
    this.sprite.fillCircle(eyeOffset + (this.facingRight ? 8 : -8), -height/2 - 10, 3);

    // Ability cooldown arc
    this.abilityCooldownArc.clear();
    if (this.state.ability.cooldownRemaining > 0) {
      const progress = 1 - this.state.ability.cooldownRemaining / CHARACTER_CONFIGS[this.characterId].ability.cooldown;
      this.abilityCooldownArc.lineStyle(3, 0xffff00, 1);
      this.abilityCooldownArc.beginPath();
      this.abilityCooldownArc.arc(0, -height/2 - 20, 20, -Math.PI/2, -Math.PI/2 + Math.PI * 2 * progress);
      this.abilityCooldownArc.strokePath();
    }

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

    // Downed indicator
    if (this.state.flags.downed) {
      this.sprite.fillStyle(0xff0000, 0.5);
      this.sprite.fillCircle(0, 0, 30);
    }

    // Stunned indicator
    if (this.state.flags.stunned) {
      this.sprite.fillStyle(0xffff00, 0.7);
      for (let i = 0; i < 3; i++) {
        const angle = (Date.now() / 200 + i * 2) % (Math.PI * 2);
        this.sprite.fillCircle(Math.cos(angle) * 25, Math.sin(angle) * 25 - 30, 5);
      }
    }
  }

  playAbilityEffect(): void {
    // Flash effect when ability used
    this.sprite.fillStyle(0xffffff, 0.5);
    this.sprite.fillCircle(0, -10, 40);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0.3,
      duration: 100,
      yoyo: true,
      repeat: 2,
      onComplete: () => { this.sprite.alpha = 1; },
    });
  }

  destroy(): void {
    this.nameText.destroy();
    super.destroy();
  }
}