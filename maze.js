export class Maze {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.grid = [];
        this.stack = [];
        this.start = { x: 0, y: 0 };
        this.start = { x: 0, y: 0 };
        this.end = { x: width - 1, y: height - 1 };
        this.stones = [];

        this.initGrid();
        this.generate();
    }

    initGrid() {
        for (let y = 0; y < this.height; y++) {
            let row = [];
            for (let x = 0; x < this.width; x++) {
                row.push({
                    x: x,
                    y: y,
                    visited: false,
                    walls: { top: true, right: true, bottom: true, left: true }
                });
            }
            this.grid.push(row);
        }
    }

    generate() {
        let current = this.grid[0][0];
        current.visited = true;
        this.stack.push(current);

        while (this.stack.length > 0) {
            current = this.stack[this.stack.length - 1]; // Peek
            let next = this.checkNeighbors(current);

            if (next) {
                next.visited = true;
                this.stack.push(next);
                this.removeWalls(current, next);
            } else {
                this.stack.pop();
            }
        }

        // Randomize Start and End points slightly, but keep them far apart ideally.
        // For now, fixed start (0,0) and end (w-1, h-1) is fine, or we can randomize.
        // The user said "aleatoriamente sean ubicados" (randomly located).
        this.pickRandomStartEnd();
        this.pickRandomOpenGL();
    }

    pickRandomOpenGL() {
        this.opengl = {
            x: Math.floor(Math.random() * this.width),
            y: Math.floor(Math.random() * this.height)
        };

        // Ensure it's not start or end
        while ((this.opengl.x === this.start.x && this.opengl.y === this.start.y) ||
            (this.opengl.x === this.end.x && this.opengl.y === this.end.y)) {
            this.opengl = {
                x: Math.floor(Math.random() * this.width),
                y: Math.floor(Math.random() * this.height)
            };
        }
    }

    pickRandomStartEnd() {
        // Simple random placement
        this.start = {
            x: Math.floor(Math.random() * this.width),
            y: Math.floor(Math.random() * this.height)
        };

        do {
            this.end = {
                x: Math.floor(Math.random() * this.width),
                y: Math.floor(Math.random() * this.height)
            };
        } while (this.dist(this.start, this.end) < (this.width + this.height) / 3); // Ensure some distance
    }

    placeStonesRandomly() {
        this.stones = [];
        const types = ['pyramid', 'dodecahedron', 'icosahedron'];

        // 3 stones total (1 of each type)
        for (let i = 0; i < 3; i++) {
            let sx, sy;
            let valid = false;
            while (!valid) {
                sx = Math.floor(Math.random() * this.width);
                sy = Math.floor(Math.random() * this.height);

                // Check collision with start, end, rat (if set), and other stones
                valid = true;
                if (sx === this.start.x && sy === this.start.y) valid = false;
                if (sx === this.end.x && sy === this.end.y) valid = false;
                if (this.rat && sx === this.rat.x && sy === this.rat.y) valid = false;
                for (const s of this.stones) {
                    if (s.x === sx && s.y === sy) valid = false;
                    // Ensure minimum distance of 3 units between stones
                    const dist = Math.sqrt(Math.pow(sx - s.x, 2) + Math.pow(sy - s.y, 2));
                    if (dist < 3) valid = false;
                }
            }
            // i maps directly to types: 0->pyramid, 1->dodecahedron, 2->icosahedron
            this.stones.push({ x: sx, y: sy, type: types[i] });
        }
    }

    relocateStone(index) {
        if (index < 0 || index >= this.stones.length) return;

        let sx, sy;
        let valid = false;
        while (!valid) {
            sx = Math.floor(Math.random() * this.width);
            sy = Math.floor(Math.random() * this.height);

            valid = true;
            if (sx === this.start.x && sy === this.start.y) valid = false;
            if (sx === this.end.x && sy === this.end.y) valid = false;
            if (this.rat && sx === this.rat.x && sy === this.rat.y) valid = false;
            for (let i = 0; i < this.stones.length; i++) {
                if (i !== index && this.stones[i].x === sx && this.stones[i].y === sy) valid = false;
            }
            // Also check if it's the SAME spot (we want it to move)
            if (sx === this.stones[index].x && sy === this.stones[index].y) valid = false;
        }
        this.stones[index].x = sx;
        this.stones[index].y = sy;
    }

    dist(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }

    checkNeighbors(cell) {
        let neighbors = [];
        let x = cell.x;
        let y = cell.y;

        let top = y > 0 ? this.grid[y - 1][x] : undefined;
        let right = x < this.width - 1 ? this.grid[y][x + 1] : undefined;
        let bottom = y < this.height - 1 ? this.grid[y + 1][x] : undefined;
        let left = x > 0 ? this.grid[y][x - 1] : undefined;

        if (top && !top.visited) neighbors.push(top);
        if (right && !right.visited) neighbors.push(right);
        if (bottom && !bottom.visited) neighbors.push(bottom);
        if (left && !left.visited) neighbors.push(left);

        if (neighbors.length > 0) {
            let r = Math.floor(Math.random() * neighbors.length);
            return neighbors[r];
        } else {
            return undefined;
        }
    }

    removeWalls(a, b) {
        let x = a.x - b.x;
        if (x === 1) {
            a.walls.left = false;
            b.walls.right = false;
        } else if (x === -1) {
            a.walls.right = false;
            b.walls.left = false;
        }

        let y = a.y - b.y;
        if (y === 1) {
            a.walls.top = false;
            b.walls.bottom = false;
        } else if (y === -1) {
            a.walls.bottom = false;
            b.walls.top = false;
        }
    }
}
