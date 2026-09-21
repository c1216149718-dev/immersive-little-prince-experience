"""Editable one-second walk: contact, down, passing, up, opposite contact.

All limb motion is baked here; the browser only mixes and retimes the clip.
Foot targets use centimetres in the final 0.72-unit character, not source units.
"""
import numpy as np


def curve(phase, keys):
    """Periodic Hermite interpolation of explicitly authored key poses."""
    keys = np.asarray(keys, float)
    n = len(keys)
    u = (phase % 1) * n
    i = np.floor(u).astype(int)
    t = u - i
    a, b = keys[i % n], keys[(i + 1) % n]
    ma = (keys[(i + 1) % n] - keys[(i - 1) % n]) * .5
    mb = (keys[(i + 2) % n] - keys[i % n]) * .5
    return (2*t**3-3*t**2+1)*a + (t**3-2*t**2+t)*ma + (-2*t**3+3*t**2)*b + (t**3-t**2)*mb


def quaternion(x, y=0., z=0.):
    # XYZ order, matching Three Euler; arrays broadcast to the number of frames.
    x, y, z = np.broadcast_arrays(x, y, z)
    cx, cy, cz = np.cos(x/2), np.cos(y/2), np.cos(z/2)
    sx, sy, sz = np.sin(x/2), np.sin(y/2), np.sin(z/2)
    return np.stack((sx*cy*cz+cx*sy*sz, cx*sy*cz-sx*cy*sz, cx*cy*sz+sx*sy*cz, cx*cy*cz-sx*sy*sz), axis=-1)


def author_walk(times, bones, positions):
    phase = times / times[-1]
    rotations = {}
    hips = np.tile(positions[bones.index('Hips')], (len(times), 1))
    # Two small weight drops per cycle. The root itself never translates in X/Z.
    hips[:, 1] += curve(phase, [-.026, -.038, -.031, -.020, -.026, -.038, -.031, -.020])
    roll = curve(phase, [0., -.026, -.037, -.022, 0., .026, .037, .022])
    yaw = curve(phase, [-.045, -.031, 0., .031, .045, .031, 0., -.031])
    rotations['Hips'] = quaternion(np.zeros(len(times)), yaw, roll)
    rotations['Spine'] = quaternion(curve(phase, [.025,.038,.025,.015,.025,.038,.025,.015]), -yaw*.7, -roll*.55)
    rotations['Neck'] = quaternion(np.zeros(len(times)), -yaw*.2, -roll*.25)
    rotations['Head'] = quaternion(curve(phase, [-.012,-.018,-.012,-.006,-.012,-.018,-.012,-.006]), -yaw*.1, -roll*.2)
    for side, offset in [('L',0.),('R',.5)]:
        u = (phase + offset) % 1
        # Linear stance: this foot travels backwards at exactly 0.36 units/sec.
        # Swing uses a smooth end-to-end arc with a distinct passing pose.
        swing = np.clip((u-.5)*2, 0, 1)
        target = np.where(u < .5, .09-.36*u, -.09+.18*(3*swing**2-2*swing**3))
        lift = .048 * (16*swing**2*(1-swing)**2)
        foot = positions[bones.index('Foot'+side)]
        knee = positions[bones.index('Shin'+side)]
        thigh = positions[bones.index('Thigh'+side)]
        upper = thigh[1]-knee[1]
        lower = np.linalg.norm(foot-knee)
        rest_angle = np.arctan2(-(foot[2]-knee[2]), knee[1]-foot[1])
        forward = -foot[2]+target
        down = hips[:,1]-foot[1]-lift
        bend = -np.arccos(np.clip((forward**2+down**2-upper**2-lower**2)/(2*upper*lower), -.999, .999))
        hip = np.arctan2(forward,down)-np.arctan2(lower*np.sin(bend),upper+lower*np.cos(bend))
        shin = bend-rest_angle
        rotations['Thigh'+side] = quaternion(hip)
        rotations['Shin'+side] = quaternion(shin)
        rotations['Foot'+side] = quaternion(-(hip+shin))
        rotations['Coat'+side] = quaternion(hip*.42, np.zeros(len(times)), np.full(len(times), -.025 if side=='L' else .025))
        # Opposing arm swing with elbow flexion through the passing pose.
        arm = curve(u, [-.28,-.21,0.,.20,.28,.20,0.,-.20])
        elbow = curve(u, [.12,.15,.22,.26,.20,.15,.10,.09])
        rotations['Shoulder'+side] = quaternion(arm, 0., np.full(len(times), .025 if side=='L' else -.025))
        rotations['Elbow'+side] = quaternion(elbow)
        rotations['Hand'+side] = quaternion(-elbow*.2)
    # Exact endpoint equality removes any floating-point wrap discontinuity.
    hips[-1] = hips[0]
    for q in rotations.values(): q[-1] = q[0]
    return hips, rotations


def settle_contact(hips, rotations, bones, positions, parents, points, joints, weights):
    """Bake sole clearance into the clip, preserving stance-driven hip motion."""
    candidates = np.flatnonzero(points[:,1] < .004)
    candidates = candidates[::max(1, len(candidates)//128)]
    p = points[candidates]
    j = joints[candidates]
    w = weights[candidates]
    for frame in range(len(hips)):
        matrices = []
        for i, name in enumerate(bones):
            x,y,z,qw = rotations[name][frame] if name in rotations else (0.,0.,0.,1.)
            m = np.eye(4)
            m[:3,:3] = [[1-2*(y*y+z*z),2*(x*y-z*qw),2*(x*z+y*qw)],
                          [2*(x*y+z*qw),1-2*(x*x+z*z),2*(y*z-x*qw)],
                          [2*(x*z-y*qw),2*(y*z+x*qw),1-2*(x*x+y*y)]]
            parent = bones.index(parents[i]) if parents[i] else None
            m[:3,3] = positions[i] - (positions[parent] if parent is not None else 0)
            if name == 'Hips': m[:3,3] = hips[frame]
            matrices.append(m if parent is None else matrices[parent] @ m)
        posed = np.zeros_like(p)
        for k in range(4):
            for joint in np.unique(j[:,k]):
                selected = j[:,k] == joint
                m = matrices[joint]
                posed[selected] += ((p[selected]-positions[joint]) @ m[:3,:3].T + m[:3,3]) * w[selected,k,None]
        hips[frame,1] -= posed[:,1].min()
    hips[-1] = hips[0]
