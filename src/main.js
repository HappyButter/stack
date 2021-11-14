import * as THREE from "three";
import * as CANNON from "cannon";

// constants
const DIRECTIONS = {
	X: "x",
	Z: "z",
};

// html elements
const scoreBoard = document.getElementById("score");
const startScreen = document.getElementById("start-screen");
const endScreen = document.getElementById("end-screen");
const resultScore = document.getElementById("result-score");

// globals
let isGameRunning = false;
let camera, scene, renderer;
let world;
let stack = [];
let overhangs = [];
let score = 0;
let hue;
let speed = 0.15;

const originalBoxSize = 3;
const boxHeight = 1;

// init game
window.focus();
init();

function init() {
	// init cannon js
	world = new CANNON.World();
	world.gravity.set(0, -10, 0);
	world.broadphase = new CANNON.NaiveBroadphase();
	world.solver.iterations = 40;

	// init three js
	scene = new THREE.Scene();

	// add first 2 layers
	addLayer(0, 0, originalBoxSize, originalBoxSize);
	addLayer(-10, 0, originalBoxSize, originalBoxSize, DIRECTIONS.X);

	// set up lights
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
	scene.add(ambientLight);

	const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
	dirLight.position.set(10, 20, 0);
	scene.add(dirLight);

	// initialize three js
	const aspect = window.innerWidth / window.innerHeight;
	const width = 10;
	const height = width / aspect;

	camera = new THREE.OrthographicCamera(
		width / -2, // left
		width / 2, // right
		height / 2, // top
		height / -2, // bottom
		0, // near
		1000 // far
	);

	camera.position.set(4, 4, 4);
	camera.lookAt(0, 0, 0);

	// set up renderer
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	document.body.appendChild(renderer.domElement);
}

function startGame() {
	isGameRunning = true;
	score = 0;
	stack = [];
	overhangs = [];
	hue = Math.floor(Math.random() * 360);
	speed = 0.15;

	if (scoreBoard) scoreBoard.innerText = `${score}`;

	// remove objects cannon js
	if (world) {
		while (world.bodies.length > 0) {
			world.remove(world.bodies[0]);
		}
	}

	// clear scene
	if (scene) {
		while (scene.children.find((c) => c.type == "Mesh")) {
			const mesh = scene.children.find((c) => c.type == "Mesh");
			scene.remove(mesh);
		}

		// add first 2 layers
		addLayer(0, 0, originalBoxSize, originalBoxSize);
		addLayer(-10, 0, originalBoxSize, originalBoxSize, DIRECTIONS.X);
	}

	// reset camera
	if (camera) {
		camera.position.set(4, 4, 4);
		camera.lookAt(0, 0, 0);
	}

	renderer.setAnimationLoop(animation);
	isGameRunning = true;
	displayResult();
}

function addLayer(x, z, width, depth, direction) {
	const y = boxHeight * stack.length;
	const layer = generateBox(x, y, z, width, depth);
	layer.direction = direction;

	stack.push(layer);
}

function addOverhang(x, z, width, depth) {
	const y = boxHeight * (stack.length - 1);
	const overhangBox = generateBox(x, y, z, width, depth, true);

	overhangs.push(overhangBox);
}

function generateBox(x, y, z, width, depth, isOverhang = false) {
	// three js
	const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
	const color = new THREE.Color(`hsl(${hue + stack.length * 4}, 100%, 50%)`);
	const material = new THREE.MeshLambertMaterial({ color });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.set(x, y, z);

	scene.add(mesh);

	// cannon js
	const shape = new CANNON.Box(new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2));
	let mass = isOverhang ? 5 : 0;

	mass *= width / originalBoxSize; // reduce mass proportionately by size
	mass *= depth / originalBoxSize; // reduce mass proportionately by size

	const body = new CANNON.Body({ mass, shape });
	body.position.set(x, y, z);
	world.addBody(body);

	return {
		threejs: mesh,
		cannonjs: body,
		width,
		depth,
	};
}

function eventHandler() {
	if (!isGameRunning) {
		startGame();
		return;
	}

	const topLayer = stack[stack.length - 1];
	const previousLayer = stack[stack.length - 2];
	const direction = topLayer.direction;
	const delta = topLayer.threejs.position[direction] - previousLayer.threejs.position[direction];

	const overhangSize = Math.abs(delta);
	const size = direction === DIRECTIONS.X ? topLayer.width : topLayer.depth;
	const overlap = size - overhangSize;

	// missed click
	if (overlap <= 0) {
		handleMissclick();
		return;
	}

	// correct move handle
	cutTheBox(topLayer, overlap, size, delta);
	createOverhangItem(topLayer, overlap, overhangSize, delta);

	// add new layer
	const nextX = direction === DIRECTIONS.X ? topLayer.threejs.position.x : -10;
	const nextZ = direction === DIRECTIONS.Z ? topLayer.threejs.position.z : -10;
	const nextDirection = direction === DIRECTIONS.X ? DIRECTIONS.Z : DIRECTIONS.X;

	const newWidth = topLayer.width;
	const newDepth = topLayer.depth;

	increaseScore();
	increaseSpeed(stack.length - 1);
	addLayer(nextX, nextZ, newWidth, newDepth, nextDirection);
}

function animation() {
	const topLayer = stack[stack.length - 1];
	topLayer.threejs.position[topLayer.direction] += speed;
	topLayer.cannonjs.position[topLayer.direction] += speed;

	if (camera.position.y < boxHeight * (stack.length - 2) + 4) {
		camera.position.y += speed;
	}

	updatePhysics();
	renderer.render(scene, camera);
}

function createOverhangItem(topLayer, overlap, overhangSize, delta) {
	const direction = topLayer.direction;

	const overShift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
	const overhangX =
		direction === DIRECTIONS.X
			? topLayer.threejs.position.x + overShift
			: topLayer.threejs.position.x;

	const overhangZ =
		direction === DIRECTIONS.Z
			? topLayer.threejs.position.z + overShift
			: topLayer.threejs.position.z;

	const overhangWidth = direction == DIRECTIONS.X ? overhangSize : topLayer.width;
	const overhangDepth = direction == DIRECTIONS.Z ? overhangSize : topLayer.depth;

	addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);
}

function cutTheBox(topLayer, overlap, size, delta) {
	const direction = topLayer.direction;

	const newWidth = direction === DIRECTIONS.X ? overlap : topLayer.width;
	const newDepth = direction === DIRECTIONS.Z ? overlap : topLayer.depth;

	// three js
	topLayer.width = newWidth;
	topLayer.depth = newDepth;

	topLayer.threejs.scale[direction] = overlap / size;
	topLayer.threejs.position[direction] -= delta / 2;

	// cannon js
	topLayer.cannonjs.position[direction] -= delta / 2;

	const shape = new CANNON.Box(new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2));
	topLayer.cannonjs.shapes = [];
	topLayer.cannonjs.addShape(shape);
}

function updatePhysics() {
	world.step(1 / 60);

	overhangs.forEach((element) => {
		element.threejs.position.copy(element.cannonjs.position);
		element.threejs.quaternion.copy(element.cannonjs.quaternion); // orientation
	});
}

function handleMissclick() {
	const topLayer = stack[stack.length - 1];

	// let last layer fall down
	addOverhang(
		topLayer.threejs.position.x,
		topLayer.threejs.position.z,
		topLayer.width,
		topLayer.depth
	);

	world.remove(topLayer.cannonjs);
	scene.remove(topLayer.threejs);

	// end screen
	isGameRunning = false;
	endScreen?.classList.remove("hidden");
	if (resultScore) resultScore.innerText = `${score}`;
}

function displayResult() {
	if (startScreen && startScreen.classList.length === 0) startScreen?.classList.add("hidden");
	if (endScreen) endScreen.classList.add("hidden");
}

function increaseScore() {
	score++;
	if (scoreBoard) scoreBoard.innerText = `${score}`;
}

function increaseSpeed(currentHeight) {
	if (currentHeight % 5) speed += 0.015;
}

// handlers
window.addEventListener("click", eventHandler);
window.addEventListener("keydown", (event) => {
	if (event.key == " ") {
		event.preventDefault();
		eventHandler();
		return;
	}
});
