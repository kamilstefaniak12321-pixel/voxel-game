import { getFruitItemModel } from './FruitBushGeometry.js';
import { CAMPFIRE_LOGS } from './CampfireGeometry.js';
import { fuelWood } from '../game/CampfireState.js';
import { SURFACE_PROFILES } from './SurfaceProfiles.js';

import { RAFT_MODEL } from './RaftModel.js';

const cache = new Map();
export function getItemModel(type) {
    if (type === 'raft') return RAFT_MODEL;
    const wood = fuelWood(type);
    if (!wood && type !== 'fire_starter') return getFruitItemModel(type);
    if (cache.has(type)) return cache.get(type);
    const texture = `campfire_${wood ?? 'oak'}`;
    let faces = CAMPFIRE_LOGS[0].faces.map(face => ({ ...face, texture, surfaceProfile: SURFACE_PROFILES.wood }));
    if (!wood) {
        // A horizontal hearth stick and a vertical rubbing spindle.
        faces = [0, 1].flatMap(axis => faces.map(face => ({ ...face,
            vertices: face.vertices.map(([x,y,z]) => axis === 0 ? [x*.35,y*.35-.25,z*.7] : [x*.35,z*.7,y*.35]),
            normal: axis === 0 ? face.normal : [face.normal[0], face.normal[2], face.normal[1]]
        })));
        // Swapping y/z reverses winding.
        faces = faces.map((face, i) => i < 6 ? face : ({ ...face,
            vertices: [face.vertices[0], face.vertices[2], face.vertices[1], face.vertices[3]],
            uv: [face.uv[0], face.uv[2], face.uv[1], face.uv[3]] }));
    }
    const model = { faces, texture };
    cache.set(type, model);
    return model;
}
