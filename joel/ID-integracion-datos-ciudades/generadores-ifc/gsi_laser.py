"""Ground heights from GSI's 5 m laser DEM (dem5a, z15 text tiles), the terrain CDE Scenes draws in Japan.

Since 2026-10-01 CDE-Frontend builds Japanese elevation tiles from z13 down out of dem5a (each terrain pixel the
mean of the laser pixels it covers, float heights), so a model placed on these heights stands on the scene's
ground. Heights are TP (orthometric) metres, like the scene's terrain and the PLATEAU placements.

    from gsi_laser import LaserGround
    g = LaserGround()
    g.height(35.6902282, 139.6917301)        # bilinear, metres TP
    g.scene_height(lat, lon)                 # the terrain CDE Scenes draws there (z14, gaps filled)
    g.local(lat0, lon0, h0)(x, y)            # scene height above h0 at x m east, y m north of (lat0, lon0)
"""
import math, os, urllib.request

CACHE = os.path.join(os.path.dirname(__file__), 'landmarks', '.gsi_dem5a_cache')
Z = 15


class LaserGround:
    def __init__(self, cache=CACHE):
        self.cache = cache
        os.makedirs(cache, exist_ok=True)
        self.tiles = {}

    def _tile(self, x, y):
        key = (x, y)
        if key not in self.tiles:
            path = os.path.join(self.cache, f'{Z}_{x}_{y}.txt')
            if not os.path.exists(path):
                url = f'https://cyberjapandata.gsi.go.jp/xyz/dem5a/{Z}/{x}/{y}.txt'
                data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'InGreenDemo/1.0'}), timeout=30).read()
                open(path, 'wb').write(data)
            rows = open(path).read().strip().split('\n')
            self.tiles[key] = [[float(v) if v not in ('e', '') else math.nan for v in r.split(',')] for r in rows]
        return self.tiles[key]

    def _pixel(self, px, py):
        """Height of global z15 pixel (px, py), counted from the north-west corner of the world."""
        t = self._tile(px // 256, py // 256)
        return t[py % 256][px % 256]

    def height(self, lat, lon):
        n = 2 ** Z * 256
        fx = (lon + 180) / 360 * n - 0.5
        fy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n - 0.5
        x0, y0 = int(math.floor(fx)), int(math.floor(fy))
        ax, ay = fx - x0, fy - y0
        v = [[self._pixel(x0 + i, y0 + j) for i in (0, 1)] for j in (0, 1)]
        flat = [w for r in v for w in r if not math.isnan(w)]
        if not flat:
            return math.nan
        v = [[w if not math.isnan(w) else sum(flat) / len(flat) for w in r] for r in v]
        return (v[0][0] * (1 - ax) * (1 - ay) + v[0][1] * ax * (1 - ay) + v[1][0] * (1 - ax) * ay + v[1][1] * ax * ay)

    def _scene_tile(self, X, Y):
        """The z14 terrain tile (X, Y) as CDE-Frontend builds it (basemapImagery.ts mergeLaserHeights): each pixel the
        mean of the 2×2 laser pixels it covers, gaps (buildings) filled from the laser around them, 16 passes."""
        key = ('s14', X, Y)
        if key not in self.tiles:
            size = 256
            out = [[math.nan] * size for _ in range(size)]
            for r in range(size):
                for c in range(size):
                    v = [self._pixel(2 * (X * 256 + c) + a, 2 * (Y * 256 + r) + b) for a in (0, 1) for b in (0, 1)]
                    v = [w for w in v if not math.isnan(w)]
                    if v:
                        out[r][c] = sum(v) / len(v)
            for _ in range(16):
                if not any(math.isnan(w) for row in out for w in row):
                    break
                nxt = [row[:] for row in out]
                for r in range(size):
                    for c in range(size):
                        if not math.isnan(out[r][c]):
                            continue
                        v = [out[r + i][c + j] for i in (-1, 0, 1) for j in (-1, 0, 1)
                             if 0 <= r + i < size and 0 <= c + j < size and not math.isnan(out[r + i][c + j])]
                        if v:
                            nxt[r][c] = sum(v) / len(v)
                out = nxt
            self.tiles[key] = out
        return self.tiles[key]

    def scene_height(self, lat, lon):
        """The scene's terrain height: bilinear between the pixel centres of its z14 tiles."""
        n = 2 ** 14 * 256
        fx = (lon + 180) / 360 * n - 0.5
        fy = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n - 0.5
        x0, y0 = int(math.floor(fx)), int(math.floor(fy))
        ax, ay = fx - x0, fy - y0

        def px(x, y):
            return self._scene_tile(x // 256, y // 256)[y % 256][x % 256]
        return (px(x0, y0) * (1 - ax) * (1 - ay) + px(x0 + 1, y0) * ax * (1 - ay) + px(x0, y0 + 1) * (1 - ax) * ay
                + px(x0 + 1, y0 + 1) * ax * ay)

    def local(self, lat0, lon0, h0=0., scene=True):
        """f(x, y) → ground height above h0 at x m east, y m north of (lat0, lon0)."""
        k_lat = 111132.954 - 559.822 * math.cos(2 * math.radians(lat0))
        k_lon = 111412.84 * math.cos(math.radians(lat0))
        f = self.scene_height if scene else self.height
        return lambda x, y: f(lat0 + y / k_lat, lon0 + x / k_lon) - h0
