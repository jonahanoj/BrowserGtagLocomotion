"""Builds the game and the map viewer from the source in src/.

    python build.py            -> index.html (the game) + tools/MapViewer.html

index.html is what GitHub Pages serves (https://jonahanoj.github.io/Scrapper/).
"""
import os, datetime
ROOT = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
def wr(p, s): open(os.path.join(ROOT, p), 'w', encoding='utf-8', newline='\n').write(s)

game = rd('src/game.html').replace('/*@@MAPS@@*/\n', rd('src/maps.js'))
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
assert "const BUILD = '__BUILD__'" in game
wr('index.html', game.replace("const BUILD = '__BUILD__'", "const BUILD = '%s'" % stamp))

# the map viewer: same game code, offline three.js, no multiplayer, a free-fly camera instead of VR
tag = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
v = game.replace(tag, '<script>' + rd('tools/three.min.js') + '</script>')
v = v.replace("import('https://cdn.jsdelivr.net/npm/trystero@0.26.0/+esm')", "Promise.reject('viewer: no multiplayer')")
v = v.replace("useServer(NET_SERVER);", "useTrystero();")   # the viewer never joins the multiplayer server
v = v.replace('/*DBG*/', 'setTimeout(() => {\n' + rd('tools/viewer_inject.js') + '\n}, 0);')
wr('tools/MapViewer.html', v.replace('<title>', '<title>Map Viewer - ', 1))
print('built index.html (BUILD %s) and tools/MapViewer.html' % stamp)
