import { SURFACE_PROFILES } from './SurfaceProfiles.js';

export const RAFT_THICKNESS = 3 / 16;
// Two 1x1 plank panels, total 1x2 blocks. Shared by world, hand and icon.
// Only the outside faces remain; each panel keeps the block's texel density.
const faces = [];
for (const z of [-.5, .5]) {
    const x0 = -.5, x1 = .5, y0 = -RAFT_THICKNESS, y1 = 0, z0 = z-.5, z1 = z+.5;
    for (const [normal, vertices] of [
        [[1,0,0], [[x1,y1,z0],[x1,y0,z0],[x1,y1,z1],[x1,y0,z1]]],
        [[-1,0,0], [[x0,y0,z1],[x0,y0,z0],[x0,y1,z1],[x0,y1,z0]]],
        [[0,1,0], [[x0,y1,z1],[x0,y1,z0],[x1,y1,z1],[x1,y1,z0]]],
        [[0,-1,0], [[x1,y0,z0],[x0,y0,z0],[x1,y0,z1],[x0,y0,z1]]],
        [[0,0,1], [[x1,y0,z1],[x0,y0,z1],[x1,y1,z1],[x0,y1,z1]]],
        [[0,0,-1], [[x0,y1,z0],[x0,y0,z0],[x1,y1,z0],[x1,y0,z0]]]
    ]) {
        if (normal[2] === 1 && z < 0 || normal[2] === -1 && z > 0) continue;
        const uv = vertices.map(([x,y,vz]) => normal[1] ? [x+.5, vz-z+.5]
            : normal[0] ? [vz-z+.5, -y] : [x+.5, -y]);
        faces.push({ normal, vertices, uv: uv.map(([u,v]) => [.001+u*.998,.001+v*.998]),
            color: [255,255,255], texture: 'oak_planks', surfaceProfile: SURFACE_PROFILES.wood });
    }
}
export const RAFT_MODEL = Object.freeze({ faces, texture: 'oak_planks' });
