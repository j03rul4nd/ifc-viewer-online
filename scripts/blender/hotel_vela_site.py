# --- hotel_vela_site.py -------------------------------------------------------
# GENERATED from the real OpenStreetMap geometry of the W Barcelona, so the model
# stands on the building's own footprint rather than on an invented one.
#
#   plot  = way 908035012  building=hotel, building:levels=27,
#                          building:levels:underground=2, height=98.8,
#                          architect=Ricardo Bofill, year_of_construction=2009
#   tower = way 908035013  building:part=yes, building:levels=27 -- the sail
#
# Coordinates are METRES east/north of the plot centroid, which is the model
# origin. Simplified with Douglas-Peucker: the survey carries more vertices than
# an extruded profile needs, and every one of them costs a wall.
#   plot  29 -> 19 points
#   tower 74 -> 22 points

SITE_LAT = 41.368708
SITE_LON = 2.190283

PLOT = [
    (44.12, 34.97), (19.36, 38.30), (19.44, 40.73), (-7.72, 44.41),
    (-7.95, 41.98), (-83.22, 52.06), (-81.09, 47.99), (-83.08, 46.95),
    (-58.21, 0.51), (-63.46, -39.19), (8.23, -48.49), (12.53, -38.76),
    (16.13, -38.11), (15.39, -32.82), (18.46, -32.62), (28.30, -12.01),
    (25.49, -11.62), (43.54, 27.23), (41.05, 28.36),
]

TOWER = [
    (-22.06, -4.29), (-58.21, 0.51), (-63.46, -39.19), (-27.37, -43.85),
    (-26.32, -36.32), (-29.03, -35.27), (-28.81, -33.70), (-21.31, -36.26),
    (-9.11, -38.90), (4.71, -39.45), (16.13, -38.11), (15.05, -31.81),
    (16.99, -32.07), (17.33, -29.52), (15.36, -29.25), (18.00, -23.47),
    (9.61, -19.65), (-3.73, -15.77), (-17.36, -14.30), (-26.06, -14.58),
    (-25.86, -13.00), (-23.19, -12.84),
]
