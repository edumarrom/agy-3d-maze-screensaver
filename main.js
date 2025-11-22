/* repo */
import { Maze } from './maze.js';
import { MazeRenderer } from './renderer.js';
import * as THREE from 'three';

class App {
  constructor() {
    this.mazeSize = 10; // Reduced by 50% (20 -> 10) for faster completion
    this.maze = new Maze(this.mazeSize, this.mazeSize);
    this.renderer = new MazeRenderer('app');

    this.bot = {
      x: this.maze.start.x,
      y: this.maze.start.y,
      dir: 0, // 0: N, 1: E, 2: S, 3: W (matches grid y-1, x+1, y+1, x-1)
      state: 'idle', // idle, moving, turning, turning_moving
      progress: 0,
      startX: 0, // Added for interpolation
      startY: 0, // Added for interpolation
      targetX: 0,
      targetY: 0,
      targetDir: 0,
      startDir: 0,
      speed: 1.28, // Reduced by another 20% (1.6 -> 1.28)
      turnSpeed: 1.632, // Reduced by another 15% (1.92 -> 1.632)
      justTurned: false // Flag to force move after turn
    };


    this.flipState = { active: false, progress: 0, startRoll: 0, targetRoll: 0 };

    this.rat = {
      x: 0,
      y: 0,
      dir: 0,
      state: 'idle',
      progress: 0,
      startX: 0,
      startY: 0,
      targetX: 0,
      targetY: 0,
      targetDir: 0,
      startDir: 0,
      speed: 1.28, // Same speed as bot
      turnSpeed: 1.632,
      justTurned: false
    };

    // Initial direction: Face a valid opening or just North
    this.bot.dir = this.findInitialDirection(this.maze.start.x, this.maze.start.y);

    this.clock = new THREE.Clock();
    this.state = 'intro'; // intro, playing, won, resetting
    this.stateTimer = 0;
    this.introDuration = 2.0;
    this.wonDuration = 0.5; // Reduced to 0.5s for faster reset

    this.wakeLock = null; // Sentinel for Wake Lock

    this.init();
  }

  findInitialDirection(x, y) {
    // Check neighbors of start to face an open path
    const cell = this.maze.grid[y][x];
    if (!cell.walls.top) return 0;
    if (!cell.walls.right) return 1;
    if (!cell.walls.bottom) return 2;
    if (!cell.walls.left) return 3;
    return 0;
  }

  async init() {
    try {
      await this.renderer.loadTextures();

      // Persistent state for next game's starting rule
      // Default: 'right' (Right-Hand Rule)
      this.nextStartRule = 'right';

      this.startNewGame();
      this.setupFullscreenListeners();

      // Handle visibility change to re-acquire lock
      document.addEventListener('visibilitychange', () => this.handleVisibilityChange());

      this.renderer.renderer.setAnimationLoop(() => this.update());
    } catch (error) {
      console.error("Init failed:", error);
    }
  }

  setupFullscreenListeners() {
    // Desktop Double Click
    window.addEventListener('dblclick', () => {
      this.toggleFullscreen();
    });

    // Mobile Double Tap
    let lastTapTime = 0;
    window.addEventListener('touchstart', (e) => {
      // Prevent default zooming behavior on some browsers if needed,
      // but be careful not to break scrolling if we had any (we don't).
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTapTime;
      if (tapLength < 300 && tapLength > 0) {
        this.toggleFullscreen();
        e.preventDefault(); // Prevent zoom
      }
      lastTapTime = currentTime;
    }, { passive: false });
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        this.lockOrientation();
        this.requestWakeLock(); // Request Wake Lock on user interaction
      }).catch(err => {
        console.warn(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        this.unlockOrientation();
      }
    }
  }

  lockOrientation() {
    // Check if Screen Orientation API is supported
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(err => {
        console.warn(`Orientation lock failed: ${err.message}`);
        // Expected on some devices/browsers that don't support locking or require specific context
      });
    }
  }

  unlockOrientation() {
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  }

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock is active');

        this.wakeLock.addEventListener('release', () => {
          console.log('Wake Lock released');
          this.wakeLock = null;
        });
      }
    } catch (err) {
      console.error(`${err.name}, ${err.message}`);
    }
  }

  async handleVisibilityChange() {
    if (this.wakeLock !== null && document.visibilityState === 'visible') {
      await this.requestWakeLock();
    }
  }

  startNewGame() {
    this.state = 'intro';
    this.stateTimer = 0;
    this.maze.generate();

    // Set rule based on previous game's outcome
    this.rule = this.nextStartRule;
    // Always start upright
    this.isInverted = false;

    this.flipState = { active: false, progress: 0, startRoll: 0, targetRoll: 0 };
    this.maze.placeStonesRandomly();
    this.placeRatRandomly();

    this.renderer.createMazeGeometry(this.maze);

    // Hide elements (stones, rat) during intro animation
    this.renderer.toggleGameElementsVisibility(false);

    // Bot Setup
    this.bot = {
      x: this.maze.start.x,
      y: this.maze.start.y,
      dir: this.findInitialDirection(this.maze.start.x, this.maze.start.y), // Find valid start direction
      state: 'idle', // idle, moving, turning, turning_moving
      progress: 0,
      speed: 1.024, // Reduced by 20% (1.28 -> 1.024)
      turnSpeed: 1.3056, // Reduced by 20% (1.632 -> 1.3056)
      targetX: 0,
      targetY: 0,
      targetDir: 0,
      startDir: 0,
      startX: 0,
      startY: 0,
      justTurned: false
    };

    // Offset Start Sprite to be in front of camera
    // Use a slightly larger offset to ensure it's clearly visible
    const fwd = this.getForwardVector(this.bot.dir);
    const offset = 0.7 * this.renderer.cellSize;
    if (this.renderer.startSprite) {
      this.renderer.startSprite.position.x += fwd.x * offset;
      this.renderer.startSprite.position.z += fwd.z * offset;
    }



    this.updateCamera();
  }

  placeRatRandomly() {
    let rx, ry;
    do {
      rx = Math.floor(Math.random() * this.mazeSize);
      ry = Math.floor(Math.random() * this.mazeSize);
    } while ((rx === this.maze.start.x && ry === this.maze.start.y) ||
      (rx === this.maze.end.x && ry === this.maze.end.y));

    this.rat.x = rx;
    this.rat.y = ry;
    this.rat.dir = Math.floor(Math.random() * 4);
    this.rat.state = 'idle';
    this.rat.progress = 0;
    this.rat.startX = rx;
    this.rat.startY = ry;
    this.rat.targetX = rx;
    this.rat.targetY = ry;
    this.rat.targetDir = this.rat.dir;
    this.rat.justTurned = false;

    this.maze.rat = { x: rx, y: ry }; // Pass to renderer for initial creation
    if (this.renderer.ratSprite) {
      this.renderer.ratSprite.position.set(rx * this.renderer.cellSize, 0.42, ry * this.renderer.cellSize);
    }
  }

  getForwardVector(dir) {
    // 0: N (0, -1), 1: E (1, 0), 2: S (0, 1), 3: W (-1, 0)
    switch (dir) {
      case 0: return { x: 0, z: -1 };
      case 1: return { x: 1, z: 0 };
      case 2: return { x: 0, z: 1 };
      case 3: return { x: -1, z: 0 };
    }
    return { x: 0, z: 0 };
  }

  update() {
    const dt = this.clock.getDelta();

    if (this.state === 'intro') {
      this.stateTimer += dt;
      this.renderer.animateWalls(dt, 1); // Animate UP to 1
      if (this.stateTimer >= this.introDuration) {
        this.state = 'playing';
        // Show elements when walls are fully up
        this.renderer.toggleGameElementsVisibility(true);
      }
    } else if (this.state === 'playing') {
      this.updateBot(dt);
      this.updateRat(dt);
      this.updateFlip(dt);
      this.renderer.updateStones(dt, this.maze.stones);
    } else if (this.state === 'won') {
      // Hide elements when walls start falling
      this.renderer.toggleGameElementsVisibility(false);

      this.renderer.animateWalls(dt, 0); // Animate DOWN to 0
      if (this.renderer.wallGroup.scale.y <= 0.01) {
        this.state = 'resetting';
        this.stateTimer = 0;
      }
    } else if (this.state === 'resetting') {
      this.stateTimer += dt;
      if (this.stateTimer >= this.wonDuration) {
        this.startNewGame();
      }
    }

    this.updateCamera();
    this.renderer.render();
  }

  updateFlip(dt) {
    if (!this.flipState.active) return;

    this.flipState.progress += dt * 0.95; // Flip speed reduced by 5% (1.0 -> 0.95)
    if (this.flipState.progress >= 1) {
      this.flipState.progress = 1;
      this.flipState.active = false;

      // Relocate stone AFTER flip is complete
      if (this.flipState.stoneIndex !== undefined) {
        this.maze.relocateStone(this.flipState.stoneIndex);
        this.flipState.stoneIndex = undefined;
      }
      // Ensure final roll is exact
      this.renderer.camera.rotation.z = this.flipState.targetRoll;
    } else {
      // Interpolate
      const t = this.flipState.progress;
      const currentRoll = this.flipState.startRoll + (this.flipState.targetRoll - this.flipState.startRoll) * t;
      this.renderer.camera.rotation.z = currentRoll;
    }
  }

  startFlip() {
    if (this.flipState.active) return;
    this.flipState.active = true;
    this.flipState.progress = 0;
    this.flipState.startRoll = this.renderer.camera.rotation.z;

    // Toggle Inverted State
    this.isInverted = !this.isInverted;

    // Toggle Movement Rule (Right <-> Left)
    this.rule = (this.rule === 'right' ? 'left' : 'right');

    // Target Roll:
    // If inverted (true), we want PI (upside down).
    // If normal (false), we want 0 (upright).
    // But to ensure smooth rotation in one direction (Right/Clockwise), we subtract PI.
    this.flipState.targetRoll = this.flipState.startRoll - Math.PI;
  }

  updateBot(dt) {
    // Calculate interpolated position for precise collision
    let currX = this.bot.x;
    let currY = this.bot.y;

    if (this.bot.state === 'moving') {
      const t = this.bot.progress;
      currX = this.bot.x + (this.bot.targetX - this.bot.x) * t;
      currY = this.bot.y + (this.bot.targetY - this.bot.y) * t;
    } else if (this.bot.state === 'turning_moving') {
      const t = this.bot.progress;
      currX = this.bot.startX + (this.bot.targetX - this.bot.startX) * t;
      currY = this.bot.startY + (this.bot.targetY - this.bot.startY) * t;
    }

    // Check Stone Collision
    // CRITICAL: Do not check collision if already flipping!
    if (!this.flipState.active && this.maze.stones) {
      for (let i = 0; i < this.maze.stones.length; i++) {
        const s = this.maze.stones[i];
        const dx = currX - s.x;
        const dy = currY - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Hitbox: 0.5 means we are 0.5 units away (entering the cell boundary)
        // This allows decimals to work properly because currX/Y are floats.
        if (dist < 0.4) {
          this.startFlip();
          // Delay relocation: Store index
          this.flipState.stoneIndex = i;
          this.renderer.updateSprites(this.isInverted);
          break;
        }
      }
    }

    if (this.flipState.active) return;

    if (this.bot.state === 'idle') {
      this.decideNextMove();
    } else if (this.bot.state === 'moving') {
      this.bot.progress += dt * this.bot.speed;

      // Check if we are moving towards the end cell
      if (this.bot.targetX === this.maze.end.x && this.bot.targetY === this.maze.end.y) {
        // "Hitbox" logic: Stop early
        if (this.bot.progress >= 0.7) {
          this.bot.progress = 0.7; // Clamp position
          this.state = 'won';
          // Toggle rule for next game based on current end state
          this.nextStartRule = (this.rule === 'right' ? 'left' : 'right');
          return;
        }
      }

      if (this.bot.progress >= 1) {
        this.bot.progress = 0;
        this.bot.x = this.bot.targetX;
        this.bot.y = this.bot.targetY;
        this.bot.state = 'idle';
        this.bot.justTurned = false; // Reset justTurned after completing a move
      }
    } else if (this.bot.state === 'turning_moving') {
      // Combine turning and moving
      this.bot.progress += dt * this.bot.speed;

      // Check if we are moving towards the end cell
      if (this.bot.targetX === this.maze.end.x && this.bot.targetY === this.maze.end.y) {
        // "Hitbox" logic: Stop early
        if (this.bot.progress >= 0.7) {
          this.bot.progress = 0.7; // Clamp position
          this.state = 'won';
          // Toggle rule for next game based on current end state
          this.nextStartRule = (this.rule === 'right' ? 'left' : 'right');
          return;
        }
      }

      if (this.bot.progress >= 1) {
        this.bot.progress = 0;
        this.bot.x = this.bot.targetX;
        this.bot.y = this.bot.targetY;
        this.bot.dir = this.bot.targetDir;
        this.bot.state = 'idle';
        this.bot.justTurned = false;
      }
    } else if (this.bot.state === 'turning') {
      let currentTurnSpeed = this.bot.turnSpeed;
      if (this.bot.turnType === 'back') {
        currentTurnSpeed *= 0.8; // Reduce by 20% for 180 turns
      }
      this.bot.progress += dt * currentTurnSpeed;
      if (this.bot.progress >= 1) {
        this.bot.progress = 0;
        this.bot.dir = this.bot.targetDir;
        this.bot.state = 'idle';
        this.bot.justTurned = true;
      }
    }

    this.updateCamera();
  }

  handleWin() {
    // Move camera back slightly so it doesn't clip the smiley
    // Bot is at end cell. Camera is at end cell.
    // We want to pull back in the direction we came from.
    // Current dir is the direction we moved IN.
    // So we subtract forward vector.
    const fwd = this.getForwardVector(this.bot.dir);
    const offset = 0.8 * this.renderer.cellSize; // Pull back almost a full cell

    const camX = this.bot.x - fwd.x * (offset / this.renderer.cellSize); // Grid units
    const camY = this.bot.y - fwd.z * (offset / this.renderer.cellSize); // Grid units
    const angle = this.getAngle(this.bot.dir);

    this.renderer.updateCamera(camX, camY, angle);
  }

  checkWin() {
    return this.bot.x === this.maze.end.x && this.bot.y === this.maze.end.y && this.bot.state === 'idle';
  }

  decideNextMove() {
    // If we just turned, we should attempt to move forward into the new path
    if (this.bot.justTurned) {
      this.bot.justTurned = false;
      if (this.canMove(this.bot.x, this.bot.y, this.bot.dir)) {
        this.startMove(this.bot.dir);
        return;
      }
    }

    const frontDir = this.bot.dir;
    const rightDir = (this.bot.dir + 1) % 4; // World Right
    const leftDir = (this.bot.dir + 3) % 4;  // World Left
    const backDir = (this.bot.dir + 2) % 4;

    // Determine Body-Relative Directions based on Camera State
    // If Upright (isInverted=false): Body Right = World Right, Body Left = World Left
    // If Inverted (isInverted=true): Body Right = World Left, Body Left = World Right
    let bodyRightDir, bodyLeftDir;

    if (!this.isInverted) {
      bodyRightDir = rightDir;
      bodyLeftDir = leftDir;
    } else {
      bodyRightDir = leftDir;
      bodyLeftDir = rightDir;
    }

    if (this.rule === 'right') {
      // Right-Hand Rule
      // Priority: 1. Body Right, 2. Front, 3. Body Left, 4. Back
      if (this.canMove(this.bot.x, this.bot.y, bodyRightDir)) {
        // Turn to Body Right
        // If Upright: Turn World Right (type 'right')
        // If Inverted: Turn World Left (type 'left') -> Visually Right on screen
        const turnType = !this.isInverted ? 'right' : 'left';
        this.startTurnMove(bodyRightDir, turnType);
      } else if (this.canMove(this.bot.x, this.bot.y, frontDir)) {
        this.startMove(frontDir);
      } else if (this.canMove(this.bot.x, this.bot.y, bodyLeftDir)) {
        const turnType = !this.isInverted ? 'left' : 'right';
        this.startTurnMove(bodyLeftDir, turnType);
      } else {
        // Dead end, U-turn
        this.startTurnMove(backDir, 'back');
      }
    } else {
      // Left-Hand Rule
      // Priority: 1. Body Left, 2. Front, 3. Body Right, 4. Back
      if (this.canMove(this.bot.x, this.bot.y, bodyLeftDir)) {
        const turnType = !this.isInverted ? 'left' : 'right';
        this.startTurnMove(bodyLeftDir, turnType);
      } else if (this.canMove(this.bot.x, this.bot.y, frontDir)) {
        this.startMove(frontDir);
      } else if (this.canMove(this.bot.x, this.bot.y, bodyRightDir)) {
        const turnType = !this.isInverted ? 'right' : 'left';
        this.startTurnMove(bodyRightDir, turnType);
      } else {
        // Dead end, U-turn
        this.startTurnMove(backDir, 'back');
      }
    }
  }

  canMove(x, y, dir) {
    const cell = this.maze.grid[y][x];
    if (dir === 0) return !cell.walls.top;
    if (dir === 1) return !cell.walls.right;
    if (dir === 2) return !cell.walls.bottom;
    if (dir === 3) return !cell.walls.left;
    return false;
  }

  startMove(dir) {
    this.bot.state = 'moving';
    this.bot.targetDir = dir;
    this.bot.startX = this.bot.x;
    this.bot.startY = this.bot.y;
    this.bot.targetX = this.bot.x + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
    this.bot.targetY = this.bot.y + (dir === 2 ? 1 : dir === 0 ? -1 : 0);
    this.bot.justTurned = false;
  }

  startTurnMove(dir, type) {
    this.bot.state = 'turning_moving';
    this.bot.startDir = this.bot.dir;
    this.bot.targetDir = dir;
    this.bot.turnType = type;
    this.bot.startX = this.bot.x;
    this.bot.startY = this.bot.y;
    // Move into the new direction
    this.bot.targetX = this.bot.x + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
    this.bot.targetY = this.bot.y + (dir === 2 ? 1 : dir === 0 ? -1 : 0);
    this.bot.progress = 0;
  }

  startTurn(dir, type) {
    // This might still be used if we are stuck?
    // But logic above covers all cases (Right, Front, Left, Back).
    // So this is likely unused for the main bot now, but kept for safety.
    this.bot.state = 'turning';
    this.bot.startDir = this.bot.dir;
    this.bot.targetDir = dir;
    this.bot.turnType = type; // 'right', 'left', 'back'
    this.bot.justTurned = true;
  }

  updateCamera() {
    // Interpolate camera position for smoothness
    // We want to follow the bot.
    // If bot is moving, we are between cells.

    let camX = this.bot.x;
    let camY = this.bot.y;
    let camAngle = this.getAngle(this.bot.dir);

    if (this.bot.state === 'moving') {
      const t = this.bot.progress;
      camX = this.bot.x + (this.bot.targetX - this.bot.x) * t;
      camY = this.bot.y + (this.bot.targetY - this.bot.y) * t;
    } else if (this.bot.state === 'turning') {
      const t = this.bot.progress; // 0 to 1
      let startAngle = this.getAngle(this.bot.startDir);

      // Calculate delta based on turn type
      let delta = 0;
      if (this.bot.turnType === 'right') delta = -Math.PI / 2;
      else if (this.bot.turnType === 'left') delta = Math.PI / 2;
      else if (this.bot.turnType === 'back') {
        // For a pure 'turning' state (not moving), 180-degree turn direction
        if (this.rule === 'right') {
          // Body Right
          delta = !this.isInverted ? -Math.PI : Math.PI;
        } else {
          // Body Left
          delta = !this.isInverted ? Math.PI : -Math.PI;
        }
      }

      camAngle = startAngle + delta * t;
    } else if (this.bot.state === 'turning_moving') {
      const t = this.bot.progress;
      camX = this.bot.startX + (this.bot.targetX - this.bot.startX) * t;
      camY = this.bot.startY + (this.bot.targetY - this.bot.startY) * t;

      // Interpolate Angle
      const startAngle = this.getAngle(this.bot.startDir);
      let targetAngle = this.getAngle(this.bot.targetDir);

      // Handle wrapping (e.g. 0 -> 270 or 270 -> 0)
      if (this.bot.turnType === 'back') {
        // For 180-degree turns while moving, force the rotation direction
        // based on the current rule (Right-Hand or Left-Hand).
        // Rule 'right' -> Turn Body Right.
        // Rule 'left' -> Turn Body Left.

        let turnDelta;
        if (this.rule === 'right') {
          // Body Right
          // If Upright: World Right (-PI)
          // If Inverted: World Left (+PI)
          turnDelta = !this.isInverted ? -Math.PI : Math.PI;
        } else {
          // Body Left
          // If Upright: World Left (+PI)
          // If Inverted: World Right (-PI)
          turnDelta = !this.isInverted ? Math.PI : -Math.PI;
        }

        targetAngle = startAngle + turnDelta;
      } else {
        // Standard shortest path for 90-degree turns
        if (targetAngle - startAngle > Math.PI) targetAngle -= Math.PI * 2;
        if (targetAngle - startAngle < -Math.PI) targetAngle += Math.PI * 2;
      }

      camAngle = startAngle + (targetAngle - startAngle) * t;
    }

    // Pass current roll
    const roll = this.flipState ? (this.flipState.active ? this.renderer.camera.rotation.z : (this.isInverted ? Math.PI : 0)) : 0;

    this.renderer.updateCamera(camX, camY, camAngle, roll);
    this.renderer.updateSprites(this.isInverted);
  }

  updateRat(dt) {
    if (!this.maze.rat) return;

    if (this.rat.state === 'idle') {
      this.decideRatMove();
    } else if (this.rat.state === 'moving') {
      this.rat.progress += dt * this.rat.speed;

      if (this.rat.progress >= 1) {
        this.rat.progress = 0;
        this.rat.x = this.rat.targetX;
        this.rat.y = this.rat.targetY;
        this.rat.state = 'idle';
        this.rat.justTurned = false;
      }
    } else if (this.rat.state === 'turning_moving') {
      this.rat.progress += dt * this.rat.speed;

      if (this.rat.progress >= 1) {
        this.rat.progress = 0;
        this.rat.x = this.rat.targetX;
        this.rat.y = this.rat.targetY;
        this.rat.dir = this.rat.targetDir;
        this.rat.state = 'idle';
        this.rat.justTurned = false;
      }
    } else if (this.rat.state === 'turning') {
      let currentTurnSpeed = this.rat.turnSpeed;
      if (this.rat.turnType === 'back') {
        currentTurnSpeed *= 0.8;
      }
      this.rat.progress += dt * currentTurnSpeed;
      if (this.rat.progress >= 1) {
        this.rat.progress = 0;
        this.rat.dir = this.rat.targetDir;
        this.rat.state = 'idle';
        this.rat.justTurned = true;
      }
    }

    // Update Visuals
    let ratX = this.rat.x;
    let ratY = this.rat.y;
    let ratAngle = this.getAngle(this.rat.dir);

    if (this.rat.state === 'moving') {
      const t = this.rat.progress;
      ratX = this.rat.x + (this.rat.targetX - this.rat.x) * t;
      ratY = this.rat.y + (this.rat.targetY - this.rat.y) * t;
    } else if (this.rat.state === 'turning_moving') {
      const t = this.rat.progress;
      ratX = this.rat.startX + (this.rat.targetX - this.rat.startX) * t;
      ratY = this.rat.startY + (this.rat.targetY - this.rat.startY) * t;
    }
    // Pass inverted state
    this.renderer.updateRatPosition(ratX, ratY, ratAngle, this.isInverted);
  }

  decideRatMove() {
    // Rat Logic: Right-Hand Rule (Wall Follower)
    // Priority: 1. Right, 2. Front, 3. Left, 4. Back

    // If we just turned, try to move forward first to avoid getting stuck in loops
    if (this.rat.justTurned) {
      this.rat.justTurned = false;
      if (this.canMove(this.rat.x, this.rat.y, this.rat.dir)) {
        this.startRatMove(this.rat.dir);
        return;
      }
    }

    const frontDir = this.rat.dir;
    const rightDir = (this.rat.dir + 1) % 4;
    const leftDir = (this.rat.dir + 3) % 4;
    const backDir = (this.rat.dir + 2) % 4;

    if (this.canMove(this.rat.x, this.rat.y, rightDir)) {
      this.startRatTurnMove(rightDir, 'right');
    } else if (this.canMove(this.rat.x, this.rat.y, frontDir)) {
      this.startRatMove(frontDir);
    } else if (this.canMove(this.rat.x, this.rat.y, leftDir)) {
      this.startRatTurnMove(leftDir, 'left');
    } else {
      // Dead end, U-turn
      this.startRatTurn(backDir, 'back');
    }
  }

  startRatMove(dir) {
    this.rat.state = 'moving';
    this.rat.targetDir = dir;
    this.rat.startX = this.rat.x;
    this.rat.startY = this.rat.y;
    this.rat.targetX = this.rat.x + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
    this.rat.targetY = this.rat.y + (dir === 2 ? 1 : dir === 0 ? -1 : 0);
    this.rat.justTurned = false;
  }

  startRatTurnMove(dir, type) {
    this.rat.state = 'turning_moving';
    this.rat.startDir = this.rat.dir;
    this.rat.targetDir = dir;
    this.rat.turnType = type;
    this.rat.startX = this.rat.x;
    this.rat.startY = this.rat.y;
    this.rat.targetX = this.rat.x + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
    this.rat.targetY = this.rat.y + (dir === 2 ? 1 : dir === 0 ? -1 : 0);
    this.rat.progress = 0;
  }

  startRatTurn(dir, type) {
    this.rat.state = 'turning';
    this.rat.startDir = this.rat.dir;
    this.rat.targetDir = dir;
    this.rat.turnType = type;
    this.rat.justTurned = true;
    this.rat.progress = 0;
  }

  getAngle(dir) {
    // 0: N (0), 1: E (-PI/2), 2: S (-PI), 3: W (PI/2)
    // Three.js: -Z is forward.
    // Rotation +Y is CCW.
    // To look East (+X), we need -PI/2 (CW).
    // To look West (-X), we need PI/2 (CCW).

    switch (dir) {
      case 0: return 0;
      case 1: return -Math.PI / 2;
      case 2: return -Math.PI;
      case 3: return Math.PI / 2;
    }
    return 0;
  }
}

new App();
