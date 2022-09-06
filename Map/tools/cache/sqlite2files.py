#! /usr/bin/env python3
# -*- coding: utf-8 -*-
#
# Alexander Shiryaev, 2021.12, 2022.09
#
# convert cache from sqlite format to files format
#

import sys, os, datetime, sqlite3

def process (fromDb, toDir, flipY=False):
	tableName = "T_" + toDir

	conn = sqlite3.connect(fromDb)
	c = conn.cursor()

	c.execute("SELECT x, y, zoom, updated, tile FROM %s" % (tableName,))

	while True:
		x = c.fetchone()
		if x is None:
			break
		assert len(x) == 5
		x, y, z, updated, tile = x
		print(x, y, z, updated)
		if flipY:
			y = (1<<z) - y - 1
		dirName = os.path.join(toDir, str(z), str(x))
		os.makedirs(dirName, exist_ok=True)
		fileName = os.path.join(dirName, "%d.png" % (y,))
		with open(fileName, 'wb') as fh:
			fh.write(tile)
		mtime = datetime.datetime.fromisoformat(updated).replace(tzinfo=datetime.timezone.utc).timestamp()
		atime = mtime
		os.utime(fileName, (atime, mtime))

	conn.close()

def main ():
	args = sys.argv[1:]
	fromDb = None
	flipY = False

	while len(args) > 0:
		x = args.pop(0)
		if x == '-db':
			fromDb = args.pop(0)
		elif x == '-flipY':
			flipY = True
		elif x == '-noFlipY':
			flipY = False
		elif x == '-dir':
			assert fromDb is not None
			toDir = args.pop(0)
			process(fromDb, toDir, flipY=flipY)
		else:
			print("invalid parameter:", x)
			assert False

if __name__ == '__main__':
	main()
