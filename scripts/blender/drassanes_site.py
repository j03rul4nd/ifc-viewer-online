# --- drassanes_site.py --------------------------------------------------------
# GENERATED from OpenStreetMap (© OpenStreetMap contributors, ODbL), queried
# 2026-10-17, so the demo station stands on the real platforms of Drassanes (L3,
# Barcelona) rather than on an invented plan.
#
#   origin   = node 3397396389  railway=station "La Rambla | Drassanes"
#   VIA_1    = way 1215124988  railway=platform, layer=-2, level=-2, tunnel=yes
#   VIA_2    = way 1215124989  railway=platform, layer=-2, level=-2, tunnel=yes
#   ENTRANCES= railway=subway_entrance nodes within 60 m of the origin
#
# Coordinates are METRES east/north of the origin (equirectangular at its
# latitude, the same convention as hotel_vela_site.py). OSM maps NO DEPTH: every
# level in build-metro-drassanes.py is an assumption, and the file says so.

SITE_LAT = 41.3766732
SITE_LON = 2.1757735
# ETRS89 / UTM 31N of the origin (Krueger series, GRS80).
EASTINGS, NORTHINGS = 431077.12, 4580900.43

VIA_1 = [(18.17, 23.02), (21.2, 21.13), (-28.58, -58.67), (-31.49, -56.81)]
VIA_2 = [(9.41, 28.19), (12.45, 26.29), (-37.32, -53.5), (-40.25, -51.64)]

ENTRANCES = [(856712226, 'Drassanes', (-18.28, -11.63)), (856712230, 'Santa Madrona', (16.51, 45.43)), (4479671004, 'Drassanes', (-9.53, 8.36))]
