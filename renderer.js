import * as THREE from 'three';

export class MazeRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; // Ensure vibrant colors
    this.container.appendChild(this.renderer.domElement);

    this.wallGroup = new THREE.Group();
    this.scene.add(this.wallGroup);

    this.textureLoader = new THREE.TextureLoader();
    this.textures = {};

    this.cellSize = 2.86; // Increased by 10% (2.6 -> 2.86)
    this.wallHeight = 2;

    this.setupLights();
    this.handleResize();
    this.setupLights();
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());

    this.stoneMeshes = [];
  }

  async loadTextures() {
    const isAgy = window.location.search.includes('agy');

    const textureUrls = isAgy ? {
      floor: 'assets/floor.png',
      ceiling: 'assets/ceiling.png',
      wall: 'assets/wall.png',
      start: 'assets/agy.png',
      smiley: 'assets/gemini.png',
      opengl: 'assets/google.png',
      rat: 'assets/spider.png',
      openglwall: 'assets/googlewall.png'
    } : {
      floor: 'assets/floor.png',
      ceiling: 'assets/ceiling.png',
      wall: 'assets/wall.png',
      start: 'assets/start.png',
      smiley: 'assets/smiley.png',
      opengl: 'assets/opengl.png',
      rat: 'assets/rat.png',
      openglwall: 'assets/openglwall.png'
    };

    const loader = new THREE.TextureLoader();
    const promises = Object.entries(textureUrls).map(([key, url]) => {
      return new Promise((resolve) => {
        loader.load(url, (texture) => {
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          // Restore wrapping for repeating textures (floor, ceiling, walls)
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = THREE.SRGBColorSpace; // Ensure texture is treated as sRGB
          this.textures[key] = texture;
          resolve();
        });
      });
    });

    await Promise.all(promises);
  }

  createMazeGeometry(maze) {
    this.clearMaze();

    this.mazeGroup = new THREE.Group();
    this.scene.add(this.mazeGroup);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(maze.width * this.cellSize, maze.height * this.cellSize);
    this.textures.floor.repeat.set(maze.width, maze.height);
    const floorMat = new THREE.MeshBasicMaterial({ map: this.textures.floor });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((maze.width * this.cellSize) / 2 - this.cellSize / 2, 0, (maze.height * this.cellSize) / 2 - this.cellSize / 2);
    this.mazeGroup.add(floor);

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(maze.width * this.cellSize, maze.height * this.cellSize);
    this.textures.ceiling.repeat.set(maze.width * 3, maze.height * 3); // Increase repeat to fix stretching
    const ceilMat = new THREE.MeshBasicMaterial({ map: this.textures.ceiling });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((maze.width * this.cellSize) / 2 - this.cellSize / 2, this.wallHeight, (maze.height * this.cellSize) / 2 - this.cellSize / 2);
    this.mazeGroup.add(ceiling);

    // Walls
    this.wallGroup = new THREE.Group();
    this.mazeGroup.add(this.wallGroup);

    const wallGeo = new THREE.BoxGeometry(this.cellSize, this.wallHeight, 0.1);
    const wallMat = new THREE.MeshBasicMaterial({ map: this.textures.wall });
    const specialWallMat = new THREE.MeshBasicMaterial({
      map: this.textures.openglwall,
      side: THREE.DoubleSide // Keep double side just in case, but opaque
    });

    const allWalls = [];

    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const cell = maze.grid[y][x];
        const cx = x * this.cellSize;
        const cz = y * this.cellSize;

        if (cell.walls.top) {
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.position.set(cx, this.wallHeight / 2, cz - this.cellSize / 2);
          this.wallGroup.add(wall);
          allWalls.push(wall);
        }
        if (cell.walls.bottom) {
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.position.set(cx, this.wallHeight / 2, cz + this.cellSize / 2);
          this.wallGroup.add(wall);
          allWalls.push(wall);
        }
        if (cell.walls.left) {
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.rotation.y = Math.PI / 2;
          wall.position.set(cx - this.cellSize / 2, this.wallHeight / 2, cz);
          this.wallGroup.add(wall);
          allWalls.push(wall);
        }
        if (cell.walls.right) {
          const wall = new THREE.Mesh(wallGeo, wallMat);
          wall.rotation.y = Math.PI / 2;
          wall.position.set(cx + this.cellSize / 2, this.wallHeight / 2, cz);
          this.wallGroup.add(wall);
          allWalls.push(wall);
        }
      }
    }

    // Randomly assign special texture to one wall
    if (allWalls.length > 0) {
      const randomIndex = Math.floor(Math.random() * allWalls.length);
      allWalls[randomIndex].material = specialWallMat;
    }

    // Start Entity
    const startMat = new THREE.SpriteMaterial({ map: this.textures.start, transparent: true, opacity: 0.5 });
    this.startSprite = new THREE.Sprite(startMat);
    this.startSprite.position.set(maze.start.x * this.cellSize, this.wallHeight / 2, maze.start.y * this.cellSize);
    this.startSprite.scale.set(1.1, 0.65, 1); // Stretched 10% width, Reduced 35% height
    this.wallGroup.add(this.startSprite);

    // Smiley Entity
    const smileyMat = new THREE.SpriteMaterial({ map: this.textures.smiley, transparent: true, opacity: 0.5 });
    this.smileySprite = new THREE.Sprite(smileyMat);
    this.smileySprite.position.set(maze.end.x * this.cellSize, this.wallHeight / 2, maze.end.y * this.cellSize);
    this.smileySprite.scale.set(0.9, 0.9, 1); // Reduced by 10%
    this.wallGroup.add(this.smileySprite);

    // OpenGL Entity
    if (maze.opengl) {
      const openglMat = new THREE.SpriteMaterial({ map: this.textures.opengl, transparent: true, opacity: 0.5 });
      this.openglSprite = new THREE.Sprite(openglMat);
      this.openglSprite.position.set(maze.opengl.x * this.cellSize, this.wallHeight / 2, maze.opengl.y * this.cellSize);
      this.openglSprite.scale.set(1, 0.52, 1); // Reduced height by another 20% (0.65 -> 0.52)
      this.wallGroup.add(this.openglSprite);
    }

    // Rat Entity
    if (maze.rat) {
      const ratMat = new THREE.SpriteMaterial({ map: this.textures.rat, transparent: true });
      this.ratSprite = new THREE.Sprite(ratMat);
      // Initial position will be updated by main loop, but set defaults here
      // Y position: Floor is 0. WallHeight is 2.
      // We want it on the floor. Sprite origin is center.
      // Let's assume rat is small, say 0.5 height. Center at 0.25.
      this.ratSprite.scale.set(0.8, 0.6, 1); // Compressed vertically
      this.ratSprite.position.set(maze.rat.x * this.cellSize, 0.42, maze.rat.y * this.cellSize);
      this.mazeGroup.add(this.ratSprite);
    }

    // Stones
    this.createStones(maze.stones);

    // Initial Wall State for Animation
    this.wallGroup.scale.y = 0.01;
    // Sprites in wallGroup will inherit scale
  }

  clearMaze() {
    if (this.mazeGroup) {
      this.scene.remove(this.mazeGroup);
      // Optional: Dispose geometries/materials if needed for memory,
      // but for this simple app letting GC handle it is likely fine or we can be more aggressive.
      this.mazeGroup = null;
      this.wallGroup = null;
    }
  }

  animateWalls(deltaTime, targetScale = 1) {
    if (!this.wallGroup) return;

    const speed = 0.5;
    let currentScale = this.wallGroup.scale.y;

    if (currentScale < targetScale) {
      currentScale += deltaTime * speed;
      if (currentScale > targetScale) currentScale = targetScale;
    } else if (currentScale > targetScale) {
      currentScale -= deltaTime * speed;
      if (currentScale < targetScale) currentScale = targetScale;
    }

    this.wallGroup.scale.y = currentScale;
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Reduced ambient slightly
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    this.scene.add(dirLight);
  }

  handleResize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(x, z, angle, roll = 0) {
    // x, z are in grid coordinates. Convert to world.
    this.camera.position.set(x * this.cellSize, this.wallHeight / 2, z * this.cellSize);
    this.camera.rotation.y = angle;
    this.camera.rotation.z = roll;
  }

  createStones(stones) {
    this.stoneMeshes = [];
    if (!stones) return;

    const isAgy = window.location.search.includes('agy');
    const googleColors = [
      0x4285F4, // Blue
      0xEA4335, // Red
      0xFBBC05, // Yellow
      0x34A853  // Green
    ];

    const defaultColor = new THREE.Color('rgb(139,138,138)');

    stones.forEach(stone => {
      let geometry;
      // Size: Increased by 15% from 0.48 -> 0.552
      const size = 0.552;

      if (stone.type === 'pyramid') {
        geometry = new THREE.TetrahedronGeometry(size);
      } else if (stone.type === 'dodecahedron') {
        geometry = new THREE.DodecahedronGeometry(size);
      } else if (stone.type === 'icosahedron') {
        geometry = new THREE.IcosahedronGeometry(size);
      }

      let material;
      if (isAgy) {
        const randomColor = googleColors[Math.floor(Math.random() * googleColors.length)];
        material = new THREE.MeshStandardMaterial({
          color: randomColor,
          flatShading: true,
          roughness: 0.5,
          metalness: 0.1
        });
      } else {
        material = new THREE.MeshStandardMaterial({
          color: defaultColor,
          flatShading: true,
          roughness: 0.5,
          metalness: 0.1
        });
      }

      const mesh = new THREE.Mesh(geometry, material);
      // Position: On floor. Center at 0.3 (slightly above half size to be safe)
      // User requested elevation to avoid floor clipping. Size is 0.552. Radius ~0.276.
      // Center at 0.7 is safe.
      mesh.position.set(stone.x * this.cellSize, 0.7, stone.y * this.cellSize);

      this.mazeGroup.add(mesh);
      this.stoneMeshes.push(mesh);
    });
  }

  updateStones(dt, stones) {
    // Rotate stones - Faster now
    this.stoneMeshes.forEach((mesh, i) => {
      mesh.rotation.x += dt * 1.5; // Tripled speed (0.5 -> 1.5)
      mesh.rotation.y += dt * 1.0; // Tripled speed (0.3 -> 1.0)

      // Update position if logic changed it (relocation)
      if (stones && stones[i]) {
        mesh.position.x = stones[i].x * this.cellSize;
        mesh.position.z = stones[i].y * this.cellSize;
      }
    });
  }

  updateSprites(inverted) {
    const rotation = inverted ? Math.PI : 0;

    if (this.startSprite) this.startSprite.material.rotation = rotation;
    if (this.smileySprite) this.smileySprite.material.rotation = rotation;
    if (this.openglSprite) this.openglSprite.material.rotation = rotation;
  }

  updateRatPosition(x, y, dir, inverted) {
    if (!this.ratSprite) return;

    this.ratSprite.position.x = x * this.cellSize;
    this.ratSprite.position.z = y * this.cellSize;

    // Rotate sprite if inverted
    if (inverted) {
      this.ratSprite.material.rotation = Math.PI;
    } else {
      this.ratSprite.material.rotation = 0;
    }
  }

  toggleGameElementsVisibility(visible) {
    if (this.stoneMeshes) {
      this.stoneMeshes.forEach(mesh => {
        mesh.visible = visible;
      });
    }
    // Rat visibility toggling removed to keep it visible
  }
}
