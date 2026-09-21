"""Resize the fused B612 rose while retaining the connected ground and UVs."""
import numpy as np


def fit_rose(position, scale=.8):
    # Measured in the source's baked Y-up frame, before the planet sphere fit.
    base = np.array([-.218, .793, .170])
    area = ((position[:, 0] > -.285) & (position[:, 0] < -.145)
            & (position[:, 2] > .095) & (position[:, 2] < .235))
    blend = np.clip((position[:, 1] - base[1]) / .025, 0, 1)
    blend = blend * blend * (3 - 2 * blend) * area
    position += (base + (position - base) * scale - position) * blend[:, None]
    return {'scale': scale, 'base': base.tolist()}
