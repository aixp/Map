#! /usr/bin/env python3
# -*- coding: utf-8 -*-
#
# Alexander Shiryaev, 2022.01
#

import sys, sqlite3

def processDir (c, d, updateOnly):
	t = "T_" + d

	print("%s: performing select, please wait..." % (d,))

	if updateOnly:
		# c.execute("SELECT src.%s.x, src.%s.y, src.%s.zoom, src.%s.updated, dst.%s.updated FROM src.%s INNER JOIN dst.%s ON (src.%s.x = dst.%s.x) AND (src.%s.y = dst.%s.y) AND (src.%s.zoom = dst.%s.zoom) AND (src.%s.updated > dst.%s.updated) AND (LENGTH(src.%s.tile) > 0)" % (t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t))
		c.execute("SELECT src.%s.x, src.%s.y, src.%s.zoom, src.%s.updated, dst.%s.updated FROM src.%s INNER JOIN dst.%s ON (src.%s.x = dst.%s.x) AND (src.%s.y = dst.%s.y) AND (src.%s.zoom = dst.%s.zoom) AND ((src.%s.updated > dst.%s.updated) OR (LENGTH(dst.%s.tile) = 0)) AND (LENGTH(src.%s.tile) > 0)" % (t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t))
	else:
		c.execute("CREATE TABLE IF NOT EXISTS dst.%s (x INTEGER, y INTEGER, zoom INTEGER, updated TEXT, tile BLOB, PRIMARY KEY (x, y, zoom))" % (t,))
		# c.execute("SELECT src.%s.x, src.%s.y, src.%s.zoom, src.%s.updated, dst.%s.updated FROM src.%s LEFT OUTER JOIN dst.%s ON (src.%s.x = dst.%s.x) AND (src.%s.y = dst.%s.y) AND (src.%s.zoom = dst.%s.zoom) WHERE (dst.%s.updated IS NULL) OR ((src.%s.updated > dst.%s.updated) AND (LENGTH(src.%s.tile) > 0))" % (t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t))
		c.execute("SELECT src.%s.x, src.%s.y, src.%s.zoom, src.%s.updated, dst.%s.updated FROM src.%s LEFT OUTER JOIN dst.%s ON (src.%s.x = dst.%s.x) AND (src.%s.y = dst.%s.y) AND (src.%s.zoom = dst.%s.zoom) WHERE (dst.%s.updated IS NULL) OR (((src.%s.updated > dst.%s.updated) OR (LENGTH(dst.%s.tile) = 0)) AND (LENGTH(src.%s.tile) > 0))" % (t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t))
	n = 0
	m = 0
	r = []
	while True:
		row = c.fetchone()
		if row == None:
			break
		x, y, zoom, srcUpdated, dstUpdated = row

		n += 1
		if dstUpdated == None:
			m += 1

		print("%s: %02d/%8d/%8d: %19s -> %19s, total = %d, new = %d" % (d, zoom, x, y, dstUpdated, srcUpdated, n, m))

		r.append((x, y, zoom))

	print("%s: total updates: %d (new: %d)" % (d, n, m))

	print("%s: performing inserts, please wait..." % (d,))

	opc = 0
	i = 0
	for x, y, zoom in r:
		c.execute("SELECT src.%s.updated, src.%s.tile FROM src.%s WHERE (src.%s.x = %d) AND (src.%s.y = %d) AND (src.%s.zoom = %d)" % (t, t, t, t, x, t, y, t, zoom))
		row = c.fetchone()
		assert row != None
		updated, tile = row
		row = c.fetchone()
		assert row == None
		c.execute("INSERT OR REPLACE INTO dst.%s (x, y, zoom, updated, tile) VALUES (?, ?, ?, ?, ?)" % (t,), (x, y, zoom, updated, tile))

		i += 1

		pc = (100 * i) // len(r)
		if pc != opc:
			print("%s: %d%% of inserts done" % (d, pc,))
			opc = pc

def process (srcDb, dstDb, dirs):
	conn = sqlite3.connect(":memory:")

	c = conn.cursor()

	c.execute("ATTACH DATABASE '%s' AS src;" % (srcDb,))
	c.execute("ATTACH DATABASE '%s' AS dst;" % (dstDb,))

	for d, updateOnly in dirs:
		processDir(c, d, updateOnly)
		print("%s: performing commit, please wait..." % (d,))
		conn.commit()

	conn.close()

def main ():
	args = sys.argv[1:]
	srcDb = None
	dstDb = None
	dirs = []
	updateOnly = False
	err = False

	while len(args) > 0:
		arg = args.pop(0)
		if arg == '-updateOnly':
			updateOnly = True
		elif arg == '-noUpdateOnly':
			updateOnly = False
		elif arg == '-src':
			assert srcDb == None
			srcDb = args.pop(0)
		elif arg == '-dst':
			assert dstDb == None
			dstDb = args.pop(0)
		elif arg == '-dir':
			dirs.append((args.pop(0), updateOnly))
		else:
			err = True
			break

	if (srcDb == None) or (dstDb == None):
		err = True

	if not err:
		process(srcDb, dstDb, dirs)
	else:
		print("usage: %s -src src.db -dst dst.db {[-updateOnly | -noUpdateOnly] -dir dir}" % (sys.argv[0],))
		print("	-updateOnly: update existing tiles only, do not add new")

if __name__ == '__main__':
	main()
