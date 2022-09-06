#! /usr/bin/env python3
# -*- coding: utf-8 -*-
#
# Alexander Shiryaev, 2021.12, 2022.09
#
# convert cache from files format to sqlite format
#

import sys, os, datetime, sqlite3

def process (fromDir, toDb, flipY=False):
	tableName = "T_" + fromDir

	conn = sqlite3.connect(toDb)
	c = conn.cursor()

	# c.execute("PRAGMA journal_mode = WAL")
	# c.execute("PRAGMA synchronous = NORMAL")

	c.execute("""CREATE TABLE IF NOT EXISTS %s (x INTEGER, y INTEGER, zoom INTEGER, updated TEXT, tile BLOB, PRIMARY KEY (x, y, zoom))""" % (tableName,))

	for dirpath, dirnames, filenames in os.walk(fromDir):
		for filename in filenames:
			if not filename.endswith('.temp'):
				fName = os.path.join(dirpath, filename)
				z, x, bFName = fName.split(os.path.sep)[-3:]
				z = int(z)
				x = int(x)
				y = int(bFName.split('.')[0])
				if flipY:
					y = (1<<z) - y - 1
				mtime = datetime.datetime.utcfromtimestamp(os.path.getmtime(fName))
				mtime = mtime.strftime("%F %T")
				print(x, y, z, mtime, fName)
				with open(fName, 'rb') as fh:
					tile = fh.read()
				if len(tile) > 8:
					if tile.startswith(b'\xff\xd8\xff') or tile.startswith(b'\x89\x50\x4e\x47\x0d\x0a\x1a\x0a'):
						c.execute("""INSERT OR IGNORE INTO %s (x, y, zoom, updated, tile) VALUES (?, ?, ?, ?, ?)""" % (tableName,), (x, y, z, mtime, tile))
					else:
						print("invalid tile")

	conn.commit()
	conn.close()

def main ():
	args = sys.argv[1:]
	toDb = None
	flipY = False

	while len(args) > 0:
		x = args.pop(0)
		if x == '-db':
			toDb = args.pop(0)
		elif x == '-flipY':
			flipY = True
		elif x == '-noFlipY':
			flipY = False
		elif x == '-dir':
			assert toDb is not None
			fromDir = args.pop(0)
			process(fromDir, toDb, flipY=flipY)
		else:
			print("invalid parameter:", x)
			assert False

if __name__ == '__main__':
	main()
