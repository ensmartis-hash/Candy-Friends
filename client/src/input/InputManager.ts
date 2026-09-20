// Candy Friends — Input Manager
// Virtual joystick (left), ability buttons (right), keyboard fallback

import type { Vec2 } from '@candy-friends/shared';

export interface InputState {
  moveDir: Vec2;
  abilityPressed: [boolean, boolean]; // [ability1, ability2]
  interactPressed: boolean;
  isTouch: boolean;
}

export type InputCallback = (state: InputState) => void;

export class InputManager {
  private scene: Phaser.Scene;
  private callbacks: InputCallback[] = [];
  
  // Joystick
  private joystickBase: Phaser.GameObjects.Graphics | null = null;
  private joystickKnob: Phaser.GameObjects.Graphics | null = null;
  private joystickActive = false;
  private joystickPointerId: number | null = null;
  private joystickCenter: Vec2 = { x: 0, y: 0 };
  private readonly joystickRadius = 80;
  private readonly joystickKnobRadius = 35;
  
  // Ability buttons
  private abilityButtons: Phaser.GameObjects.Graphics[] = [];
  private abilityButtonRadius = 50;
  private abilityButtonPressed = [false, false];
  
  // Keyboard
  private keys: { [key: string]: Phaser.Input.Keyboard.Key } = {};
  private readonly keyMap = {
    left: ['A', 'ArrowLeft'],
    right: ['D', 'ArrowRight'],
    up: ['W', 'ArrowUp'],
    down: ['S', 'ArrowDown'],
    ability1: ['Q', 'Shift'],
    ability2: ['E', 'Space'],
    interact: ['F', 'Enter'],
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.setupKeyboard();
    this.createTouchControls();
  }

  private setupKeyboard(): void {
    const kb = this.scene.input.keyboard!;
    for (const [action, keyNames] of Object.entries(this.keyMap)) {
      for (const keyName of keyNames) {
        const key = kb.addKey(Phaser.Input.Keyboard.KeyCodes[keyName as keyof typeof Phaser.Input.Keyboard.KeyCodes]);
        this.keys[action] = key;
      }
    }
  }

  private createTouchControls(): void {
    const { width, height } = this.scene.scale;
    const isMobile = this.scene.sys.game.device.os.android || this.scene.sys.game.device.os.iOS || 
                     ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    if (!isMobile) return;

    // Joystick base (left side)
    this.joystickBase = this.scene.add.graphics();
    this.joystickBase.setDepth(1000);
    this.joystickBase.setScrollFactor(0);
    this.joystickBase.fillStyle(0xffffff, 0.15);
    this.joystickBase.fillCircle(0, 0, this.joystickRadius);
    this.joystickBase.lineStyle(2, 0xffffff, 0.3);
    this.joystickBase.strokeCircle(0, 0, this.joystickRadius);
    this.joystickBase.setVisible(false);

    // Joystick knob
    this.joystickKnob = this.scene.add.graphics();
    this.joystickKnob.setDepth(1001);
    this.joystickKnob.setScrollFactor(0);
    this.joystickKnob.fillStyle(0xffffff, 0.5);
    this.joystickKnob.fillCircle(0, 0, this.joystickKnobRadius);
    this.joystickKnob.setVisible(false);

    // Ability buttons (right side) - 2 buttons stacked
    const buttonSpacing = 20;
    const startX = width - this.abilityButtonRadius - 20;
    const startY = height - this.abilityButtonRadius * 2 - buttonSpacing - 20;

    for (let i = 0; i < 2; i++) {
      const btn = this.scene.add.graphics();
      btn.setDepth(1000);
      btn.setScrollFactor(0);
      const x = startX;
      const y = startY + i * (this.abilityButtonRadius * 2 + buttonSpacing);
      
      btn.fillStyle(0xffffff, 0.15);
      btn.fillCircle(x, y, this.abilityButtonRadius);
      btn.lineStyle(2, 0xffffff, 0.3);
      btn.strokeCircle(x, y, this.abilityButtonRadius);
      
      // Label
      const label = this.scene.add.text(x, y, i === 0 ? 'A' : 'B', {
        fontSize: '28px',
        color: '#ffffff',
        fontFamily: 'Arial',
      }).setOrigin(0.5).setDepth(1001).setScrollFactor(0);
      
      btn.setData('label', label);
      btn.setData('index', i);
      btn.setData('center', { x, y });
      this.abilityButtons.push(btn);
    }

    // Touch events
    this.scene.input.on('pointerdown', this.onPointerDown, this);
    this.scene.input.on('pointermove', this.onPointerMove, this);
    this.scene.input.on('pointerup', this.onPointerUp, this);
    this.scene.input.on('pointerupoutside', this.onPointerUp, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const { width, height } = this.scene.scale;
    
    // Check joystick area (left 40% of screen)
    if (pointer.x < width * 0.4) {
      this.joystickActive = true;
      this.joystickPointerId = pointer.id;
      this.joystickCenter = { x: pointer.x, y: pointer.y };
      
      if (this.joystickBase && this.joystickKnob) {
        this.joystickBase.setPosition(pointer.x, pointer.y).setVisible(true);
        this.joystickKnob.setPosition(pointer.x, pointer.y).setVisible(true);
      }
      return;
    }

    // Check ability buttons
    for (let i = 0; i < this.abilityButtons.length; i++) {
      const btn = this.abilityButtons[i];
      const center = btn.getData('center') as Vec2;
      const dist = Phaser.Math.Distance.Between(pointer.x, pointer.y, center.x, center.y);
      
      if (dist <= this.abilityButtonRadius) {
        this.abilityButtonPressed[i] = true;
        btn.fillStyle(0xffffff, 0.4);
        btn.clear();
        btn.fillCircle(center.x, center.y, this.abilityButtonRadius);
        btn.lineStyle(2, 0xffffff, 0.6);
        btn.strokeCircle(center.x, center.y, this.abilityButtonRadius);
        return;
      }
    }

    // Check interact area (right side, not on buttons)
    if (pointer.x > width * 0.6) {
      this.emitState({ interactPressed: true });
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.joystickActive || pointer.id !== this.joystickPointerId) return;

    const dx = pointer.x - this.joystickCenter.x;
    const dy = pointer.y - this.joystickCenter.y;
    const dist = Math.hypot(dx, dy);
    
    let normX = 0, normY = 0;
    let knobX = pointer.x, knobY = pointer.y;
    
    if (dist > this.joystickRadius) {
      normX = dx / dist;
      normY = dy / dist;
      knobX = this.joystickCenter.x + normX * this.joystickRadius;
      knobY = this.joystickCenter.y + normY * this.joystickRadius;
    } else if (dist > 0) {
      normX = dx / this.joystickRadius;
      normY = dy / this.joystickRadius;
    }

    if (this.joystickKnob) {
      this.joystickKnob.setPosition(knobX, knobY);
    }

    this.emitState({ moveDir: { x: normX, y: normY }, isTouch: true });
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    // Joystick release
    if (pointer.id === this.joystickPointerId) {
      this.joystickActive = false;
      this.joystickPointerId = null;
      if (this.joystickBase) this.joystickBase.setVisible(false);
      if (this.joystickKnob) this.joystickKnob.setVisible(false);
      this.emitState({ moveDir: { x: 0, y: 0 }, isTouch: true });
    }

    // Ability button release
    for (let i = 0; i < this.abilityButtons.length; i++) {
      if (this.abilityButtonPressed[i]) {
        this.abilityButtonPressed[i] = false;
        const btn = this.abilityButtons[i];
        const center = btn.getData('center') as Vec2;
        btn.clear();
        btn.fillStyle(0xffffff, 0.15);
        btn.fillCircle(center.x, center.y, this.abilityButtonRadius);
        btn.lineStyle(2, 0xffffff, 0.3);
        btn.strokeCircle(center.x, center.y, this.abilityButtonRadius);
        this.emitState({ abilityPressed: [this.abilityButtonPressed[0], this.abilityButtonPressed[1]] });
      }
    }

    // Interact release
    this.emitState({ interactPressed: false });
  }

  update(): void {
    if (!this.scene.sys.game.device.os.android && !this.scene.sys.game.device.os.iOS && 
        !('ontouchstart' in window) && navigator.maxTouchPoints === 0) {
      this.updateKeyboard();
    }
  }

  private updateKeyboard(): void {
    let moveX = 0, moveY = 0;
    
    if (this.keys.left?.isDown) moveX -= 1;
    if (this.keys.right?.isDown) moveX += 1;
    if (this.keys.up?.isDown) moveY -= 1;
    if (this.keys.down?.isDown) moveY += 1;

    const len = Math.hypot(moveX, moveY);
    const moveDir: Vec2 = len > 0 ? { x: moveX / len, y: moveY / len } : { x: 0, y: 0 };

    const ability1 = Phaser.Input.Keyboard.JustDown(this.keys.ability1);
    const ability2 = Phaser.Input.Keyboard.JustDown(this.keys.ability2);
    const interact = Phaser.Input.Keyboard.JustDown(this.keys.interact);

    this.emitState({
      moveDir,
      abilityPressed: [ability1, ability2],
      interactPressed: interact,
      isTouch: false,
    });
  }

  onInput(callback: InputCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx >= 0) this.callbacks.splice(idx, 1);
    };
  }

  private emitState(partial: Partial<InputState>): void {
    // Merge with last known state
    const state: InputState = {
      moveDir: { x: 0, y: 0 },
      abilityPressed: [false, false],
      interactPressed: false,
      isTouch: false,
      ...partial,
    };
    for (const cb of this.callbacks) {
      cb(state);
    }
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('pointerupoutside', this.onPointerUp, this);
    
    this.joystickBase?.destroy();
    this.joystickKnob?.destroy();
    for (const btn of this.abilityButtons) {
      btn.getData('label')?.destroy();
      btn.destroy();
    }
    this.callbacks = [];
  }

  // Resize handler
  resize(width: number, height: number): void {
    // Reposition ability buttons
    const startX = width - this.abilityButtonRadius - 20;
    const startY = height - this.abilityButtonRadius * 2 - 20 - 20;
    
    for (let i = 0; i < this.abilityButtons.length; i++) {
      const btn = this.abilityButtons[i];
      const x = startX;
      const y = startY + i * (this.abilityButtonRadius * 2 + 20);
      
      btn.clear();
      btn.fillStyle(0xffffff, 0.15);
      btn.fillCircle(x, y, this.abilityButtonRadius);
      btn.lineStyle(2, 0xffffff, 0.3);
      btn.strokeCircle(x, y, this.abilityButtonRadius);
      
      const label = btn.getData('label') as Phaser.GameObjects.Text;
      label.setPosition(x, y);
      
      btn.setData('center', { x, y });
    }
  }
}