'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'game3d.js'), 'utf8');
assert.match(source, /function makeShape\(points\)[\s\S]*?return shape;/);
assert.match(source, /const coast = makeShape\(outline\);/);
assert.match(source, /new THREE\.ExtrudeGeometry\(coast,/);
assert.match(source, /new THREE\.ShapeGeometry\(makeShape\(points\), 1\)/);

const shape = new THREE.Shape();
shape.moveTo(0, 0);
shape.lineTo(100, 0);
shape.lineTo(100, 80);
shape.lineTo(0, 80);
shape.closePath();
assert.strictEqual(typeof shape.extractPoints, 'function');
const extruded = new THREE.ExtrudeGeometry(shape, {
  depth: 18, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 9, bevelThickness: 3,
});
assert.ok(extruded.getAttribute('position').count > 0, 'a forma deve produzir vértices 3D');
extruded.dispose();

const flatGeometry = new THREE.ShapeGeometry(shape, 1);
assert.throws(() => new THREE.ExtrudeGeometry(flatGeometry, { depth: 18 }), /extractPoints/);
flatGeometry.dispose();
console.log('ok   - a ilha fornece THREE.Shape ao ExtrudeGeometry e gera geometria 3D');
