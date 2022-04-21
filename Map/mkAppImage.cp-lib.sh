#!/bin/sh

APPDIR=${EXE}.AppDir

mkdir -p ${APPDIR}/usr/lib64
cp /usr/lib64/ld-linux-x86-64.so.2 ${APPDIR}/usr/lib64/

ldd ${EXE} | cut -d'>' -f 2 | cut -d' ' -f 2 | grep lib | while read line; do
	cp ${line} ${APPDIR}/usr/lib/
done

find ${APPDIR}/usr/lib/ -type f -name "*.so*" | while read line; do
	# echo $line
	patchelf --set-rpath '$ORIGIN' ${line}
done

cp -Rp /usr/lib/gio /usr/lib/gvfs ${APPDIR}/usr/lib/

ls /usr/lib/gvfs | while read line; do
	if [ ! -e ${APPDIR}/usr/lib/${line} ]; then
		ln -s gvfs/${line} ${APPDIR}/usr/lib/
	fi
done

cp -p -L /usr/lib/libgconf-2.so ${APPDIR}/usr/lib/
