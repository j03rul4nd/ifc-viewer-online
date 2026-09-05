"""Drawing-derived reference geometry; dimensions are estimates, not a survey.

User sheets A.2.15/A.2.27: lenticular plate with indented short ends.
A.3.2/A.3.5/A.3.6: convex seaward elevation and upright landward spine.
The OSM building:part also includes the rectangular low-rise annex. It must
never be used as the outline of every upper floor.
"""
import math

SPINE_X, CENTRE_Y = 18.0, -28.0
LENGTH, DEPTH = 63.0, 25.2
CROWN_HEIGHT = 98.8
ROOF_LEVEL = 94.0
# Retain the western OSM block, terminating at the reconstructed tower edge.
# The former full OSM rectangle overlaps the corrected tower plate.
# Drawing frame: tower at left, lift cluster at right, three low-rise wings.
# The courtyard is the re-entrant part of this simple U-shaped polygon.
ANNEX = [(3.5,-51.), (46.,-51.), (46.,-5.), (3.5,-5.),
         (3.5,-14.7), (21.,-14.7), (21.,-17.5), (34.,-17.5),
         (34.,-38.5), (21.,-38.5), (21.,-41.3), (3.5,-41.3)]
ANNEX_HEIGHT = 25.50

BEARING = math.radians(172.5)
C, S = math.cos(BEARING), math.sin(BEARING)
TX = -42.0 - (C*18.0 - S*(-28.0))
TY = -20.4 - (S*18.0 + C*(-28.0))


def to_site(point):
    x, y, *z = point
    return (C*x-S*y+TX, S*x+C*y+TY, *z)


def from_site(point):
    x, y, *z = point
    return (C*(x-TX)+S*(y-TY), -S*(x-TX)+C*(y-TY), *z)


def stair_edge(z):
    return SPINE_X-LENGTH*(1-retreat(z))

# Normalized visual trace of the long section (image 4 / sheet A.3.5).
# Abscissa is height; ordinate is retreat of the curved end from its belly.
SECTION = [(0., .08), (.16, .025), (.32, 0.), (.50, .012),
           (.62, .045), (.70, .095), (.78, .18), (.85, .29),
           (.90, .40), (.94, .53), (.97, .67), (.99, .81), (1., .985)]


def retreat(z):
    h = max(0., min(1., z / CROWN_HEIGHT))
    for (a, x), (b, y) in zip(SECTION, SECTION[1:]):
        if h <= b:
            return x + (y - x) * (h - a) / (b - a)
    return SECTION[-1][1]


def half_depth(u):
    # Read from the supplied typical plan: broad convex faces, clipped ends.
    return DEPTH * (.29 + .21 * math.sin(math.pi * u))


def link_profiles():
    """Two short connections from the lens boundary to the low-rise wings."""
    out=[]
    for side in (-1,1):
        edge=[(8.+i, CENTRE_Y+side*half_depth((8.+i+45.)/LENGTH)) for i in range(9)]
        wing_y=-41.3 if side<0 else -14.7
        ring=edge+[(16.,wing_y),(8.,wing_y)]
        area=sum(ring[i][0]*ring[(i+1)%len(ring)][1]-ring[(i+1)%len(ring)][0]*ring[i][1]
                 for i in range(len(ring)))
        out.append(ring if area>0 else list(reversed(ring)))
    return out


def plate_at(z):
    """Crop the full lenticular plan at the sail edge; do not scale rooms.

    Stable vertex correspondence lets facade solids loft without twisting.
    A shallow central indentation on each short end echoes the stair slots.
    """
    start = retreat(z)
    us = [start + (1. - start) * i / 32 for i in range(33)]
    lower = [(SPINE_X - LENGTH * (1-u), CENTRE_Y-half_depth(u)) for u in us]
    upper = [(SPINE_X - LENGTH * (1-u), CENTRE_Y+half_depth(u)) for u in reversed(us)]
    notch = min(1.8, LENGTH * (1-start) * .18)
    left = stair_edge(z)
    recess = min(5.8, LENGTH*(1-start)*.20)
    return (lower + [(SPINE_X-notch, CENTRE_Y)] + upper
            + [(left,CENTRE_Y+1.7), (left+recess,CENTRE_Y+1.7),
               (left+recess,CENTRE_Y-1.7), (left,CENTRE_Y-1.7)])


def facade_grid(z0, z1, module=2.4):
    """Fixed facade axes across storeys; only the trimmed end rakes.

    Resampling each perimeter independently makes the crown mullions fan out.
    These samples instead refer to the same positions on the full plan.
    """
    a, b = retreat(z0), retreat(z1)
    low, high = [], []
    for side in (-1, 1):
        for k in range(1, math.ceil(LENGTH/module)):
            u = k*module/LENGTH
            if u <= max(a, b) or u >= 1:
                continue
            p = (SPINE_X-LENGTH*(1-u), CENTRE_Y+side*(half_depth(u)-.1))
            low.append(p)
            high.append(p)
        low.append((SPINE_X-LENGTH*(1-a), CENTRE_Y+side*(half_depth(a)-.1)))
        high.append((SPINE_X-LENGTH*(1-b), CENTRE_Y+side*(half_depth(b)-.1)))
        low.append((SPINE_X, CENTRE_Y+side*(half_depth(1)-.1)))
        high.append(low[-1])
    return low, high
